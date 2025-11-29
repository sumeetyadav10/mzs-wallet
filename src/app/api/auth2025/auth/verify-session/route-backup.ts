import { NextRequest, NextResponse } from 'next/server';
import { securityManager } from '@/lib/security/session-manager';
import { securityMiddleware } from '@/lib/security/security-middleware';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0] || 
                    request.headers.get('x-real-ip') || 
                    'unknown';
  const userAgent = request.headers.get('user-agent') || 'unknown';

  // Apply rate limiting to prevent session enumeration attacks
  const rateLimitResult = securityManager.checkRateLimit(
    `verify_session_${ipAddress}`,
    10, // 10 attempts per 5 minutes
    5
  );

  if (!rateLimitResult.allowed) {
    securityManager.logSecurityEvent({
      type: 'RATE_LIMITED',
      ipAddress,
      userAgent,
      timestamp: Date.now(),
      details: { 
        reason: 'Session verification rate limit exceeded',
        attempts: rateLimitResult.remaining
      }
    });

    return NextResponse.json({ 
      error: 'Rate limit exceeded',
      code: 'RATE_LIMITED',
      message: 'Too many session verification attempts',
      valid: false
    }, { 
      status: 429,
      headers: {
        'X-RateLimit-Limit': '10',
        'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
        'X-RateLimit-Reset': rateLimitResult.resetTime.toString(),
        'Retry-After': Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000).toString()
      }
    });
  }

  try {
    // Get session token from Authorization header
    const authHeader = request.headers.get('authorization');
    const sessionToken = authHeader?.replace('Bearer ', '');

    if (!sessionToken) {
      securityManager.logSecurityEvent({
        type: 'LOGIN_FAIL',
        ipAddress,
        userAgent,
        timestamp: Date.now(),
        details: { reason: 'No session token provided for verification' }
      });

      return NextResponse.json({ 
        error: 'No session token provided',
        valid: false 
      }, { status: 401 });
    }

    // Verify the session
    const session = await securityManager.verifySession(sessionToken);

    if (!session) {
      securityManager.logSecurityEvent({
        type: 'SESSION_EXPIRED',
        ipAddress,
        userAgent,
        timestamp: Date.now(),
        details: { reason: 'Session verification failed' }
      });

      return NextResponse.json({ 
        error: 'Invalid or expired session',
        valid: false 
      }, { status: 401 });
    }

    // Session is valid
    const response = NextResponse.json({
      valid: true,
      session: {
        userId: session.userId,
        email: session.email,
        isAdmin: session.isAdmin,
        lastActivity: session.lastActivity,
        loginTime: session.loginTime
      },
      message: 'Session verified successfully'
    });

    // Add security headers
    const secureHeaders = securityMiddleware.createSecureHeaders();
    Object.entries(secureHeaders).forEach(([key, value]) => {
      response.headers.set(key, value);
    });

    return response;

  } catch (error) {
    securityManager.logSecurityEvent({
      type: 'LOGIN_FAIL',
      ipAddress,
      userAgent,
      timestamp: Date.now(),
      details: { 
        reason: 'Internal error in session verification',
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    });

    return NextResponse.json({ 
      error: 'Internal server error',
      valid: false 
    }, { status: 500 });
  }
}