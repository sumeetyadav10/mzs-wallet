import { NextRequest, NextResponse } from 'next/server';
import { securityManager } from '@/lib/security/session-manager-enhanced';
import { securityMiddleware } from '@/lib/security/security-middleware';
import { APISecurityMiddleware } from '@/lib/security/api-security-middleware';
import { JWTSecurityEnhanced } from '@/lib/security/jwt-security-enhanced';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  // For verify-session, we need to handle the case where there's no body
  // Check authentication header directly first
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json({ 
      error: 'Authentication required',
      valid: false 
    }, { status: 401 });
  }

  // 🔒 COMPREHENSIVE SECURITY VALIDATION
  const securityValidation = await APISecurityMiddleware.validateRequest(request, true); // Require auth
  if (!securityValidation.valid) {
    return securityValidation.response!;
  }
  
  const authenticatedUser = securityValidation.user;
  const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0] || 
                    request.headers.get('x-real-ip') || 
                    request.ip || 'unknown';
  const userAgent = request.headers.get('user-agent') || 'unknown';
  const deviceFingerprint = request.headers.get('x-device-fingerprint');

  // Rate limiting and authentication already handled by APISecurityMiddleware
  logger.log('🔒 Session verification with enhanced security for:', authenticatedUser.email);

  try {
    // 🔒 TOKEN ALREADY VERIFIED BY SECURITY MIDDLEWARE
    // The authenticatedUser contains the verified JWT payload
    
    logger.log(`✅ Enhanced security verification passed for: ${authenticatedUser.email}`);

    // 🔒 SESSION VALID - RETURN USER DATA WITH ENHANCED SECURITY
    const response = NextResponse.json({
      valid: true,
      user: {
        userId: authenticatedUser.userId,
        email: authenticatedUser.email,
        isAdmin: authenticatedUser.isAdmin || false,
        authMethod: authenticatedUser.authMethod || 'enhanced_security'
      },
      security: {
        deviceBound: !!deviceFingerprint,
        ipBound: true,
        tokenType: 'enhanced_jwt'
      },
      message: 'Session verified with enhanced security'
    });

    // Log successful session verification
    securityManager.logSecurityEvent({
      type: 'LOGIN_SUCCESS' as const,
      userId: authenticatedUser.userId,
      email: authenticatedUser.email,
      ipAddress,
      userAgent,
      timestamp: Date.now(),
      details: {
        method: 'enhanced_security_middleware',
        deviceBound: !!deviceFingerprint,
        ipBound: true
      }
    });

    return APISecurityMiddleware.addSecurityHeaders(response);

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