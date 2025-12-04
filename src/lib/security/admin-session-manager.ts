import { logger } from '@/lib/logger';
import { createJWTToken, verifyJWTToken } from '@/lib/web3auth-jwt-secure';
import { db } from '@/lib/firebase-admin';

/**
 * 🔒 MZS WALLET ADMIN SESSION MANAGER
 * 
 * Manages admin authentication sessions with enhanced security
 */

interface AdminSessionData {
  adminId: string;
  email: string;
  role: string;
  permissions: string[];
  createdAt: Date;
  expiresAt: Date;
  ipAddress: string;
  userAgent: string;
  deviceFingerprint: string;
  lastActivity: Date;
}

interface AdminLoginAttempt {
  email: string;
  ipAddress: string;
  userAgent: string;
  success: boolean;
  timestamp: Date;
  reason?: string;
}

export class AdminSessionManager {
  // Session duration from environment or default to 24 hours
  private static readonly SESSION_DURATION = parseInt(process.env.ADMIN_SESSION_DURATION_HOURS || '24') * 60 * 60 * 1000;
  private static readonly MAX_LOGIN_ATTEMPTS = 5;
  private static readonly LOCKOUT_DURATION = 30 * 60 * 1000; // 30 minutes

  /**
   * Create admin session after successful authentication
   */
  static async createAdminSession(params: {
    adminId: string;
    email: string;
    role: string;
    permissions: string[];
    ipAddress: string;
    userAgent: string;
    deviceFingerprint: string;
  }): Promise<{ sessionToken: string; sessionData: AdminSessionData }> {
    try {
      // Clean up any existing sessions for this admin first
      const existingSessionsQuery = await db
        .collection('admin_sessions')
        .where('adminId', '==', params.adminId)
        .where('email', '==', params.email)
        .get();

      if (!existingSessionsQuery.empty) {
        const batch = db.batch();
        existingSessionsQuery.docs.forEach((doc) => {
          batch.delete(doc.ref);
        });
        await batch.commit();
        
        logger.log('🧹 Cleaned up existing admin sessions', { 
          adminId: params.adminId,
          count: existingSessionsQuery.size 
        });
      }

      const now = new Date();
      const expiresAt = new Date(now.getTime() + this.SESSION_DURATION);

      const sessionData: AdminSessionData = {
        adminId: params.adminId,
        email: params.email,
        role: params.role,
        permissions: params.permissions,
        createdAt: now,
        expiresAt,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
        deviceFingerprint: params.deviceFingerprint,
        lastActivity: now
      };

      // Store session in Firestore
      const sessionRef = db.collection('admin_sessions').doc();
      await sessionRef.set({
        ...sessionData,
        sessionId: sessionRef.id
      });

      // Create JWT token
      const sessionToken = createJWTToken({
        userId: params.adminId,
        email: params.email,
        deviceFingerprint: params.deviceFingerprint,
        ipAddress: params.ipAddress,
        keyPinned: true // Admin sessions are always key-pinned
      });

      logger.log('✅ Admin session created', { 
        adminId: params.adminId, 
        email: params.email,
        role: params.role,
        sessionId: sessionRef.id,
        expiresAt: expiresAt.toISOString(),
        sessionDurationHours: this.SESSION_DURATION / (60 * 60 * 1000)
      });

      return { sessionToken, sessionData };
    } catch (error) {
      logger.error('Failed to create admin session:', error);
      throw error;
    }
  }

  /**
   * Validate admin session
   */
  static async validateAdminSession(sessionToken: string): Promise<AdminSessionData | null> {
    try {
      // Verify JWT token first
      const tokenPayload = await verifyJWTToken(sessionToken);
      if (!tokenPayload) {
        return null;
      }

      // Find session in Firestore
      logger.log('🔍 Looking for admin session', {
        adminId: tokenPayload.userId,
        email: tokenPayload.email,
        deviceFingerprint: tokenPayload.deviceFingerprint
      });
      
      const sessionsQuery = await db
        .collection('admin_sessions')
        .where('adminId', '==', tokenPayload.userId)
        .where('email', '==', tokenPayload.email)
        .orderBy('createdAt', 'desc') // Get the most recent session
        .limit(1)
        .get();

      if (sessionsQuery.empty) {
        logger.warn('Admin session not found in database', { 
          userId: tokenPayload.userId,
          email: tokenPayload.email
        });
        
        // Debug: List all admin sessions
        const allSessions = await db.collection('admin_sessions').limit(5).get();
        logger.log('Debug - Available admin sessions:', 
          allSessions.docs.map(d => ({ 
            id: d.id, 
            adminId: d.data().adminId,
            email: d.data().email 
          }))
        );
        
        return null;
      }

      const sessionDoc = sessionsQuery.docs[0];
      const rawData = sessionDoc.data();
      
      // Convert Firestore timestamps to Date objects
      const sessionData: AdminSessionData = {
        ...rawData,
        createdAt: rawData.createdAt?.toDate ? rawData.createdAt.toDate() : new Date(rawData.createdAt),
        expiresAt: rawData.expiresAt?.toDate ? rawData.expiresAt.toDate() : new Date(rawData.expiresAt),
        lastActivity: rawData.lastActivity?.toDate ? rawData.lastActivity.toDate() : new Date(rawData.lastActivity)
      } as AdminSessionData;

      // Debug session data
      const now = new Date();
      const hoursRemaining = (sessionData.expiresAt.getTime() - now.getTime()) / (60 * 60 * 1000);
      logger.log('📅 Session time check', {
        adminId: sessionData.adminId,
        createdAt: sessionData.createdAt.toISOString(),
        expiresAt: sessionData.expiresAt.toISOString(),
        now: now.toISOString(),
        isExpired: now > sessionData.expiresAt,
        hoursRemaining: Math.round(hoursRemaining * 10) / 10,
        sessionDurationHours: this.SESSION_DURATION / (60 * 60 * 1000)
      });
      
      // Check if session is expired
      if (new Date() > sessionData.expiresAt) {
        logger.warn('Admin session expired', { 
          adminId: sessionData.adminId,
          expiresAt: sessionData.expiresAt,
          now: new Date(),
          timeDiff: new Date().getTime() - sessionData.expiresAt.getTime()
        });
        await this.destroyAdminSession(sessionToken);
        return null;
      }

      // Update last activity
      await sessionDoc.ref.update({
        lastActivity: new Date()
      });

      logger.log('✅ Admin session validated', { 
        adminId: sessionData.adminId,
        email: sessionData.email,
        role: sessionData.role
      });

      return sessionData;
    } catch (error) {
      logger.error('Admin session validation failed:', error);
      return null;
    }
  }

  /**
   * Destroy admin session
   */
  static async destroyAdminSession(sessionToken: string): Promise<boolean> {
    try {
      const tokenPayload = await verifyJWTToken(sessionToken);
      if (!tokenPayload) {
        return false;
      }

      // Find and delete session from Firestore
      const sessionsQuery = await db
        .collection('admin_sessions')
        .where('adminId', '==', tokenPayload.userId)
        .where('email', '==', tokenPayload.email)
        .get();

      const batch = db.batch();
      sessionsQuery.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });

      await batch.commit();

      logger.log('✅ Admin session destroyed', { adminId: tokenPayload.userId });
      return true;
    } catch (error) {
      logger.error('Failed to destroy admin session:', error);
      return false;
    }
  }

  /**
   * Log admin login attempt
   */
  static async logLoginAttempt(attempt: AdminLoginAttempt): Promise<void> {
    try {
      await db.collection('admin_login_attempts').add({
        ...attempt,
        timestamp: attempt.timestamp
      });

      logger.log('Admin login attempt logged', {
        email: attempt.email,
        success: attempt.success,
        ipAddress: attempt.ipAddress
      });
    } catch (error) {
      logger.error('Failed to log admin login attempt:', error);
    }
  }

  /**
   * Check if admin is locked out due to too many failed attempts
   */
  static async isAdminLockedOut(email: string, ipAddress: string): Promise<boolean> {
    try {
      const cutoffTime = new Date(Date.now() - this.LOCKOUT_DURATION);

      const attemptsQuery = await db
        .collection('admin_login_attempts')
        .where('email', '==', email)
        .where('ipAddress', '==', ipAddress)
        .where('success', '==', false)
        .where('timestamp', '>', cutoffTime)
        .get();

      const failedAttempts = attemptsQuery.size;

      if (failedAttempts >= this.MAX_LOGIN_ATTEMPTS) {
        logger.warn('Admin account locked out', { 
          email, 
          ipAddress, 
          failedAttempts 
        });
        return true;
      }

      return false;
    } catch (error) {
      logger.error('Failed to check admin lockout status:', error);
      return false; // Fail open for availability
    }
  }

  /**
   * Get all active admin sessions (for debugging)
   */
  static async getActiveSessions(): Promise<AdminSessionData[]> {
    try {
      const now = new Date();
      const sessionsQuery = await db
        .collection('admin_sessions')
        .where('expiresAt', '>', now)
        .get();

      const activeSessions = sessionsQuery.docs.map(doc => doc.data() as AdminSessionData);

      logger.log('Retrieved active admin sessions', { count: activeSessions.length });
      return activeSessions;
    } catch (error) {
      logger.error('Failed to get active admin sessions:', error);
      return [];
    }
  }

  /**
   * Cleanup expired sessions
   */
  static async cleanupExpiredSessions(): Promise<number> {
    try {
      const now = new Date();
      const expiredSessionsQuery = await db
        .collection('admin_sessions')
        .where('expiresAt', '<=', now)
        .get();

      if (expiredSessionsQuery.empty) {
        return 0;
      }

      const batch = db.batch();
      expiredSessionsQuery.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });

      await batch.commit();

      const cleanedCount = expiredSessionsQuery.size;
      logger.log('Cleaned up expired admin sessions', { count: cleanedCount });
      
      return cleanedCount;
    } catch (error) {
      logger.error('Failed to cleanup expired admin sessions:', error);
      return 0;
    }
  }
}