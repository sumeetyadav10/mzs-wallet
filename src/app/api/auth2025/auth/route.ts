import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { compare } from 'bcryptjs';
import crypto from 'crypto';
import { logger } from '@/lib/logger';
import { securityManager } from '@/lib/security/session-manager-enhanced';
import { createAuthTokens } from '@/lib/security/auth-helper';
import { securityMiddleware } from '@/lib/security/security-middleware';
import { whitelistManager } from '@/lib/security/whitelist-manager';
import { APISecurityMiddleware } from '@/lib/security/api-security-middleware';
import { BackendValidation } from '@/lib/security/backend-validation';
import { SQLInjectionPrevention } from '@/lib/security/sql-injection-prevention';

// Initialize Firebase Admin if not already initialized
if (!getApps().length) {
  try {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    });
  } catch (error) {
    logger.error('Firebase Admin initialization error:', error);
  }
}

const db = getFirestore();

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  logger.log('Auth API called with enhanced security');
  
  // 🔒 COMPREHENSIVE SECURITY VALIDATION
  const securityValidation = await APISecurityMiddleware.validateRequest(request, false); // Don't require auth for login
  if (!securityValidation.valid) {
    return securityValidation.response!;
  }
  
  // Read body once and reuse (already validated by security middleware)
  const body = (securityValidation as any).body || await request.json();
  const { user_id, password, captchaToken } = body;
  
  // Check if this is a whitelisted legitimate user
  const isWhitelistedUser = user_id && whitelistManager.isWhitelisted(user_id);
  
  // Apply security middleware WITHOUT captcha check (we'll handle it manually)
  const securityResult = await securityMiddleware.applySecurityMiddleware(request, {
    requireCaptcha: false, // We'll verify CAPTCHA manually since body is already read
    maxAttempts: isWhitelistedUser ? 30 : 10, // More lenient limits with reCAPTCHA
    windowMinutes: 15,
    blockSuspiciousIPs: false // Let CAPTCHA handle bot detection
  });
  
  if (securityResult) {
    return securityResult;
  }
  
  // Manually verify CAPTCHA since we already have the token
  if (!captchaToken) {
    logger.log('[AUTH] BLOCKING REQUEST - NO CAPTCHA TOKEN');
    return NextResponse.json({ 
      error: 'CAPTCHA verification required',
      code: 'CAPTCHA_REQUIRED'
    }, { status: 400 });
  }
  
  logger.log(`[AUTH] CAPTCHA TOKEN RECEIVED: ${captchaToken ? `length ${captchaToken.length}` : 'NULL/MISSING'}`);
  
  // Verify CAPTCHA with Google
  const captchaVerification = await securityMiddleware.verifyCaptcha(captchaToken, '/api/auth');
  if (!captchaVerification.success) {
    logger.log('[AUTH] CAPTCHA VERIFICATION FAILED:', captchaVerification.error);
    return NextResponse.json({ 
      error: captchaVerification.error || 'CAPTCHA verification failed',
      code: 'CAPTCHA_INVALID'
    }, { status: 400 });
  }
  
  logger.log('[AUTH] CAPTCHA VERIFICATION PASSED - PROCEEDING WITH LOGIN');
  
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
    'http://localhost:3000' // Development only
  ];

  const isValidOrigin = allowedDomains.some(domain => 
    referer.startsWith(domain) || origin === domain
  );

  if (!isValidOrigin) {
    securityManager.logSecurityEvent({
      type: 'LOGIN_FAIL',
      userId: 'unknown',
      email: 'unknown',
      ipAddress,
      userAgent,
      timestamp: Date.now(),
      details: { 
        reason: 'Direct API access blocked',
        referer,
        origin,
        endpoint: 'auth'
      }
    });

    return NextResponse.json({ 
      error: 'Direct API access not allowed' 
    }, { status: 403 });
  }
  
  try {
    // We already have the body parsed above
    logger.log('Request body:', { ...{ user_id, password }, password: '[REDACTED]' });
    
    if (!user_id || !password) {
      logger.log('Missing credentials');
      
      securityManager.logSecurityEvent({
        type: 'LOGIN_FAIL',
        userId: 'unknown',
        email: user_id || 'unknown',
        ipAddress,
        userAgent,
        timestamp: Date.now(),
        details: { reason: 'Missing credentials', user_id }
      });
      
      return NextResponse.json(
        { error: 'Missing user_id or password' },
        { status: 400 }
      );
    }

    logger.log('Querying user from Firestore:', user_id);
    
    // 🔒 SECURE DATABASE QUERY - Validate input and query Firestore
    // Sanitize user_id to prevent injection attempts
    const sanitizedUserId = SQLInjectionPrevention.sanitizeInput(user_id, 'user_id');
    
    // Query user from mzs collection - try by user_id field first
    let userQuery = await db.collection('mzs').where('user_id', '==', sanitizedUserId).limit(1).get();
    
    // If not found by user_id field, try by document ID
    let userDoc;
    if (userQuery.empty) {
      logger.log('Not found by user_id field, trying by document ID...');
      try {
        const docRef = await db.collection('mzs').doc(sanitizedUserId).get();
        if (docRef.exists) {
          userDoc = docRef;
          logger.log('User found by document ID');
        }
      } catch (e) {
        logger.log('Error fetching by document ID:', e);
      }
    } else {
      userDoc = userQuery.docs[0];
    }
    
    if (!userDoc) {
      logger.log('User not found in mzs collection');
      
      securityManager.logSecurityEvent({
        type: 'LOGIN_FAIL',
        userId: 'unknown',
        email: user_id,
        ipAddress,
        userAgent,
        timestamp: Date.now(),
        details: { reason: 'User not found' }
      });
      
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }
    
    const userData = userDoc.data();
    
    logger.log('User data found:', { ...userData, password_hash: '[REDACTED]', private_key: '[REDACTED]' });
    
    if (!userData) {
      logger.log('User data missing');
      return NextResponse.json(
        { error: 'User data missing' },
        { status: 500 }
      );
    }

    const isPasswordValid = await compare(password, userData.password_hash);
    logger.log('Password validation:', isPasswordValid ? 'Success' : 'Failed');
    
    if (!isPasswordValid) {
      securityManager.logSecurityEvent({
        type: 'LOGIN_FAIL',
        userId: userDoc.id,
        email: user_id,
        ipAddress,
        userAgent,
        timestamp: Date.now(),
        details: { reason: 'Invalid password' }
      });
      
      return NextResponse.json(
        { error: 'Invalid password' },
        { status: 401 }
      );
    }

    // Generate device fingerprint
    const deviceFingerprint = crypto.randomUUID();

    // Create secure session with device fingerprint
    const tokens = await createAuthTokens({
      userId: userDoc.id,
      email: user_id,
      ipAddress,
      userAgent,
      isAdmin: userData.role === 'admin' || userData.isAdmin === true,
      deviceFingerprint
    });
    
    // Encrypt private key before sending
    const encryptedPrivateKey = userData.private_key;
    
    const response = NextResponse.json({
      // New token format
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: 24 * 60 * 60,
      // Keep backward compatibility
      sessionToken: tokens.accessToken, // Use access token for backward compatibility
      private_key: encryptedPrivateKey,
      encryptedPrivateKey: encryptedPrivateKey, // Add this for login page compatibility
      auth_email: userData.auth_email || null,
      message: 'Login successful',
      isAdmin: userData.role === 'admin' || userData.isAdmin === true,
      user_id: userDoc.id // Add user_id for migration flow
    });
    
    // Add enhanced security headers
    const enhancedResponse = APISecurityMiddleware.addSecurityHeaders(response);
    
    securityManager.logSecurityEvent({
      type: 'LOGIN_SUCCESS',
      userId: userDoc.id,
      email: user_id,
      ipAddress,
      userAgent,
      timestamp: Date.now(),
      details: { 
        method: 'enhanced_security_auth',
        deviceFingerprint: deviceFingerprint.substring(0, 8) + '...',
        isAdmin: userData.role === 'admin' || userData.isAdmin === true
      }
    });
    
    return enhancedResponse;
  } catch (error) {
    logger.error('Auth error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
