import { logger } from '@/lib/logger';
import { EmailService } from '@/lib/email-service';
import { db } from '@/lib/firebase-admin';
import crypto from 'crypto';

/**
 * 🔒 MZS WALLET ADMIN MULTI-FACTOR AUTHENTICATION
 * 
 * Provides MFA functionality for admin users
 */

interface MFAChallenge {
  challengeId: string;
  adminId: string;
  email: string;
  type: 'otp' | 'email' | 'sms';
  code: string;
  hashedCode: string;
  expiresAt: Date;
  attempts: number;
  ipAddress: string;
  userAgent: string;
  verified: boolean;
}

interface MFASettings {
  adminId: string;
  email: string;
  enabledMethods: Array<'otp' | 'email' | 'sms'>;
  backupCodes: string[];
  lastUsed: Date;
  phoneNumber?: string;
}

export class AdminMFA {
  private static readonly CODE_EXPIRY = 5 * 60 * 1000; // 5 minutes
  private static readonly MAX_ATTEMPTS = 3;
  private static readonly CODE_LENGTH = 6;

  /**
   * Generate MFA challenge for admin login
   */
  static async generateMFAChallenge(params: {
    adminId: string;
    email: string;
    type: 'otp' | 'email' | 'sms';
    ipAddress: string;
    userAgent: string;
  }): Promise<{ challengeId: string; code?: string }> {
    try {
      const challengeId = crypto.randomBytes(16).toString('hex');
      const code = this.generateMFACode();
      const salt = crypto.randomBytes(16).toString('hex');
      const hashedCode = crypto.createHash('sha256').update(salt + code).digest('hex');

      const expiresAt = new Date(Date.now() + this.CODE_EXPIRY);

      const challenge: MFAChallenge = {
        challengeId,
        adminId: params.adminId,
        email: params.email,
        type: params.type,
        code: salt + ':' + hashedCode, // Store salt:hash
        hashedCode,
        expiresAt,
        attempts: 0,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
        verified: false
      };

      // Store challenge in Firestore (convert Date to Firestore timestamp)
      await db.collection('admin_mfa_challenges').doc(challengeId).set({
        ...challenge,
        expiresAt: expiresAt // Firestore will automatically convert Date to Timestamp
      });

      // Verify the challenge was saved
      const verifyDoc = await db.collection('admin_mfa_challenges').doc(challengeId).get();
      logger.log('✅ MFA challenge generated and verified in DB', {
        challengeId,
        adminId: params.adminId,
        type: params.type,
        savedInDB: verifyDoc.exists,
        docData: verifyDoc.exists ? { ...verifyDoc.data(), code: '***' } : null
      });

      // For email/SMS, we would send the code
      if (params.type === 'email') {
        await this.sendEmailMFA(params.email, code);
        return { challengeId }; // Don't return code for email/SMS
      } else if (params.type === 'sms') {
        // await this.sendSMSMFA(phoneNumber, code);
        return { challengeId }; // Don't return code for email/SMS
      }

      // For OTP apps, return the code for display
      return { challengeId, code };
    } catch (error) {
      logger.error('Failed to generate MFA challenge:', error);
      throw error;
    }
  }

  /**
   * Verify MFA challenge
   */
  static async verifyMFAChallenge(challengeId: string, providedCode: string): Promise<{
    success: boolean;
    adminId?: string;
    email?: string;
    error?: string;
  }> {
    try {
      logger.log('🔍 Verifying MFA challenge', { challengeId, providedCode: '***' });
      
      const challengeDoc = await db.collection('admin_mfa_challenges').doc(challengeId).get();

      if (!challengeDoc.exists) {
        logger.error('❌ Challenge document not found', { challengeId });
        
        // Debug: Check if there are any challenges in the collection
        const allChallenges = await db.collection('admin_mfa_challenges').get();
        logger.log('📊 Available challenges in DB:', { 
          count: allChallenges.size,
          challengeIds: allChallenges.docs.map(doc => doc.id)
        });
        
        return { success: false, error: 'Invalid challenge ID' };
      }

      const challenge = challengeDoc.data() as MFAChallenge;

      // Check if challenge is expired (handle Firestore timestamp)
      const expirationTime = challenge.expiresAt.toDate ? challenge.expiresAt.toDate() : new Date(challenge.expiresAt);
      if (new Date() > expirationTime) {
        await challengeDoc.ref.delete();
        return { success: false, error: 'Challenge expired' };
      }

      // Check if challenge is already verified
      if (challenge.verified) {
        return { success: false, error: 'Challenge already used' };
      }

      // Check attempt limit
      if (challenge.attempts >= this.MAX_ATTEMPTS) {
        await challengeDoc.ref.delete();
        return { success: false, error: 'Too many attempts' };
      }

      // Verify code
      const [salt, storedHash] = challenge.code.split(':');
      const providedHash = crypto.createHash('sha256').update(salt + providedCode).digest('hex');

      const isValid = crypto.timingSafeEqual(
        Buffer.from(storedHash, 'hex'),
        Buffer.from(providedHash, 'hex')
      );

      // Update attempts
      await challengeDoc.ref.update({
        attempts: challenge.attempts + 1,
        verified: isValid
      });

      if (isValid) {
        logger.log('✅ MFA challenge verified successfully', {
          challengeId,
          adminId: challenge.adminId
        });

        // Mark as verified and cleanup after delay
        setTimeout(async () => {
          await challengeDoc.ref.delete();
        }, 30000); // 30 seconds

        return {
          success: true,
          adminId: challenge.adminId,
          email: challenge.email
        };
      } else {
        logger.warn('❌ MFA challenge verification failed', {
          challengeId,
          adminId: challenge.adminId,
          attempts: challenge.attempts + 1
        });

        return { success: false, error: 'Invalid verification code' };
      }
    } catch (error) {
      logger.error('MFA verification failed:', error);
      return { success: false, error: 'Verification failed' };
    }
  }

  /**
   * Resend MFA code
   */
  static async resendMFAChallenge(challengeId: string): Promise<boolean> {
    try {
      const challengeDoc = await db.collection('admin_mfa_challenges').doc(challengeId).get();

      if (!challengeDoc.exists) {
        return false;
      }

      const challenge = challengeDoc.data() as MFAChallenge;

      // Check if challenge is expired
      if (new Date() > challenge.expiresAt) {
        await challengeDoc.ref.delete();
        return false;
      }

      // Generate new code
      const newCode = this.generateMFACode();
      const salt = crypto.randomBytes(16).toString('hex');
      const hashedCode = crypto.createHash('sha256').update(salt + newCode).digest('hex');

      // Update challenge
      await challengeDoc.ref.update({
        code: salt + ':' + hashedCode,
        hashedCode,
        attempts: 0, // Reset attempts
        expiresAt: new Date(Date.now() + this.CODE_EXPIRY) // Extend expiry
      });

      // Send new code based on type
      if (challenge.type === 'email') {
        await this.sendEmailMFA(challenge.email, newCode);
      } else if (challenge.type === 'sms') {
        // await this.sendSMSMFA(phoneNumber, newCode);
      }

      logger.log('✅ MFA challenge resent', {
        challengeId,
        adminId: challenge.adminId,
        type: challenge.type
      });

      return true;
    } catch (error) {
      logger.error('Failed to resend MFA challenge:', error);
      return false;
    }
  }

  /**
   * Get admin MFA settings
   */
  static async getAdminMFASettings(adminId: string): Promise<MFASettings | null> {
    try {
      const settingsDoc = await db.collection('admin_mfa_settings').doc(adminId).get();

      if (!settingsDoc.exists) {
        return null;
      }

      return settingsDoc.data() as MFASettings;
    } catch (error) {
      logger.error('Failed to get admin MFA settings:', error);
      return null;
    }
  }

  /**
   * Setup MFA for admin
   */
  static async setupAdminMFA(params: {
    adminId: string;
    email: string;
    enabledMethods: Array<'otp' | 'email' | 'sms'>;
    phoneNumber?: string;
  }): Promise<{ backupCodes: string[] }> {
    try {
      const backupCodes = this.generateBackupCodes();

      const settings: MFASettings = {
        adminId: params.adminId,
        email: params.email,
        enabledMethods: params.enabledMethods,
        backupCodes,
        lastUsed: new Date(),
        phoneNumber: params.phoneNumber
      };

      await db.collection('admin_mfa_settings').doc(params.adminId).set(settings);

      logger.log('✅ Admin MFA setup completed', {
        adminId: params.adminId,
        enabledMethods: params.enabledMethods
      });

      return { backupCodes };
    } catch (error) {
      logger.error('Failed to setup admin MFA:', error);
      throw error;
    }
  }

  /**
   * Generate MFA code
   */
  private static generateMFACode(): string {
    return crypto.randomInt(100000, 999999).toString();
  }

  /**
   * Generate backup codes
   */
  private static generateBackupCodes(): string[] {
    const codes: string[] = [];
    for (let i = 0; i < 8; i++) {
      codes.push(crypto.randomBytes(4).toString('hex').toUpperCase());
    }
    return codes;
  }

  /**
   * Send email MFA code
   */
  private static async sendEmailMFA(email: string, code: string): Promise<void> {
    try {
      const result = await EmailService.sendAdminMFAEmail({
        email,
        code
      });
      
      if (!result.success) {
        logger.error('Failed to send admin MFA email:', result.error);
        throw new Error(`Failed to send verification email: ${result.error}`);
      }
      
      logger.log('✅ Admin MFA email sent successfully', { 
        email, 
        messageId: result.messageId 
      });
      
    } catch (error) {
      logger.error('Failed to send MFA email:', error);
      throw error;
    }
  }

  /**
   * Cleanup expired challenges
   */
  static async cleanupExpiredChallenges(): Promise<number> {
    try {
      const now = new Date();
      const expiredQuery = await db
        .collection('admin_mfa_challenges')
        .where('expiresAt', '<=', now)
        .get();

      if (expiredQuery.empty) {
        return 0;
      }

      const batch = db.batch();
      expiredQuery.docs.forEach(doc => {
        batch.delete(doc.ref);
      });

      await batch.commit();

      const cleanedCount = expiredQuery.size;
      logger.log('Cleaned up expired MFA challenges', { count: cleanedCount });

      return cleanedCount;
    } catch (error) {
      logger.error('Failed to cleanup expired MFA challenges:', error);
      return 0;
    }
  }
}