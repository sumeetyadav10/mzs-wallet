import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { verifyAdminSession } from '@/lib/adminAuth';
import { logger } from '@/lib/logger';

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

// Enhanced admin rate limiting
const rateLimit = new Map<string, { count: number; timestamp: number }>();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const MAX_REQUESTS = 20; // Reduced for security: 20 requests per minute

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  // 🔐 ENHANCED: Verify admin session (requires MFA completion)
  const authResult = await verifyAdminSession(request);
  if (!authResult.success) {
    logger.warn('🚨 Unauthorized admin recovery requests access attempt', {
      error: authResult.error,
      ip: request.headers.get('x-forwarded-for') || 'unknown',
      deviceFingerprint: request.headers.get('x-device-fingerprint') || 'missing',
      userAgent: request.headers.get('user-agent') || 'unknown'
    });
    return NextResponse.json({ error: authResult.error || 'Admin session required' }, { status: 403 });
  }
  
  // Log successful admin access
  logger.log('✅ Admin recovery-requests API accessed', {
    adminEmail: authResult.email,
    adminId: authResult.adminId,
    ip: request.headers.get('x-forwarded-for') || 'unknown',
    deviceFingerprint: request.headers.get('x-device-fingerprint'),
    action: 'view_recovery_requests'
  });

  // Rate limiting by user email
  const userEmail = authResult.email!;
  const now = Date.now();
  const rateLimitInfo = rateLimit.get(userEmail) || { count: 0, timestamp: now };
  
  if (now - rateLimitInfo.timestamp > RATE_LIMIT_WINDOW) {
    rateLimitInfo.count = 0;
    rateLimitInfo.timestamp = now;
  }
  
  rateLimitInfo.count++;
  rateLimit.set(userEmail, rateLimitInfo);
  
  if (rateLimitInfo.count > MAX_REQUESTS) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': '60' } }
    );
  }

  try {
    const snapshot = await db.collection('password_reset_requests')
      .orderBy('createdAt', 'desc')
      .limit(100) // Limit to last 100 requests
      .get();

    const requests = snapshot.docs.map(doc => ({
      requestId: doc.id,
      ...doc.data()
    }));

    return NextResponse.json({ 
      requests,
      rateLimit: {
        remaining: MAX_REQUESTS - rateLimitInfo.count,
        reset: Math.ceil((RATE_LIMIT_WINDOW - (now - rateLimitInfo.timestamp)) / 1000)
      }
    });
  } catch (error) {
    logger.error('Error fetching recovery requests:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 