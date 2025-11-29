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

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  // 🔐 ENHANCED: Verify admin session (requires MFA completion)
  const authResult = await verifyAdminSession(request);
  if (!authResult.success) {
    logger.warn('🚨 Unauthorized admin recovery approval attempt', {
      error: authResult.error,
      ip: request.headers.get('x-forwarded-for') || 'unknown',
      deviceFingerprint: request.headers.get('x-device-fingerprint') || 'missing',
      userAgent: request.headers.get('user-agent') || 'unknown'
    });
    return NextResponse.json({ error: authResult.error || 'Admin session required' }, { status: 403 });
  }
  
  // Log CRITICAL admin action
  logger.warn('⚠️ Admin recovery approval accessed', {
    adminEmail: authResult.email,
    adminId: authResult.adminId,
    ip: request.headers.get('x-forwarded-for') || 'unknown',
    deviceFingerprint: request.headers.get('x-device-fingerprint'),
    action: 'approve_recovery_request',
    severity: 'CRITICAL'
  });
  try {
    const { requestId } = await request.json();
    if (!requestId) {
      return NextResponse.json({ error: 'Missing requestId' }, { status: 400 });
    }
    // Get the request
    const reqDoc = await db.collection('password_reset_requests').doc(requestId).get();
    if (!reqDoc.exists) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 });
    }
    const reqData = reqDoc.data();
    if (!reqData) {
      return NextResponse.json({ error: 'Request data missing' }, { status: 500 });
    }
    if (reqData.status !== 'pending') {
      return NextResponse.json({ error: 'Request already processed' }, { status: 400 });
    }
    // Update user password
    const userQuery = await db.collection('users').where('user_id', '==', reqData.userId).limit(1).get();
    if (userQuery.empty) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    const userRef = userQuery.docs[0].ref;
    await userRef.update({ 
      password_hash: reqData.password_hash,
      password_reset_by_admin: authResult.email,
      password_reset_by_admin_id: authResult.adminId,
      password_reset_at: new Date().toISOString(),
      password_reset_from_ip: request.headers.get('x-forwarded-for') || 'unknown'
    });
    // Mark request as approved
    await reqDoc.ref.update({ 
      status: 'approved', 
      adminActionAt: new Date().toISOString(),
      approvedBy: authResult.email,
      approvedByAdminId: authResult.adminId,
      approvedFromIP: request.headers.get('x-forwarded-for') || 'unknown',
      approvedWithDevice: request.headers.get('x-device-fingerprint') || 'unknown'
    });
    
    // Log critical admin action
    await db.collection('admin_logs').add({
      action: 'password_recovery_approved',
      adminEmail: authResult.email,
      adminId: authResult.adminId,
      targetUserId: reqData.userId,
      requestId: requestId,
      timestamp: new Date().toISOString(),
      ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
      deviceFingerprint: request.headers.get('x-device-fingerprint') || 'unknown',
      userAgent: request.headers.get('user-agent') || 'unknown',
      severity: 'CRITICAL'
    });
    
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 