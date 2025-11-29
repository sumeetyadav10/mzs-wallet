import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { logger } from '@/lib/logger';

// Initialize Firebase Admin if not already initialized
if (!getApps().length) {
  try {
    // Use private key from environment variables
    if (!process.env.FIREBASE_PRIVATE_KEY) {
      throw new Error('FIREBASE_PRIVATE_KEY environment variable is not set');
    }

    // Clean up the private key formatting - handle both \n and actual newlines
    let privateKey = process.env.FIREBASE_PRIVATE_KEY;
    
    // Remove quotes if present
    privateKey = privateKey.replace(/^["']|["']$/g, '');
    // Replace literal \n with actual newlines
    privateKey = privateKey.replace(/\\n/g, '\n');
    // Ensure proper formatting
    if (!privateKey.includes('\n') && privateKey.includes('-----BEGIN PRIVATE KEY-----')) {
      // If it's all on one line, split it properly
      privateKey = privateKey
        .replace('-----BEGIN PRIVATE KEY-----', '-----BEGIN PRIVATE KEY-----\n')
        .replace('-----END PRIVATE KEY-----', '\n-----END PRIVATE KEY-----');
    }

    logger.log('🔐 Initializing Firebase Admin with environment private key:', {
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKeyLength: privateKey.length,
      privateKeyStart: privateKey.substring(0, 50),
      hasNewlines: privateKey.includes('\n')
    });

    const credential = cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: privateKey,
    });

    initializeApp({
      credential: credential,
    });

    logger.log('✅ Firebase Admin initialized successfully with environment key');
  } catch (error) {
    logger.error('❌ Firebase Admin initialization error:', error);
    logger.error('❌ Error details:', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : null
    });
    // Continue without throwing to allow the API to work
  }
}

// Export admin services
export const db = getFirestore();
export const adminAuth = getAuth();