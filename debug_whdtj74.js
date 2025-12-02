require('dotenv').config({ path: '.env.local' });
const admin = require('firebase-admin');

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

async function debug() {
  console.log('=== DEBUGGING auth_email QUERY ===\n');
  
  const email = 'whdtj74@gmail.com';
  
  // Query exactly how the API does it
  console.log('Querying mzs collection where auth_email ==', email);
  const query = await db
    .collection('mzs')
    .where('auth_email', '==', email)
    .limit(1)
    .get();
  
  console.log('\nQuery result:');
  console.log('isEmpty:', query.empty);
  console.log('docCount:', query.docs.length);
  
  if (!query.empty) {
    const doc = query.docs[0];
    const data = doc.data();
    console.log('\nFound document!');
    console.log('Document ID:', doc.id);
    console.log('auth_email:', data.auth_email);
    console.log('private_key:', data.private_key ? 'EXISTS' : 'MISSING');
    console.log('wallet_address:', data.wallet_address || data.address || 'MISSING');
  } else {
    console.log('\n❌ NO DOCUMENT FOUND!');
    
    // List all documents in mzs collection to debug
    console.log('\nListing all documents with whdtj74 in any field...');
    const allDocs = await db.collection('mzs').get();
    let found = false;
    
    allDocs.forEach(doc => {
      const data = doc.data();
      const dataStr = JSON.stringify(data).toLowerCase();
      if (dataStr.includes('whdtj74')) {
        console.log('\nFound in document:', doc.id);
        console.log('auth_email:', data.auth_email);
        console.log('email:', data.email);
        found = true;
      }
    });
    
    if (!found) {
      console.log('No documents contain whdtj74');
    }
  }
}

debug().catch(console.error);