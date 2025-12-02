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

async function checkAuthEmail() {
  console.log('Checking for auth_email: pey9954@gmail.com\n');
  
  try {
    // Check by auth_email
    const authEmailQuery = await db.collection('users')
      .where('auth_email', '==', 'pey9954@gmail.com')
      .get();
    
    if (!authEmailQuery.empty) {
      console.log('User found with auth_email pey9954@gmail.com:');
      authEmailQuery.docs.forEach(doc => {
        const data = doc.data();
        console.log(`\nDocument ID: ${doc.id}`);
        console.log('Fields:');
        Object.keys(data).forEach(key => {
          if (key === 'private_key') {
            console.log(`  ${key}: [REDACTED]`);
          } else {
            console.log(`  ${key}: ${data[key]}`);
          }
        });
      });
    } else {
      console.log('No user found with auth_email: pey9954@gmail.com');
    }
    
    // Also check if suda159@hotmail.com exists anywhere
    console.log('\n\nChecking for email: suda159@hotmail.com');
    const emailQuery = await db.collection('users')
      .where('email', '==', 'suda159@hotmail.com')
      .get();
    
    if (!emailQuery.empty) {
      console.log('User found with email suda159@hotmail.com:');
      const data = emailQuery.docs[0].data();
      console.log('Document ID:', emailQuery.docs[0].id);
      console.log('auth_email:', data.auth_email);
      console.log('wallet_address:', data.wallet_address || data.address);
    } else {
      console.log('No user found with email: suda159@hotmail.com');
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

checkAuthEmail()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });