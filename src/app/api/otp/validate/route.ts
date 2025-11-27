import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import crypto from 'crypto';

interface ValidateOTPRequest {
  otpId: string;
  otpCode: string;
}

export async function POST(request: NextRequest) {
  try {
    // SECURITY: Require authentication with direct JWT verification
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }
    
    const token = authHeader.substring(7);
    
    // Verify session token from database
    let sessionData: any;
    const deviceFingerprint = request.headers.get('x-device-fingerprint') || '';
    const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0] || request.headers.get('x-real-ip') || 'unknown';
    
    try {
      // Use SecureSessionManager to validate session from database
      const { SecureSessionManager } = await import('@/lib/security/secure-session-manager');
      const validationResult = await SecureSessionManager.validateSession(token, deviceFingerprint, ipAddress);
      
      if (!validationResult.valid || !validationResult.session) {
        throw new Error(validationResult.error || 'Session validation failed');
      }
      
      sessionData = validationResult.session;
      
      if (!sessionData.userId || !sessionData.email) {
        throw new Error('Invalid session data');
      }
      
      // OTP validation request processed (session verified from database)
    } catch (error) {
      // Session validation failed for OTP validation
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
    const body: ValidateOTPRequest = await request.json();

    // Validate request body
    if (!body.otpId || !body.otpCode) {
      return NextResponse.json(
        { success: false, error: 'OTP ID and code are required' },
        { status: 400 }
      );
    }

    // Validate OTP code format (6 digits)
    if (!/^\d{6}$/.test(body.otpCode)) {
      return NextResponse.json(
        { success: false, error: 'Invalid OTP format' },
        { status: 400 }
      );
    }

    // Get OTP record from database
    const otpDoc = await db.collection('otp_codes').doc(body.otpId).get();

    if (!otpDoc.exists) {
      await db.collection('audit_logs').add({
        userId: user.uid,
        action: 'OTP_VALIDATION_FAILED',
        details: { reason: 'OTP not found', otpId: body.otpId },
        timestamp: new Date(),
        ipAddress: ipAddress
      });

      return NextResponse.json(
        { success: false, error: 'Invalid or expired verification code' },
        { status: 400 }
      );
    }

    const otpData = otpDoc.data()!;

    // Verify ownership
    if (otpData.userId !== user.uid) {
      await db.collection('audit_logs').add({
        userId: user.uid,
        action: 'OTP_VALIDATION_FAILED',
        details: { reason: 'User mismatch', otpId: body.otpId },
        timestamp: new Date(),
        ipAddress: ipAddress
      });

      return NextResponse.json(
        { success: false, error: 'Invalid verification code' },
        { status: 400 }
      );
    }

    // Check if already used
    if (otpData.used) {
      await db.collection('audit_logs').add({
        userId: user.uid,
        action: 'OTP_VALIDATION_FAILED',
        details: { reason: 'OTP already used', otpId: body.otpId },
        timestamp: new Date(),
        ipAddress: ipAddress
      });

      return NextResponse.json(
        { success: false, error: 'Verification code has already been used' },
        { status: 400 }
      );
    }

    // Check if expired
    const now = new Date();
    const expiresAt = otpData.expiresAt.toDate();
    if (now > expiresAt) {
      await db.collection('audit_logs').add({
        userId: user.uid,
        action: 'OTP_VALIDATION_FAILED',
        details: { reason: 'OTP expired', otpId: body.otpId },
        timestamp: new Date(),
        ipAddress: ipAddress
      });

      return NextResponse.json(
        { success: false, error: 'Verification code has expired' },
        { status: 400 }
      );
    }

    // ENTERPRISE SECURITY: Timing-safe OTP validation with salt
    // Reconstruct hash using stored salt (same method as generation)
    const providedOTPHash = crypto.createHash('sha256')
      .update(otpData.salt + body.otpCode + otpData.userId)
      .digest();
    const storedOTPHash = Buffer.from(otpData.otpHash, 'hex');
    
    // Use crypto.timingSafeEqual to prevent timing attacks
    const isValidOTP = crypto.timingSafeEqual(providedOTPHash, storedOTPHash);
    
    if (!isValidOTP) {
      await db.collection('audit_logs').add({
        userId: user.uid,
        action: 'OTP_VALIDATION_FAILED',
        details: { 
          reason: 'Invalid OTP code - timing-safe verification', 
          otpId: body.otpId,
          securityNote: 'OTP codes not logged for security'
        },
        timestamp: new Date(),
        ipAddress: ipAddress
      });

      // Log failed OTP attempt for anomaly detection
      const { AnomalyMonitor } = await import('@/lib/security/anomaly-monitor');
      
      // Count recent failures
      const recentFailures = await db.collection('audit_logs')
        .where('userId', '==', user.uid)
        .where('action', '==', 'OTP_VALIDATION_FAILED')
        .where('timestamp', '>=', new Date(Date.now() - 60 * 60 * 1000)) // Last hour
        .get();
      
      await AnomalyMonitor.logFailedOTP({
        userId: user.uid,
        email: user.email!,
        ipAddress: ipAddress,
        userAgent: request.headers.get('user-agent') || 'unknown',
        attemptCount: recentFailures.size + 1
      });

      return NextResponse.json(
        { success: false, error: 'Invalid verification code' },
        { status: 400 }
      );
    }

    // Mark OTP as used
    await otpDoc.ref.update({
      used: true,
      usedAt: new Date()
    });

    // Log successful validation
    await db.collection('audit_logs').add({
      userId: user.uid,
      action: 'OTP_VALIDATED_SUCCESS',
      details: { 
        otpId: body.otpId,
        withdrawalDetails: otpData.withdrawalDetails
      },
      timestamp: new Date(),
      ipAddress: ipAddress
    });

    return NextResponse.json({
      success: true,
      message: 'Verification code validated successfully',
      withdrawalDetails: otpData.withdrawalDetails,
      validatedAt: new Date().toISOString()
    });

  } catch (error) {
    // OTP validation error
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}