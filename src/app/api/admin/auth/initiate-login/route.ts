import { NextRequest, NextResponse } from 'next/server';
import { AdminMFA } from '@/lib/security/admin-mfa';
import { AdminSessionManager } from '@/lib/security/admin-session-manager';
import { securityMiddleware } from '@/lib/security/security-middleware';
import { DeviceFP, SecAudit } from '@/lib/security/enhanced-security';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { compare } from 'bcryptjs';
import { logger } from '@/lib/logger';

// Initialize Firebase Admin if not already initialized
if (!getApps().length) {
  try {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    });
  } catch (error) {
    logger.error('Firebase Admin initialization error:', error);
  }
}

const db = getFirestore();

export const dynamic = 'force-dynamic';

/**
 * 🔐 MZS WALLET ADMIN LOGIN INITIATION - Step 1 of MFA Flow
 * 
 * This endpoint:
 * 1. Verifies admin credentials
 * 2. Checks admin status in MZS database
 * 3. Generates and sends OTP for MFA
 * 4. Returns temporary challenge ID for completing MFA
 */
export async function POST(request: NextRequest) {
  const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0] || 
                   request.headers.get('x-real-ip') || 
                   '0.0.0.0';
  const userAgent = request.headers.get('user-agent') || '';
  const deviceFingerprint = DeviceFP.generateFingerprint(request);

  try {
    const { email, password, deviceFingerprint: clientDeviceFingerprint, captchaToken } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password required' },
        { status: 400 }
      );
    }

    // Verify CAPTCHA for admin login
    if (!captchaToken) {
      return NextResponse.json(
        { error: 'CAPTCHA verification required' },
        { status: 400 }
      );
    }

    const captchaResult = await securityMiddleware.verifyCaptcha(captchaToken, 'admin_login');
    if (!captchaResult.success) {
      return NextResponse.json(
        { error: 'CAPTCHA verification failed' },
        { status: 400 }
      );
    }

    logger.log('🔐 MZS Admin login initiation attempt', { email, ipAddress });

    // Check if admin is locked out
    const isLockedOut = await AdminSessionManager.isAdminLockedOut(email, ipAddress);
    if (isLockedOut) {
      SecAudit.logCriticalAccess({
        type: 'SECURITY_VIOLATION',
        userId: 'unknown',
        email: email,
        ipAddress,
        userAgent,
        deviceFingerprint,
        operation: 'admin_login_lockout',
        success: false
      });

      return NextResponse.json(
        { error: 'Account temporarily locked due to too many failed attempts' },
        { status: 429 }
      );
    }

    // 1. Verify admin credentials in MZS database
    const adminQuery = await db
      .collection('users')
      .where('auth_email', '==', email)
      .where('role', '==', 'admin')
      .limit(1)
      .get();

    if (adminQuery.empty) {
      // Check if user exists but is not admin
      const userQuery = await db
        .collection('users')
        .where('auth_email', '==', email)
        .limit(1)
        .get();

      await AdminSessionManager.logLoginAttempt({
        email,
        ipAddress,
        userAgent,
        success: false,
        timestamp: new Date(),
        reason: userQuery.empty ? 'user_not_found' : 'not_admin'
      });

      SecAudit.logCriticalAccess({
        type: 'AUTH_FAIL',
        userId: 'unknown',
        email: email,
        ipAddress,
        userAgent,
        deviceFingerprint,
        operation: 'admin_login_not_found',
        success: false
      });

      return NextResponse.json(
        { error: 'Admin account not found' },
        { status: 404 }
      );
    }

    const adminDoc = adminQuery.docs[0];
    const adminData = adminDoc.data();

    // 2. Verify password
    const isPasswordValid = await compare(password, adminData.password_hash);
    
    if (!isPasswordValid) {
      await AdminSessionManager.logLoginAttempt({
        email,
        ipAddress,
        userAgent,
        success: false,
        timestamp: new Date(),
        reason: 'invalid_password'
      });

      SecAudit.logCriticalAccess({
        type: 'AUTH_FAIL',
        userId: adminDoc.id,
        email: email,
        ipAddress,
        userAgent,
        deviceFingerprint,
        operation: 'admin_login_invalid_password',
        success: false
      });

      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    // 3. Get admin MFA settings
    const mfaSettings = await AdminMFA.getAdminMFASettings(adminDoc.id);
    
    // If no MFA setup, create default email MFA
    let enabledMethods = mfaSettings?.enabledMethods || ['email'];

    // 4. Generate MFA challenge (default to email)
    const mfaType = enabledMethods.includes('email') ? 'email' : enabledMethods[0];
    
    const challengeResult = await AdminMFA.generateMFAChallenge({
      adminId: adminDoc.id,
      email: email,
      type: mfaType,
      ipAddress,
      userAgent
    });

    // Log successful password verification
    SecAudit.logCriticalAccess({
      type: 'AUTH_SUCCESS',
      userId: adminDoc.id,
      email: email,
      ipAddress,
      userAgent,
      deviceFingerprint,
      operation: 'admin_login_password_verified',
      success: true,
      details: {
        mfaType,
        challengeGenerated: true
      }
    });

    logger.log('✅ MZS Admin password verified, MFA challenge sent', {
      adminId: adminDoc.id,
      email,
      challengeId: challengeResult.challengeId,
      mfaType
    });

    return NextResponse.json({
      success: true,
      message: 'Password verified. Please complete MFA verification.',
      challengeId: challengeResult.challengeId,
      mfaType: mfaType,
      expiresIn: 300, // 5 minutes
      adminInfo: {
        email: email,
        role: adminData.role,
        permissions: adminData.permissions || ['read', 'write']
      }
    });

  } catch (error) {
    logger.error('MZS Admin login initiation error:', error);
    
    SecAudit.logCriticalAccess({
      type: 'SECURITY_VIOLATION',
      userId: 'unknown',
      email: 'unknown',
      ipAddress,
      userAgent,
      deviceFingerprint,
      operation: 'admin_login_error',
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
    service: 'MZS Wallet Admin Login Initiation',
    version: '2.0',
    description: 'Initiates admin login with password verification and MFA challenge',
    supportedMFA: ['email', 'otp'],
    documentation: 'https://docs.mzswallet.com/api/admin/auth'
  });
}