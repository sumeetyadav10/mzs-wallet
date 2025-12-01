import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from '@/lib/logger';
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

export async function GET(request: NextRequest) {
  // 🚁 REMOVE INSECURE GET ENDPOINT - DATA LEAKAGE RISK
  return NextResponse.json({ 
    error: 'Endpoint deprecated for security reasons. Use POST with proper authentication.' 
  }, { status: 410 }); // 410 Gone
}

export async function POST(request: NextRequest) {
  // 🔒 SIMPLE SECURITY FOR PASSWORD RESET - CAPTCHA + RATE LIMITING ONLY
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
  const { address, captchaToken } = body;
  
  // 🔒 VALIDATE REQUIRED FIELDS
  if (!address || !captchaToken) {
    logger.log('Password reset lookup failed: missing address or CAPTCHA');
    return NextResponse.json({ error: 'Address and CAPTCHA are required' }, { status: 400 });
  }
  
  // 🔒 VERIFY CAPTCHA (Critical for unauthenticated endpoint)
  try {
    const captchaVerification = await securityMiddleware.verifyCaptcha(captchaToken, 'password_reset_lookup');
    if (!captchaVerification.success) {
      logger.log('Password reset CAPTCHA verification failed');
      return NextResponse.json({ 
        error: 'CAPTCHA verification failed',
        code: 'CAPTCHA_INVALID' 
      }, { status: 400 });
    }
  } catch (error) {
    logger.log('CAPTCHA verification error:', error);
    return NextResponse.json({ 
      error: 'CAPTCHA verification failed',
      code: 'CAPTCHA_INVALID' 
    }, { status: 400 });
  }
  
  // 🔒 BASIC RATE LIMITING FOR PASSWORD RESET (by IP)
  const rateLimitResult = securityManager.checkRateLimit(
    `find_user_unauth_${ipAddress}`,
    5, // 5 lookups per hour per IP for password reset
    60 // 1 hour window
  );
  
  if (!rateLimitResult.allowed) {
    logger.log(`Password reset rate limit exceeded for IP: ${ipAddress}`);
    return NextResponse.json({ 
      error: 'Too many password reset attempts. Please try again later.',
      code: 'RATE_LIMITED'
    }, { status: 429 });
  }
  
  try {
    // 🔒 SECURE DATABASE QUERY - Use properly initialized Firebase instance
    const mzsRef = db.collection('mzs');
    
    // Query mzs collection ONLY
    const sanitizedAddress = address.toLowerCase().trim();
    const originalAddress = address.trim();
    
    logger.log(`Searching for wallet address in mzs collection: ${address.substring(0, 10)}...`);
    
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
    
    // 🔍 DEBUG: Show sample of what addresses exist (without exposing user data)
    if (userSnapshot.empty) {
      logger.log('No match found, checking database connectivity...');
      try {
        const connectivityTest = await mzsRef.limit(1).get();
        logger.log(`Database connectivity: ${connectivityTest.size > 0 ? 'OK' : 'No data'}`);
      } catch (dbError) {
        logger.error('Firebase connectivity error:', dbError);
        return NextResponse.json({ error: 'Database connectivity issue' }, { status: 503 });
      }
    }
    
    if (userSnapshot.empty) {
      logger.log(`Password reset user lookup failed: ${address.substring(0, 10)}...`);
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    
    const userDoc = userSnapshot.docs[0];
    const userResult = { data: userDoc.data(), id: userDoc.id };
    
    const userData = userResult.data;
    
    // 🔒 LOG SUCCESSFUL LOOKUP
    logger.log(`Password reset user lookup successful for: ${address.substring(0, 10)}...`);
    
    return NextResponse.json({ user_id: userData.user_id });
    
  } catch (error) {
    logger.error('Error finding user for password reset:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 