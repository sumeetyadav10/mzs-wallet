import jwt from 'jsonwebtoken';
import { logger } from '@/lib/logger';

export class JWTSecurityEnhanced {
  private static readonly JWT_SECRET = process.env.JWT_SECRET;
  
  static {
    if (!this.JWT_SECRET) {
      throw new Error('JWT_SECRET environment variable is required');
    }
  }
  
  static async createSecureJWT(payload: any, expiresIn: string = '24h'): Promise<string> {
    try {
      if (!this.JWT_SECRET) {
        throw new Error('JWT_SECRET is not defined');
      }
      const token = jwt.sign(payload, this.JWT_SECRET, {
        expiresIn,
        algorithm: 'HS256'
      } as jwt.SignOptions);
      
      logger.info('Secure JWT created', {
        userId: payload.userId,
        expiresIn
      });
      
      return token;
    } catch (error) {
      logger.error('JWT creation failed', { error });
      throw new Error('Token creation failed');
    }
  }
  
  static async verifySecureJWT(token: string): Promise<any> {
    try {
      if (!this.JWT_SECRET) {
        throw new Error('JWT_SECRET is not defined');
      }
      const decoded = jwt.verify(token, this.JWT_SECRET);
      return decoded;
    } catch (error) {
      logger.error('JWT verification failed', { error });
      throw new Error('Token verification failed');
    }
  }
}

export default JWTSecurityEnhanced;