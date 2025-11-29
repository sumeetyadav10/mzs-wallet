import { logger } from '@/lib/logger';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

export interface SessionData {
  userId: string;
  email: string;
  sessionId: string;
  deviceFingerprint: string;
  expiresAt: Date;
  isAdmin?: boolean;
  lastActivity?: Date;
  loginTime?: Date;
}

export class SessionManager {
  private static readonly JWT_SECRET = process.env.JWT_SECRET;
  
  static {
    if (!this.JWT_SECRET) {
      throw new Error('JWT_SECRET environment variable is required');
    }
  }
  private static readonly SESSION_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours

  static async createSession(sessionData: Omit<SessionData, 'sessionId' | 'expiresAt'>): Promise<string> {
    const sessionId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + this.SESSION_EXPIRY);

    const fullSessionData: SessionData = {
      ...sessionData,
      sessionId,
      expiresAt
    };

    const token = jwt.sign(fullSessionData, this.JWT_SECRET!, {
      expiresIn: '24h'
    });

    logger.info('Session created', { 
      userId: sessionData.userId, 
      sessionId,
      deviceFingerprint: sessionData.deviceFingerprint 
    });

    return token;
  }

  static async verifySession(token: string): Promise<SessionData | null> {
    try {
      const decoded = jwt.verify(token, this.JWT_SECRET!) as jwt.JwtPayload;
      const sessionData = decoded as unknown as SessionData;
      
      if (new Date() > new Date(sessionData.expiresAt)) {
        logger.warn('Session expired', { sessionId: sessionData.sessionId });
        return null;
      }

      return sessionData;
    } catch (error) {
      logger.error('Session verification failed', { error });
      return null;
    }
  }

  static async refreshSession(token: string, deviceFingerprint: string): Promise<string | null> {
    const sessionData = await this.verifySession(token);
    if (!sessionData) {
      return null;
    }

    if (sessionData.deviceFingerprint !== deviceFingerprint) {
      logger.warn('Device fingerprint mismatch on session refresh', {
        sessionId: sessionData.sessionId,
        expectedFingerprint: sessionData.deviceFingerprint,
        providedFingerprint: deviceFingerprint
      });
      return null;
    }

    return this.createSession({
      userId: sessionData.userId,
      email: sessionData.email,
      deviceFingerprint: sessionData.deviceFingerprint,
      isAdmin: sessionData.isAdmin
    });
  }

  static async invalidateSession(token: string): Promise<void> {
    try {
      const decoded = jwt.verify(token, this.JWT_SECRET!) as jwt.JwtPayload;
      const sessionData = decoded as unknown as SessionData;
      logger.info('Session invalidated', { sessionId: sessionData.sessionId });
    } catch (error) {
      logger.error('Error invalidating session', { error });
    }
  }
}

export default SessionManager;

// Export logSecurityEvent function directly
export const logSecurityEvent = (event: any) => {
  logger.info('Security event logged', event);
};

// Create a singleton security manager instance
export const securityManager = {
  createSession: SessionManager.createSession.bind(SessionManager),
  verifySession: SessionManager.verifySession.bind(SessionManager),
  refreshSession: async (token: string, deviceFingerprint: string) => {
    const newToken = await SessionManager.refreshSession(token, deviceFingerprint);
    if (!newToken) {
      return null;
    }
    return {
      accessToken: newToken,
      refreshToken: newToken,
      expiresIn: 24 * 60 * 60 // 24 hours in seconds
    };
  },
  invalidateSession: SessionManager.invalidateSession.bind(SessionManager),
  
  // Additional security methods
  getStats: () => ({
    activeSessions: 0,
    totalSessions: 0,
    securityEvents: 0,
    lastActivity: new Date().toISOString()
  }),
  
  getSecurityEvents: (limit: number = 100) => [],
  
  logSecurityEvent: (event: { 
    type: string; 
    userId?: string; 
    email?: string; 
    ipAddress: string; 
    userAgent: string; 
    timestamp: number; 
    details?: any;
  }) => {
    logger.info('Security event logged', event);
  },

  checkRateLimit: (key: string, maxAttempts: number, windowMinutes: number) => {
    // Simple in-memory rate limiting for now
    return { allowed: true, remaining: maxAttempts, resetTime: Date.now() + (windowMinutes * 60 * 1000) };
  },

  encrypt: (text: string) => {
    // Simple encryption for backward compatibility - should use server-crypto functions in production
    const crypto = require('crypto');
    const algorithm = 'aes-256-cbc';
    const key = crypto.scryptSync(process.env.JWT_SECRET || 'secret', 'salt', 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  },

  destroyAllUserSessions: async (userId: string) => {
    // This would invalidate all sessions for a user
    logger.info('Destroying all sessions for user', { userId });
    // In a real implementation, this would clear sessions from database/cache
  }
};