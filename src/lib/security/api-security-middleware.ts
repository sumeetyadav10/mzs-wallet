import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { RateLimiterMemory } from 'rate-limiter-flexible';

// Rate limiters for different endpoints
const rateLimiters = {
  auth: new RateLimiterMemory({
    keyGenerator: (req: NextRequest) => req.ip || 'unknown',
    points: 5, // 5 attempts
    duration: 60, // per 60 seconds
  }),
  api: new RateLimiterMemory({
    keyGenerator: (req: NextRequest) => req.ip || 'unknown',
    points: 60, // 60 requests
    duration: 60, // per 60 seconds
  }),
  wallet: new RateLimiterMemory({
    keyGenerator: (req: NextRequest) => req.ip || 'unknown',
    points: 10, // 10 requests
    duration: 60, // per 60 seconds
  })
};

export interface SecurityMiddlewareOptions {
  rateLimitType?: 'auth' | 'api' | 'wallet';
  requireAuth?: boolean;
  requireAdmin?: boolean;
  validateDeviceFingerprint?: boolean;
}

export interface SecurityValidationResult {
  valid: boolean;
  errors?: string[];
  response?: NextResponse;
  body?: any;
}

export class APISecurityMiddleware {
  // Static method for extracting client IP
  static extractClientIP(request: NextRequest): string {
    const xForwardedFor = request.headers.get('x-forwarded-for');
    if (xForwardedFor) {
      return xForwardedFor.split(',')[0].trim();
    }
    
    const xRealIp = request.headers.get('x-real-ip');
    if (xRealIp) {
      return xRealIp;
    }
    
    return request.ip || 'unknown';
  }

  static async validateRequest(
    request: NextRequest, 
    options: SecurityMiddlewareOptions | boolean = {}
  ): Promise<SecurityValidationResult> {
    // Handle legacy boolean parameter
    if (typeof options === 'boolean') {
      options = { requireAuth: options };
    }
    const {
      rateLimitType = 'api',
      requireAuth = false,
      requireAdmin = false,
      validateDeviceFingerprint = false
    } = options as SecurityMiddlewareOptions;

    try {
      // Parse body for POST requests
      let body: any = null;
      if (request.method === 'POST') {
        try {
          body = await request.json();
        } catch (error) {
          return {
            valid: false,
            errors: ['Invalid JSON in request body'],
            response: NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
          };
        }
      }

      // Rate limiting
      const rateLimiter = rateLimiters[rateLimitType];
      if (rateLimiter) {
        try {
          await rateLimiter.consume(request.ip || 'unknown');
        } catch (rateLimitError) {
          logger.warn('Rate limit exceeded', {
            ip: request.ip,
            endpoint: request.nextUrl.pathname,
            type: rateLimitType
          });
          return {
            valid: false,
            errors: ['Rate limit exceeded'],
            response: NextResponse.json({ error: 'Too many requests' }, { status: 429 })
          };
        }
      }

      // Basic security headers validation
      const contentType = request.headers.get('content-type');
      if (request.method === 'POST' && !contentType?.includes('application/json')) {
        return {
          valid: false,
          errors: ['Invalid content type'],
          response: NextResponse.json({ error: 'Invalid content type' }, { status: 400 })
        };
      }

      // Device fingerprint validation
      if (validateDeviceFingerprint) {
        const deviceFingerprint = request.headers.get('x-device-fingerprint');
        if (!deviceFingerprint) {
          logger.warn('Missing device fingerprint', {
            ip: request.ip,
            endpoint: request.nextUrl.pathname
          });
          return {
            valid: false,
            errors: ['Missing device fingerprint'],
            response: NextResponse.json({ error: 'Device fingerprint required' }, { status: 400 })
          };
        }
      }

      // Log security event
      logger.info('API request validated', {
        method: request.method,
        endpoint: request.nextUrl.pathname,
        ip: request.ip,
        userAgent: request.headers.get('user-agent')?.substring(0, 100)
      });

      return { valid: true, body }; // Success
    } catch (error) {
      logger.error('Security middleware error', { error });
      return {
        valid: false,
        errors: ['Security validation failed'],
        response: NextResponse.json({ error: 'Security validation failed' }, { status: 500 })
      };
    }
  }

  static async validateAuthToken(request: NextRequest): Promise<any> {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      throw new Error('Missing or invalid authorization header');
    }

    const token = authHeader.substring(7);
    // Here you would validate the JWT token
    // For now, return a mock validation
    return { userId: 'user123', email: 'user@example.com' };
  }

  static addSecurityHeaders(response: NextResponse): NextResponse {
    // Add security headers to the response
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set('X-XSS-Protection', '1; mode=block');
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    response.headers.set('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    
    return response;
  }
}

export default APISecurityMiddleware;