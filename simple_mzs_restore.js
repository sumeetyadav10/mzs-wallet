const admin = require('firebase-admin');
const fs = require('fs').promises;
const csv = require('csv-parser');
const { createReadStream } = require('fs');

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

// Load CSV files into memory
async function loadCSV(filename) {
  return new Promise((resolve, reject) => {
    const data = [];
    createReadStream(filename)
      .pipe(csv())
      .on('data', (row) => data.push(row))
      .on('end', () => resolve(data))
      .on('error', reject);
  });
}

async function simpleRestore() {
  console.log('=== SIMPLE MZS RESTORATION - ONLY ESSENTIAL FIELDS ===\n');
  
  try {
    // Load CSV files
    console.log('Loading CSV files...');
    const mzsDeletedFinal = await loadCSV('mzs_deleted_users_complete_final.csv');
    const missedUsers = await loadCSV('missed_deleted_users.csv');
    const mzs2Data = await loadCSV('MZS2.csv');
    
    console.log(`mzs_deleted_users_complete_final.csv: ${mzsDeletedFinal.length} users`);
    console.log(`missed_deleted_users.csv: ${missedUsers.length} users`);
    console.log(`MZS2.csv: ${mzs2Data.length} records`);
    
    // Create MZS2 lookup map
    const mzs2Map = new Map();
    mzs2Data.forEach(row => {
      if (row.user_id) mzs2Map.set(row.user_id, row);
      if (row.address) mzs2Map.set(row.address.toLowerCase(), row);
    });
    
    // Combine all users
    const allUsers = new Map();
    
    // Add from both CSV files
    [...mzsDeletedFinal, ...missedUsers].forEach(user => {
      if (user.user_id && user.auth_email) {
        allUsers.set(user.user_id, user);
      }
    });
    
    console.log(`\nTotal users to process: ${allUsers.size}\n`);
    
    let updated = 0;
    let created = 0;
    let errors = 0;
    
    // Process each user
    for (const [userId, userData] of allUsers) {
      try {
        const authEmail = userData.auth_email;
        const walletAddress = userData.wallet_address || userData.address;
        
        // Find private key in MZS2
        const mzs2Match = mzs2Map.get(userId) || (walletAddress ? mzs2Map.get(walletAddress.toLowerCase()) : null);
        
        // Only care about these 3 fields
        const updateData = {
          user_id: userId,
          auth_email: authEmail
        };
        
        // Add private key if found
        if (mzs2Match && mzs2Match.private_key) {
          updateData.private_key = mzs2Match.private_key;
        } else if (userData.private_key) {
          updateData.private_key = userData.private_key;
        }
        
        // Update or create in database
        const docRef = db.collection('mzs').doc(userId);
        const existingDoc = await docRef.get();
        
        if (existingDoc.exists) {
          await docRef.update(updateData);
          updated++;
          console.log(`✅ Updated: ${userId} - ${authEmail}`);
        } else {
          await docRef.set(updateData);
          created++;
          console.log(`➕ Created: ${userId} - ${authEmail}`);
        }
        
      } catch (error) {
        console.error(`❌ Error ${userId}:`, error.message);
        errors++;
      }
    }
    
    console.log('\n\n=== DONE ===');
    console.log(`Updated: ${updated}`);
    console.log(`Created: ${created}`);
    console.log(`Errors: ${errors}`);
    
  } catch (error) {
    console.error('Fatal error:', error);
  }
}

// Load environment variables
require('dotenv').config({ path: '.env.local' });

// Run
simpleRestore()
  .then(() => {
    console.log('\n✅ Done!');
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Failed:', err);
    process.exit(1);
  });