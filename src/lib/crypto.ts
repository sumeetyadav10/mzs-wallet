import CryptoJS from 'crypto-js';
import { logger } from '@/lib/logger';

export class CryptoUtils {
  private static readonly ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || process.env.WALLET_ENCRYPTION_KEY;
  
  static {
    if (!this.ENCRYPTION_KEY) {
      throw new Error('ENCRYPTION_KEY or WALLET_ENCRYPTION_KEY environment variable is required');
    }
  }

  static encrypt(text: string, key?: string): string {
    try {
      const encryptionKey = key || this.ENCRYPTION_KEY;
      const encrypted = CryptoJS.AES.encrypt(text, encryptionKey).toString();
      return encrypted;
    } catch (error) {
      logger.error('Encryption failed', { error });
      throw new Error('Encryption failed');
    }
  }

  static decrypt(encryptedText: string, key?: string): string {
    try {
      const encryptionKey = key || this.ENCRYPTION_KEY;
      const decrypted = CryptoJS.AES.decrypt(encryptedText, encryptionKey);
      const decryptedText = decrypted.toString(CryptoJS.enc.Utf8);
      
      if (!decryptedText) {
        throw new Error('Decryption resulted in empty string');
      }
      
      return decryptedText;
    } catch (error) {
      logger.error('Decryption failed', { error });
      throw new Error('Decryption failed');
    }
  }

  static generateHash(data: string): string {
    return CryptoJS.SHA256(data).toString();
  }

  static generateRandomKey(length: number = 32): string {
    return CryptoJS.lib.WordArray.random(length).toString();
  }

  static verifyHash(data: string, hash: string): boolean {
    const dataHash = this.generateHash(data);
    return dataHash === hash;
  }
}

export default CryptoUtils;

// Export individual functions for compatibility
export const encrypt = CryptoUtils.encrypt;
export const decrypt = CryptoUtils.decrypt;
export const generateHash = CryptoUtils.generateHash;