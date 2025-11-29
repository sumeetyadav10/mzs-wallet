import { logger } from '@/lib/logger';
import bcrypt from 'bcryptjs';

export class AuthHelper {
  static async hashPassword(password: string): Promise<string> {
    const saltRounds = 12;
    return bcrypt.hash(password, saltRounds);
  }

  static async verifyPassword(password: string, hash: string): Promise<boolean> {
    try {
      return await bcrypt.compare(password, hash);
    } catch (error) {
      logger.error('Password verification error', { error });
      return false;
    }
  }

  static generateSecureToken(length: number = 32): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  static validatePasswordStrength(password: string): { isValid: boolean; message?: string } {
    if (password.length < 8) {
      return { isValid: false, message: 'Password must be at least 8 characters long' };
    }
    
    if (!/[A-Z]/.test(password)) {
      return { isValid: false, message: 'Password must contain at least one uppercase letter' };
    }
    
    if (!/[a-z]/.test(password)) {
      return { isValid: false, message: 'Password must contain at least one lowercase letter' };
    }
    
    if (!/\d/.test(password)) {
      return { isValid: false, message: 'Password must contain at least one number' };
    }
    
    return { isValid: true };
  }
}

export default AuthHelper;

// Export individual functions for compatibility
export const hashPassword = AuthHelper.hashPassword;
export const verifyPassword = AuthHelper.verifyPassword;
export const generateSecureToken = AuthHelper.generateSecureToken;

// Mock function for createAuthTokens (referenced by OAuth route)
export async function createAuthTokens(userData: any) {
  return {
    accessToken: generateSecureToken(64),
    refreshToken: generateSecureToken(64)
  };
}

// Export requireAuth function for API routes
export async function requireAuth(request: Request, requireSession: boolean = false) {
  // This is a placeholder implementation
  // In production, this would validate the session token
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) {
    throw new Error('Authentication required');
  }
  return { 
    userId: 'user123', 
    email: 'user@example.com', 
    session: requireSession ? { userId: 'user123', email: 'user@example.com' } : null 
  };
}