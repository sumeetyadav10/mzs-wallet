import { NextRequest, NextResponse } from 'next/server';
import { AdminMFA } from '@/lib/security/admin-mfa';
import { AdminSessionManager } from '@/lib/security/admin-session-manager';
import { logger } from '@/lib/logger';
import crypto from 'crypto';

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
    const { challengeId, otpCode, email } = await request.json();

    if (!challengeId || !otpCode || !email) {
      return NextResponse.json(
        { error: 'Challenge ID, OTP code, and email required' },
        { status: 400 }
      );
    }

    // Get client IP
    const ipAddress = request.headers.get('x-forwarded-for') || 
                     request.headers.get('x-real-ip') || 
                     'unknown';

    // 1. Verify MFA challenge
    logger.info('🔍 DEBUG: MFA verification attempt', {
      email,
      otpCode,
      ipAddress,
      challengeId: challengeId.substring(0, 8) + '...'
    });
    
    const otpResult = await AdminMFA.verifyMFAChallenge(challengeId, otpCode);

    logger.info('🔍 DEBUG: OTP verification result', {
      email,
      success: otpResult.success,
      error: otpResult.error
    });

    if (!otpResult.success) {
      logger.warn('🚨 Admin OTP verification failed', {
        email,
        ipAddress,
        error: otpResult.error
      });
      return NextResponse.json(
        { 
          error: otpResult.error
        },
        { status: 400 }
      );
    }

    // 2. Security check - verify email matches
    if (otpResult.email !== email) {
      logger.error('🚨 Email mismatch in MFA verification', {
        challengeEmail: otpResult.email,
        providedEmail: email,
        ipAddress
      });
      return NextResponse.json(
        { error: 'Authentication session invalid' },
        { status: 403 }
      );
    }

    // 3. Create admin session
    const { sessionToken } = await AdminSessionManager.createAdminSession({
      adminId: otpResult.adminId!,
      email: otpResult.email!,
      role: 'admin',
      permissions: ['all'],
      ipAddress,
      userAgent: request.headers.get('user-agent') || 'unknown',
      deviceFingerprint: crypto.randomUUID() // Generate device fingerprint
    });

    logger.info('✅ Admin MFA completed successfully - session created', {
      email: otpResult.email,
      ipAddress,
      sessionId: sessionToken.substring(0, 8) + '...'
    });

    // 4. Set secure session cookie
    const response = NextResponse.json({
      success: true,
      sessionId: sessionToken,
      message: 'Admin authentication completed'
    });

    response.cookies.set('admin-session', sessionToken, {
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