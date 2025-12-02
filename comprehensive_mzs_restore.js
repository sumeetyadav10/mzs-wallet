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

async function comprehensiveRestore() {
  console.log('=== COMPREHENSIVE MZS USER RESTORATION ===\n');
  
  try {
    // Load all CSV files
    console.log('Loading all CSV files...');
    
    // Main user lists
    const mzsDeletedFinal = await loadCSV('mzs_deleted_users_complete_final.csv');
    const missedUsers = await loadCSV('missed_deleted_users.csv');
    const mzs1Data = await loadCSV('MZS1.csv');
    const mzs2Data = await loadCSV('MZS2.csv');
    
    console.log(`mzs_deleted_users_complete_final.csv: ${mzsDeletedFinal.length} users`);
    console.log(`missed_deleted_users.csv: ${missedUsers.length} users`);
    console.log(`MZS1.csv: ${mzs1Data.length} records`);
    console.log(`MZS2.csv: ${mzs2Data.length} records`);
    
    // Create lookup maps for MZS1 and MZS2
    const mzs1Map = new Map();
    const mzs2Map = new Map();
    
    // Index MZS1 by multiple fields
    mzs1Data.forEach(row => {
      // MZS1 has: id, password_hash, email, created_at, username
      if (row.id) mzs1Map.set(row.id, row);
      if (row.email) mzs1Map.set(row.email.toLowerCase(), row);
      if (row.username) mzs1Map.set(row.username, row);
    });
    
    // Index MZS2 by user_id and address
    mzs2Data.forEach(row => {
      // MZS2 has: user_id, address, private_key
      if (row.user_id) mzs2Map.set(row.user_id, row);
      if (row.address) mzs2Map.set(row.address.toLowerCase(), row);
    });
    
    // Combine all users to process
    const allUsers = new Map();
    
    // Add from mzs_deleted_users_complete_final.csv
    mzsDeletedFinal.forEach(user => {
      if (user.user_id || user.auth_email) {
        const key = user.user_id || user.auth_email;
        allUsers.set(key, {
          ...user,
          source: 'mzs_deleted_final'
        });
      }
    });
    
    // Add from missed_deleted_users.csv
    missedUsers.forEach(user => {
      if (user.user_id || user.auth_email) {
        const key = user.user_id || user.auth_email;
        if (!allUsers.has(key)) {
          allUsers.set(key, {
            ...user,
            source: 'missed_users'
          });
        } else {
          // Merge data
          const existing = allUsers.get(key);
          allUsers.set(key, { ...existing, ...user });
        }
      }
    });
    
    console.log(`\nTotal unique users to process: ${allUsers.size}\n`);
    
    const stats = {
      total: allUsers.size,
      created: 0,
      updated: 0,
      errors: 0,
      noPrivateKey: 0,
      noPassword: 0,
      processedUsers: []
    };
    
    // Process each user
    let count = 0;
    for (const [key, userData] of allUsers) {
      count++;
      if (count % 50 === 0) {
        console.log(`Processing... ${count}/${allUsers.size}`);
      }
      
      try {
        const userId = userData.user_id || key;
        const authEmail = userData.auth_email || userData.email;
        const walletAddress = userData.wallet_address || userData.address;
        
        // Find matching data in MZS1 and MZS2
        let mzs1Match = null;
        let mzs2Match = null;
        
        // Try multiple ways to find MZS1 match
        mzs1Match = mzs1Map.get(userId) || 
                    mzs1Map.get(authEmail?.toLowerCase()) || 
                    mzs1Map.get(userData.username) ||
                    mzs1Map.get(userData.email?.toLowerCase());
        
        // Try multiple ways to find MZS2 match
        mzs2Match = mzs2Map.get(userId) || 
                    mzs2Map.get(walletAddress?.toLowerCase());
        
        // Build complete user data
        const completeData = {
          user_id: userId,
          auth_email: authEmail,
          email: userData.email || authEmail,
          wallet_address: walletAddress,
          address: walletAddress,
          username: userData.username,
          service: 'MZS-WALLET',
          migrated: true,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };
        
        // Add password from MZS1
        if (mzs1Match) {
          if (mzs1Match.password_hash) {
            completeData.password_hash = mzs1Match.password_hash;
          }
          if (mzs1Match.created_at) {
            completeData.original_created_at = mzs1Match.created_at;
          }
          if (mzs1Match.username && !completeData.username) {
            completeData.username = mzs1Match.username;
          }
        } else {
          stats.noPassword++;
        }
        
        // Add private key from MZS2
        if (mzs2Match && mzs2Match.private_key) {
          completeData.private_key = mzs2Match.private_key;
        } else if (userData.private_key) {
          completeData.private_key = userData.private_key;
        } else {
          stats.noPrivateKey++;
        }
        
        // Add any other fields from original data
        Object.keys(userData).forEach(key => {
          if (!completeData[key] && userData[key] && key !== 'source') {
            completeData[key] = userData[key];
          }
        });
        
        // Save to database
        const docRef = db.collection('mzs').doc(userId);
        const existingDoc = await docRef.get();
        
        if (existingDoc.exists) {
          // Update with merge to preserve existing data
          await docRef.set(completeData, { merge: true });
          stats.updated++;
        } else {
          // Create new document
          completeData.createdAt = admin.firestore.FieldValue.serverTimestamp();
          await docRef.set(completeData);
          stats.created++;
        }
        
        stats.processedUsers.push({
          user_id: userId,
          auth_email: authEmail,
          wallet_address: walletAddress,
          has_password: !!completeData.password_hash,
          has_private_key: !!completeData.private_key,
          status: existingDoc.exists ? 'UPDATED' : 'CREATED'
        });
        
      } catch (error) {
        console.error(`❌ Error processing ${key}:`, error.message);
        stats.errors++;
      }
    }
    
    // Summary
    console.log('\n\n=== RESTORATION COMPLETE ===');
    console.log(`Total users processed: ${stats.total}`);
    console.log(`Created: ${stats.created}`);
    console.log(`Updated: ${stats.updated}`);
    console.log(`Errors: ${stats.errors}`);
    console.log(`Missing passwords: ${stats.noPassword}`);
    console.log(`Missing private keys: ${stats.noPrivateKey}`);
    
    // Save detailed report
    const report = {
      summary: {
        total_processed: stats.total,
        created: stats.created,
        updated: stats.updated,
        errors: stats.errors,
        missing_passwords: stats.noPassword,
        missing_private_keys: stats.noPrivateKey,
        timestamp: new Date().toISOString()
      },
      processed_users: stats.processedUsers
    };
    
    await fs.writeFile('comprehensive_restoration_report.json', JSON.stringify(report, null, 2));
    console.log('\nDetailed report saved to: comprehensive_restoration_report.json');
    
    // Create CSV of results
    const csvContent = [
      'user_id,auth_email,wallet_address,has_password,has_private_key,status',
      ...stats.processedUsers.map(u => 
        `"${u.user_id}","${u.auth_email}","${u.wallet_address}","${u.has_password}","${u.has_private_key}","${u.status}"`
      )
    ].join('\n');
    
    await fs.writeFile('comprehensive_restoration_results.csv', csvContent);
    console.log('Results CSV saved to: comprehensive_restoration_results.csv');
    
    // List users still missing critical data
    const missingData = stats.processedUsers.filter(u => !u.has_password || !u.has_private_key);
    if (missingData.length > 0) {
      console.log(`\n⚠️  ${missingData.length} users are missing critical data:`);
      console.log('Missing passwords:', missingData.filter(u => !u.has_password).length);
      console.log('Missing private keys:', missingData.filter(u => !u.has_private_key).length);
    }
    
  } catch (error) {
    console.error('Fatal error:', error);
  }
}

// Load environment variables
require('dotenv').config({ path: '.env.local' });

// Run comprehensive restoration
comprehensiveRestore()
  .then(() => {
    console.log('\n✅ Comprehensive restoration completed!');
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Restoration failed:', err);
    process.exit(1);
  });