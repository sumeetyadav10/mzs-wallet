import { NextRequest, NextResponse } from 'next/server';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from '@/lib/logger';

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

// Security: Email validation to prevent Korean phone number attacks
function isValidEmail(email: string): boolean {
  // Reject Korean phone numbers (010xxxxxxxx)
  if (/^01[0-9]{8,9}$/.test(email)) return false;
  // Reject pure numbers that are common attack patterns
  if (/^[0-9]{4,15}$/.test(email)) return false;
  // Basic email format check
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length > 5 && email.length < 100;
}

// Security: Rate limiting (20 requests per 5 minutes per IP - lenient for Google login)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

function checkRateLimit(request: NextRequest): boolean {
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0] : 'unknown';
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  
  if (entry) {
    if (now < entry.resetTime) {
      if (entry.count >= 20) return false; // Rate limited - more lenient for Google login
      entry.count++;
    } else {
      entry.count = 1;
      entry.resetTime = now + 300000; // 5 minutes
    }
  } else {
    rateLimitMap.set(ip, { count: 1, resetTime: now + 300000 });
  }
  return true;
}

export async function POST(request: NextRequest) {
  try {
    // SECURITY FIX: Check origin/referer
    const origin = request.headers.get('origin');
    const referer = request.headers.get('referer');
    
    // Allow requests only from your domain
    const allowedOrigins = [
      'https://gptchwallet.com',
      'https://www.gptchwallet.com',
      'http://localhost:3000' // for development
    ];
    
    const isAllowed = (origin && allowedOrigins.includes(origin)) || 
                     (referer && allowedOrigins.some(allowed => referer.startsWith(allowed)));
    
    if (!isAllowed) {
      logger.warn('🚨 Blocked user-wallet request from:', origin || referer);
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    
    // SECURITY FIX: Add a secret token check - support both web and mobile tokens
    const authHeader = request.headers.get('x-app-token');
    const validTokens = [
      process.env.APP_SECRET_TOKEN || 'gptch-wallet-2024',           // Web version
      'gptch-wallet-2024-5bb127f0d9da4e642c046eb37fdd2562'          // Mobile version
    ];
    
    if (!authHeader || !validTokens.includes(authHeader)) {
      logger.warn('🚨 Invalid app token:', authHeader);
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    
    // Security: Check rate limit FIRST
    if (!checkRateLimit(request)) {
      logger.log('🚫 SECURITY: Rate limit exceeded');
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
    }

    const { email, private_key } = await request.json();
    if (!email) {
      return NextResponse.json({ error: 'Missing email' }, { status: 400 });
    }

    // Security: Validate email format BEFORE any database queries
    if (!isValidEmail(email)) {
      logger.log('🚫 SECURITY: Invalid email format blocked:', email);
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 });
    }
    
    logger.log('🔍 API: Searching for wallet with email:', email);
    logger.log('🔍 API: Email type:', typeof email);
    logger.log('🔍 API: Email length:', email.length);
    
    // Get ALL docs with this auth_email
    const userQuery = await db.collection('users').where('auth_email', '==', email).get();
    logger.log('🔍 API: Query returned', userQuery.size, 'documents');
    
    // Also log first few users to debug
    const allUsersQuery = await db.collection('users').limit(5).get();
    logger.log('🔍 API: Sample users in database:');
    allUsersQuery.forEach(doc => {
      const data = doc.data();
      logger.log('🔍 API: User email:', data.auth_email, 'has private_key:', !!data.private_key);
    });
    if (!userQuery.empty) {
      logger.log('✅ API: Found', userQuery.size, 'users with email:', email);
      // 1. Prefer doc with migratedAt
      let migratedDoc: any = null;
      let migratedDocId: string | null = null;
      let fallbackDoc: any = null;
      let fallbackDocId: string | null = null;
      
      userQuery.forEach(doc => {
        const data = doc.data();
        logger.log('🔍 API: User doc data:', {
          auth_email: data.auth_email,
          has_private_key: !!data.private_key,
          has_migratedAt: !!data.migratedAt,
          created_at: data.created_at,
          user_id: data.user_id
        });
        if (data.migratedAt && data.private_key) {
          migratedDoc = data;
          migratedDocId = doc.id;
          logger.log('✅ API: Found migrated wallet');
        } else if (data.private_key && !fallbackDoc) {
          fallbackDoc = data;
          fallbackDocId = doc.id;
          logger.log('✅ API: Found fallback wallet');
        }
      });
      if (migratedDoc) {
        logger.log('🎉 API: Returning migrated wallet private key and user_id');
        return NextResponse.json({ 
          private_key: migratedDoc.private_key,
          user_id: migratedDoc.user_id || migratedDocId
          // Don't send solana_address - let client derive it from private key
        });
      }
      if (fallbackDoc) {
        logger.log('🎉 API: Returning fallback wallet private key and user_id');
        return NextResponse.json({ 
          private_key: fallbackDoc.private_key,
          user_id: fallbackDoc.user_id || fallbackDocId
          // Don't send solana_address - let client derive it from private key
        });
      }
      logger.log('❌ API: Found users but no valid private keys');
      return NextResponse.json({ error: 'No wallet found for this user.' }, { status: 404 });
    } else {
      logger.log('❌ API: No users found with email:', email);
    }
    // If not found, create user if private_key provided
    if (private_key) {
      logger.log('🔨 API: Creating new user with email:', email);
      const userRef = db.collection('users').doc();
      await userRef.set({
        auth_email: email,
        private_key,
        created_at: new Date().toISOString(),
      });
      logger.log('✅ API: Created new user, returning private key');
      return NextResponse.json({ private_key });
    }
    logger.log('❌ API: No user found and no private_key provided - returning 404');
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 