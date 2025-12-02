const admin = require('firebase-admin');

// Initialize Firebase Admin
const serviceAccount = {
  projectId: 'walletlandingpage',
  clientEmail: 'firebase-adminsdk-fbsvc@walletlandingpage.iam.gserviceaccount.com',
  privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
};

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function checkSchema() {
  console.log('Checking database schema by examining a few users...\n');
  
  try {
    // Get a few users with wallet addresses
    const usersWithWallet = await db.collection('users')
      .limit(5)
      .get();
    
    console.log('Sample user documents and their fields:\n');
    
    usersWithWallet.docs.forEach((doc, index) => {
      const data = doc.data();
      console.log(`User ${index + 1} (ID: ${doc.id}):`);
      console.log('Fields present:');
      Object.keys(data).forEach(key => {
        const value = data[key];
        if (key === 'private_key') {
          console.log(`  - ${key}: [REDACTED]`);
        } else if (typeof value === 'object' && value !== null) {
          console.log(`  - ${key}: [Object]`);
        } else {
          console.log(`  - ${key}: ${value}`);
        }
      });
      console.log('---\n');
    });
    
  } catch (error) {
    console.error('Error:', error);
  }
}

checkSchema()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });