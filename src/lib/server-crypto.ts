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
    const iv = crypto.randomBytes(12);
    
    // Derive key using user email as additional entropy
    const key = crypto.pbkdf2Sync(ENCRYPTION_KEY + userEmail, salt, 10000, 32, 'sha512');
    
    const cipher = crypto.createCipherGCM(ALGORITHM, key, iv);
    
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
    const iv = combined.subarray(16, 28);
    const authTag = combined.subarray(28, 44);
    const encrypted = combined.subarray(44);
    
    // Derive the same key using user email
    const key = crypto.pbkdf2Sync(ENCRYPTION_KEY + userEmail, salt, 10000, 32, 'sha512');
    
    const decipher = crypto.createDecipherGCM(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, null, 'utf8');
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
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(verifyHash, 'hex'));
  } catch {
    return false;
  }
}