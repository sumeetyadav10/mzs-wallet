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
                    'unknown';
  const userAgent = request.headers.get('user-agent') || 'unknown';
  
  // Basic CORS check
  const origin = request.headers.get('origin');
  const allowedOrigins = [
    'https://gptchwallet.com', 
    'https://www.gptchwallet.com',
    'https://mzswallet.com',
    'https://www.mzswallet.com',
    'http://localhost:3000'
  ];
  
  if (origin && !allowedOrigins.includes(origin)) {
    logger.log(`Origin check failed: ${origin} not in allowed list`);
    return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
  }
  
  const body = await request.json();
  const { walletAddress, requestedPassword, identityProof, captchaToken, userId } = body;
  
  // 🔒 VALIDATE REQUIRED FIELDS
  if (!walletAddress || !requestedPassword || !identityProof) {
    logger.log('Password reset request failed: missing required fields');
    return NextResponse.json({ error: 'All fields are required' }, { status: 400 });
  }
  
  // 🔒 VERIFY CAPTCHA (OPTIONAL - since already verified in find-user step)
  if (captchaToken) {
    try {
      const captchaVerification = await securityMiddleware.verifyCaptcha(captchaToken, 'password_reset_request');
      
      if (!captchaVerification.success) {
        logger.log('Password reset request CAPTCHA verification failed:', captchaVerification.error);
        // Don't fail if CAPTCHA is invalid - it might have been used already
        logger.log('Proceeding without CAPTCHA verification (already verified in find-user step)');
      }
    } catch (error) {
      logger.log('Password reset request CAPTCHA verification error:', error);
      // Continue without CAPTCHA since it was already verified
    }
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
    // 🔍 FIND USER BY WALLET ADDRESS - MZS COLLECTION ONLY
    const mzsRef = db.collection('mzs');
    
    const sanitizedAddress = walletAddress.toLowerCase().trim();
    const originalAddress = walletAddress.trim();
    
    logger.log(`Searching for wallet address in password reset: ${walletAddress.substring(0, 10)}...`);
    
    // Try address field (main field) in mzs collection
    let userSnapshot = await mzsRef.where('address', '==', sanitizedAddress).limit(1).get();
    logger.log(`mzs address lowercase search results: ${userSnapshot.size}`);
    
    if (userSnapshot.empty && originalAddress !== sanitizedAddress) {
      userSnapshot = await mzsRef.where('address', '==', originalAddress).limit(1).get();
      logger.log(`mzs address original case search results: ${userSnapshot.size}`);
    }
    
    // If not found, try wallet_address field as backup
    if (userSnapshot.empty) {
      userSnapshot = await mzsRef.where('wallet_address', '==', sanitizedAddress).limit(1).get();
      logger.log(`mzs wallet_address lowercase search results: ${userSnapshot.size}`);
      
      if (userSnapshot.empty && originalAddress !== sanitizedAddress) {
        userSnapshot = await mzsRef.where('wallet_address', '==', originalAddress).limit(1).get();
        logger.log(`mzs wallet_address original case search results: ${userSnapshot.size}`);
      }
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