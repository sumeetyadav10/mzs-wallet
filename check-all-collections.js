const admin = require('firebase-admin');
require('dotenv').config({ path: '.env.local' });

// Initialize Firebase Admin
const serviceAccount = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
};

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

// Test wallet address to search for
const testAddress = '0x716e89f710f9df90d64e85092d5d2e3772a71581';

async function checkAllCollections() {
  console.log('=== Checking all collections for wallet addresses ===\n');
  
  try {
    // Get all collections
    const collections = await db.listCollections();
    console.log(`Found ${collections.length} collections:\n`);
    
    for (const collection of collections) {
      console.log(`Checking collection: ${collection.id}`);
      
      // Try to find by walletAddress field
      const snapshot1 = await collection
        .where('walletAddress', '==', testAddress.toLowerCase())
        .limit(1)
        .get();
        
      if (!snapshot1.empty) {
        console.log(`  ✓ Found in ${collection.id} by walletAddress field`);
        const data = snapshot1.docs[0].data();
        console.log(`    Document ID: ${snapshot1.docs[0].id}`);
        console.log(`    Auth Email: ${data.authEmail || data.email || 'No email'}`);
      }
      
      // Try to find by address field  
      const snapshot2 = await collection
        .where('address', '==', testAddress.toLowerCase())
        .limit(1)
        .get();
        
      if (!snapshot2.empty) {
        console.log(`  ✓ Found in ${collection.id} by address field`);
        const data = snapshot2.docs[0].data();
        console.log(`    Document ID: ${snapshot2.docs[0].id}`);
        console.log(`    Auth Email: ${data.authEmail || data.email || 'No email'}`);
      }
      
      // Try to find by id (document ID)
      const docRef = collection.doc(testAddress.toLowerCase());
      const doc = await docRef.get();
      
      if (doc.exists) {
        console.log(`  ✓ Found in ${collection.id} by document ID`);
        const data = doc.data();
        console.log(`    Auth Email: ${data.authEmail || data.email || 'No email'}`);
      }
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
  
  console.log('\n=== Check Complete ===');
  process.exit(0);
}

checkAllCollections().catch(error => {
  console.error('Script error:', error);
  process.exit(1);
});