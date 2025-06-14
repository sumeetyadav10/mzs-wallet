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
const allowedIps = ['192.168.31.151'];

export async function GET(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || request.ip || '';
  if (!allowedIps.includes(ip)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  try {
    const snapshot = await db.collection('password_reset_requests').where('status', '==', 'pending').orderBy('requestedAt', 'desc').get();
    const requests = snapshot.docs.map(doc => doc.data());
    return NextResponse.json({ requests });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 