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

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  // Verify admin authentication
  const authResult = await verifyAdminToken(request);
  if (!authResult.success) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  try {
    const snapshot = await db.collection('mzs_password_reset_requests')
      .orderBy('createdAt', 'desc')
      .limit(100) // Limit to last 100 requests
      .get();

    const requests = snapshot.docs.map(doc => ({
      requestId: doc.id,
      ...doc.data()
    }));

    return NextResponse.json({ requests });
  } catch (error) {
    console.error('Error fetching recovery requests:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 