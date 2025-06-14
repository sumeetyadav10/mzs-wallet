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

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get('address');

  if (!address) {
    return NextResponse.json({ error: 'Missing wallet address' }, { status: 400 });
  }

  try {
    const userQuery = await db.collection('mzs').where('address', '==', address).limit(1).get();
    if (userQuery.empty) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    const userData = userQuery.docs[0].data();
    return NextResponse.json({ user_id: userData.user_id });
  } catch (error) {
    console.error('Error finding user:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { address } = await request.json();
    if (!address) {
      return NextResponse.json({ error: 'Missing wallet address' }, { status: 400 });
    }
    const userQuery = await db.collection('mzs').where('address', '==', address).limit(1).get();
    if (userQuery.empty) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    const userData = userQuery.docs[0].data();
    return NextResponse.json({ user_id: userData.user_id });
  } catch (error) {
    console.error('Error finding user:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 