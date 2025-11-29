import { NextRequest } from 'next/server';
import crypto from 'crypto';
import { logger } from '@/lib/logger';

/**
 * 🔒 MZS WALLET ENHANCED SECURITY MODULES
 * 
 * Collection of advanced security utilities
 */

// Device Fingerprinting
export class DeviceFP {
  static generateFingerprint(request: NextRequest): string {
    const userAgent = request.headers.get('user-agent') || '';
    const acceptLanguage = request.headers.get('accept-language') || '';
    const acceptEncoding = request.headers.get('accept-encoding') || '';
    const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0] || 
                     request.headers.get('x-real-ip') || '0.0.0.0';

    const fingerprint = crypto
      .createHash('sha256')
      .update(`${userAgent}-${acceptLanguage}-${acceptEncoding}-${ipAddress}`)
      .digest('hex')
      .substring(0, 16);

    return fingerprint;
  }
}

// Request Signing
export class ReqSign {
  private static readonly SECRET = process.env.REQUEST_SIGNING_SECRET || 'mzs-wallet-request-secret';

  static generateRequestSignature(userId: string, timestamp: number, operation: string): string {
    const payload = `${userId}-${timestamp}-${operation}`;
    return crypto
      .createHmac('sha256', this.SECRET)
      .update(payload)
      .digest('hex');
  }

  static verifyRequestSignature(
    userId: string, 
    timestamp: number, 
    operation: string, 
    signature: string
  ): boolean {
    // Check timestamp (must be within 5 minutes)
    const now = Date.now();
    if (Math.abs(now - timestamp) > 5 * 60 * 1000) {
      return false;
    }

    const expectedSignature = this.generateRequestSignature(userId, timestamp, operation);
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  }
}

// Critical Rate Limiting
export class CriticalRL {
  private static attempts = new Map<string, { count: number; resetTime: number; }>();

  static checkCriticalOperation(
    key: string, 
    operation: string,
    maxAttempts: number = 5,
    windowMs: number = 15 * 60 * 1000 // 15 minutes
  ): { allowed: boolean; remainingAttempts: number; resetTimeMs: number } {
    const now = Date.now();
    const record = this.attempts.get(key);

    if (!record || now > record.resetTime) {
      // Reset or create new record
      this.attempts.set(key, { count: 1, resetTime: now + windowMs });
      return { 
        allowed: true, 
        remainingAttempts: maxAttempts - 1, 
        resetTimeMs: now + windowMs 
      };
    }

    if (record.count >= maxAttempts) {
      return { 
        allowed: false, 
        remainingAttempts: 0, 
        resetTimeMs: record.resetTime 
      };
    }

    record.count++;
    return { 
      allowed: true, 
      remainingAttempts: maxAttempts - record.count, 
      resetTimeMs: record.resetTime 
    };
  }
}

// Secure Authentication
export class SecAuth {
  private static challenges = new Map<string, { userId: string; operation: string; expires: number; }>();

  static generateChallenge(userId: string, operation: string): { challenge: string; expiresIn: number } {
    const challenge = crypto.randomBytes(32).toString('hex');
    const expiresIn = 5 * 60 * 1000; // 5 minutes
    const expires = Date.now() + expiresIn;

    this.challenges.set(challenge, { userId, operation, expires });

    // Cleanup expired challenges
    this.cleanupExpiredChallenges();

    return { challenge, expiresIn };
  }

  static verifyChallenge(challengeId: string, userId: string, operation: string): boolean {
    const challenge = this.challenges.get(challengeId);
    
    if (!challenge) {
      return false;
    }

    if (Date.now() > challenge.expires) {
      this.challenges.delete(challengeId);
      return false;
    }

    if (challenge.userId !== userId || challenge.operation !== operation) {
      return false;
    }

    // Remove challenge after use (one-time use)
    this.challenges.delete(challengeId);
    return true;
  }

  private static cleanupExpiredChallenges() {
    const now = Date.now();
    for (const [challengeId, challenge] of Array.from(this.challenges.entries())) {
      if (now > challenge.expires) {
        this.challenges.delete(challengeId);
      }
    }
  }
}

// Security Audit
export class SecAudit {
  static logCriticalAccess(data: {
    type: 'AUTH_SUCCESS' | 'AUTH_FAIL' | 'PRIVATE_KEY_ACCESS' | 'SECURITY_VIOLATION';
    userId: string;
    email: string;
    ipAddress: string;
    userAgent: string;
    deviceFingerprint: string;
    operation: string;
    success: boolean;
    details?: any;
  }) {
    const auditEntry = {
      timestamp: new Date().toISOString(),
      service: 'MZS-WALLET',
      ...data
    };

    logger.security('Security audit log', auditEntry);

    // In production, this would also:
    // 1. Send to external security monitoring
    // 2. Store in secure audit database
    // 3. Trigger alerts for critical violations
  }
}

// Private Key Protection
export class PKProtect {
  private static readonly TRANSPORT_SECRET = process.env.PK_TRANSPORT_SECRET || 'mzs-wallet-pk-transport-secret';

  static encryptForTransport(privateKey: string, userId: string, nonce: string): string {
    const cipher = crypto.createCipher('aes-256-cbc', `${this.TRANSPORT_SECRET}-${userId}-${nonce}`);
    let encrypted = cipher.update(privateKey, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    // Prepend nonce for decryption
    return `${Buffer.from(nonce).toString('hex')}:${encrypted}`;
  }

  static decryptFromTransport(encryptedKey: string, userId: string): string {
    const [nonceHex, encrypted] = encryptedKey.split(':');
    const nonce = Buffer.from(nonceHex, 'hex').toString('utf8');
    
    const decipher = crypto.createDecipher('aes-256-cbc', `${this.TRANSPORT_SECRET}-${userId}-${nonce}`);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }
}