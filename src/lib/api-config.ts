/**
 * 🔒 CENTRALIZED API CONFIGURATION (2025)
 * 
 * This file centralizes all API endpoint configuration using environment variables
 * Prevents API paths from being exposed in frontend bundle
 */

// 🔐 Base API Configuration
export const API_CONFIG = {
  BASE_URL: process.env.NODE_ENV === 'production' 
    ? 'https://mzswallet.com' 
    : 'http://localhost:3000',

  // 🔒 Authentication Endpoints (2025)
  AUTH: {
    BASE: `/api/${process.env.NEXT_PUBLIC_API_AUTH}`,
    OAUTH: `/api/${process.env.NEXT_PUBLIC_API_AUTH_OAUTH}`,
    VERIFY_SESSION: `/api/${process.env.NEXT_PUBLIC_API_AUTH_VERIFY}`,
    GET_PRIVATE_KEY: `/api/${process.env.NEXT_PUBLIC_API_AUTH_PRIVATE_KEY}`,
    USER_INFO: `/api/${process.env.NEXT_PUBLIC_API_AUTH_USER_INFO}`,
    MIGRATE: `/api/${process.env.NEXT_PUBLIC_API_AUTH_MIGRATE}`,
    FIND_USER: `/api/${process.env.NEXT_PUBLIC_API_AUTH_FIND_USER}`,
    RESET_REQUEST: `/api/${process.env.NEXT_PUBLIC_API_AUTH_RESET_REQUEST}`,
    RESET_PASSWORD: `/api/${process.env.NEXT_PUBLIC_API_AUTH_RESET_PASSWORD}`,
  },

  // 🔒 Wallet Endpoints (2025)
  WALLET: {
    USER_WALLET: `/api/${process.env.NEXT_PUBLIC_API_USER_WALLET}`,
  },

  // 🔒 Secure Endpoints (2025)
  SECURE: {
    AUTH: `/api/${process.env.NEXT_PUBLIC_API_AUTH_SECURE}`,
  },

  // 🔒 Obfuscated Endpoints (Dynamic)
  OBFUSCATED: {
    BASE: `/api/${process.env.NEXT_PUBLIC_API_OBFUSCATED_BASE}`,
  },

  // 🔒 Other API Endpoints
  OTP: {
    GENERATE: `/api/${process.env.NEXT_PUBLIC_API_OTP_GENERATE || 'otp/generate'}`,
    VALIDATE: `/api/${process.env.NEXT_PUBLIC_API_OTP_VALIDATE || 'otp/validate'}`,
  },

  // 🔒 Blockchain API Endpoints (2025)
  SOLANA: {
    BALANCE: `/api/${process.env.NEXT_PUBLIC_API_SOLANA_BALANCE || 'solana/balance'}`,
    WALLET: `/api/${process.env.NEXT_PUBLIC_API_SOLANA_WALLET || 'solana/wallet'}`,
  },

  GENERAL: {
    PRICE: `/api/${process.env.NEXT_PUBLIC_API_PRICE || 'price'}`,
  },

  TRON: {
    BALANCE: `/api/${process.env.NEXT_PUBLIC_API_TRON_BALANCE || 'tron/balance'}`,
    WALLET: `/api/${process.env.NEXT_PUBLIC_API_TRON_WALLET || 'tron/wallet'}`,
    SEND: `/api/${process.env.NEXT_PUBLIC_API_TRON_SEND || 'tron/send'}`,
  },

  POLYGON: {
    SEND: `/api/${process.env.NEXT_PUBLIC_API_POLYGON_SEND || 'polygon/send'}`,
    TRANSACTIONS: `/api/${process.env.NEXT_PUBLIC_API_POLYGON_TRANSACTIONS || 'polygon/transactions'}`,
  },

  SERVICES: {
    GASLESS_RELAY: `/api/${process.env.NEXT_PUBLIC_API_GASLESS_RELAY || 'gasless-relay'}`,
    MZS_PRICE: `/api/${process.env.NEXT_PUBLIC_API_MZS_PRICE || 'mzs-price'}`,
  }
} as const;

// 🔐 Helper Functions
export class APIConfig {
  /**
   * Get full API URL with base URL
   */
  static getFullURL(endpoint: string): string {
    return `${API_CONFIG.BASE_URL}${endpoint}`;
  }

  /**
   * Get authentication endpoint
   */
  static getAuthEndpoint(type: keyof typeof API_CONFIG.AUTH = 'BASE'): string {
    return API_CONFIG.AUTH[type];
  }

  /**
   * Get wallet endpoint
   */
  static getWalletEndpoint(type: keyof typeof API_CONFIG.WALLET = 'USER_WALLET'): string {
    return API_CONFIG.WALLET[type];
  }

  /**
   * Get secure endpoint
   */
  static getSecureEndpoint(type: keyof typeof API_CONFIG.SECURE = 'AUTH'): string {
    return API_CONFIG.SECURE[type];
  }

  /**
   * Build obfuscated endpoint path (for dynamic endpoints)
   */
  static getObfuscatedEndpoint(hash: string): string {
    return `${API_CONFIG.OBFUSCATED.BASE}${hash}`;
  }

  /**
   * Get blockchain endpoints
   */
  static getSolanaEndpoint(type: keyof typeof API_CONFIG.SOLANA = 'BALANCE'): string {
    return API_CONFIG.SOLANA[type];
  }

  static getTronEndpoint(type: keyof typeof API_CONFIG.TRON = 'BALANCE'): string {
    return API_CONFIG.TRON[type];
  }

  static getPolygonEndpoint(type: keyof typeof API_CONFIG.POLYGON = 'SEND'): string {
    return API_CONFIG.POLYGON[type];
  }

  static getServiceEndpoint(type: keyof typeof API_CONFIG.SERVICES = 'GASLESS_RELAY'): string {
    return API_CONFIG.SERVICES[type];
  }

  /**
   * Get all endpoints for debugging (development only)
   */
  static getAllEndpoints(): Record<string, any> {
    if (process.env.NODE_ENV === 'production') {
      return { error: 'Endpoint listing disabled in production' };
    }
    
    return API_CONFIG;
  }

  /**
   * Validate that all required environment variables are set
   */
  static validateConfig(): { valid: boolean; missing: string[] } {
    const required = [
      'NEXT_PUBLIC_API_AUTH',
      'NEXT_PUBLIC_API_AUTH_OAUTH',
      'NEXT_PUBLIC_API_AUTH_VERIFY',
      'NEXT_PUBLIC_API_AUTH_USER_INFO',
      'NEXT_PUBLIC_API_USER_WALLET',
      'NEXT_PUBLIC_API_AUTH_SECURE',
      'NEXT_PUBLIC_API_OBFUSCATED_BASE'
    ];

    const missing = required.filter(key => !process.env[key]);

    return {
      valid: missing.length === 0,
      missing
    };
  }
}

// 🔒 Export for direct usage
export default API_CONFIG;