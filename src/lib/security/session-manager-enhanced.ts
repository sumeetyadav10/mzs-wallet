import { SessionManager, SessionData } from './session-manager';
import { logger } from '@/lib/logger';

export interface EnhancedSessionData extends SessionData {
  userAgent: string;
  ipAddress: string;
  lastActivity: Date;
  securityLevel: 'standard' | 'elevated' | 'admin';
}

export class EnhancedSessionManager extends SessionManager {
  static async createEnhancedSession(
    sessionData: Omit<EnhancedSessionData, 'sessionId' | 'expiresAt' | 'lastActivity'>
  ): Promise<string> {
    const enhancedData: Omit<EnhancedSessionData, 'sessionId' | 'expiresAt'> = {
      ...sessionData,
      lastActivity: new Date()
    };

    logger.info('Enhanced session created', {
      userId: sessionData.userId,
      securityLevel: sessionData.securityLevel,
      deviceFingerprint: sessionData.deviceFingerprint
    });

    return super.createSession(enhancedData);
  }

  static logSecurityEvent(event: {
    type: string;
    userId: string;
    email: string;
    ipAddress: string;
    userAgent: string;
    timestamp: number;
    details?: any;
  }): void {
    logger.info('Security event logged', {
      type: event.type,
      userId: event.userId,
      email: event.email,
      ipAddress: event.ipAddress,
      userAgent: event.userAgent?.substring(0, 100),
      timestamp: new Date(event.timestamp).toISOString(),
      details: event.details
    });
  }

  static async validateSessionSecurity(token: string, currentIp: string, userAgent: string): Promise<boolean> {
    const sessionData = await this.verifySession(token) as EnhancedSessionData;
    if (!sessionData) return false;

    // Check IP consistency (allow some flexibility for mobile users)
    if (sessionData.ipAddress && sessionData.ipAddress !== currentIp) {
      logger.warn('IP address mismatch detected', {
        sessionId: sessionData.sessionId,
        expectedIp: sessionData.ipAddress,
        actualIp: currentIp
      });
      // For now, allow IP changes but log them
    }

    // Check user agent consistency
    if (sessionData.userAgent && sessionData.userAgent !== userAgent) {
      logger.warn('User agent mismatch detected', {
        sessionId: sessionData.sessionId,
        expectedUA: sessionData.userAgent.substring(0, 50),
        actualUA: userAgent.substring(0, 50)
      });
      return false;
    }

    return true;
  }
}

export default EnhancedSessionManager;

// Export as securityManager for compatibility
export const securityManager = EnhancedSessionManager;