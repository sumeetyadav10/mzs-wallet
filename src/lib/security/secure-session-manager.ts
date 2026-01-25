import { SessionManager } from './session-manager';
import { logger } from '@/lib/logger';

export class SecureSessionManager extends SessionManager {
  static async createSecureSession(sessionRequest: {
    web3AuthIdToken: string;
    verifiedUserData: any;
    deviceFingerprint: string;
    ipAddress: string;
    userAgent: string;
  }): Promise<{ sessionToken: string; sessionData: any }> {
    const { web3AuthIdToken, verifiedUserData, deviceFingerprint, ipAddress, userAgent } = sessionRequest;
    
    // Generate unique session ID combining user data and Web3Auth token
    const crypto = await import('crypto');
    const uniqueSessionSeed = `${verifiedUserData.userId}-${verifiedUserData.email}-${deviceFingerprint}-${Date.now()}-${crypto.randomBytes(16).toString('hex')}`;
    const sessionId = crypto.createHash('sha256').update(uniqueSessionSeed).digest('hex');
    
    const sessionData = {
      userId: verifiedUserData.userId,
      email: verifiedUserData.email,
      deviceFingerprint,
      isAdmin: verifiedUserData.isAdmin || false,
      ipAddress,
      userAgent,
      web3AuthTokenHash: crypto.createHash('sha256').update(web3AuthIdToken).digest('hex').substring(0, 32), // Store hash for verification
      sessionId,
      loginTime: Date.now(),
      lastActivity: Date.now(),
      authMethod: 'web3auth_oauth'
    };
    
    logger.info('Creating secure session with unique token', {
      userId: sessionData.userId,
      email: sessionData.email,
      sessionId: sessionId.substring(0, 16) + '...',
      deviceFingerprint: deviceFingerprint.substring(0, 16) + '...'
    });
    
    // Create JWT with additional claims for security
    const jwt = await import('jsonwebtoken');
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw new Error('JWT_SECRET environment variable is required for session creation');
    }
    
    // Ensure userId is a valid string for JWT subject
    const subjectId = sessionData.userId || sessionData.email || 'unknown';
    if (typeof subjectId !== 'string' || !subjectId) {
      throw new Error('Invalid userId or email for session creation');
    }
    
    const sessionDurationHours = parseInt(process.env.ADMIN_SESSION_DURATION_HOURS || '24', 10);
    const token = jwt.sign(sessionData, jwtSecret, {
      expiresIn: `${sessionDurationHours}h`,
      issuer: 'mzs-wallet',
      audience: 'mzs-wallet-users',
      subject: subjectId
    });
    
    return { 
      sessionToken: token, 
      sessionData: {
        ...sessionData,
        tokenHash: crypto.createHash('sha256').update(token).digest('hex').substring(0, 16)
      }
    };
  }

  // Override parent method with compatible signature
  static async createSession(sessionData: Omit<import('./session-manager').SessionData, 'sessionId' | 'expiresAt'>): Promise<string> {
    logger.info('Creating legacy secure session', {
      userId: sessionData.userId,
      email: sessionData.email
    });
    
    return super.createSession(sessionData);
  }
  
  static async verifySecureSession(token: string): Promise<any> {
    try {
      const jwt = await import('jsonwebtoken');
      const jwtSecret = process.env.JWT_SECRET;
      if (!jwtSecret) {
        throw new Error('JWT_SECRET environment variable is required for session verification');
      }

      const decoded = jwt.verify(token, jwtSecret) as any;

      // Validate token claims
      if (!decoded.userId || !decoded.email) {
        logger.warn('Invalid secure session token structure');
        return null;
      }

      // Check if token is expired
      if (decoded.exp && Date.now() >= decoded.exp * 1000) {
        logger.debug('Secure session token expired');
        return null;
      }

      logger.log('✅ Secure session verified successfully', {
        userId: decoded.userId,
        email: decoded.email,
        authMethod: decoded.authMethod
      });

      return decoded;
    } catch (error: any) {
      // Handle token expiration silently - it's expected
      if (error.name === 'TokenExpiredError') {
        logger.debug('Session token expired - user needs to login again');
        return null;
      }
      logger.warn('Secure session verification failed:', error);
      return null;
    }
  }

  static async validateSession(
    sessionToken: string, 
    deviceFingerprint?: string,
    ipAddress?: string
  ): Promise<{ valid: boolean; session?: any; error?: string }> {
    
    try {
      // First try the new secure session validation
      const sessionData = await this.verifySecureSession(sessionToken);
      if (sessionData) {
        // Validate device fingerprint if provided
        if (deviceFingerprint && sessionData.deviceFingerprint !== deviceFingerprint) {
          logger.warn('Device fingerprint mismatch', {
            sessionId: sessionData.sessionId,
            expected: sessionData.deviceFingerprint,
            provided: deviceFingerprint
          });
          return { valid: false, error: 'Device mismatch' };
        }
        
        return { valid: true, session: sessionData };
      } else {
        return { valid: false, error: 'Invalid session token' };
      }
    } catch (error) {
      logger.error('Session validation error:', error);
      return { valid: false, error: 'Validation failed' };
    }
  }

  static async validateSecureSession(token: string, deviceFingerprint: string): Promise<any> {
    const sessionData = await this.verifySecureSession(token);
    if (!sessionData) {
      return null;
    }
    
    // Validate device fingerprint
    if (sessionData.deviceFingerprint !== deviceFingerprint) {
      logger.warn('Device fingerprint mismatch', {
        sessionId: sessionData.sessionId,
        expected: sessionData.deviceFingerprint,
        provided: deviceFingerprint
      });
      return null;
    }
    
    return sessionData;
  }
}

export default SecureSessionManager;