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

const targetAddress = '0x394cf45b6e49fc73d3c6a685ec540a955257dae9';

async function findWalletAddress() {
  console.log(`Searching for wallet address: ${targetAddress}\n`);
  
  try {
    // Search by wallet_address field
    const walletAddressQuery = await db.collection('users')
      .where('wallet_address', '==', targetAddress)
      .limit(1)
      .get();
    
    // Search by address field (legacy)
    const addressQuery = await db.collection('users')
      .where('address', '==', targetAddress)
      .limit(1)
      .get();
    
    let found = false;
    
    if (!walletAddressQuery.empty) {
      console.log('Found by wallet_address field:');
      const doc = walletAddressQuery.docs[0];
      const data = doc.data();
      console.log(`\nDocument ID: ${doc.id}`);
      console.log('\nAll fields in the document:');
      console.log(JSON.stringify(data, null, 2));
      found = true;
    }
    
    if (!addressQuery.empty && addressQuery.docs[0].id !== walletAddressQuery.docs[0]?.id) {
      console.log('\nAlso found by address field:');
      const doc = addressQuery.docs[0];
      const data = doc.data();
      console.log(`\nDocument ID: ${doc.id}`);
      console.log('\nAll fields in the document:');
      console.log(JSON.stringify(data, null, 2));
      found = true;
    }
    
    if (!found) {
      console.log('Wallet address not found in database.');
      
      // Let's also search in all documents to see if it's stored differently
      console.log('\nSearching all users for any field containing this address...');
      const allUsers = await db.collection('users').get();
      
      allUsers.docs.forEach(doc => {
        const data = doc.data();
        const dataStr = JSON.stringify(data).toLowerCase();
        if (dataStr.includes(targetAddress.toLowerCase())) {
          console.log(`\nFound in document ${doc.id}:`);
          console.log(JSON.stringify(data, null, 2));
        }
      });
    }
    
  } catch (error) {
    console.error('Error searching:', error);
  }
}

findWalletAddress()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });