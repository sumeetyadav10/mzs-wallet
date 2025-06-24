import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { verifyAdminToken } from '@/lib/adminAuth';

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

const db = getFirestore();

export async function POST(request: NextRequest) {
  // Verify admin authentication
  const authResult = await verifyAdminToken(request);
  if (!authResult.success) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  try {
    const { requestId } = await request.json();
    if (!requestId) {
      return NextResponse.json({ error: 'Missing requestId' }, { status: 400 });
    }
    // Get the request
    const reqDoc = await db.collection('mzs_password_reset_requests').doc(requestId).get();
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
    // Mark request as rejected
    await reqDoc.ref.update({ 
      status: 'rejected', 
      adminActionAt: new Date().toISOString(),
      adminEmail: authResult.email
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 