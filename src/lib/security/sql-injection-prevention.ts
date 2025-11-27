import { logger } from '@/lib/logger';

export class SQLInjectionPrevention {
  private static readonly DANGEROUS_PATTERNS = [
    /('|\\')|(;)|(\\)|(\-\-)|(\|)/i,
    /(union.*select.*from)/i,
    /(select.*from.*where)/i,
    /(insert.*into.*values)/i,
    /(update.*set.*where)/i,
    /(delete.*from.*where)/i,
    /(drop.*table)/i,
    /(alter.*table)/i,
    /(create.*table)/i,
    /(exec.*sp_)/i,
    /(script.*src)/i,
    /(<script|<\/script>)/i
  ];

  static sanitizeInput(input: string, fieldName?: string): string {
    if (typeof input !== 'string') {
      throw new Error(`Invalid input type for ${fieldName || 'field'}: expected string`);
    }

    // Check for dangerous patterns
    for (const pattern of this.DANGEROUS_PATTERNS) {
      if (pattern.test(input)) {
        logger.warn('Potential SQL injection attempt detected', {
          fieldName,
          inputLength: input.length,
          pattern: pattern.toString()
        });
        throw new Error(`Invalid characters detected in ${fieldName || 'input'}`);
      }
    }

    // Basic sanitization
    return input
      .trim()
      .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
      .substring(0, 1000); // Limit length
  }

  static sanitizeObject<T extends Record<string, any>>(obj: T): T {
    const sanitized = {} as T;
    
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        sanitized[key as keyof T] = this.sanitizeInput(value, key) as T[keyof T];
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        sanitized[key as keyof T] = this.sanitizeObject(value);
      } else {
        sanitized[key as keyof T] = value;
      }
    }
    
    return sanitized;
  }

  static validateEmail(email: string): boolean {
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return emailRegex.test(email) && !this.containsDangerousPattern(email);
  }

  static validateUserId(userId: string): boolean {
    // Allow alphanumeric, underscore, dash, and dot
    const userIdRegex = /^[a-zA-Z0-9._-]+$/;
    return userIdRegex.test(userId) && userId.length <= 50 && !this.containsDangerousPattern(userId);
  }

  private static containsDangerousPattern(input: string): boolean {
    return this.DANGEROUS_PATTERNS.some(pattern => pattern.test(input));
  }
}

export default SQLInjectionPrevention;