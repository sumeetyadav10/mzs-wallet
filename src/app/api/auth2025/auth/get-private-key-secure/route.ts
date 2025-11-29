import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { securityManager } from '@/lib/security/session-manager';
import { securityMiddleware } from '@/lib/security/security-middleware';
import { logger } from '@/lib/logger';
import { decryptPrivateKey, encryptPrivateKey, logSecurityEvent } from '@/lib/server-crypto';
import { DeviceFP, ReqSign, CriticalRL, SecAuth, SecAudit, PKProtect } from '@/lib/security/enhanced-security';
// Enhanced Web3Auth verification is handled through SecureSessionManager
import { verifyJWTToken } from '@/lib/web3auth-jwt-secure';

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
  const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0] || 
                    request.headers.get('x-real-ip') || 
                    'unknown';
  const userAgent = request.headers.get('user-agent') || 'unknown';
  
  // 🔒 CRITICAL OPERATION: PRIVATE KEY ACCESS
  // Generate device fingerprint
  const deviceFingerprint = DeviceFP.generateFingerprint(request);
  
  // Apply MAXIMUM security - this is the most critical endpoint
  const securityResult = await securityMiddleware.applySecurityMiddleware(request, {
    requireAuth: true,
    requireCaptcha: true,
    maxAttempts: 1, // Only 1 attempt per window
    windowMinutes: 60,
    blockSuspiciousIPs: true,
    requireAdminRole: false
  });
  
  if (securityResult) {
    return securityResult;
  }
  
  try {
    const { captchaToken, requestSignature, timestamp, challengeId } = await request.json();
    
    // 🚨 CRITICAL: Validate all required security parameters
    if (!requestSignature || !timestamp || !challengeId) {
      SecAudit.logCriticalAccess({
        type: 'SECURITY_VIOLATION',
        userId: 'unknown',
        email: 'unknown',
        ipAddress,
        userAgent,
        deviceFingerprint,
        operation: 'private_key_access_invalid_request',
        success: false,
        details: { 
          reason: 'Missing critical security parameters',
          hasSignature: !!requestSignature,
          hasTimestamp: !!timestamp,
          hasChallengeId: !!challengeId
        }
      });
      
      return NextResponse.json({ 
        error: 'Invalid request - missing security parameters'
      }, { status: 400 });
    }
    
    // 🔐 ENHANCED AUTHENTICATION: Use enhanced Web3Auth verification
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');
    
    if (!token) {
      SecAudit.logCriticalAccess({
        type: 'AUTH_FAIL',
        userId: 'unknown',
        email: 'unknown',
        ipAddress,
        userAgent,
        deviceFingerprint,
        operation: 'private_key_access_no_token',
        success: false
      });
      
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    
    // Verify with enhanced Web3Auth security
    let session: any;
    try {
      session = await verifyJWTToken(token);
      
      // CRITICAL: Warn about unpinned keys
      if (session.keyPinned === false) {
        logger.warn(`🚨 SECURITY WARNING: Private key access with unpinned Web3Auth key`);
      }
      
    } catch (error) {
      SecAudit.logCriticalAccess({
        type: 'AUTH_FAIL',
        userId: 'unknown',
        email: 'unknown',
        ipAddress,
        userAgent,
        deviceFingerprint,
        operation: 'private_key_access_invalid_token',
        success: false,
        details: { error: error instanceof Error ? error.message : 'Token verification failed' }
      });
      
      return NextResponse.json({ 
        error: 'Invalid or expired authentication token' 
      }, { status: 401 });
    }
    
    // ✅ NO RATE LIMITING: Once authenticated via Web3Auth, user should be free to access their own wallet
    // Security is handled by Web3Auth JWT verification + device fingerprinting + request signing
    
    // 🔐 REQUEST SIGNATURE VERIFICATION
    if (!ReqSign.verifyRequestSignature(session.userId, timestamp, 'get_private_key', requestSignature)) {
      SecAudit.logCriticalAccess({
        type: 'SECURITY_VIOLATION',
        userId: session.userId,
        email: session.email,
        ipAddress,
        userAgent,
        deviceFingerprint,
        operation: 'private_key_access_invalid_signature',
        success: false,
        details: { timestamp, providedSignature: requestSignature }
      });
      
      return NextResponse.json({
        error: 'Invalid request signature'
      }, { status: 403 });
    }
    
    // 🔐 SECONDARY AUTHENTICATION CHALLENGE
    if (!SecAuth.verifyChallenge(challengeId, session.userId, 'get_private_key')) {
      SecAudit.logCriticalAccess({
        type: 'SECURITY_VIOLATION',
        userId: session.userId,
        email: session.email,
        ipAddress,
        userAgent,
        deviceFingerprint,
        operation: 'private_key_access_invalid_challenge',
        success: false,
        details: { challengeId }
      });
      
      return NextResponse.json({
        error: 'Invalid or expired security challenge'
      }, { status: 403 });
    }
    
    // 🔐 CAPTCHA VERIFICATION (MANDATORY)
    if (!captchaToken) {
      return NextResponse.json({
        error: 'CAPTCHA verification required for private key access'
      }, { status: 400 });
    }
    
    const captchaResult = await securityMiddleware.verifyCaptcha(captchaToken, 'get_private_key');
    if (!captchaResult.success) {
      SecAudit.logCriticalAccess({
        type: 'SECURITY_VIOLATION',
        userId: session.userId,
        email: session.email,
        ipAddress,
        userAgent,
        deviceFingerprint,
        operation: 'private_key_access_captcha_fail',
        success: false,
        details: { error: captchaResult.error }
      });
      
      return NextResponse.json(
        { error: 'CAPTCHA verification failed for private key access' }, 
        { status: 400 }
      );
    }
    
    // 🔐 CRITICAL: Use session email only (NO user input for email)
    const userQuery = await db.collection('users').where('auth_email', '==', session.email).limit(1).get();
    if (userQuery.empty) {
      SecAudit.logCriticalAccess({
        type: 'AUTH_FAIL',
        userId: session.userId,
        email: session.email,
        ipAddress,
        userAgent,
        deviceFingerprint,
        operation: 'private_key_access_user_not_found',
        success: false
      });
      
      return NextResponse.json({ error: 'User wallet not found' }, { status: 404 });
    }
    
    const userDoc = userQuery.docs[0];
    
    // 🚨 CRITICAL: Additional validation - session must match database
    if (session.email !== userDoc.data().auth_email) {
      SecAudit.logCriticalAccess({
        type: 'SECURITY_VIOLATION',
        userId: session.userId,
        email: session.email,
        ipAddress,
        userAgent,
        deviceFingerprint,
        operation: 'private_key_access_email_mismatch',
        success: false,
        details: { 
          sessionEmail: session.email,
          dbEmail: userDoc.data().auth_email
        }
      });
      
      return NextResponse.json({ error: 'Authentication mismatch' }, { status: 403 });
    }
    
    const userData = userDoc.data();
    
    if (!userData.private_key) {
      SecAudit.logCriticalAccess({
        type: 'AUTH_FAIL',
        userId: session.userId,
        email: session.email,
        ipAddress,
        userAgent,
        deviceFingerprint,
        operation: 'private_key_access_no_key',
        success: false
      });
      
      return NextResponse.json({ error: 'Private key not found' }, { status: 404 });
    }
    
    // 🔐 DECRYPT PRIVATE KEY FROM DATABASE (if encrypted)
    let rawPrivateKey: string;
    try {
      rawPrivateKey = decryptPrivateKey(userData.private_key, session.email);
    } catch (error) {
      // If decryption fails, it might be a raw key (legacy)
      logger.warn(`⚠️ Found raw private key - security risk!`);
      rawPrivateKey = userData.private_key;
    }
    
    // 🔐 ENHANCED ENCRYPTION FOR TRANSPORT
    const transportEncryptedKey = PKProtect.encryptForTransport(
      rawPrivateKey,
      session.userId,
      `${session.userId}_${Date.now()}`
    );
    
    // 🔐 LOG CRITICAL ACCESS
    SecAudit.logCriticalAccess({
      type: 'PRIVATE_KEY_ACCESS',
      userId: session.userId,
      email: session.email,
      ipAddress,
      userAgent,
      deviceFingerprint,
      operation: 'private_key_access_success',
      success: true,
      details: {
        keyPinned: session.keyPinned,
        authMethod: 'web3auth_secure'
      }
    });
    
    // Clear sensitive data from memory
    rawPrivateKey = '';
    
    const response = NextResponse.json({ 
      encryptedPrivateKey: transportEncryptedKey,
      message: 'Private key access granted with enhanced security',
      securityInfo: {
        keyPinned: session.keyPinned,
        authMethod: 'web3auth_enhanced',
        securityLevel: 'maximum'
      }
    });
    
    // Add enhanced security headers
    const secureHeaders = securityMiddleware.createSecureHeaders();
    Object.entries(secureHeaders).forEach(([key, value]) => {
      response.headers.set(key, value);
    });
    
    return response;
    
  } catch (error) {
    SecAudit.logCriticalAccess({
      type: 'SECURITY_VIOLATION',
      userId: 'unknown',
      email: 'unknown',
      ipAddress,
      userAgent,
      deviceFingerprint,
      operation: 'private_key_access_error',
      success: false,
      details: { 
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    });
    
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Add endpoint to initiate secure private key access (get challenge)
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');
    
    if (!token) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    
    // Verify session
    const session = await verifyJWTToken(token);
    
    if (!session) {
      return NextResponse.json(
        { error: 'Invalid or expired session' },
        { status: 401 }
      );
    }
    
    // Generate security challenge
    const challenge = SecAuth.generateChallenge(session.userId, 'get_private_key');
    
    return NextResponse.json({
      challengeId: challenge.challenge,
      expiresIn: challenge.expiresIn,
      message: 'Use this challenge ID to securely access your private key'
    });
    
  } catch (error) {
    return NextResponse.json({ 
      error: 'Failed to generate security challenge' 
    }, { status: 500 });
  }
}