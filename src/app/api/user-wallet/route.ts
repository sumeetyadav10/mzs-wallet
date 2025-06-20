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
    
    // Get ALL documents with this auth_email (remove limit(1))
    const userQuery = await db.collection('mzs').where('auth_email', '==', email).get();
    if (!userQuery.empty) {
      // 1. Prefer doc with migratedAt (old wallet - highest priority)
      let migratedDoc: any = null;
      let fallbackDoc: any = null;
      
      userQuery.forEach(doc => {
        const data = doc.data();
        if (data.migratedAt && data.private_key) {
          migratedDoc = data;  // OLD WALLET - HIGHEST PRIORITY
        } else if (data.private_key && !fallbackDoc) {
          fallbackDoc = data;  // NEW WALLET - FALLBACK
        }
      });
      
      if (migratedDoc) {
        return NextResponse.json({ private_key: migratedDoc.private_key });
      }
      if (fallbackDoc) {
        return NextResponse.json({ private_key: fallbackDoc.private_key });
      }
      return NextResponse.json({ error: 'No wallet found for this user.' }, { status: 404 });
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