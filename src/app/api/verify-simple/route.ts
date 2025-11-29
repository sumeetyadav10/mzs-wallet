import { NextRequest, NextResponse } from 'next/server';
import { SecureSessionManager } from '@/lib/security/secure-session-manager';

export async function POST(request: NextRequest) {
  try {
    // Get the authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'No authorization header' }, { status: 401 });
    }
    
    const token = authHeader.substring(7);
    const deviceFingerprint = request.headers.get('x-device-fingerprint') || '';
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 
               request.headers.get('x-real-ip') || 
               '::1';
    
    // Validate the session
    const result = await SecureSessionManager.validateSession(token, deviceFingerprint, ip);
    
    if (!result.valid) {
      return NextResponse.json({ error: result.error || 'Invalid session' }, { status: 401 });
    }
    
    // Return success
    return NextResponse.json({
      valid: true,
      user: {
        userId: result.session?.userId,
        email: result.session?.email,
      }
    });
    
  } catch (error) {
    console.error('Simple verify error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}