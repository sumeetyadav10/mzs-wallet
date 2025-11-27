import { NextRequest, NextResponse } from 'next/server';
import { AdminMFA } from '@/lib/security/admin-mfa';
import { AdminSessionManager } from '@/lib/security/admin-session-manager';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

/**
 * 🔐 ADMIN MFA VERIFICATION - Step 2 of Login Flow
 * 
 * This endpoint:
 * 1. Verifies the OTP code
 * 2. Retrieves pending authentication data
 * 3. Creates admin session
 * 4. Returns session cookie/token
 */
export async function POST(request: NextRequest) {
  try {
    const { tempToken, otpCode, email } = await request.json();

    if (!tempToken || !otpCode || !email) {
      return NextResponse.json(
        { error: 'Temp token, OTP code, and email required' },
        { status: 400 }
      );
    }

    // Get client IP
    const ipAddress = request.headers.get('x-forwarded-for') || 
                     request.headers.get('x-real-ip') || 
                     'unknown';

    // 1. Verify OTP code
    logger.info('🔍 DEBUG: MFA verification attempt', {
      email,
      otpCode,
      ipAddress,
      tempToken: tempToken.substring(0, 8) + '...'
    });
    
    const otpResult = AdminMFA.verifyOTP(email, otpCode, ipAddress);

    logger.info('🔍 DEBUG: OTP verification result', {
      email,
      success: otpResult.success,
      error: otpResult.error
    });

    if (!otpResult.success) {
      logger.warn('🚨 Admin OTP verification failed', {
        email,
        ipAddress,
        error: otpResult.error,
        remainingAttempts: otpResult.remainingAttempts
      });
      return NextResponse.json(
        { 
          error: otpResult.error,
          remainingAttempts: otpResult.remainingAttempts
        },
        { status: 400 }
      );
    }

    // 2. Retrieve and consume pending authentication data
    const pendingAuth = AdminMFA.consumePendingAuth(tempToken);

    if (!pendingAuth) {
      logger.warn('🚨 Invalid or expired temp token in MFA verification', {
        email,
        ipAddress,
        tempToken: tempToken.substring(0, 8) + '...'
      });
      return NextResponse.json(
        { error: 'Invalid or expired authentication session' },
        { status: 400 }
      );
    }

    // 3. Security checks
    if (pendingAuth.email !== email) {
      logger.error('🚨 Email mismatch in MFA verification', {
        pendingEmail: pendingAuth.email,
        providedEmail: email,
        ipAddress
      });
      return NextResponse.json(
        { error: 'Authentication session invalid' },
        { status: 403 }
      );
    }

    if (pendingAuth.ipAddress !== ipAddress) {
      logger.error('🚨 IP address mismatch in MFA verification', {
        pendingIP: pendingAuth.ipAddress,
        currentIP: ipAddress,
        email
      });
      return NextResponse.json(
        { error: 'Authentication session invalid - security violation' },
        { status: 403 }
      );
    }

    // 4. Create admin session
    const sessionId = AdminSessionManager.createSession(
      pendingAuth.email,
      pendingAuth.userId,
      ipAddress,
      request.headers.get('user-agent') || 'unknown',
      pendingAuth.deviceFingerprint
    );

    logger.info('✅ Admin MFA completed successfully - session created', {
      email: pendingAuth.email,
      ipAddress,
      sessionId: sessionId.substring(0, 8) + '...'
    });

    // 5. Set secure session cookie
    const response = NextResponse.json({
      success: true,
      sessionId,
      message: 'Admin authentication completed'
    });

    response.cookies.set('admin-session', sessionId, {
      httpOnly: false, // Allow JavaScript access for admin API calls
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 30 * 60, // 30 minutes
      path: '/'
    });

    return response;

  } catch (error) {
    logger.error('❌ Admin MFA verification failed', { error });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}