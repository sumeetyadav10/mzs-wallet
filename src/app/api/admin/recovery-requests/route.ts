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

// Simple in-memory rate limiting
const rateLimit = new Map<string, { count: number; timestamp: number }>();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const MAX_REQUESTS = 30; // 30 requests per minute

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || '';
  console.log('Detected IP:', ip); // Debug log for IP detection
  
  // IP check
  if (!allowedIps.includes(ip)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Rate limiting
  const now = Date.now();
  const rateLimitInfo = rateLimit.get(ip) || { count: 0, timestamp: now };
  
  if (now - rateLimitInfo.timestamp > RATE_LIMIT_WINDOW) {
    rateLimitInfo.count = 0;
    rateLimitInfo.timestamp = now;
  }
  
  rateLimitInfo.count++;
  rateLimit.set(ip, rateLimitInfo);
  
  if (rateLimitInfo.count > MAX_REQUESTS) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': '60' } }
    );
  }

  try {
    const snapshot = await db.collection('mzs_password_reset_requests')
      .orderBy('createdAt', 'desc')
      .limit(100) // Limit to last 100 requests
      .get();

    const requests = snapshot.docs.map(doc => ({
      requestId: doc.id,
      ...doc.data()
    }));

    return NextResponse.json({ 
      requests,
      rateLimit: {
        remaining: MAX_REQUESTS - rateLimitInfo.count,
        reset: Math.ceil((RATE_LIMIT_WINDOW - (now - rateLimitInfo.timestamp)) / 1000)
      }
    });
  } catch (error) {
    console.error('Error fetching recovery requests:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 