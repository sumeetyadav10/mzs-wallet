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

export async function GET(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || '';
  if (!allowedIps.includes(ip)) {
    return NextResponse.json({ error: 'Access denied: Your IP is not authorized to view this page.' }, { status: 403 });
  }
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');
  if (!userId) {
    return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
  }
  try {
    const userQuery = await db.collection('mzs').where('user_id', '==', userId).limit(1).get();
    if (userQuery.empty) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    const userData = userQuery.docs[0].data();
    // Remove sensitive fields
    ['password_hash', 'private_key', 'mnemonic', 'seed'].forEach(field => delete userData[field]);
    return NextResponse.json({ user: userData });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 