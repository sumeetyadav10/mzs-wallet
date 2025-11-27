'use client';

import CryptoJS from 'crypto-js';
import { FrontendEndpointManager } from './endpoint-obfuscation';
import { APIConfig } from '../api-config';

// Frontend Security Utilities for Secure API Communication
export class FrontendSecurity {
  private static readonly REQUEST_SIGNING_SECRET = process.env.NEXT_PUBLIC_REQUEST_SIGNING_SECRET || 'request-signing-secret-key';

  // Generate request signature for critical operations
  static generateRequestSignature(userId: string, timestamp: number, operation: string, data?: any): string {
    const payload = {
      userId,
      timestamp,
      operation,
      data: data ? JSON.stringify(data) : ''
    };

    return CryptoJS.HmacSHA256(JSON.stringify(payload), this.REQUEST_SIGNING_SECRET).toString();
  }

  // Generate comprehensive device fingerprint (client-side version)
  static generateDeviceFingerprint(): string {
    try {
      const components = [
        // Browser & System
        navigator.userAgent || '',
        navigator.language || '',
        navigator.languages?.join(',') || '',
        navigator.platform || '',
        
        // Screen & Display
        screen.width + 'x' + screen.height,
        screen.colorDepth?.toString() || '',
        screen.pixelDepth?.toString() || '',
        window.devicePixelRatio?.toString() || '',
        
        // Hardware
        navigator.hardwareConcurrency?.toString() || '',
        navigator.maxTouchPoints?.toString() || '',
        (navigator as any).deviceMemory?.toString() || '',
        
        // Timezone & Location
        new Date().getTimezoneOffset().toString(),
        Intl.DateTimeFormat().resolvedOptions().timeZone || '',
        
        // WebGL Fingerprinting (for uniqueness)
        this.getWebGLFingerprint(),
        
        // Canvas Fingerprinting (for uniqueness) 
        this.getCanvasFingerprint()
      ].filter(Boolean); // Remove empty values

      const fingerprint = CryptoJS.SHA256(components.join('|')).toString();
      
      
      return fingerprint;
    } catch (error) {
      // Fallback fingerprint
      return CryptoJS.SHA256(
        navigator.userAgent + '|' + 
        screen.width + 'x' + screen.height + '|' + 
        new Date().getTimezoneOffset()
      ).toString();
    }
  }

  // WebGL fingerprinting for device uniqueness
  private static getWebGLFingerprint(): string {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (!gl) return 'no-webgl';
      
      const renderer = (gl as any).getParameter((gl as any).RENDERER);
      const vendor = (gl as any).getParameter((gl as any).VENDOR);
      return `${vendor}|${renderer}`;
    } catch {
      return 'webgl-error';
    }
  }

  // Canvas fingerprinting for device uniqueness
  private static getCanvasFingerprint(): string {
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return 'no-canvas';
      
      ctx.textBaseline = 'top';
      ctx.font = '14px Arial';
      ctx.fillText('MZS Device Check 🔐', 2, 2);
      return canvas.toDataURL().substring(0, 50);
    } catch {
      return 'canvas-error';
    }
  }

  // Get client IP (best effort - will be validated on server)
  static async getClientIP(): Promise<string> {
    try {
      // This will be the real IP detection on server side
      // Client side just returns placeholder
      return 'client-detected';
    } catch {
      return 'ip-unknown';
    }
  }

  // Decrypt transport-encrypted private key
  static decryptTransportKey(encryptedData: string, userId: string, sessionId: string): string {
    try {
      const parts = encryptedData.split(':');
      if (parts.length !== 4) {
        throw new Error('Invalid encrypted data format');
      }

      const [ivHex, saltHex, tagHex, encrypted] = parts;
      
      // Note: This is a simplified version. In production, you'd use WebCrypto API
      // For now, we'll return the encrypted data and let the server handle decryption
      
      return encryptedData;
      
    } catch (error) {
      
      throw new Error('Failed to decrypt private key');
    }
  }

  // Validate timestamp for replay attack prevention
  static isTimestampValid(timestamp: number, maxAgeMs: number = 5 * 60 * 1000): boolean {
    const now = Date.now();
    return Math.abs(now - timestamp) <= maxAgeMs;
  }
}

// 🔒 SIMPLIFIED API CLIENT - Direct API calls with JWT authentication + Device Binding
export class SecureAPIClient {

  // Get user email from stored session
  private static getUserEmail(): string | null {
    const storedUserInfo = localStorage.getItem('userInfo');
    if (!storedUserInfo) return null;
    try {
      const userInfo = JSON.parse(storedUserInfo);
      return userInfo.email || null;
    } catch {
      return null;
    }
  }

  // Generate secure headers with device binding
  private static async getSecureHeaders(authToken?: string): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Device-Fingerprint': FrontendSecurity.generateDeviceFingerprint(),
      'X-Timestamp': Date.now().toString()
    };

    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }

    // Add request signature for critical operations
    const timestamp = Date.now();
    headers['X-Request-Signature'] = FrontendSecurity.generateRequestSignature(
      'api_client',
      timestamp,
      'secure_request',
      { deviceFingerprint: headers['X-Device-Fingerprint'] }
    );

    return headers;
  }

  // 🔐 WALLET ACCESS - Direct API call with JWT + Device Binding
  static async accessWalletSecure(authToken: string) {
    try {
      const userEmail = this.getUserEmail();
      if (!userEmail) {
        throw new Error('No user email available - please login again');
      }

      
      const secureHeaders = await this.getSecureHeaders(authToken);
      
      const response = await fetch(`/api/${process.env.NEXT_PUBLIC_API_USER_WALLET}`, {
        method: 'POST',
        headers: secureHeaders,
        body: JSON.stringify({
          email: userEmail
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Wallet access failed: ${response.status} ${errorText}`);
      }

      const data = await response.json();
      
      return data;

    } catch (error) {
      SecurityLogger.logSecurityEvent({
        type: 'WALLET_ACCESS',
        success: false,
        details: { error: error instanceof Error ? error.message : 'Unknown error' }
      });
      throw error;
    }
  }

  // 🔐 WALLET CREATION - Direct API call with JWT + Device Binding
  static async createWalletSecure(authToken: string, privateKey: string) {
    try {
      const userEmail = this.getUserEmail();
      if (!userEmail) {
        throw new Error('No user email available - please login again');
      }

      

      const secureHeaders = await this.getSecureHeaders(authToken);

      const response = await fetch(`/api/${process.env.NEXT_PUBLIC_API_USER_WALLET}`, {
        method: 'POST',
        headers: secureHeaders,
        body: JSON.stringify({
          email: userEmail,
          private_key: privateKey
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Wallet creation failed: ${response.status} ${errorText}`);
      }

      const data = await response.json();
      
      return data;

    } catch (error) {
      SecurityLogger.logSecurityEvent({
        type: 'WALLET_ACCESS',
        success: false,
        details: { error: error instanceof Error ? error.message : 'Unknown error' }
      });
      throw error;
    }
  }

  // 🔐 PRIVATE KEY ACCESS - Direct API call with JWT + Device Binding + CAPTCHA
  static async accessPrivateKeySecure(authToken: string, captchaToken: string) {
    try {
      const userEmail = this.getUserEmail();
      if (!userEmail) {
        throw new Error('No user email available - please login again');
      }

      
      const secureHeaders = await this.getSecureHeaders(authToken);
      
      const response = await fetch(`/api/${process.env.NEXT_PUBLIC_API_AUTH_PRIVATE_KEY}`, {
        method: 'POST',
        headers: secureHeaders,
        body: JSON.stringify({
          email: userEmail,
          captchaToken: captchaToken
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Private key access failed: ${response.status} ${errorText}`);
      }

      const data = await response.json();
      
      return data;

    } catch (error) {
      SecurityLogger.logSecurityEvent({
        type: 'PRIVATE_KEY_ACCESS',
        success: false,
        details: { error: error instanceof Error ? error.message : 'Unknown error' }
      });
      throw error;
    }
  }

  // 🔐 SESSION VERIFICATION - Direct API call with JWT + Device Binding
  static async verifySessionSecure(authToken: string) {
    try {
      
      const secureHeaders = await this.getSecureHeaders(authToken);
      
      const response = await fetch(`/api/${process.env.NEXT_PUBLIC_API_AUTH_VERIFY}`, {
        method: 'POST',
        headers: secureHeaders
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Session verification failed: ${response.status} ${errorText}`);
      }

      const data = await response.json();
      
      return data;

    } catch (error) {
      SecurityLogger.logSecurityEvent({
        type: 'AUTH_ATTEMPT',
        success: false,
        details: { error: error instanceof Error ? error.message : 'Unknown error' }
      });
      throw error;
    }
  }

  // 🔐 LEGACY AUTHENTICATION - Direct API call with user credentials + Device Binding
  static async authenticateSecure(userId: string, password: string, captchaToken: string) {
    try {
      
      const secureHeaders = await this.getSecureHeaders(); // No auth token yet
      
      const response = await fetch(`/api/${process.env.NEXT_PUBLIC_API_AUTH_SECURE}`, {
        method: 'POST',
        headers: secureHeaders,
        body: JSON.stringify({
          user_id: userId,
          password: password,
          captchaToken: captchaToken
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Authentication failed: ${response.status} ${errorText}`);
      }

      const data = await response.json();
      
      return data;

    } catch (error) {
      SecurityLogger.logSecurityEvent({
        type: 'AUTH_ATTEMPT',
        success: false,
        details: { error: error instanceof Error ? error.message : 'Unknown error' }
      });
      throw error;
    }
  }
}

// Security Event Logger
export class SecurityLogger {
  static logSecurityEvent(event: {
    type: 'AUTH_ATTEMPT' | 'WALLET_ACCESS' | 'PRIVATE_KEY_ACCESS' | 'SECURITY_WARNING';
    userId?: string;
    success: boolean;
    details?: any;
  }) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      deviceFingerprint: FrontendSecurity.generateDeviceFingerprint(),
      userAgent: navigator.userAgent,
      url: window.location.href,
      ...event
    };

    
    // In production, send to secure logging service
    // await fetch('/api/security/log', { ... });
  }
}