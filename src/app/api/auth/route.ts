import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { compare } from 'bcryptjs';

// Initialize Firebase Admin if not already initialized
if (!getApps().length) {
  try {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\n/g, '\n'),
      }),
    });
  } catch (error) {
    console.error('Firebase Admin initialization error:', error);
  }
}

const db = getFirestore();

export async function POST(request: NextRequest) {
  console.log('Auth API called');
  try {
    const { user_id, password } = await request.json();
    console.log('Request body:', { ...{ user_id, password }, password: '[REDACTED]' });
    
    if (!user_id || !password) {
      console.log('Missing credentials');
      return NextResponse.json(
        { error: 'Missing user_id or password' },
        { status: 400 }
      );
    }

    console.log('Querying user:', user_id);
    // Query MZS collection
    const userQuery = await db.collection('mzs').where('user_id', '==', user_id).limit(1).get();
    
    if (userQuery.empty) {
      console.log('User not found');
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const userDoc = userQuery.docs[0];
    const userData = userDoc.data();
    console.log('User data found:', { ...userData, password_hash: '[REDACTED]', private_key: '[REDACTED]' });
    
    if (!userData) {
      console.log('User data missing');
      return NextResponse.json(
        { error: 'User data missing' },
        { status: 500 }
      );
    }

    const isPasswordValid = await compare(password, userData.password_hash);
    console.log('Password validation:', isPasswordValid ? 'Success' : 'Failed');
    
    if (!isPasswordValid) {
      return NextResponse.json(
        { error: 'Invalid password' },
        { status: 401 }
      );
    }

    return NextResponse.json({
      private_key: userData.private_key,
      auth_email: userData.auth_email || null,
      message: 'Login successful'
    });
  } catch (error) {
    console.error('Auth error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
