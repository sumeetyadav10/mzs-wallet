import { NextRequest, NextResponse } from 'next/server';
import { AdminMFA } from '@/lib/security/admin-mfa';
import { verifyAdminToken } from '@/lib/adminAuth';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  try {
    // First verify basic admin credentials
    const authResult = await verifyAdminToken(request);
    if (!authResult.success) {
      return NextResponse.json(
        { success: false, error: 'Admin authentication required' },
        { status: 401 }
      );
    }

    const { adminId, email, type = 'email' } = await request.json();
    
    if (!adminId || !email) {
      return NextResponse.json(
        { success: false, error: 'Missing adminId or email' },
        { status: 400 }
      );
    }

    // Get IP address and user agent for MFA challenge
    const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0] || 
                     request.headers.get('x-real-ip') || 'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';

    // Generate MFA challenge
    const challenge = await AdminMFA.generateMFAChallenge({
      adminId,
      email,
      type: type as 'otp' | 'email' | 'sms',
      ipAddress,
      userAgent
    });

    logger.log('✅ Admin MFA challenge generated', {
      challengeId: challenge.challengeId,
      adminId,
      email,
      type
    });

    return NextResponse.json({
      success: true,
      challengeId: challenge.challengeId,
      type,
      message: type === 'email' ? 'Verification code sent to your email' : 'Use your authenticator app'
    });

  } catch (error) {
    logger.error('Admin MFA challenge generation failed:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate MFA challenge' },
      { status: 500 }
    );
  }
}