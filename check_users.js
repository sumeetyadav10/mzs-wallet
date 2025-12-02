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

// List of emails to check
const emailsToCheck = [
  'parksangdunk@gmail.com',
  'oolee2000@gmail.com', 
  'kim1203hy@gmail.com',
  'ingugsong0@gmail.com',
  'hanmjmj3@hanmail.net',
  'brandcho11@gmail.com',
  'heyyo2511@gmail.com',
  'whdtj74@gmail.com' // Adding a known working email for comparison
];

async function checkUsers() {
  console.log('Checking users in Firebase...\n');
  
  for (const email of emailsToCheck) {
    try {
      // Check auth_email field
      const authEmailQuery = await db.collection('users')
        .where('auth_email', '==', email)
        .limit(1)
        .get();
      
      // Check regular email field as fallback
      const emailQuery = await db.collection('users')
        .where('email', '==', email)
        .limit(1)
        .get();
      
      // Check by document ID
      const docById = await db.collection('users').doc(email).get();
      
      console.log(`Email: ${email}`);
      console.log(`  - Found by auth_email: ${!authEmailQuery.empty}`);
      console.log(`  - Found by email: ${!emailQuery.empty}`);
      console.log(`  - Found by document ID: ${docById.exists}`);
      
      if (!authEmailQuery.empty) {
        const userData = authEmailQuery.docs[0].data();
        console.log(`  - User ID: ${userData.user_id || 'N/A'}`);
        console.log(`  - Wallet Address: ${userData.wallet_address || userData.address || 'N/A'}`);
      } else if (!emailQuery.empty) {
        const userData = emailQuery.docs[0].data();
        console.log(`  - User ID: ${userData.user_id || 'N/A'}`);
        console.log(`  - Wallet Address: ${userData.wallet_address || userData.address || 'N/A'}`);
      } else if (docById.exists) {
        const userData = docById.data();
        console.log(`  - User ID: ${userData.user_id || 'N/A'}`);
        console.log(`  - Wallet Address: ${userData.wallet_address || userData.address || 'N/A'}`);
      }
      
      console.log('---');
      
    } catch (error) {
      console.log(`Error checking ${email}: ${error.message}`);
      console.log('---');
    }
  }
  
  // Also check total user count
  const allUsers = await db.collection('users').limit(10).get();
  console.log(`\nTotal users in database (showing first 10):`);
  allUsers.docs.forEach(doc => {
    const data = doc.data();
    console.log(`- ${doc.id}: auth_email=${data.auth_email}, email=${data.email}`);
  });
}

checkUsers()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });