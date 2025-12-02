const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// Use EXACT same initialization as user-wallet2025 route
if (!getApps().length) {
  try {
    // Clean up the private key formatting - handle both \n and actual newlines
    let privateKey = process.env.FIREBASE_PRIVATE_KEY;
    if (privateKey) {
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
    }
    
    console.log('🔐 Initializing Firebase Admin with credentials:', {
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      hasPrivateKey: !!privateKey,
      privateKeyLength: privateKey?.length || 0,
      privateKeyStart: privateKey?.substring(0, 50),
      hasNewlines: privateKey?.includes('\n') || false
    });
    
    const credential = cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: privateKey,
    });
    
    initializeApp({
      credential: credential,
    });
    
    console.log('✅ Firebase Admin initialized successfully');
  } catch (error) {
    console.error('❌ Firebase Admin initialization error:', error);
    console.error('❌ Error details:', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : null
    });
  }
}

const db = getFirestore();

async function checkAllCollections() {
  console.log('=== CHECKING ALL COLLECTIONS FOR yadsum396@gmail.com ===\n');
  
  const email = 'yadsum396@gmail.com';
  const collections = ['users', 'mzs', 'mzs-users', 'mzs_users', 'MZS', 'deleted_users'];
  
  for (const collectionName of collections) {
    console.log(`\n📂 Checking collection: ${collectionName}`);
    
    try {
      // Check auth_email field
      const authEmailQuery = await db
        .collection(collectionName)
        .where('auth_email', '==', email)
        .limit(1)
        .get();
      
      if (!authEmailQuery.empty) {
        console.log(`✅ FOUND in ${collectionName} with auth_email!`);
        const doc = authEmailQuery.docs[0];
        const data = doc.data();
        console.log('  Document ID:', doc.id);
        console.log('  Fields:', Object.keys(data));
        console.log('  auth_email:', data.auth_email);
        console.log('  wallet_address:', data.wallet_address || data.address);
        return;
      }
      
      // Check email field
      const emailQuery = await db
        .collection(collectionName)
        .where('email', '==', email)
        .limit(1)
        .get();
      
      if (!emailQuery.empty) {
        console.log(`✅ FOUND in ${collectionName} with email!`);
        const doc = emailQuery.docs[0];
        const data = doc.data();
        console.log('  Document ID:', doc.id);
        console.log('  Fields:', Object.keys(data));
        console.log('  email:', data.email);
        console.log('  auth_email:', data.auth_email);
        return;
      }
      
      // Check as document ID
      const docRef = await db.collection(collectionName).doc(email).get();
      if (docRef.exists) {
        console.log(`✅ FOUND in ${collectionName} as document ID!`);
        const data = docRef.data();
        console.log('  Fields:', Object.keys(data));
        console.log('  auth_email:', data.auth_email);
        console.log('  email:', data.email);
        return;
      }
      
      console.log(`  ❌ Not found in ${collectionName}`);
      
    } catch (error) {
      console.log(`  ⚠️ Error accessing ${collectionName}:`, error.message);
    }
  }
  
  // Also check suda159 since user mentioned it
  console.log('\n\n=== ALSO CHECKING FOR suda159 ===');
  const suda159Email = 'suda159@hotmail.com';
  
  const sudaQuery = await db
    .collection('users')
    .where('auth_email', '==', suda159Email)
    .limit(1)
    .get();
    
  if (!sudaQuery.empty) {
    console.log('✅ Found suda159!');
    const doc = sudaQuery.docs[0];
    const data = doc.data();
    console.log('  Document ID:', doc.id);
    console.log('  auth_email:', data.auth_email);
    console.log('  wallet_address:', data.wallet_address || data.address);
  } else {
    console.log('❌ suda159 not found either');
  }
  
  process.exit(0);
}

// Load environment variables
require('dotenv').config({ path: '.env.local' });

checkAllCollections().catch(console.error);