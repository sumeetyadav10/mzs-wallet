import { logger } from '@/lib/logger';
import jwt from 'jsonwebtoken';

export interface ValidationResult {
  isValid: boolean;
  error?: string;
  data?: any;
}

export class BackendValidation {
  private static readonly JWT_SECRET = process.env.JWT_SECRET;
  
  static {
    if (!this.JWT_SECRET) {
      throw new Error('JWT_SECRET environment variable is required');
    }
  }

  static validateJWTToken(token: string): ValidationResult {
    try {
      if (!this.JWT_SECRET) {
        throw new Error('JWT_SECRET is not defined');
      }
      const decoded = jwt.verify(token, this.JWT_SECRET);
      return { isValid: true, data: decoded };
    } catch (error) {
      logger.error('JWT validation failed', { error });
      return { isValid: false, error: 'Invalid token' };
    }
  }

  static validateSessionData(sessionData: any): ValidationResult {
    if (!sessionData) {
      return { isValid: false, error: 'No session data provided' };
    }

    const required = ['userId', 'email', 'sessionId'];
    const missing = required.filter(field => !sessionData[field]);
    
    if (missing.length > 0) {
      return { isValid: false, error: `Missing required fields: ${missing.join(', ')}` };
    }

    return { isValid: true, data: sessionData };
  }

  static validateDeviceFingerprint(fingerprint: string, storedFingerprint: string): boolean {
    if (!fingerprint || !storedFingerprint) {
      return false;
    }

    return fingerprint === storedFingerprint;
  }

  static validateTimestamp(timestamp: string, maxAge: number = 5 * 60 * 1000): boolean {
    try {
      const requestTime = parseInt(timestamp);
      const currentTime = Date.now();
      const age = currentTime - requestTime;
      
      return age >= 0 && age <= maxAge;
    } catch {
      return false;
    }
  }
}

export default BackendValidation;