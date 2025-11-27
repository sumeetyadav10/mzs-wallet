import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { NextRequest } from 'next/server';
import { AdminSessionManager } from '@/lib/security/admin-session-manager';

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

// Admin email whitelist - Update these with your admin emails
const ADMIN_EMAILS = [
  'whdtj74@gmail.com',
  // Add more admin emails here
];

export async function verifyAdminToken(request: NextRequest): Promise<{ success: boolean; email?: string; error?: string }> {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return { success: false, error: 'Missing or invalid authorization header' };
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    const auth = getAuth();
    
    // Verify the Firebase token
    const decodedToken = await auth.verifyIdToken(token);
    const email = decodedToken.email;

    if (!email) {
      return { success: false, error: 'No email found in token' };
    }

    // Check if email is in admin whitelist
    if (!ADMIN_EMAILS.includes(email)) {
      return { success: false, error: 'Email not authorized for admin access' };
    }

    return { success: true, email };
  } catch (error) {
    console.error('Admin token verification error:', error);
    return { success: false, error: 'Token verification failed' };
  }
}

export async function verifyAdminSession(request: NextRequest): Promise<{ success: boolean; email?: string; error?: string }> {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return { success: false, error: 'Missing or invalid authorization header' };
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    
    // First try to validate as admin session token
    try {
      const sessionData = await AdminSessionManager.validateAdminSession(token);
      if (sessionData && sessionData.email) {
        // Check if email is still in admin whitelist
        if (!ADMIN_EMAILS.includes(sessionData.email)) {
          return { success: false, error: 'Email no longer authorized for admin access' };
        }
        return { success: true, email: sessionData.email };
      }
    } catch (sessionError) {
      // If session validation fails, fall back to Firebase token validation
    }
    
    // Fall back to Firebase token verification for backward compatibility
    const auth = getAuth();
    const decodedToken = await auth.verifyIdToken(token);
    const email = decodedToken.email;

    if (!email) {
      return { success: false, error: 'No email found in token' };
    }

    // Check if email is in admin whitelist
    if (!ADMIN_EMAILS.includes(email)) {
      return { success: false, error: 'Email not authorized for admin access' };
    }

    return { success: true, email };
  } catch (error) {
    console.error('Admin session verification error:', error);
    return { success: false, error: 'Session verification failed' };
  }
}

export function isAdminEmail(email: string): boolean {
  return ADMIN_EMAILS.includes(email);
}

export { ADMIN_EMAILS }; 