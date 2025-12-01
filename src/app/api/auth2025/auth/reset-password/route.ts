import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import bcrypt from 'bcryptjs';
import { securityManager } from '@/lib/security/session-manager';
import { securityMiddleware } from '@/lib/security/security-middleware';

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
  // CRITICAL: This endpoint requires strong authentication and CAPTCHA
  const securityResult = await securityMiddleware.applySecurityMiddleware(request, {
    requireAuth: true, // Must be logged in
    requireCaptcha: true, // Must complete CAPTCHA
    maxAttempts: 3, // Very strict rate limiting
    windowMinutes: 60, // 1 hour window
    blockSuspiciousIPs: true,
    requireAdminRole: false // Users can reset their own password
  });
  
  if (securityResult) {
    return securityResult;
  }
  
  const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0] || 
                    request.headers.get('x-real-ip') || 
                    'unknown';
  const userAgent = request.headers.get('user-agent') || 'unknown';

  // CRITICAL: Block all direct API access - only allow from website
  const referer = request.headers.get('referer') || '';
  const origin = request.headers.get('origin') || '';
  
  const allowedDomains = [
    'https://gptchwallet.com',
    'https://www.gptchwallet.com', 
    'https://mzswallet.com',
    'https://www.mzswallet.com',
    'http://localhost:3000'
  ];

  const isValidOrigin = allowedDomains.some(domain => 
    referer.startsWith(domain) || origin === domain
  );

  if (!isValidOrigin) {
    securityManager.logSecurityEvent({
      type: 'LOGIN_FAIL',
      ipAddress,
      userAgent,
      timestamp: Date.now(),
      details: { 
        reason: 'Direct API access blocked',
        referer,
        origin,
        endpoint: 'reset-password'
      }
    });

    return NextResponse.json({ 
      error: 'Direct API access not allowed' 
    }, { status: 403 });
  }
  
  try {
    const { user_id, new_password, captchaToken } = await request.json();
    if (!user_id || !new_password) {
      securityManager.logSecurityEvent({
        type: 'LOGIN_FAIL',
        ipAddress,
        userAgent,
        timestamp: Date.now(),
        details: { reason: 'Missing parameters in password reset', endpoint: 'reset-password' }
      });
      
      return NextResponse.json({ error: 'Missing user_id or new_password' }, { status: 400 });
    }
    
    // Verify session token and get authenticated user
    const authHeader = request.headers.get('authorization');
    const sessionToken = authHeader?.replace('Bearer ', '');
    
    if (!sessionToken) {
      securityManager.logSecurityEvent({
        type: 'LOGIN_FAIL',
        email: user_id,
        ipAddress,
        userAgent,
        timestamp: Date.now(),
        details: { reason: 'No session token for password reset' }
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
        details: { reason: 'Invalid session for password reset' }
      });
      
      return NextResponse.json({ error: 'Invalid or expired session' }, { status: 401 });
    }
    
    // Verify CAPTCHA for this sensitive operation
    if (captchaToken) {
      const captchaResult = await securityMiddleware.verifyCaptcha(captchaToken, 'reset_password');
      if (!captchaResult.success) {
        securityManager.logSecurityEvent({
          type: 'CAPTCHA_FAIL',
          userId: session.userId,
          email: user_id,
          ipAddress,
          userAgent,
          timestamp: Date.now(),
          details: { error: captchaResult.error, action: 'reset_password' }
        });
        
        return NextResponse.json(
          { error: 'CAPTCHA verification failed for password reset' }, 
          { status: 400 }
        );
      }
    }
    const userQuery = await db.collection('mzs').where('user_id', '==', user_id).limit(1).get();
    if (userQuery.empty) {
      securityManager.logSecurityEvent({
        type: 'LOGIN_FAIL',
        userId: session.userId,
        email: user_id,
        ipAddress,
        userAgent,
        timestamp: Date.now(),
        details: { reason: 'User not found for password reset' }
      });
      
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    
    const userDoc = userQuery.docs[0];
    
    // Verify user can only reset their own password (unless admin)
    if (session.userId !== userDoc.id && !session.isAdmin) {
      securityManager.logSecurityEvent({
        type: 'LOGIN_FAIL',
        userId: session.userId,
        email: user_id,
        ipAddress,
        userAgent,
        timestamp: Date.now(),
        details: { 
          reason: 'Unauthorized password reset attempt',
          targetUserId: userDoc.id,
          sessionUserId: session.userId
        }
      });
      
      return NextResponse.json({ 
        error: 'Unauthorized: Can only reset your own password' 
      }, { status: 403 });
    }
    
    // Log if admin is resetting another user's password
    if (session.isAdmin && session.userId !== userDoc.id) {
      securityManager.logSecurityEvent({
        type: 'LOGIN_SUCCESS' as const,
        userId: session.userId,
        email: user_id,
        ipAddress,
        userAgent,
        timestamp: Date.now(),
        details: { 
          action: 'ADMIN_PASSWORD_RESET',
          targetUserId: userDoc.id,
          adminEmail: session.email
        }
      });
    }
    const password_hash = await bcrypt.hash(new_password, 12); // Increased security
    await userDoc.ref.update({ password_hash });
    
    // Log successful password reset
    securityManager.logSecurityEvent({
      type: 'LOGIN_SUCCESS',
      userId: session.userId,
      email: user_id,
      ipAddress,
      userAgent,
      timestamp: Date.now(),
      details: { action: 'password_reset_completed' }
    });
    
    // Invalidate all existing sessions for this user (security best practice)
    securityManager.destroyAllUserSessions(session.userId);
    
    const response = NextResponse.json({ 
      success: true,
      message: 'Password reset successful. Please log in again.'
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
        reason: 'Internal error in password reset',
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    });
    
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 