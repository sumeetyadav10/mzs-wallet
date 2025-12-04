import { NextRequest, NextResponse } from "next/server";
import { getFirestore } from "firebase-admin/firestore";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { securityManager } from '@/lib/security/session-manager';
import { securityMiddleware } from '@/lib/security/security-middleware';

// Initialize Firebase Admin if not already initialized
if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}

const db = getFirestore();

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  // CRITICAL: Account migration requires authentication from legacy system
  const securityResult = await securityMiddleware.applySecurityMiddleware(req, {
    requireAuth: true, // Must be authenticated with legacy system
    requireCaptcha: false, // CAPTCHA was already verified during login
    maxAttempts: 5, // Allow reasonable attempts for migration
    windowMinutes: 60,
    blockSuspiciousIPs: true,
    requireAdminRole: false // Users can migrate their own accounts
  });
  
  if (securityResult) {
    return securityResult;
  }
  
  const ipAddress = req.headers.get('x-forwarded-for')?.split(',')[0] || 
                    req.headers.get('x-real-ip') || 
                    'unknown';
  const userAgent = req.headers.get('user-agent') || 'unknown';

  // CRITICAL: Block all direct API access - only allow from website
  const referer = req.headers.get('referer') || '';
  const origin = req.headers.get('origin') || '';
  
  const allowedDomains = [
    'https://gptchwallet.com',
    'https://www.gptchwallet.com',
    'https://mzswallet.com',
    'https://www.mzswallet.com',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:3010',
    'https://localhost:3000',
    'https://localhost:3001',
    'https://localhost:3010'
  ];

  const isValidOrigin = allowedDomains.some(domain => 
    referer.startsWith(domain) || origin === domain
  );

  if (!isValidOrigin) {
    securityManager.logSecurityEvent({
      type: 'LOGIN_FAIL',
      ipAddress,
      userAgent,
      timestamp: Date.now(),
      details: { 
        reason: 'Direct API access blocked',
        referer,
        origin,
        endpoint: 'migrate'
      }
    });

    return NextResponse.json({ 
      error: 'Direct API access not allowed' 
    }, { status: 403 });
  }
  
  try {
    const { legacyUserId, googleEmail, captchaToken } = await req.json();
    if (!legacyUserId || !googleEmail) {
      securityManager.logSecurityEvent({
        type: 'LOGIN_FAIL',
        ipAddress,
        userAgent,
        timestamp: Date.now(),
        details: { reason: 'Missing parameters in account migration', endpoint: 'migrate' }
      });
      
      return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
    }
    
    // Verify session token from legacy auth
    const authHeader = req.headers.get('authorization');
    const sessionToken = authHeader?.replace('Bearer ', '');
    
    if (!sessionToken) {
      securityManager.logSecurityEvent({
        type: 'LOGIN_FAIL',
        email: googleEmail,
        ipAddress,
        userAgent,
        timestamp: Date.now(),
        details: { reason: 'No session token for account migration' }
      });
      
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    
    // Verify the session
    const session = await securityManager.verifySession(sessionToken);
    if (!session) {
      securityManager.logSecurityEvent({
        type: 'LOGIN_FAIL',
        email: googleEmail,
        ipAddress,
        userAgent,
        timestamp: Date.now(),
        details: { reason: 'Invalid session for account migration' }
      });
      
      return NextResponse.json({ error: 'Invalid or expired session' }, { status: 401 });
    }
    
    // CRITICAL: Verify the session belongs to the user being migrated
    if (session.userId !== legacyUserId && session.email !== legacyUserId) {
      securityManager.logSecurityEvent({
        type: 'SECURITY_VIOLATION',
        userId: session.userId,
        email: googleEmail,
        ipAddress,
        userAgent,
        timestamp: Date.now(),
        details: { 
          reason: 'User attempted to migrate different account',
          sessionUserId: session.userId,
          attemptedUserId: legacyUserId 
        }
      });
      
      return NextResponse.json({ error: 'Unauthorized: Cannot migrate another user account' }, { status: 403 });
    }
    
    // Check if the Google email is already in use
    const existingEmailQuery = await db.collection('mzs')
      .where('auth_email', '==', googleEmail)
      .limit(1)
      .get();
    
    if (!existingEmailQuery.empty) {
      securityManager.logSecurityEvent({
        type: 'LOGIN_FAIL',
        userId: session.userId,
        email: googleEmail,
        ipAddress,
        userAgent,
        timestamp: Date.now(),
        details: { 
          reason: 'Email already in use',
          existingEmail: googleEmail
        }
      });
      
      return NextResponse.json({ 
        error: 'This email is already in use. Please use a different email address.' 
      }, { status: 409 });
    }
    
    // Log if admin is performing migration for another user
    if (session.isAdmin && session.email !== googleEmail) {
      securityManager.logSecurityEvent({
        type: 'LOGIN_SUCCESS' as const,
        userId: session.userId,
        email: googleEmail,
        ipAddress,
        userAgent,
        timestamp: Date.now(),
        details: { 
          action: 'ADMIN_ACCOUNT_MIGRATION',
          sessionEmail: session.email,
          targetEmail: googleEmail,
          legacyUserId
        }
      });
    }

    // 1. Query for the legacy user by user_id field in mzs collection
    const legacyUserSnap = await db.collection("mzs")
      .where("user_id", "==", legacyUserId)
      .limit(1)
      .get();

    if (legacyUserSnap.empty) {
      securityManager.logSecurityEvent({
        type: 'LOGIN_FAIL',
        userId: session.userId,
        email: googleEmail,
        ipAddress,
        userAgent,
        timestamp: Date.now(),
        details: { reason: 'Legacy user not found for migration', legacyUserId }
      });
      
      return NextResponse.json({ error: "Legacy user not found" }, { status: 404 });
    }

    const legacyDoc = legacyUserSnap.docs[0];
    const legacyData = legacyDoc.data();
    if (!legacyData?.private_key) {
      return NextResponse.json({ error: "Legacy private key not found" }, { status: 404 });
    }

    // 2. Update the legacy user doc with auth_email and migration info
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