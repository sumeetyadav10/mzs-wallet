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

async function findYadsum396() {
  const email = 'yadsum396@gmail.com';
  
  // Use EXACT same query as user-wallet2025 route
  let userQuery;
  try {
    console.log('🔍 Querying Firestore for user:', { email });
    userQuery = await db
      .collection('users')
      .where('auth_email', '==', email)
      .limit(1)
      .get();
    
    console.log('✅ Firestore query successful', { 
      isEmpty: userQuery.empty,
      docCount: userQuery.docs.length 
    });
    
    if (!userQuery.empty) {
      console.log('\n✅ FOUND USER!');
      const userDoc = userQuery.docs[0];
      const userData = userDoc.data();
      console.log('Document ID:', userDoc.id);
      console.log('User data fields:', Object.keys(userData));
      console.log('auth_email:', userData.auth_email);
      console.log('wallet_address:', userData.wallet_address);
      console.log('Has private_key:', !!userData.private_key);
    } else {
      console.log('\n❌ User not found!');
      
      // Let's try other queries
      console.log('\n🔍 Trying with email field instead of auth_email...');
      const emailQuery = await db
        .collection('users')
        .where('email', '==', email)
        .limit(1)
        .get();
      
      if (!emailQuery.empty) {
        console.log('✅ Found with email field!');
        const doc = emailQuery.docs[0];
        console.log('Document fields:', Object.keys(doc.data()));
      }
      
      // Try as document ID
      console.log('\n🔍 Trying as document ID...');
      const docRef = await db.collection('users').doc(email).get();
      if (docRef.exists) {
        console.log('✅ Found as document ID!');
        console.log('Document fields:', Object.keys(docRef.data()));
      }
      
      // List first few users to see structure
      console.log('\n🔍 Listing first 5 users to check structure...');
      const snapshot = await db.collection('users').limit(5).get();
      snapshot.forEach((doc, index) => {
        const data = doc.data();
        console.log(`\nUser ${index + 1}:`);
        console.log('  Doc ID:', doc.id);
        console.log('  auth_email:', data.auth_email);
        console.log('  email:', data.email);
      });
    }
    
  } catch (firestoreError) {
    console.error('❌ Firestore query failed:', firestoreError);
    if (firestoreError instanceof Error && firestoreError.message.includes('DECODER')) {
      console.error('🔐 Firebase credentials issue - check FIREBASE_PRIVATE_KEY format');
    }
  }
  
  process.exit(0);
}

// Load environment variables
require('dotenv').config({ path: '.env.local' });

findYadsum396().catch(console.error);