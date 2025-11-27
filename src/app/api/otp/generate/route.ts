import { NextRequest, NextResponse } from 'next/server';
import { EmailService } from '@/lib/email-service';
import { db } from '@/lib/firebase-admin';
import crypto from 'crypto';
import { logger } from '@/lib/logger';
import { SecureSessionManager } from '@/lib/security/secure-session-manager';

interface OTPRequest {
  amount: number;
  currency: string;
  toAddress: string;
  blockchain: 'tron' | 'polygon';
}

export async function POST(request: NextRequest) {
  try {
    // Parse request body first (before any other operations that might consume it)
    let body: OTPRequest;
    try {
      body = await request.json();
    } catch (parseError) {
      return NextResponse.json(
        { success: false, error: 'Invalid request body' },
        { status: 400 }
      );
    }
    
    // SECURITY: Require authentication with direct JWT verification
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }
    
    const token = authHeader.substring(7);
    
    // Verify session token from database OR Web3Auth ID token
    let sessionData: any;
    const deviceFingerprint = request.headers.get('x-device-fingerprint') || '';
    const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0] || request.headers.get('x-real-ip') || 'unknown';
    
    try {
      // Use SecureSessionManager to validate session from database
      const validationResult = await SecureSessionManager.validateSession(token, deviceFingerprint, ipAddress);
      
      if (!validationResult.valid || !validationResult.session) {
        throw new Error(validationResult.error || 'Session validation failed');
      }
      
      sessionData = validationResult.session;
      
      if (!sessionData.userId || !sessionData.email) {
        throw new Error('Invalid session data');
      }
      
      // Reduced logging for performance - only log in development
      if (process.env.NODE_ENV === 'development') {
        logger.log(`✅ OTP request initiated (session verified from database)`);
      }
    } catch (error) {
      logger.error('Session validation failed for OTP:', error instanceof Error ? error.message : error);
      
      return NextResponse.json(
        { success: false, error: 'Invalid session - please login again', requiresRelogin: true },
        { status: 401 }
      );
    }
    
    // Extract user data from verified session
    const user = { 
      uid: sessionData.userId, 
      email: sessionData.email,
      web3AuthId: sessionData.web3AuthId,
      provider: sessionData.web3AuthProvider
    };

    // Validate request body
    if (!body.amount || !body.currency || !body.toAddress || !body.blockchain) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // OTP is now REQUIRED for ALL withdrawals regardless of amount
    // This ensures maximum security for all transactions

    // OPTIMIZED RATE LIMITING: Batch queries for better performance
    const now = new Date();
    const tenSecondsAgo = new Date(now.getTime() - 10 * 1000);
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    // Fast check for recent requests first (most likely to fail)
    const recentRequests = await db.collection('otp_requests')
      .where('userId', '==', user.uid)
      .where('createdAt', '>=', tenSecondsAgo)
      .limit(1)
      .get();
    
    if (!recentRequests.empty) {
      // Calculate time remaining
      const lastRequest = recentRequests.docs[0].data();
      const lastRequestTime = lastRequest.createdAt.toDate ? lastRequest.createdAt.toDate() : new Date(lastRequest.createdAt);
      const timeRemaining = Math.ceil((10000 - (now.getTime() - lastRequestTime.getTime())) / 1000);
      
      return NextResponse.json(
        { 
          success: false, 
          error: `Please wait ${timeRemaining} seconds before requesting another OTP.`,
          timeRemaining 
        },
        { status: 429 }
      );
    }

    // Batch the remaining checks to reduce database round trips
    const [ipRequestsPromise, userRequestsPromise] = await Promise.all([
      db.collection('otp_requests')
        .where('ipAddress', '==', ipAddress)
        .where('createdAt', '>=', oneHourAgo)
        .count()
        .get(),
      db.collection('otp_requests')
        .where('userId', '==', user.uid)
        .where('createdAt', '>=', oneDayAgo)
        .count()
        .get()
    ]);
    
    // Check IP-based rate limit (20 requests per hour)
    if (ipRequestsPromise.data().count >= 20) {
      return NextResponse.json(
        { success: false, error: 'Too many OTP requests from this IP. Please try again later.' },
        { status: 429 }
      );
    }
    
    // Check user-based rate limit (50 requests per day)
    if (userRequestsPromise.data().count >= 50) {
      return NextResponse.json(
        { success: false, error: 'Daily OTP request limit exceeded. Please try again tomorrow.' },
        { status: 429 }
      );
    }

    // Generate 6-digit OTP
    const otp = crypto.randomInt(100000, 999999).toString();
    
    // Generate salt for secure hashing (prevents rainbow table attacks)
    const salt = crypto.randomBytes(32).toString('hex');
    
    // Create salted hash for secure storage
    const otpHash = crypto.createHash('sha256').update(salt + otp + user.uid).digest('hex');
    
    // Set expiration to 5 minutes
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    // Batch database operations for better performance
    const batch = db.batch();
    
    // Store OTP in database (salted and hashed - never plaintext)
    const otpDocRef = db.collection('otp_codes').doc();
    batch.set(otpDocRef, {
      userId: user.uid,
      email: user.email,
      otpHash: otpHash,
      salt: salt,
      expiresAt: expiresAt,
      used: false,
      withdrawalDetails: {
        amount: body.amount,
        currency: body.currency,
        toAddress: body.toAddress,
        blockchain: body.blockchain
      },
      createdAt: new Date(),
      ipAddress: request.headers.get('x-forwarded-for') || 'unknown'
    });

    // Track rate limiting in batch
    const rateLimitDocRef = db.collection('otp_requests').doc();
    batch.set(rateLimitDocRef, {
      userId: user.uid,
      ipAddress: ipAddress,
      userAgent: request.headers.get('user-agent') || 'unknown',
      createdAt: new Date(),
      requestType: 'withdrawal_otp'
    });

    // Only add audit log in production/important environments
    if (process.env.NODE_ENV === 'production') {
      const auditLogRef = db.collection('audit_logs').doc();
      batch.set(auditLogRef, {
        userId: user.uid,
        action: 'OTP_GENERATED',
        details: {
          amount: body.amount,
          currency: body.currency,
          blockchain: body.blockchain,
          otpId: otpDocRef.id
        },
        timestamp: new Date(),
        ipAddress: request.headers.get('x-forwarded-for') || 'unknown'
      });
    }

    // Execute all database operations in a single batch
    await batch.commit();

    // Send OTP email
    const emailResult = await EmailService.sendOTPEmail({
      email: user.email!,
      otp: otp,
      amount: body.amount.toString(),
      currency: body.currency,
      toAddress: body.toAddress
    });

    if (!emailResult.success) {
      // Clean up OTP record if email fails - use batch for performance
      const cleanupBatch = db.batch();
      cleanupBatch.delete(otpDocRef);
      await cleanupBatch.commit();
      
      // Provide more specific error message
      let errorMessage = 'Failed to send verification email.';
      if (emailResult.error?.includes('fetch failed')) {
        errorMessage = 'Email service is temporarily unavailable. Please try again in a moment.';
      } else if (emailResult.error?.includes('API key')) {
        errorMessage = 'Email service configuration error. Please contact support.';
      }
      
      return NextResponse.json(
        { 
          success: false, 
          error: errorMessage,
          details: process.env.NODE_ENV === 'development' ? emailResult.error : undefined
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      requiresOTP: true,
      otpId: otpDocRef.id,
      expiresAt: expiresAt.toISOString(),
      message: 'Verification code sent to your email'
    });

  } catch (error) {
    logger.error('OTP generation error:', error);
    logger.error('Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      name: error instanceof Error ? error.name : undefined
    });
    return NextResponse.json(
      { 
        success: false, 
        error: 'Internal server error',
        debug: process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.message : String(error)) : undefined
      },
      { status: 500 }
    );
  }
}