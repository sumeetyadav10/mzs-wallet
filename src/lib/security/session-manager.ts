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

    const token = jwt.sign(fullSessionData, this.JWT_SECRET, {
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
      const decoded = jwt.verify(token, this.JWT_SECRET) as SessionData;
      
      if (new Date() > new Date(decoded.expiresAt)) {
        logger.warn('Session expired', { sessionId: decoded.sessionId });
        return null;
      }

      return decoded;
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
      const decoded = jwt.verify(token, this.JWT_SECRET) as SessionData;
      logger.info('Session invalidated', { sessionId: decoded.sessionId });
    } catch (error) {
      logger.error('Error invalidating session', { error });
    }
  }
}

export default SessionManager;