import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { logger } from '@/lib/logger';

// Initialize Firebase Admin if not already initialized
if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

const adminAuth = getAuth();

export const dynamic = 'force-dynamic';

// One-time admin creation endpoint
export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();
    
    // Any valid email can create an admin account
    // Firebase authentication will validate the email/password

    if (!password || password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
    }

    // Create the user
    const userRecord = await adminAuth.createUser({
      email: email,
      password: password,
      emailVerified: true,
    });

    return NextResponse.json({ 
      success: true, 
      message: 'Admin user created successfully',
      uid: userRecord.uid 
    });
  } catch (error: any) {
    logger.error('Error creating admin user:', error);
    
    if (error.code === 'auth/email-already-exists') {
      return NextResponse.json({ error: 'User already exists' }, { status: 409 });
    }
    
    return NextResponse.json({ error: 'Failed to create admin user' }, { status: 500 });
  }
} 