import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import bcrypt from 'bcryptjs';
import { logger } from '@/lib/logger';
import { securityManager } from '@/lib/security/session-manager';
import { securityMiddleware } from '@/lib/security/security-middleware';
import { SQLInjectionPrevention } from '@/lib/security/sql-injection-prevention';

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
  // 🔒 SIMPLE SECURITY FOR PASSWORD RESET REQUEST - CAPTCHA + RATE LIMITING ONLY
  const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0] || 
                    request.headers.get('x-real-ip') || 
                    request.ip || 'unknown';
  const userAgent = request.headers.get('user-agent') || 'unknown';
  
  // Basic CORS check
  const origin = request.headers.get('origin');
  const allowedOrigins = ['https://gptchwallet.com', 'https://www.gptchwallet.com'];
  
  if (origin && !allowedOrigins.includes(origin)) {
    return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
  }
  
  const body = await request.json();
  const { walletAddress, requestedPassword, identityProof, captchaToken } = body;
  
  // 🔒 VALIDATE REQUIRED FIELDS (REMOVED userId - will be looked up internally)
  if (!walletAddress || !requestedPassword || !identityProof || !captchaToken) {
    logger.log('Password reset request failed: missing required fields');
    return NextResponse.json({ error: 'All fields including CAPTCHA are required' }, { status: 400 });
  }
  
  // 🔒 VERIFY CAPTCHA (MANDATORY)
  try {
    const captchaVerification = await securityMiddleware.verifyCaptcha(captchaToken, 'password_reset_request');
    
    if (!captchaVerification.success) {
      logger.log('Password reset request CAPTCHA verification failed:', captchaVerification.error);
      return NextResponse.json({ 
        error: captchaVerification.error || 'CAPTCHA verification failed',
        code: 'CAPTCHA_INVALID'
      }, { status: 400 });
    }
  } catch (error) {
    logger.log('Password reset request CAPTCHA verification error:', error);
    return NextResponse.json({ 
      error: 'CAPTCHA verification failed',
      code: 'CAPTCHA_INVALID' 
    }, { status: 400 });
  }
  
  // 🔒 RATE LIMITING FOR PASSWORD RESET REQUESTS
  const rateLimitResult = securityManager.checkRateLimit(
    `password_reset_request_${ipAddress}`,
    3, // Only 3 attempts per day per IP
    24 * 60 // 24 hours window
  );
  
  if (!rateLimitResult.allowed) {
    logger.log(`Password reset request rate limit exceeded for IP: ${ipAddress}`);
    return NextResponse.json({ 
      error: 'Too many password reset requests. Please try again tomorrow.',
      code: 'RATE_LIMITED'
    }, { status: 429 });
  }
  
  try {
    // 🔍 FIND USER BY WALLET ADDRESS (COMBINED LOOKUP)
    const usersRef = db.collection('users');
    
    const sanitizedAddress = walletAddress.toLowerCase().trim();
    const originalAddress = walletAddress.trim();
    
    logger.log(`Searching for wallet address in password reset: ${walletAddress.substring(0, 10)}...`);
    
    // Try wallet_address field with lowercase first
    let userSnapshot = await usersRef.where('wallet_address', '==', sanitizedAddress).limit(1).get();
    logger.log(`wallet_address lowercase search results: ${userSnapshot.size}`);
    
    // If not found, try wallet_address with original case
    if (userSnapshot.empty && originalAddress !== sanitizedAddress) {
      userSnapshot = await usersRef.where('wallet_address', '==', originalAddress).limit(1).get();
      logger.log(`wallet_address original case search results: ${userSnapshot.size}`);
    }
    
    // If not found, try address field with lowercase
    if (userSnapshot.empty) {
      userSnapshot = await usersRef.where('address', '==', sanitizedAddress).limit(1).get();
      logger.log(`address field lowercase search results: ${userSnapshot.size}`);
    }
    
    // If not found, try address field with original case
    if (userSnapshot.empty && originalAddress !== sanitizedAddress) {
      userSnapshot = await usersRef.where('address', '==', originalAddress).limit(1).get();
      logger.log(`address field original case search results: ${userSnapshot.size}`);
    }
    
    if (userSnapshot.empty) {
      logger.log(`Password reset user not found: ${walletAddress.substring(0, 10)}...`);
      securityManager.logSecurityEvent({
        type: 'LOGIN_FAIL',
        ipAddress,
        userAgent,
        timestamp: Date.now(),
        details: { reason: 'User not found for password reset request', walletAddress: walletAddress.substring(0, 10) + '...' }
      });
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    
    const userDoc = userSnapshot.docs[0];
    const userData = userDoc.data();
    
    // 🔒 USER FOUND - EXTRACT USER ID
    const foundUserId = userData.user_id;
    logger.log(`Password reset user found: ${walletAddress.substring(0, 10)}..., userId: ${foundUserId}`);
    // 🔒 CREATE SECURE PASSWORD HASH
    const passwordHash = await bcrypt.hash(requestedPassword, 12);
    
    // 🔒 STORE REQUEST SECURELY
    await db.collection('password_reset_requests').add({
      userId: foundUserId,
      password_hash: passwordHash,
      identityProof: identityProof.substring(0, 500), // Limit proof size
      status: 'pending',
      createdAt: new Date().toISOString(),
      requestIP: ipAddress,
      requestUserAgent: userAgent,
      walletAddress: walletAddress
    });
    
    // 🔒 LOG SUCCESSFUL REQUEST
    securityManager.logSecurityEvent({
      type: 'LOGIN_SUCCESS',
      ipAddress,
      userAgent,
      timestamp: Date.now(),
      details: { 
        action: 'password_reset_request_submitted',
        userId: foundUserId,
        walletAddress: walletAddress.substring(0, 10) + '...'
      }
    });
    
    return NextResponse.json({ 
      success: true, 
      message: 'Password reset request submitted for review',
      userId: foundUserId // Return userId for frontend display
    });
  } catch (error) {
    logger.error('Error in password reset request:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 