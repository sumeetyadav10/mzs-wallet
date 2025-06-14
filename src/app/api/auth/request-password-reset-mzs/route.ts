import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import bcrypt from 'bcryptjs';

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
    const { walletAddress, userId, requestedPassword, identityProof } = await request.json();
    if (!walletAddress || !userId || !requestedPassword || !identityProof) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    // Use the MZS collection for user lookup
    const userQuery = await db.collection('mzs').where('address', '==', walletAddress).limit(1).get();
    if (userQuery.empty) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    const userData = userQuery.docs[0].data();
    const passwordHash = await bcrypt.hash(requestedPassword, 10);
    // Store in mzs_password_reset_requests
    await db.collection('mzs_password_reset_requests').add({
      userId: userData.user_id,
      password_hash: passwordHash,
      identityProof,
      status: 'pending',
      createdAt: new Date().toISOString(),
    });
    return NextResponse.json({ success: true, message: 'Password reset request submitted' });
  } catch (error) {
    console.error('Error in MZS password reset request:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 