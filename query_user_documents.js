const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
require('dotenv').config({ path: '.env.local' });

// Initialize Firebase Admin if not already initialized
if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

const db = getFirestore();

async function queryUserDocuments() {
  const targetEmail = 'j21449097@gmail.com';
  
  try {
    console.log(`Querying Firestore for documents with auth_email: ${targetEmail}`);
    console.log('='.repeat(60));
    
    // Query the 'mzs' collection for documents with the specified auth_email
    const querySnapshot = await db.collection('mzs')
      .where('auth_email', '==', targetEmail)
      .get();
    
    if (querySnapshot.empty) {
      console.log('No documents found with the specified auth_email.');
      return;
    }
    
    console.log(`Found ${querySnapshot.size} document(s):`);
    console.log('='.repeat(60));
    
    let docIndex = 0;
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      docIndex++;
      
      console.log(`\nDocument ${docIndex}:`);
      console.log(`Document ID: ${doc.id}`);
      console.log('Data:');
      
      // Display all fields, but redact sensitive information
      Object.entries(data).forEach(([key, value]) => {
        if (key === 'private_key' || key === 'password_hash') {
          console.log(`  ${key}: [REDACTED]`);
        } else if (key === 'created_at' || key === 'migratedAt') {
          // Format dates nicely, handle invalid dates
          try {
            const date = value instanceof Date ? value : new Date(value);
            if (isNaN(date.getTime())) {
              console.log(`  ${key}: ${value} (Invalid date)`);
            } else {
              console.log(`  ${key}: ${date.toISOString()} (${date.toLocaleString()})`);
            }
          } catch (e) {
            console.log(`  ${key}: ${value} (Date parsing error)`);
          }
        } else {
          console.log(`  ${key}: ${value}`);
        }
      });
      console.log('-'.repeat(40));
    });
    
    // Summary information
    console.log(`\nSummary for ${targetEmail}:`);
    const documents = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    const migratedDocs = documents.filter(doc => doc.migrated || doc.migratedAt);
    const nonMigratedDocs = documents.filter(doc => !doc.migrated && !doc.migratedAt);
    
    console.log(`- Total documents: ${documents.length}`);
    console.log(`- Migrated documents: ${migratedDocs.length}`);
    console.log(`- Non-migrated documents: ${nonMigratedDocs.length}`);
    
    if (migratedDocs.length > 0) {
      console.log('\nMigrated documents:');
      migratedDocs.forEach(doc => {
        console.log(`  - ${doc.id} (user_id: ${doc.user_id || 'N/A'})`);
      });
    }
    
    if (nonMigratedDocs.length > 0) {
      console.log('\nNon-migrated documents:');
      nonMigratedDocs.forEach(doc => {
        console.log(`  - ${doc.id} (user_id: ${doc.user_id || 'N/A'})`);
      });
    }
    
  } catch (error) {
    console.error('Error querying documents:', error);
    process.exit(1);
  }
}

// Run the query
queryUserDocuments()
  .then(() => {
    console.log('\nQuery completed successfully.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Query failed:', error);
    process.exit(1);
  }); 