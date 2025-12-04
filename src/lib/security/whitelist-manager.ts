import { logger } from '@/lib/logger';

export class WhitelistManager {
  private static readonly ALLOWED_DOMAINS = [
    'mzswallet.com',
    'localhost',
    'localhost:3000',
    'localhost:3001',
    'localhost:3010',
    '127.0.0.1'
  ];

  private static readonly ALLOWED_IPS = [
    '127.0.0.1',
    '::1',
    // Add your server IPs here
  ];

  static isDomainAllowed(domain: string): boolean {
    const cleanDomain = domain.toLowerCase().replace(/^https?:\/\//, '');
    const domainWithoutPort = cleanDomain.split(':')[0];
    
    return this.ALLOWED_DOMAINS.some(allowed => {
      // Check exact match (including port)
      if (cleanDomain === allowed) return true;
      
      // Check domain without port
      const allowedWithoutPort = allowed.split(':')[0];
      if (domainWithoutPort === allowedWithoutPort) return true;
      
      // Check subdomain match
      return domainWithoutPort.endsWith('.' + allowedWithoutPort);
    });
  }

  static isIpAllowed(ip: string): boolean {
    return this.ALLOWED_IPS.includes(ip);
  }

  static validateOrigin(origin: string | null): boolean {
    if (!origin) return false;
    
    try {
      const url = new URL(origin);
      // Include port in domain check if present
      const domain = url.port ? `${url.hostname}:${url.port}` : url.hostname;
      const isAllowed = this.isDomainAllowed(domain);
      
      if (!isAllowed) {
        logger.warn('Origin not in whitelist', { origin, domain });
      }
      
      return isAllowed;
    } catch (error) {
      logger.error('Invalid origin format', { origin, error });
      return false;
    }
  }

  static validateReferer(referer: string | null): boolean {
    if (!referer) return true; // Referer is optional
    
    try {
      const url = new URL(referer);
      return this.isDomainAllowed(url.hostname);
    } catch (error) {
      logger.error('Invalid referer format', { referer, error });
      return false;
    }
  }
}

export default WhitelistManager;

// Export as whitelistManager for compatibility
export const whitelistManager = {
  isWhitelisted: (userId: string) => {
    // For now, return false for all users to ensure reCAPTCHA is always required
    return false;
  },
  isDomainAllowed: WhitelistManager.isDomainAllowed,
  isIpAllowed: WhitelistManager.isIpAllowed,
  validateOrigin: WhitelistManager.validateOrigin,
  validateReferer: WhitelistManager.validateReferer
};