const admin = require('firebase-admin');

// Initialize Firebase Admin
const serviceAccount = require('./firebase-service-account.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function checkUserFields() {
  console.log('=== CHECKING USER FIELDS FOR yadsum396@gmail.com ===\n');

  // Check all possible field combinations
  const fieldsToCheck = ['auth_email', 'email', 'authEmail', 'user_email'];
  
  for (const field of fieldsToCheck) {
    console.log(`\nChecking field: ${field}`);
    try {
      const query = await db.collection('users')
        .where(field, '==', 'yadsum396@gmail.com')
        .limit(1)
        .get();
        
      if (!query.empty) {
        console.log(`✅ FOUND USER with field "${field}"`);
        const doc = query.docs[0];
        const data = doc.data();
        console.log('Document ID:', doc.id);
        console.log('Document fields:', Object.keys(data));
        console.log('Full document:', JSON.stringify(data, null, 2));
        return;
      } else {
        console.log(`❌ No user found with ${field} = yadsum396@gmail.com`);
      }
    } catch (error) {
      console.error(`Error checking ${field}:`, error.message);
    }
  }
  
  // Try document ID
  console.log('\nChecking if email is used as document ID...');
  try {
    const docRef = db.collection('users').doc('yadsum396@gmail.com');
    const doc = await docRef.get();
    
    if (doc.exists) {
      console.log('✅ FOUND USER as document ID');
      const data = doc.data();
      console.log('Document fields:', Object.keys(data));
      console.log('Full document:', JSON.stringify(data, null, 2));
    } else {
      console.log('❌ No user found with document ID = yadsum396@gmail.com');
    }
  } catch (error) {
    console.error('Error checking document ID:', error.message);
  }

  process.exit(0);
}

checkUserFields().catch(console.error);