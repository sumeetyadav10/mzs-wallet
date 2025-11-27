import crypto from 'crypto';

/**
 * 🔒 API Endpoint Obfuscation System
 * 
 * Generates unique, rotating API endpoint paths for each user
 * Prevents reconnaissance and automated attacks
 */
export class EndpointObfuscation {
  private static readonly OBFUSCATION_SECRET = process.env.ENDPOINT_OBFUSCATION_SECRET || 'endpoint-obfuscation-secret-key';
  private static readonly ROTATION_HOURS = 1; // Rotate every hour
  
  /**
   * Generate obfuscated endpoint path for a user and operation
   */
  static generateSecureEndpoint(userId: string, operation: string): string {
    const timestamp = Math.floor(Date.now() / (1000 * 60 * 60 * this.ROTATION_HOURS)); // Hourly rotation
    
    const hash = crypto
      .createHmac('sha256', this.OBFUSCATION_SECRET)
      .update(`${userId}-${operation}-${timestamp}`)
      .digest('hex')
      .substring(0, 16); // 16 char hash
    
    return `/api/sec_${hash}`;
  }
  
  /**
   * Verify if a request path is valid for the user and operation
   */
  static verifyEndpointPath(path: string, userId: string, operation: string): boolean {
    // Extract hash from path
    const match = path.match(/^\/api\/sec_([a-f0-9]{16})$/);
    if (!match) return false;
    
    const providedHash = match[1];
    
    // Check current hour and previous hour (for clock skew tolerance)
    const currentTimestamp = Math.floor(Date.now() / (1000 * 60 * 60 * this.ROTATION_HOURS));
    
    for (let i = 0; i <= 1; i++) { // Current and previous hour
      const timestamp = currentTimestamp - i;
      
      const expectedHash = crypto
        .createHmac('sha256', this.OBFUSCATION_SECRET)
        .update(`${userId}-${operation}-${timestamp}`)
        .digest('hex')
        .substring(0, 16);
      
      if (crypto.timingSafeEqual(
        Buffer.from(providedHash, 'hex'),
        Buffer.from(expectedHash, 'hex')
      )) {
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * Generate all current endpoint paths for a user (2025 versions)
   */
  static generateUserEndpoints(userId: string): {
    auth: string;
    wallet: string;
    privateKey: string;
    authChallenge: string;
  } {
    return {
      auth: this.generateSecureEndpoint(userId, 'auth2025'),
      wallet: this.generateSecureEndpoint(userId, 'wallet2025'), 
      privateKey: this.generateSecureEndpoint(userId, 'privatekey2025'),
      authChallenge: this.generateSecureEndpoint(userId, 'challenge2025')
    };
  }
  
  /**
   * Middleware to verify obfuscated endpoint access
   */
  static createObfuscationMiddleware(operation: string) {
    return async (request: Request, userId: string): Promise<boolean> => {
      const url = new URL(request.url);
      const path = url.pathname;
      
      const isValid = this.verifyEndpointPath(path, userId, operation);
      
      if (!isValid) {
        // Invalid obfuscated endpoint access attempt - log to monitoring in production
      }
      
      return isValid;
    };
  }
}

// Frontend helper to get current user endpoints
export class FrontendEndpointManager {
  private static userEndpoints: any = null;
  
  /**
   * Store user endpoints received from auth response
   */
  static setUserEndpoints(endpoints: any) {
    this.userEndpoints = endpoints;
    
    // Store in sessionStorage for persistence across page refreshes
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('secure_endpoints', JSON.stringify(endpoints));
    }
  }
  
  /**
   * Get current user endpoints
   */
  static getUserEndpoints(): any {
    if (this.userEndpoints) {
      return this.userEndpoints;
    }
    
    // Try to load from sessionStorage
    if (typeof window !== 'undefined') {
      const stored = sessionStorage.getItem('secure_endpoints');
      if (stored) {
        this.userEndpoints = JSON.parse(stored);
        return this.userEndpoints;
      }
    }
    
    return null;
  }
  
  /**
   * Clear stored endpoints (on logout)
   */
  static clearEndpoints() {
    this.userEndpoints = null;
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('secure_endpoints');
    }
  }
}