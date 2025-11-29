import crypto from 'crypto';

/**
 * 🔒 MZS WALLET SERVER-SIDE CRYPTOGRAPHY
 * 
 * Secure encryption/decryption for sensitive data
 */

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || process.env.WALLET_ENCRYPTION_KEY;

if (!ENCRYPTION_KEY) {
  throw new Error('ENCRYPTION_KEY or WALLET_ENCRYPTION_KEY environment variable is required');
}
const ALGORITHM = 'aes-256-gcm';

/**
 * Encrypt private key for database storage
 */
export function encryptPrivateKey(privateKey: string, userEmail: string): string {
  try {
    const salt = crypto.randomBytes(16);
    const iv = crypto.randomBytes(16);
    
    // Derive key using user email as additional entropy
    const key = crypto.pbkdf2Sync(ENCRYPTION_KEY + userEmail, salt, 10000, 32, 'sha512');
    
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    let encrypted = cipher.update(privateKey, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    // Combine salt, iv, authTag, and encrypted data
    const combined = Buffer.concat([salt, iv, authTag, Buffer.from(encrypted, 'hex')]);
    
    return combined.toString('base64');
  } catch (error) {
    throw new Error('Encryption failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
  }
}

/**
 * Decrypt private key from database storage
 */
export function decryptPrivateKey(encryptedPrivateKey: string, userEmail: string): string {
  try {
    const combined = Buffer.from(encryptedPrivateKey, 'base64');
    
    const salt = combined.subarray(0, 16);
    const iv = combined.subarray(16, 32);
    const authTag = combined.subarray(32, 48);
    const encrypted = combined.subarray(48);
    
    // Derive the same key using user email
    const key = crypto.pbkdf2Sync(ENCRYPTION_KEY + userEmail, salt, 10000, 32, 'sha512');
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, undefined, 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    throw new Error('Decryption failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
  }
}

/**
 * Generate a secure random string
 */
export function generateSecureRandom(length: number = 32): string {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Hash sensitive data for comparison
 */
export function hashData(data: string, salt?: string): string {
  const actualSalt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(data, actualSalt, 10000, 32, 'sha512').toString('hex');
  return `${actualSalt}:${hash}`;
}

/**
 * Verify hashed data
 */
export function verifyHashedData(data: string, hashedData: string): boolean {
  try {
    const [salt, hash] = hashedData.split(':');
    const verifyHash = crypto.pbkdf2Sync(data, salt, 10000, 32, 'sha512').toString('hex');
    const hashBuffer = Buffer.from(hash, 'hex');
    const verifyBuffer = Buffer.from(verifyHash, 'hex');
    return hashBuffer.length === verifyBuffer.length && crypto.timingSafeEqual(hashBuffer, verifyBuffer);
  } catch {
    return false;
  }
}

/**
 * Log security event
 */
export function logSecurityEvent(event: any): void {
  // This is a placeholder that should be replaced with actual logging
  console.log('Security event:', event);
}