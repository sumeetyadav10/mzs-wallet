import { NextRequest, NextResponse } from 'next/server';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

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
  try {
    const { email, private_key } = await request.json();
    if (!email) {
      return NextResponse.json({ error: 'Missing email' }, { status: 400 });
    }
    // Check if user exists in mzs
    const userQuery = await db.collection('mzs').where('auth_email', '==', email).limit(1).get();
    if (!userQuery.empty) {
      const userData = userQuery.docs[0].data();
      return NextResponse.json({ private_key: userData.private_key });
    }
    // If not found, create user if private_key provided
    if (private_key) {
      const userRef = db.collection('mzs').doc();
      await userRef.set({
        auth_email: email,
        private_key,
        created_at: new Date().toISOString(),
      });
      return NextResponse.json({ private_key });
    }
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 