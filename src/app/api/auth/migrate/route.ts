import { NextRequest, NextResponse } from "next/server";
import { getFirestore } from "firebase-admin/firestore";
import { initializeApp, getApps, cert } from "firebase-admin/app";

// Initialize Firebase Admin if not already initialized
if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\n/g, "\n"),
    }),
  });
}

const db = getFirestore();

export async function POST(req: NextRequest) {
  try {
    const { legacyUserId, googleEmail } = await req.json();
    if (!legacyUserId || !googleEmail) {
      return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
    }

    // Query for the legacy user by user_id field in mzs
    const legacyUserSnap = await db.collection("mzs")
      .where("user_id", "==", legacyUserId)
      .limit(1)
      .get();

    if (legacyUserSnap.empty) {
      return NextResponse.json({ error: "Legacy user not found" }, { status: 404 });
    }

    const legacyDoc = legacyUserSnap.docs[0];
    const legacyData = legacyDoc.data();
    if (!legacyData?.private_key) {
      return NextResponse.json({ error: "Legacy private key not found" }, { status: 404 });
    }

    // Update the legacy user doc with auth_email and migration info
    await legacyDoc.ref.update({
      auth_email: googleEmail,
      migratedAt: new Date(),
      migrated: true,
    });

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Migration failed" }, { status: 500 });
  }
} 