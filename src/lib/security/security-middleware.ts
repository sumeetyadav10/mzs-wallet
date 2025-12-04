import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { RateLimiterMemory } from 'rate-limiter-flexible';

// Rate limiter for different types of requests
const rateLimiter = new RateLimiterMemory({
  points: 10, // 10 requests
  duration: 60, // per 60 seconds
});

export interface SecurityMiddlewareOptions {
  requireCaptcha?: boolean;
  requireAuth?: boolean;
  requireAdminRole?: boolean;
  maxAttempts?: number;
  windowMinutes?: number;
  blockSuspiciousIPs?: boolean;
}

export const securityMiddleware = {
  validateOrigin(request: NextRequest): boolean {
    const origin = request.headers.get('origin');
    const referer = request.headers.get('referer');
    const clientType = request.headers.get('x-client-type');
    
    // Allow mobile apps (they don't have origin)
    if (clientType === 'mobile-app') {
      const deviceFingerprint = request.headers.get('x-device-fingerprint');
      if (deviceFingerprint) {
        logger.log('✅ Mobile app request validated', { 
          deviceFingerprint: deviceFingerprint.substring(0, 50) + '...', 
          userAgent: request.headers.get('user-agent'),
          ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown'
        });
        return true;
      } else {
        logger.warn('Mobile app request missing device fingerprint', {
          userAgent: request.headers.get('user-agent'),
          ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown'
        });
      }
    }
    
    // Allow localhost for development
    if (process.env.NODE_ENV === 'development' || origin?.includes('localhost') || origin?.includes('127.0.0.1')) {
      const allowedOrigins = [
        'http://localhost:3000',
        'http://localhost:3001',
        'http://localhost:3010',
        'https://localhost:3000',
        'https://localhost:3001',
        'https://localhost:3010',
        'http://127.0.0.1:3000',
        'http://127.0.0.1:3001',
        'http://127.0.0.1:3010',
        'https://127.0.0.1:3000',
        'https://127.0.0.1:3001',
        'https://127.0.0.1:3010'
      ];
      
      if (origin && allowedOrigins.includes(origin)) {
        return true;
      }
      
      if (referer && allowedOrigins.some(allowed => referer.startsWith(allowed))) {
        return true;
      }
    }
    
    // Production origin validation
    const allowedProductionOrigins = [
      'https://mzswallet.com',
      'https://www.mzswallet.com',
      'https://wallet.mzs.com'
    ];
    
    if (origin && allowedProductionOrigins.includes(origin)) {
      return true;
    }
    
    if (referer && allowedProductionOrigins.some(allowed => referer.startsWith(allowed))) {
      return true;
    }
    
    // Log unauthorized origin attempt
    logger.warn('Unauthorized origin detected', {
      origin,
      referer,
      clientType,
      userAgent: request.headers.get('user-agent'),
      ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown'
    });
    
    return false;
  },

  async applySecurityMiddleware(
    request: NextRequest, 
    options: SecurityMiddlewareOptions = {}
  ): Promise<NextResponse | null> {
    try {
      // Rate limiting
      const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 
                 request.headers.get('x-real-ip') || 
                 'unknown';
      await rateLimiter.consume(ip);
      return null; // No security issues
    } catch (rateLimitError) {
      const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 
                 request.headers.get('x-real-ip') || 
                 'unknown';
      logger.warn('Rate limit exceeded', {
        ip,
        endpoint: request.nextUrl.pathname
      });
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429 }
      );
    }
  },

  async verifyCaptcha(captchaToken: string, action?: string): Promise<{success: boolean; error?: string}> {
    if (!captchaToken) {
      return { success: false, error: 'No captcha token provided' };
    }

    try {
      const secretKey = process.env.RECAPTCHA_SECRET_KEY;
      if (!secretKey) {
        logger.error('Missing RECAPTCHA_SECRET_KEY environment variable');
        return { success: false, error: 'CAPTCHA configuration error' };
      }

      // Debug logging
      logger.info('🔍 CAPTCHA Debug - Sending verification request', {
        tokenLength: captchaToken.length,
        tokenPreview: captchaToken.substring(0, 20) + '...',
        secretKeyExists: !!secretKey,
        secretKeyPreview: secretKey.substring(0, 10) + '...',
        action
      });

      const response = await fetch('https://www.google.com/recaptcha/api/siteverify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `secret=${secretKey}&response=${captchaToken}`,
      });

      const data = await response.json();
      
      // Debug logging
      logger.info('🔍 CAPTCHA Debug - Google response', {
        success: data.success,
        errorCodes: data['error-codes'],
        hostname: data.hostname,
        challengeTs: data.challenge_ts,
        apkPackageName: data.apk_package_name,
        action
      });
      
      if (data.success) {
        logger.info('CAPTCHA verification successful', { action });
        return { success: true };
      } else {
        logger.warn('CAPTCHA verification failed', { 
          errors: data['error-codes'], 
          action,
          hostname: data.hostname,
          fullResponse: data
        });
        return { success: false, error: 'CAPTCHA verification failed' };
      }
    } catch (error) {
      logger.error('CAPTCHA verification error', { error, action });
      return { success: false, error: 'CAPTCHA verification error' };
    }
  },

  createSecureHeaders(): Record<string, string> {
    return {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
      'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.google.com https://www.gstatic.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self' https://www.google.com; frame-src https://www.google.com;"
    };
  }
};

export default securityMiddleware;