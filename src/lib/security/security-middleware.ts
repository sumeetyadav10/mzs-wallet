import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { RateLimiterMemory } from 'rate-limiter-flexible';

// Rate limiter for different types of requests
const rateLimiter = new RateLimiterMemory({
  keyGenerator: (req: NextRequest) => req.ip || 'unknown',
  points: 10, // 10 requests
  duration: 60, // per 60 seconds
});

export interface SecurityMiddlewareOptions {
  requireCaptcha?: boolean;
  maxAttempts?: number;
  windowMinutes?: number;
  blockSuspiciousIPs?: boolean;
}

export const securityMiddleware = {
  validateOrigin(request: NextRequest): boolean {
    const origin = request.headers.get('origin');
    const referer = request.headers.get('referer');
    
    // Allow localhost for development
    if (process.env.NODE_ENV === 'development') {
      const allowedOrigins = [
        'http://localhost:3000',
        'https://localhost:3000',
        'http://127.0.0.1:3000',
        'https://127.0.0.1:3000'
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
      await rateLimiter.consume(request.ip || 'unknown');
      return null; // No security issues
    } catch (rateLimitError) {
      logger.warn('Rate limit exceeded', {
        ip: request.ip,
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

      const response = await fetch('https://www.google.com/recaptcha/api/siteverify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `secret=${secretKey}&response=${captchaToken}`,
      });

      const data = await response.json();
      
      if (data.success) {
        logger.info('CAPTCHA verification successful', { action });
        return { success: true };
      } else {
        logger.warn('CAPTCHA verification failed', { 
          errors: data['error-codes'], 
          action 
        });
        return { success: false, error: 'CAPTCHA verification failed' };
      }
    } catch (error) {
      logger.error('CAPTCHA verification error', { error, action });
      return { success: false, error: 'CAPTCHA verification error' };
    }
  }
};

export default securityMiddleware;