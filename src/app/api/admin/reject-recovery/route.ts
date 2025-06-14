import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

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
const allowedIps = [
  '192.168.31.151',
  '192.168.120.18',
  '127.0.0.1',
  '::1',
  '61.73.114.166',
  '211.234.181.226',
  '152.56.12.157',
  '2401:4900:7ddd:159c:ee33:3dde:3c2e:7f4a',
  '152.59.13.206',
  '152.58.30.143',
  '91.108.105.43'
];

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || request.ip || '';
  if (!allowedIps.includes(ip)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
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
    await reqDoc.ref.update({ status: 'rejected', adminActionAt: new Date().toISOString() });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 