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

// DEPRECATED: This endpoint is for GPTCH only. Do not use for MZS. All new requests should use mzs_password_reset_requests and mzs collection.
// To enforce, you can throw an error or return a 410 Gone status.
export async function POST(request: NextRequest) {
  return NextResponse.json({ error: 'This endpoint is deprecated. Use the MZS endpoints.' }, { status: 410 });
} 