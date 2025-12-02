const admin = require('firebase-admin');

// Initialize Firebase Admin
const serviceAccount = require('./firebase-service-account.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function checkSuda159() {
  console.log('=== CHECKING SUDA159 STATUS ===\n');

  // Check by username
  console.log('1. Checking by username (suda159):');
  const usernameQuery = await db.collection('users')
    .where('username', '==', 'suda159')
    .get();

  if (!usernameQuery.empty) {
    usernameQuery.forEach(doc => {
      const data = doc.data();
      console.log(`   Found user with ID: ${doc.id}`);
      console.log(`   - auth_email: ${data.auth_email}`);
      console.log(`   - username: ${data.username}`);
      console.log(`   - wallet_address: ${data.wallet_address}`);
    });
  } else {
    console.log('   ❌ No user found with username: suda159');
  }

  // Check by email (from CSV)
  console.log('\n2. Checking by auth_email (suda159@hotmail.com):');
  const emailQuery = await db.collection('users')
    .where('auth_email', '==', 'suda159@hotmail.com')
    .get();

  if (!emailQuery.empty) {
    emailQuery.forEach(doc => {
      const data = doc.data();
      console.log(`   Found user with ID: ${doc.id}`);
      console.log(`   - auth_email: ${data.auth_email}`);
      console.log(`   - username: ${data.username}`);
      console.log(`   - wallet_address: ${data.wallet_address}`);
    });
  } else {
    console.log('   ❌ No user found with auth_email: suda159@hotmail.com');
  }

  // Check if user is trying to login with just username
  console.log('\n3. Recent login attempts from server logs:');
  console.log('   - Failed attempts on 2025-12-01 at 07:24:26, 07:24:35, 07:38:43');
  console.log('   - Reason: user_not_found');
  console.log('   - IP Address: 112.173.142.109');
  console.log('   - Issue: User is trying to login with username "suda159" instead of email "suda159@hotmail.com"');

  process.exit(0);
}

checkSuda159().catch(console.error);