const admin = require('firebase-admin');
const fs = require('fs').promises;
const csv = require('csv-parser');
const { createReadStream } = require('fs');

// Initialize Firebase Admin with production credentials
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

async function loadMissedUsers() {
  return new Promise((resolve, reject) => {
    const users = [];
    createReadStream('missed_deleted_users.csv')
      .pipe(csv())
      .on('data', (data) => {
        users.push(data);
      })
      .on('end', () => {
        resolve(users);
      })
      .on('error', (error) => {
        reject(error);
      });
  });
}

async function loadMZS1Data() {
  return new Promise((resolve, reject) => {
    const data = {};
    createReadStream('MZS1.csv')
      .pipe(csv())
      .on('data', (row) => {
        // Index by multiple fields
        if (row.id) data[row.id] = row;
        if (row.email) data[row.email.toLowerCase()] = row;
      })
      .on('end', () => {
        resolve(data);
      })
      .on('error', reject);
  });
}

async function loadMZS2Data() {
  return new Promise((resolve, reject) => {
    const data = {};
    createReadStream('MZS2.csv')
      .pipe(csv())
      .on('data', (row) => {
        // Index by user_id and address
        if (row.user_id) data[row.user_id] = row;
        if (row.address) data[row.address.toLowerCase()] = row;
      })
      .on('end', () => {
        resolve(data);
      })
      .on('error', reject);
  });
}

async function restoreMissedUsersToFirebase() {
  console.log('=== RESTORING MISSED USERS TO PRODUCTION DATABASE ===\n');
  
  try {
    // Load all data
    console.log('Loading data files...');
    const missedUsers = await loadMissedUsers();
    const mzs1Data = await loadMZS1Data();
    const mzs2Data = await loadMZS2Data();
    
    console.log(`Found ${missedUsers.length} missed users to restore`);
    console.log(`MZS1 data loaded: ${Object.keys(mzs1Data).length} entries`);
    console.log(`MZS2 data loaded: ${Object.keys(mzs2Data).length} entries`);
    
    const stats = {
      total: missedUsers.length,
      alreadyExists: 0,
      restored: 0,
      updated: 0,
      errors: 0,
      restoredUsers: [],
      updatedUsers: [],
      errorUsers: []
    };
    
    // Process each user
    for (const user of missedUsers) {
      const userId = user.user_id;
      const authEmail = user.auth_email;
      const wallet = user.wallet_address?.toLowerCase();
      
      if (!userId) {
        console.log(`⚠️  Skipping user with no user_id: ${authEmail}`);
        stats.errors++;
        continue;
      }
      
      try {
        console.log(`\n📦 Processing: ${authEmail} (${userId})`);
        
        // Find matching data in MZS1 and MZS2
        const mzs1Match = mzs1Data[userId] || mzs1Data[authEmail.toLowerCase()];
        const mzs2Match = mzs2Data[userId] || mzs2Data[wallet];
        
        // Prepare user data
        const userData = {
          user_id: userId,
          auth_email: authEmail,
          email: user.email || authEmail,
          wallet_address: user.wallet_address,
          address: user.wallet_address, // Some code expects 'address' field
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          migrated: true,
          migratedAt: admin.firestore.FieldValue.serverTimestamp(),
          service: 'MZS-WALLET',
          chains: ['Ethereum'],
          token_contract_address: '0xB987d48Ed8f2C468D52D6405624EADBa5e76d723',
          token_symbol: 'MZS'
        };
        
        // Add data from MZS1 (password)
        if (mzs1Match) {
          if (mzs1Match.password_hash) userData.password_hash = mzs1Match.password_hash;
          if (mzs1Match.created_at) userData.original_created_at = mzs1Match.created_at;
          console.log('   ✅ Found password in MZS1');
        }
        
        // Add data from MZS2 (private key)
        if (mzs2Match && mzs2Match.private_key) {
          userData.private_key = mzs2Match.private_key;
          console.log('   ✅ Found private key in MZS2');
        }
        
        if (!userData.private_key) {
          console.log('   ⚠️  WARNING: No private key found');
        }
        
        // Check if user exists in mzs collection
        const userRef = db.collection('mzs').doc(userId);
        const userDoc = await userRef.get();
        
        if (userDoc.exists) {
          // Update existing user with missing fields
          console.log('   📝 Updating existing user...');
          await userRef.update(userData);
          stats.updated++;
          stats.updatedUsers.push({
            user_id: userId,
            auth_email: authEmail,
            wallet_address: user.wallet_address,
            had_private_key: !!userData.private_key
          });
          console.log('   ✅ Updated successfully!');
        } else {
          // Create new user
          console.log('   ➕ Creating new user...');
          await userRef.set(userData);
          stats.restored++;
          stats.restoredUsers.push({
            user_id: userId,
            auth_email: authEmail,
            wallet_address: user.wallet_address,
            had_private_key: !!userData.private_key
          });
          console.log('   ✅ Created successfully!');
        }
        
      } catch (error) {
        console.error(`   ❌ Error processing user ${userId}:`, error.message);
        stats.errors++;
        stats.errorUsers.push({
          user_id: userId,
          auth_email: authEmail,
          error: error.message
        });
      }
    }
    
    // Generate summary report
    console.log('\n\n=== RESTORATION SUMMARY ===');
    console.log(`Total users processed: ${stats.total}`);
    console.log(`Already existed (updated): ${stats.updated}`);
    console.log(`Newly created: ${stats.restored}`);
    console.log(`Errors: ${stats.errors}`);
    
    // Save detailed report
    const report = {
      summary: {
        total_processed: stats.total,
        updated_existing: stats.updated,
        newly_created: stats.restored,
        errors: stats.errors,
        timestamp: new Date().toISOString()
      },
      updated_users: stats.updatedUsers,
      created_users: stats.restoredUsers,
      error_users: stats.errorUsers
    };
    
    await fs.writeFile('missed_users_db_restoration_report.json', JSON.stringify(report, null, 2));
    console.log('\nDetailed report saved to: missed_users_db_restoration_report.json');
    
    // Create summary CSV
    const allProcessed = [...stats.updatedUsers, ...stats.restoredUsers];
    if (allProcessed.length > 0) {
      const csvContent = [
        'user_id,auth_email,wallet_address,had_private_key,status',
        ...stats.updatedUsers.map(u => 
          `"${u.user_id}","${u.auth_email}","${u.wallet_address}","${u.had_private_key}","UPDATED"`
        ),
        ...stats.restoredUsers.map(u => 
          `"${u.user_id}","${u.auth_email}","${u.wallet_address}","${u.had_private_key}","CREATED"`
        )
      ].join('\n');
      
      await fs.writeFile('missed_users_processed.csv', csvContent);
      console.log('Processed users list saved to: missed_users_processed.csv');
    }
    
  } catch (error) {
    console.error('Fatal error:', error);
  }
}

// Load environment variables for Firebase
require('dotenv').config({ path: '.env.local' });

// Run the restoration
restoreMissedUsersToFirebase()
  .then(() => {
    console.log('\n✅ Process completed successfully!');
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Process failed:', err);
    process.exit(1);
  });