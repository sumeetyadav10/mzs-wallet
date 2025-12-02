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

async function checkUser() {
  const email = 'whdtj74@gmail.com';
  console.log(`=== CHECKING USER: ${email} ===\n`);
  
  try {
    // Check in users collection
    console.log('1. Checking users collection...');
    const usersQuery = await db.collection('users')
      .where('auth_email', '==', email)
      .limit(1)
      .get();
    
    if (!usersQuery.empty) {
      console.log('✅ User found in users collection!');
      const doc = usersQuery.docs[0];
      const data = doc.data();
      console.log('Document ID:', doc.id);
      console.log('Data:', JSON.stringify(data, null, 2));
      
      // Check if user has the necessary fields for mzs
      if (data.private_key || data.wallet_address || data.address) {
        console.log('\n📝 Migrating user to mzs collection...');
        
        // Prepare data for mzs collection
        const mzsData = {
          user_id: doc.id,
          auth_email: email,
          email: data.email || email
        };
        
        // Add optional fields if they exist
        if (data.private_key) mzsData.private_key = data.private_key;
        if (data.wallet_address) mzsData.wallet_address = data.wallet_address;
        if (data.address) mzsData.address = data.address;
        if (data.username) mzsData.username = data.username;
        
        // Add migration metadata
        mzsData.migratedFromUsers = true;
        mzsData.migrationDate = admin.firestore.FieldValue.serverTimestamp();
        mzsData.service = 'MZS-WALLET';
        
        // Save to mzs collection
        await db.collection('mzs').doc(doc.id).set(mzsData);
        console.log('✅ User migrated to mzs collection!');
      } else {
        console.log('\n⚠️ User lacks wallet data - cannot migrate to mzs collection');
      }
    } else {
      console.log('❌ User not found in users collection');
    }
    
    // Check in mzs collection
    console.log('\n2. Checking mzs collection...');
    const mzsQuery = await db.collection('mzs')
      .where('auth_email', '==', email)
      .limit(1)
      .get();
    
    if (!mzsQuery.empty) {
      console.log('✅ User found in mzs collection!');
      const doc = mzsQuery.docs[0];
      console.log('Document ID:', doc.id);
      console.log('Data:', JSON.stringify(doc.data(), null, 2));
    } else {
      console.log('❌ User not found in mzs collection');
    }
    
    // Check by document ID "your_old_user_id"
    console.log('\n3. Checking document ID "your_old_user_id" in mzs collection...');
    const docRef = await db.collection('mzs').doc('your_old_user_id').get();
    if (docRef.exists) {
      console.log('✅ Document found with ID "your_old_user_id"!');
      console.log('Data:', JSON.stringify(docRef.data(), null, 2));
    } else {
      console.log('❌ No document with ID "your_old_user_id" in mzs collection');
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

// Load environment variables
require('dotenv').config({ path: '.env.local' });

checkUser()
  .then(() => {
    console.log('\n✅ Check completed!');
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Check failed:', err);
    process.exit(1);
  });