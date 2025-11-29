import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { securityManager } from '@/lib/security/session-manager';
import { securityMiddleware } from '@/lib/security/security-middleware';
import { decryptPrivateKey, encryptPrivateKey, logSecurityEvent } from '@/lib/server-crypto';
import { DeviceFP, ReqSign, CriticalRL, SecAuth, SecAudit, PKProtect } from '@/lib/security/enhanced-security';
// Enhanced Web3Auth verification is handled through SecureSessionManager

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\n/g, '\n'),
    }),
  });
}

const db = getFirestore();

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  // Apply comprehensive security - this endpoint needs maximum protection
  const securityResult = await securityMiddleware.applySecurityMiddleware(request, {
    requireAuth: true,
    requireCaptcha: true,
    maxAttempts: 3,
    windowMinutes: 60,
    blockSuspiciousIPs: true,
    requireAdminRole: false // Users can access their own private keys
  });
  
  if (securityResult) {
    return securityResult;
  }
  
  const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0] || 
                    request.headers.get('x-real-ip') || 
                    'unknown';
  const userAgent = request.headers.get('user-agent') || 'unknown';
  
  try {
    const { user_id, captchaToken } = await request.json();
    if (!user_id) {
      securityManager.logSecurityEvent({
        type: 'LOGIN_FAIL',
        ipAddress,
        userAgent,
        timestamp: Date.now(),
        details: { reason: 'Missing user_id in get-private-key request' }
      });
      
      return NextResponse.json({ error: 'Missing user_id' }, { status: 400 });
    }
    
    // Verify session from headers
    const authHeader = request.headers.get('authorization');
    const sessionToken = authHeader?.replace('Bearer ', '');
    
    if (!sessionToken) {
      securityManager.logSecurityEvent({
        type: 'LOGIN_FAIL',
        email: user_id,
        ipAddress,
        userAgent,
        timestamp: Date.now(),
        details: { reason: 'No session token provided for private key access' }
      });
      
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    
    const session = await securityManager.verifySession(sessionToken);
    if (!session) {
      securityManager.logSecurityEvent({
        type: 'LOGIN_FAIL',
        email: user_id,
        ipAddress,
        userAgent,
        timestamp: Date.now(),
        details: { reason: 'Invalid session for private key access' }
      });
      
      return NextResponse.json({ error: 'Invalid or expired session' }, { status: 401 });
    }
    
    // Verify CAPTCHA for this sensitive operation
    if (captchaToken) {
      const captchaResult = await securityMiddleware.verifyCaptcha(captchaToken, 'get_private_key');
      if (!captchaResult.success) {
        securityManager.logSecurityEvent({
          type: 'CAPTCHA_FAIL',
          userId: session.userId,
          email: user_id,
          ipAddress,
          userAgent,
          timestamp: Date.now(),
          details: { error: captchaResult.error, action: 'get_private_key' }
        });
        
        return NextResponse.json(
          { error: 'CAPTCHA verification failed for private key access' }, 
          { status: 400 }
        );
      }
    }
    const userQuery = await db.collection('users').where('user_id', '==', user_id).limit(1).get();
    if (userQuery.empty) {
      securityManager.logSecurityEvent({
        type: 'LOGIN_FAIL',
        userId: session.userId,
        email: user_id,
        ipAddress,
        userAgent,
        timestamp: Date.now(),
        details: { reason: 'User not found for private key request' }
      });
      
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    
    const userDoc = userQuery.docs[0];
    
    // Verify user can only access their own private key - NO ADMIN BYPASS
    if (session.userId !== userDoc.id) {
      securityManager.logSecurityEvent({
        type: 'LOGIN_FAIL',
        userId: session.userId,
        email: user_id,
        ipAddress,
        userAgent,
        timestamp: Date.now(),
        details: { 
          reason: 'Unauthorized private key access attempt - BLOCKED',
          requestedUserId: userDoc.id,
          sessionUserId: session.userId,
          isAdmin: session.isAdmin || false
        }
      });
      
      // Even admins cannot access other users' private keys
      return NextResponse.json({ 
        error: 'Unauthorized - private keys are strictly user-only access' 
      }, { status: 403 });
    }
    const userData = userDoc.data();
    
    // Log successful private key access
    securityManager.logSecurityEvent({
      type: 'LOGIN_SUCCESS',
      userId: session.userId,
      email: user_id,
      ipAddress,
      userAgent,
      timestamp: Date.now(),
      details: { action: 'private_key_access_granted' }
    });
    
    // Return encrypted private key
    const encryptedPrivateKey = securityManager.encrypt(userData.private_key);
    
    const response = NextResponse.json({ 
      encryptedPrivateKey,
      message: 'Private key retrieved successfully'
    });
    
    // Add security headers
    const secureHeaders = securityMiddleware.createSecureHeaders();
    Object.entries(secureHeaders).forEach(([key, value]) => {
      response.headers.set(key, value);
    });
    
    return response;
  } catch (error) {
    const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0] || 
                      request.headers.get('x-real-ip') || 
                      'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';
    
    securityManager.logSecurityEvent({
      type: 'LOGIN_FAIL',
      ipAddress,
      userAgent,
      timestamp: Date.now(),
      details: { 
        reason: 'Internal error in get-private-key',
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    });
    
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 