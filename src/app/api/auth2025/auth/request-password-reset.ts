import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import bcrypt from 'bcryptjs';
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

export async function POST(request: NextRequest) {
  try {
    const { walletAddress, userId, requestedPassword, identityProof, captchaToken } = await request.json();
    
    // SECURITY: CAPTCHA validation is REQUIRED for password reset requests
    if (!captchaToken) {
      return NextResponse.json({ 
        error: 'CAPTCHA verification required', 
        message: '보안 인증이 필요합니다. 페이지를 새로고침하고 다시 시도해주세요.'
      }, { status: 400 });
    }
    
    // Verify CAPTCHA token with Google reCAPTCHA
    const captchaResult = await securityMiddleware.verifyCaptcha(captchaToken);
    if (!captchaResult.success) {
      return NextResponse.json({ 
        error: 'CAPTCHA verification failed', 
        message: '보안 인증에 실패했습니다. 다시 시도해주세요.'
      }, { status: 400 });
    }
    if (!walletAddress || !userId || !requestedPassword || !identityProof) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    const password_hash = await bcrypt.hash(requestedPassword, 10);
    const requestRef = db.collection('password_reset_requests').doc();
    await requestRef.set({
      requestId: requestRef.id,
      walletAddress,
      userId,
      password_hash,
      identityProof,
      requestedAt: new Date().toISOString(),
      status: 'pending',
    });
    return NextResponse.json({ success: true, requestId: requestRef.id });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 