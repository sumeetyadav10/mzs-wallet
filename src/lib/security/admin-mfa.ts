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
        email: params.email,
        type: params.type,
        savedInDB: verifyDoc.exists,
        codeLength: code.length,
        saltLength: salt.length,
        expiresAt: expiresAt.toISOString(),
        expiresInMs: this.CODE_EXPIRY,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent?.substring(0, 100) + '...',
        docData: verifyDoc.exists ? { 
          adminId: verifyDoc.data()?.adminId,
          email: verifyDoc.data()?.email,
          type: verifyDoc.data()?.type,
          attempts: verifyDoc.data()?.attempts,
          verified: verifyDoc.data()?.verified,
          codeFormatValid: verifyDoc.data()?.code?.includes(':')
        } : null
      });

      // For email/SMS, we would send the code
      if (params.type === 'email') {
        logger.log('📧 Sending MFA email', {
          challengeId,
          adminId: params.adminId,
          email: params.email,
          codeLength: code.length,
          emailSendTime: new Date().toISOString()
        });
        await this.sendEmailMFA(params.email, code);
        logger.log('📧 MFA email sent successfully', {
          challengeId,
          adminId: params.adminId,
          email: params.email
        });
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
      // 🔍 ENHANCED LOGGING: Sanitize and normalize input
      const sanitizedCode = providedCode?.toString().trim().replace(/\D/g, '') || '';
      const originalCodeLength = providedCode?.length || 0;
      const sanitizedCodeLength = sanitizedCode.length;
      
      logger.log('🔍 MFA Verification Debug - Input Analysis', {
        challengeId,
        originalCodeLength,
        sanitizedCodeLength,
        hasNonDigits: originalCodeLength !== sanitizedCodeLength,
        codeStart: sanitizedCode.substring(0, 2) + '****',
        timestamp: new Date().toISOString()
      });
      
      const challengeDoc = await db.collection('admin_mfa_challenges').doc(challengeId).get();

      if (!challengeDoc.exists) {
        logger.error('❌ Challenge document not found', { 
          challengeId,
          lookupTime: new Date().toISOString()
        });
        
        // Debug: Check if there are any challenges in the collection
        const allChallenges = await db.collection('admin_mfa_challenges').get();
        logger.log('📊 Available challenges in DB:', { 
          count: allChallenges.size,
          challengeIds: allChallenges.docs.map(doc => doc.id),
          searchedId: challengeId
        });
        
        return { success: false, error: 'Invalid challenge ID' };
      }

      const challenge = challengeDoc.data() as MFAChallenge;
      const now = new Date();

      // 🔍 ENHANCED LOGGING: Challenge state analysis
      logger.log('🔍 MFA Verification Debug - Challenge State', {
        challengeId,
        adminId: challenge.adminId,
        email: challenge.email,
        attempts: challenge.attempts,
        maxAttempts: this.MAX_ATTEMPTS,
        verified: challenge.verified,
        challengeType: challenge.type,
        createdTime: (() => {
          try {
            if (challenge.expiresAt) {
              const expiry = challenge.expiresAt instanceof Date ? challenge.expiresAt : new Date(challenge.expiresAt);
              const created = new Date(expiry.getTime() - this.CODE_EXPIRY);
              return created.toISOString();
            }
            return 'unknown';
          } catch {
            return 'invalid_date';
          }
        })(),
        currentTime: now.toISOString()
      });

      // Check if challenge is expired (handle Firestore timestamp)
      const expirationTime = challenge.expiresAt instanceof Date ? challenge.expiresAt : new Date(challenge.expiresAt);
      const timeRemaining = expirationTime.getTime() - now.getTime();
      
      logger.log('🔍 MFA Verification Debug - Expiry Check', {
        challengeId,
        expirationTime: (() => {
          try {
            return expirationTime.toISOString();
          } catch {
            return 'invalid_expiry_date';
          }
        })(),
        currentTime: now.toISOString(),
        timeRemainingMs: timeRemaining,
        timeRemainingMin: Math.round(timeRemaining / 60000 * 10) / 10,
        isExpired: now > expirationTime
      });
      
      if (now > expirationTime) {
        await challengeDoc.ref.delete();
        logger.warn('❌ Challenge expired and deleted', {
          challengeId,
          adminId: challenge.adminId,
          expiredBy: now.getTime() - expirationTime.getTime()
        });
        return { success: false, error: 'Challenge expired' };
      }

      // Check if challenge is already verified
      if (challenge.verified) {
        logger.warn('❌ Challenge already verified', {
          challengeId,
          adminId: challenge.adminId
        });
        return { success: false, error: 'Challenge already used' };
      }

      // Check attempt limit
      if (challenge.attempts >= this.MAX_ATTEMPTS) {
        await challengeDoc.ref.delete();
        logger.warn('❌ Too many attempts, challenge deleted', {
          challengeId,
          adminId: challenge.adminId,
          attempts: challenge.attempts
        });
        return { success: false, error: 'Too many attempts' };
      }

      // 🔍 ENHANCED LOGGING: Hash verification debug
      try {
        const codeParts = challenge.code?.split(':') || [];
        
        if (codeParts.length !== 2) {
          logger.error('❌ Invalid challenge code format in database', {
            challengeId,
            adminId: challenge.adminId,
            codePartsLength: codeParts.length,
            codeFormat: challenge.code ? 'present' : 'missing'
          });
          return { success: false, error: 'Challenge data corrupted' };
        }

        const [salt, storedHash] = codeParts;
        
        logger.log('🔍 MFA Verification Debug - Hash Components', {
          challengeId,
          adminId: challenge.adminId,
          saltLength: salt?.length || 0,
          storedHashLength: storedHash?.length || 0,
          saltStart: salt?.substring(0, 8) + '...',
          storedHashStart: storedHash?.substring(0, 8) + '...'
        });

        // Use sanitized code for hash generation
        const providedHash = crypto.createHash('sha256').update(salt + sanitizedCode).digest('hex');
        
        logger.log('🔍 MFA Verification Debug - Hash Comparison', {
          challengeId,
          adminId: challenge.adminId,
          providedCodeUsed: sanitizedCode,
          providedHashStart: providedHash.substring(0, 8) + '...',
          storedHashStart: storedHash.substring(0, 8) + '...',
          hashesMatch: providedHash === storedHash,
          saltConcatInput: `${salt}${sanitizedCode}`,
          saltConcatLength: (salt + sanitizedCode).length
        });

        // Use timing-safe comparison with proper error handling
        let isValid = false;
        try {
          const storedBuffer = Buffer.from(storedHash, 'hex');
          const providedBuffer = Buffer.from(providedHash, 'hex');
          isValid = crypto.timingSafeEqual(storedBuffer, providedBuffer);
        } catch (bufferError) {
          logger.error('❌ Buffer comparison failed', {
            challengeId,
            adminId: challenge.adminId,
            error: bufferError instanceof Error ? bufferError.message : 'Unknown buffer error',
            storedHashValid: /^[a-f0-9]+$/i.test(storedHash),
            providedHashValid: /^[a-f0-9]+$/i.test(providedHash)
          });
          return { success: false, error: 'Hash comparison failed' };
        }

        // 🔒 ATOMIC UPDATE: Use transaction to prevent race conditions
        await db.runTransaction(async (transaction) => {
          const freshDoc = await transaction.get(challengeDoc.ref);
          if (!freshDoc.exists) {
            throw new Error('Challenge document deleted during verification');
          }
          
          const freshData = freshDoc.data() as MFAChallenge;
          
          // Double-check attempt limit in transaction
          if (freshData.attempts >= this.MAX_ATTEMPTS) {
            throw new Error('Too many attempts reached during verification');
          }
          
          // Update with atomic increment
          transaction.update(challengeDoc.ref, {
            attempts: freshData.attempts + 1,
            verified: isValid,
            lastAttemptAt: new Date()
          });
        });

        if (isValid) {
          logger.log('✅ MFA challenge verified successfully', {
            challengeId,
            adminId: challenge.adminId,
            email: challenge.email,
            finalAttempts: challenge.attempts + 1,
            verificationTime: new Date().toISOString()
          });

          // Mark as verified and cleanup after delay
          setTimeout(async () => {
            try {
              await challengeDoc.ref.delete();
              logger.log('🧹 Challenge cleaned up after successful verification', { challengeId });
            } catch (cleanupError) {
              logger.warn('Failed to cleanup challenge', { challengeId, error: cleanupError });
            }
          }, 30000); // 30 seconds

          return {
            success: true,
            adminId: challenge.adminId,
            email: challenge.email
          };
        } else {
          logger.warn('❌ MFA challenge verification failed - Hash mismatch', {
            challengeId,
            adminId: challenge.adminId,
            email: challenge.email,
            attempts: challenge.attempts + 1,
            maxAttempts: this.MAX_ATTEMPTS,
            providedCodeLength: sanitizedCode.length,
            expectedCodeLength: 6
          });

          return { success: false, error: 'Invalid verification code' };
        }
        
      } catch (hashError) {
        logger.error('❌ Hash processing error', {
          challengeId,
          adminId: challenge.adminId,
          error: hashError instanceof Error ? hashError.message : 'Unknown hash error',
          challengeCodePresent: !!challenge.code
        });
        return { success: false, error: 'Verification processing failed' };
      }
      
    } catch (error) {
      logger.error('❌ MFA verification system error', {
        challengeId,
        error: error instanceof Error ? error.message : 'Unknown system error',
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString()
      });
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