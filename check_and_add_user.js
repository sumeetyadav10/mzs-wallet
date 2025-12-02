const admin = require('firebase-admin');
const fs = require('fs').promises;

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

async function checkAndAddUser() {
  const email = 'a01038118835@gmail.com';
  console.log(`=== CHECKING USER: ${email} ===\n`);
  
  try {
    // Check in mzs collection by auth_email
    console.log('1. Checking mzs collection by auth_email...');
    const authEmailQuery = await db.collection('mzs')
      .where('auth_email', '==', email)
      .limit(1)
      .get();
    
    if (!authEmailQuery.empty) {
      console.log('✅ User found in mzs collection!');
      const doc = authEmailQuery.docs[0];
      console.log('Document ID:', doc.id);
      console.log('Data:', JSON.stringify(doc.data(), null, 2));
      return;
    }
    
    // Check by email field
    console.log('\n2. Checking mzs collection by email field...');
    const emailQuery = await db.collection('mzs')
      .where('email', '==', email)
      .limit(1)
      .get();
    
    if (!emailQuery.empty) {
      console.log('✅ User found by email field!');
      const doc = emailQuery.docs[0];
      console.log('Document ID:', doc.id);
      console.log('Data:', JSON.stringify(doc.data(), null, 2));
      return;
    }
    
    // Check as document ID
    console.log('\n3. Checking as document ID...');
    const docRef = await db.collection('mzs').doc(email).get();
    if (docRef.exists) {
      console.log('✅ User found as document ID!');
      console.log('Data:', JSON.stringify(docRef.data(), null, 2));
      return;
    }
    
    // Check in MZS collection (capital)
    console.log('\n4. Checking MZS collection...');
    const MZSQuery = await db.collection('MZS')
      .where('auth_email', '==', email)
      .limit(1)
      .get();
    
    if (!MZSQuery.empty) {
      console.log('✅ User found in MZS collection!');
      const doc = MZSQuery.docs[0];
      const data = doc.data();
      console.log('Document ID:', doc.id);
      console.log('Data:', JSON.stringify(data, null, 2));
      
      // Add to mzs collection
      console.log('\n📝 Adding user to mzs collection...');
      await db.collection('mzs').doc(doc.id).set({
        ...data,
        migratedFromMZS: true,
        migrationDate: admin.firestore.FieldValue.serverTimestamp()
      });
      console.log('✅ User added to mzs collection!');
      return;
    }
    
    // Check in users collection
    console.log('\n5. Checking users collection...');
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
      
      // Add to mzs collection
      console.log('\n📝 Adding user to mzs collection...');
      await db.collection('mzs').doc(doc.id).set({
        ...data,
        migratedFromUsers: true,
        migrationDate: admin.firestore.FieldValue.serverTimestamp()
      });
      console.log('✅ User added to mzs collection!');
      return;
    }
    
    console.log('\n❌ User not found in any collection!');
    
    // Try to find in CSV files
    console.log('\n6. Searching in MZS1.csv and MZS2.csv...');
    
    try {
      const mzs1Data = await fs.readFile('MZS1.csv', 'utf8');
      const mzs2Data = await fs.readFile('MZS2.csv', 'utf8');
      
      // Search in MZS1
      if (mzs1Data.includes(email)) {
        console.log('✅ Found in MZS1.csv!');
        const lines = mzs1Data.split('\n');
        for (const line of lines) {
          if (line.includes(email)) {
            console.log('Line:', line);
            break;
          }
        }
      }
      
      // Search in MZS2
      if (mzs2Data.includes('01038118835')) {
        console.log('✅ Found in MZS2.csv!');
        const lines = mzs2Data.split('\n');
        for (const line of lines) {
          if (line.includes('01038118835')) {
            console.log('Line:', line);
            const parts = line.split(',');
            if (parts.length >= 3) {
              console.log('\nExtracted data:');
              console.log('User ID:', parts[0]);
              console.log('Wallet:', parts[1]);
              console.log('Private Key:', parts[2]);
              
              // Create user in mzs collection
              console.log('\n📝 Creating user in mzs collection...');
              await db.collection('mzs').doc('01038118835').set({
                user_id: '01038118835',
                auth_email: email,
                email: email,
                wallet_address: parts[1],
                address: parts[1],
                private_key: parts[2],
                createdFromCSV: true,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                service: 'MZS-WALLET'
              });
              console.log('✅ User created in mzs collection!');
            }
            break;
          }
        }
      }
      
    } catch (err) {
      console.log('Could not read CSV files:', err.message);
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

// Load environment variables
require('dotenv').config({ path: '.env.local' });

checkAndAddUser()
  .then(() => {
    console.log('\n✅ Check completed!');
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Check failed:', err);
    process.exit(1);
  });