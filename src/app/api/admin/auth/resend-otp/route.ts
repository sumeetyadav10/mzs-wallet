import { NextRequest, NextResponse } from 'next/server';
import { AdminMFA } from '@/lib/security/admin-mfa';
import { securityMiddleware } from '@/lib/security/security-middleware';
import { DeviceFP, SecAudit } from '@/lib/security/enhanced-security';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

/**
 * 🔐 MZS WALLET ADMIN OTP RESEND
 * 
 * Resends MFA verification code for admin login
 */
export async function POST(request: NextRequest) {
  const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0] || 
                   request.headers.get('x-real-ip') || 
                   '0.0.0.0';
  const userAgent = request.headers.get('user-agent') || '';
  const deviceFingerprint = DeviceFP.generateFingerprint(request);

  try {
    const { challengeId, captchaToken } = await request.json();

    if (!challengeId) {
      return NextResponse.json(
        { error: 'Challenge ID required' },
        { status: 400 }
      );
    }

    // Verify CAPTCHA for resend request
    if (!captchaToken) {
      return NextResponse.json(
        { error: 'CAPTCHA verification required for resend' },
        { status: 400 }
      );
    }

    const captchaResult = await securityMiddleware.verifyCaptcha(captchaToken, 'admin_resend_otp');
    if (!captchaResult.success) {
      return NextResponse.json(
        { error: 'CAPTCHA verification failed' },
        { status: 400 }
      );
    }

    logger.log('🔐 MZS Admin OTP resend request', { challengeId, ipAddress });

    // Resend MFA challenge
    const resendResult = await AdminMFA.resendMFAChallenge(challengeId);

    if (!resendResult) {
      SecAudit.logCriticalAccess({
        type: 'SECURITY_VIOLATION',
        userId: 'unknown',
        email: 'unknown',
        ipAddress,
        userAgent,
        deviceFingerprint,
        operation: 'admin_resend_otp_failed',
        success: false,
        details: { challengeId }
      });

      return NextResponse.json(
        { error: 'Failed to resend verification code. Challenge may be expired or invalid.' },
        { status: 400 }
      );
    }

    SecAudit.logCriticalAccess({
      type: 'AUTH_SUCCESS',
      userId: 'unknown',
      email: 'unknown',
      ipAddress,
      userAgent,
      deviceFingerprint,
      operation: 'admin_resend_otp_success',
      success: true,
      details: { challengeId }
    });

    logger.log('✅ MZS Admin OTP resent successfully', { challengeId });

    return NextResponse.json({
      success: true,
      message: 'Verification code resent successfully',
      challengeId: challengeId,
      expiresIn: 300 // 5 minutes
    });

  } catch (error) {
    logger.error('MZS Admin OTP resend error:', error);
    
    SecAudit.logCriticalAccess({
      type: 'SECURITY_VIOLATION',
      userId: 'unknown',
      email: 'unknown',
      ipAddress,
      userAgent,
      deviceFingerprint,
      operation: 'admin_resend_otp_error',
      success: false,
      details: { error: error instanceof Error ? error.message : 'Unknown error' }
    });

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    service: 'MZS Wallet Admin OTP Resend',
    version: '2.0',
    description: 'Resends MFA verification code for admin authentication',
    requiredFields: ['challengeId', 'captchaToken'],
    documentation: 'https://docs.mzswallet.com/api/admin/auth'
  });
}