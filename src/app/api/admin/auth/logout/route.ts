import { NextRequest, NextResponse } from 'next/server';
import { AdminSessionManager } from '@/lib/security/admin-session-manager';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

/**
 * 🔓 ADMIN LOGOUT
 * 
 * This endpoint:
 * 1. Validates current session
 * 2. Destroys the session
 * 3. Clears session cookie
 * 4. Logs the logout event
 */
export async function POST(request: NextRequest) {
  try {
    // Get session from header or cookie
    const sessionId = request.headers.get('X-Admin-Session') || 
                     request.cookies.get('admin-session')?.value;

    if (!sessionId) {
      return NextResponse.json(
        { error: 'No session found' },
        { status: 400 }
      );
    }

    // Get client info for security logging
    const ipAddress = request.headers.get('x-forwarded-for') || 
                     request.headers.get('x-real-ip') || 
                     'unknown';

    // Destroy the session
    const destroyed = AdminSessionManager.destroySession(sessionId);

    if (destroyed) {
      logger.info('🔓 Admin logged out successfully', {
        sessionId: sessionId.substring(0, 8) + '...',
        ipAddress
      });
    }

    // Clear session cookie
    const response = NextResponse.json({
      success: true,
      message: 'Logged out successfully'
    });

    response.cookies.set('admin-session', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      expires: new Date(0),
      path: '/'
    });

    return response;

  } catch (error) {
    logger.error('❌ Admin logout failed', { error });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}