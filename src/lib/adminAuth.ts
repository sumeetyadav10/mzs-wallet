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

// Admin access is now determined by Firebase authentication
// Any user with a valid Firebase account can access admin panel

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

    // Any authenticated Firebase user can access admin panel
    return { success: true, email };
  } catch (error) {
    console.error('Admin token verification error:', error);
    return { success: false, error: 'Token verification failed' };
  }
}

export async function verifyAdminSession(request: NextRequest): Promise<{ success: boolean; email?: string; adminId?: string; error?: string }> {
  try {
    // Get admin session token from X-Admin-Session header
    const sessionToken = request.headers.get('x-admin-session');
    if (!sessionToken) {
      return { success: false, error: 'Missing admin session token' };
    }
    const deviceFingerprint = request.headers.get('x-device-fingerprint');
    const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0] || request.headers.get('x-real-ip') || 'unknown';
    
    // SECURITY: Device fingerprint handling with fallback
    let effectiveFingerprint = deviceFingerprint;
    
    if (!deviceFingerprint || deviceFingerprint === 'pending') {
      // Generate server-side fallback fingerprint from request data
      const userAgent = request.headers.get('user-agent') || 'unknown';
      const acceptLanguage = request.headers.get('accept-language') || 'unknown';
      const acceptEncoding = request.headers.get('accept-encoding') || 'unknown';
      
      // Create a basic server-side fingerprint
      const serverComponents = [
        ipAddress,
        userAgent.substring(0, 100), // Limit length
        acceptLanguage.substring(0, 50),
        acceptEncoding.substring(0, 50)
      ];
      
      // Simple hash function for server-side fingerprint
      let hash = 0;
      const combined = serverComponents.join('|');
      for (let i = 0; i < combined.length; i++) {
        const char = combined.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
      }
      
      effectiveFingerprint = 'server-fallback-' + Math.abs(hash).toString(36);
      
      console.warn('Admin access with server-side fingerprint fallback', { 
        ip: ipAddress,
        fallbackFingerprint: effectiveFingerprint,
        originalFingerprint: deviceFingerprint
      });
    }
    
    // First try to validate as admin session token (from OTP-based auth)
    try {
      const sessionData = await AdminSessionManager.validateAdminSession(sessionToken);
      if (sessionData && sessionData.email) {
        // DISABLED: Device fingerprint check for admin - allowing access from any device
        // This reduces security but allows admin access from different devices/countries
        console.log('Device fingerprint check disabled for admin access', {
          email: sessionData.email,
          sessionFingerprint: sessionData.deviceFingerprint?.substring(0, 10) + '...',
          providedFingerprint: effectiveFingerprint?.substring(0, 10) + '...',
          ip: ipAddress
        });
        
        // Verify this is an actual admin session (created via OTP auth)
        if (!sessionData.role || sessionData.role !== 'admin') {
          console.error('Non-admin role attempting admin access', { 
            email: sessionData.email,
            role: sessionData.role 
          });
          return { success: false, error: 'Admin role required' };
        }
        
        return { 
          success: true, 
          email: sessionData.email,
          adminId: sessionData.adminId
        };
      }
    } catch (sessionError) {
      console.error('Admin session validation failed:', sessionError);
    }
    
    // NO FALLBACK - Admin must use proper OTP-based authentication
    return { 
      success: false, 
      error: 'Valid admin session required. Please login through admin panel with OTP verification.' 
    };
  } catch (error) {
    console.error('Admin session verification error:', error);
    return { success: false, error: 'Session verification failed' };
  }
}

export function isAdminEmail(email: string): boolean {
  // Any email with a Firebase account is considered admin
  return !!email;
} 