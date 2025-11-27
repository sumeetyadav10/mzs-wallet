import { NextRequest, NextResponse } from 'next/server';
import { AdminMFA } from '@/lib/security/admin-mfa';
import { AdminSessionManager } from '@/lib/security/admin-session-manager';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  try {
    const { challengeId, code } = await request.json();
    
    if (!challengeId || !code) {
      return NextResponse.json(
        { success: false, error: 'Missing challengeId or verification code' },
        { status: 400 }
      );
    }

    // Verify MFA challenge
    const verificationResult = await AdminMFA.verifyMFAChallenge(challengeId, code);
    
    if (!verificationResult.success) {
      return NextResponse.json(
        { success: false, error: verificationResult.error || 'Invalid verification code' },
        { status: 400 }
      );
    }

    // Get device information for session creation
    const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0] || 
                     request.headers.get('x-real-ip') || 'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';
    const deviceFingerprint = request.headers.get('x-device-fingerprint') || 
                             `${ipAddress}-${userAgent}`.substring(0, 50);

    // Create admin session
    const sessionResult = await AdminSessionManager.createAdminSession({
      adminId: verificationResult.adminId!,
      email: verificationResult.email!,
      role: 'admin',
      permissions: ['read', 'write', 'manage_users', 'view_analytics'],
      ipAddress,
      userAgent,
      deviceFingerprint
    });

    logger.log('✅ Admin session created after MFA verification', {
      adminId: verificationResult.adminId,
      email: verificationResult.email,
      challengeId
    });

    return NextResponse.json({
      success: true,
      sessionToken: sessionResult.sessionToken,
      expiresAt: sessionResult.sessionData.expiresAt.toISOString(),
      adminInfo: {
        adminId: verificationResult.adminId,
        email: verificationResult.email,
        role: 'admin'
      }
    });

  } catch (error) {
    logger.error('Admin MFA verification failed:', error);
    return NextResponse.json(
      { success: false, error: 'MFA verification failed' },
      { status: 500 }
    );
  }
}