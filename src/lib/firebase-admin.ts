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

    logger.log('🔐 Initializing Firebase Admin with environment private key:', {
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKeyLength: process.env.FIREBASE_PRIVATE_KEY.length
    });

    const credential = cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    });

    initializeApp({
      credential: credential,
    });

    logger.log('✅ Firebase Admin initialized successfully with environment key');
  } catch (error) {
    logger.error('❌ Firebase Admin initialization error:', error);
    // Continue without throwing to allow the API to work
  }
}

// Export admin services
export const db = getFirestore();
export const adminAuth = getAuth();