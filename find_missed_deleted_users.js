const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// Initialize Firebase Admin
if (!getApps().length) {
  try {
    let privateKey = process.env.FIREBASE_PRIVATE_KEY;
    if (privateKey) {
      privateKey = privateKey.replace(/^["']|["']$/g, '');
      privateKey = privateKey.replace(/\\n/g, '\n');
      if (!privateKey.includes('\n') && privateKey.includes('-----BEGIN PRIVATE KEY-----')) {
        privateKey = privateKey
          .replace('-----BEGIN PRIVATE KEY-----', '-----BEGIN PRIVATE KEY-----\n')
          .replace('-----END PRIVATE KEY-----', '\n-----END PRIVATE KEY-----');
      }
    }
    
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
  }
}

const db = getFirestore();

async function findMissedDeletedUsers() {
  console.log('=== SEARCHING FOR MISSED DELETED USERS ===\n');
  
  // Users who failed login but not in our restored list
  const missedUsers = [
    'min720525@daum.net',
    'snlee20101@gmail.com',
    'a67283425@gmail.com',
    'h692773@gmail.com',
    'a01038118835@gmail.com',
    'skarms01@gmail.com',
    'kimek0463@gmail.com',
    'gimg67027@gmail.com',
    'tlsaudgp@gmail.com',
    'skarms01@naver.com',
    'seongtaesin@gmail.com',
    'lim25kr@gmail.com',
    'sookkyung1052@gmail.com',
    'sk01085207785@gmail.com',
    'rladmleks12@gmail.com',
    'moldhjoss@naver.com',
    'missuni051938@gmail.com',
    'ksb55201@gmail.com',
    'kodan6988@gmail.com',
    'kangyt7023@gmail.com',
    'jskim22929@daum.net',
    'izzima45@gmail.com',
    'hdr3017@hanmail.net',
    'gs36516@gmail.com',
    'ehdals5793@gmail.com',
    'bumjuntaegun@gmail.com',
    'a71270007@gmail.com',
    'a0103285653664@gmail.com'
  ];
  
  const foundUsers = [];
  const collections = ['users', 'mzs', 'deleted_users', 'gptch_users', 'mzs_deleted'];
  
  for (const email of missedUsers) {
    console.log(`\nChecking: ${email}`);
    let found = false;
    
    for (const collection of collections) {
      try {
        // Check by auth_email
        const authEmailQuery = await db.collection(collection)
          .where('auth_email', '==', email)
          .limit(1)
          .get();
          
        if (!authEmailQuery.empty) {
          const doc = authEmailQuery.docs[0];
          const data = doc.data();
          console.log(`  ✅ Found in ${collection}!`);
          console.log(`     user_id: ${doc.id}`);
          console.log(`     wallet: ${data.wallet_address || data.address || 'N/A'}`);
          console.log(`     private_key: ${data.private_key ? 'YES' : 'NO'}`);
          
          foundUsers.push({
            user_id: doc.id,
            auth_email: email,
            wallet_address: data.wallet_address || data.address || '',
            private_key: data.private_key || '',
            collection: collection,
            ...data
          });
          found = true;
          break;
        }
        
        // Check by email field
        const emailQuery = await db.collection(collection)
          .where('email', '==', email)
          .limit(1)
          .get();
          
        if (!emailQuery.empty) {
          const doc = emailQuery.docs[0];
          const data = doc.data();
          console.log(`  ✅ Found in ${collection} (email field)!`);
          console.log(`     user_id: ${doc.id}`);
          console.log(`     wallet: ${data.wallet_address || data.address || 'N/A'}`);
          
          foundUsers.push({
            user_id: doc.id,
            auth_email: data.auth_email || email,
            email: email,
            wallet_address: data.wallet_address || data.address || '',
            private_key: data.private_key || '',
            collection: collection,
            ...data
          });
          found = true;
          break;
        }
        
        // Check as document ID
        const docRef = await db.collection(collection).doc(email).get();
        if (docRef.exists) {
          const data = docRef.data();
          console.log(`  ✅ Found in ${collection} as doc ID!`);
          console.log(`     wallet: ${data.wallet_address || data.address || 'N/A'}`);
          
          foundUsers.push({
            user_id: email,
            auth_email: data.auth_email || email,
            wallet_address: data.wallet_address || data.address || '',
            private_key: data.private_key || '',
            collection: collection,
            ...data
          });
          found = true;
          break;
        }
      } catch (e) {
        // Collection might not exist
      }
    }
    
    if (!found) {
      console.log(`  ❌ Not found in any collection`);
    }
  }
  
  // Save results
  const fs = require('fs').promises;
  const csv = ['user_id,auth_email,email,wallet_address,collection,has_private_key'];
  
  foundUsers.forEach(user => {
    csv.push(`${user.user_id},${user.auth_email},${user.email || ''},${user.wallet_address},${user.collection},${user.private_key ? 'YES' : 'NO'}`);
  });
  
  await fs.writeFile('missed_deleted_users.csv', csv.join('\n'));
  console.log(`\n\nSaved ${foundUsers.length} found users to missed_deleted_users.csv`);
  
  // Also search for more deleted users by scanning collections
  console.log('\n\n=== SCANNING FOR MORE DELETED USERS ===');
  const deletedPattern = /deleted|removed|migrated/i;
  const moreDeleted = [];
  
  for (const collection of ['mzs', 'deleted_users', 'mzs_deleted']) {
    try {
      console.log(`\nScanning ${collection} collection...`);
      const snapshot = await db.collection(collection).limit(100).get();
      
      snapshot.forEach(doc => {
        const data = doc.data();
        if (data.auth_email && !missedUsers.includes(data.auth_email)) {
          moreDeleted.push({
            user_id: doc.id,
            auth_email: data.auth_email,
            wallet_address: data.wallet_address || data.address || '',
            collection: collection
          });
        }
      });
    } catch (e) {
      console.log(`  Could not access ${collection}`);
    }
  }
  
  console.log(`\nFound ${moreDeleted.length} more potential deleted users`);
  
  process.exit(0);
}

// Load environment variables
require('dotenv').config({ path: '.env.local' });

findMissedDeletedUsers().catch(console.error);