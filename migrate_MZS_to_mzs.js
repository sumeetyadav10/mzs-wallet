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

async function migrateMZSToMzs() {
  console.log('=== MIGRATING DOCUMENTS FROM MZS TO mzs COLLECTION ===\n');
  
  const stats = {
    totalInMZS: 0,
    alreadyInMzs: 0,
    migrated: 0,
    merged: 0,
    errors: 0,
    migratedDocs: [],
    mergedDocs: [],
    errorDocs: []
  };
  
  try {
    // Get all documents from MZS collection
    console.log('Loading all documents from MZS collection...');
    const MZSSnapshot = await db.collection('MZS').get();
    stats.totalInMZS = MZSSnapshot.size;
    console.log(`Found ${stats.totalInMZS} documents in MZS collection\n`);
    
    // Process each document
    let count = 0;
    for (const doc of MZSSnapshot.docs) {
      count++;
      const docId = doc.id;
      const MZSData = doc.data();
      
      try {
        // Progress indicator
        if (count % 100 === 0) {
          console.log(`Processing... ${count}/${stats.totalInMZS}`);
        }
        
        // Check if document exists in mzs collection
        const mzsDocRef = db.collection('mzs').doc(docId);
        const mzsDoc = await mzsDocRef.get();
        
        if (mzsDoc.exists) {
          // Document exists in mzs - merge fields
          const mzsData = mzsDoc.data();
          
          // Merge data - MZS fields take priority for missing fields in mzs
          const mergedData = { ...mzsData };
          let fieldsAdded = 0;
          
          for (const [key, value] of Object.entries(MZSData)) {
            // Add field if it doesn't exist in mzs document
            if (!(key in mzsData) && value !== null && value !== undefined && value !== '') {
              mergedData[key] = value;
              fieldsAdded++;
            }
          }
          
          // Update if new fields were added
          if (fieldsAdded > 0) {
            mergedData.lastMergedFrom = 'MZS';
            mergedData.mergedAt = admin.firestore.FieldValue.serverTimestamp();
            
            await mzsDocRef.update(mergedData);
            stats.merged++;
            stats.mergedDocs.push({
              doc_id: docId,
              fields_added: fieldsAdded,
              auth_email: mergedData.auth_email || mergedData.email
            });
            
            console.log(`📝 Merged ${fieldsAdded} fields for doc: ${docId}`);
          } else {
            stats.alreadyInMzs++;
          }
          
        } else {
          // Document doesn't exist in mzs - create it
          const newData = {
            ...MZSData,
            migratedFromMZS: true,
            migrationDate: admin.firestore.FieldValue.serverTimestamp()
          };
          
          await mzsDocRef.set(newData);
          stats.migrated++;
          stats.migratedDocs.push({
            doc_id: docId,
            auth_email: newData.auth_email || newData.email,
            wallet_address: newData.wallet_address || newData.address
          });
          
          console.log(`➕ Migrated doc: ${docId} (${newData.auth_email || newData.email})`);
        }
        
      } catch (error) {
        console.error(`❌ Error processing doc ${docId}:`, error.message);
        stats.errors++;
        stats.errorDocs.push({
          doc_id: docId,
          error: error.message
        });
      }
    }
    
    // Summary
    console.log('\n\n=== MIGRATION SUMMARY ===');
    console.log(`Total documents in MZS: ${stats.totalInMZS}`);
    console.log(`Already complete in mzs: ${stats.alreadyInMzs}`);
    console.log(`Newly migrated: ${stats.migrated}`);
    console.log(`Merged (fields added): ${stats.merged}`);
    console.log(`Errors: ${stats.errors}`);
    
    // Save detailed report
    const report = {
      summary: {
        total_in_MZS: stats.totalInMZS,
        already_complete: stats.alreadyInMzs,
        newly_migrated: stats.migrated,
        merged_documents: stats.merged,
        errors: stats.errors,
        timestamp: new Date().toISOString()
      },
      migrated_documents: stats.migratedDocs,
      merged_documents: stats.mergedDocs,
      error_documents: stats.errorDocs
    };
    
    await fs.writeFile('MZS_to_mzs_migration_report.json', JSON.stringify(report, null, 2));
    console.log('\nDetailed report saved to: MZS_to_mzs_migration_report.json');
    
    // Ask about deleting MZS collection
    console.log('\n⚠️  IMPORTANT: The MZS collection still exists.');
    console.log('After verifying the migration, you may want to delete it to avoid confusion.');
    console.log('Command to delete: db.collection("MZS").get().then(snapshot => snapshot.forEach(doc => doc.ref.delete()))');
    
  } catch (error) {
    console.error('Fatal error during migration:', error);
  }
}

// Load environment variables
require('dotenv').config({ path: '.env.local' });

// Run migration
migrateMZSToMzs()
  .then(() => {
    console.log('\n✅ Migration completed successfully!');
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  });