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

async function loadDeletedUsers() {
  return new Promise((resolve, reject) => {
    const users = [];
    createReadStream('mzs_deleted_users_complete_final.csv')
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

async function checkAndRestoreUsers() {
  console.log('=== CHECKING AND RESTORING MISSING MZS USERS ===\n');
  
  try {
    // Load deleted users from CSV
    const deletedUsers = await loadDeletedUsers();
    console.log(`Total users to check: ${deletedUsers.length}\n`);
    
    const stats = {
      total: deletedUsers.length,
      alreadyExists: 0,
      restored: 0,
      errors: 0,
      existingUsers: [],
      restoredUsers: [],
      errorUsers: []
    };
    
    // Check each user
    for (const user of deletedUsers) {
      const userId = user.user_id;
      if (!userId) {
        console.log('⚠️  Skipping user with no user_id');
        stats.errors++;
        continue;
      }
      
      try {
        // Check if user exists in MZS collection
        const userDoc = await db.collection('MZS').doc(userId).get();
        
        if (userDoc.exists) {
          stats.alreadyExists++;
          stats.existingUsers.push({
            user_id: userId,
            email: user.email,
            auth_email: user.auth_email
          });
          console.log(`✓ User ${userId} already exists (${user.email || user.auth_email})`);
        } else {
          // User doesn't exist, prepare data for restoration
          const userData = {
            userId: userId,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          };
          
          // Add fields only if they exist and are not empty
          if (user.email) userData.email = user.email;
          if (user.auth_email) userData.auth_email = user.auth_email;
          if (user.wallet_address) userData.wallet_address = user.wallet_address;
          if (user.password_hash) userData.password_hash = user.password_hash;
          if (user.private_key) userData.private_key = user.private_key;
          if (user.temp_password) userData.temp_password = user.temp_password;
          if (user.phone_number) userData.phone_number = user.phone_number;
          if (user.balance) userData.balance = user.balance;
          
          // Set default values for important fields
          userData.migrated = false;
          userData.security_version = 1;
          userData.service = 'MZS';
          userData.chains = ['Ethereum'];
          userData.token_contract_address = '0xB987d48Ed8f2C468D52D6405624EADBa5e76d723';
          userData.token_symbol = 'MZS';
          
          // Add to Firestore
          await db.collection('MZS').doc(userId).set(userData);
          
          stats.restored++;
          stats.restoredUsers.push({
            user_id: userId,
            email: user.email,
            auth_email: user.auth_email,
            wallet_address: user.wallet_address
          });
          console.log(`✅ Restored user ${userId} (${user.email || user.auth_email})`);
        }
      } catch (error) {
        console.error(`❌ Error processing user ${userId}:`, error.message);
        stats.errors++;
        stats.errorUsers.push({
          user_id: userId,
          error: error.message
        });
      }
    }
    
    // Generate summary report
    console.log('\n=== RESTORATION SUMMARY ===');
    console.log(`Total users checked: ${stats.total}`);
    console.log(`Already exists: ${stats.alreadyExists}`);
    console.log(`Newly restored: ${stats.restored}`);
    console.log(`Errors: ${stats.errors}`);
    
    // Save detailed report
    const report = {
      summary: {
        total_checked: stats.total,
        already_exists: stats.alreadyExists,
        newly_restored: stats.restored,
        errors: stats.errors,
        timestamp: new Date().toISOString()
      },
      existing_users: stats.existingUsers,
      restored_users: stats.restoredUsers,
      error_users: stats.errorUsers
    };
    
    await fs.writeFile('restoration_report.json', JSON.stringify(report, null, 2));
    console.log('\nDetailed report saved to: restoration_report.json');
    
    // Create CSV of restored users
    if (stats.restoredUsers.length > 0) {
      const csvContent = [
        'user_id,email,auth_email,wallet_address',
        ...stats.restoredUsers.map(u => 
          `"${u.user_id}","${u.email || ''}","${u.auth_email || ''}","${u.wallet_address || ''}"`
        )
      ].join('\n');
      
      await fs.writeFile('restored_users.csv', csvContent);
      console.log('Restored users list saved to: restored_users.csv');
    }
    
    // Create CSV of existing users
    if (stats.existingUsers.length > 0) {
      const csvContent = [
        'user_id,email,auth_email',
        ...stats.existingUsers.map(u => 
          `"${u.user_id}","${u.email || ''}","${u.auth_email || ''}"`
        )
      ].join('\n');
      
      await fs.writeFile('already_existing_users.csv', csvContent);
      console.log('Already existing users list saved to: already_existing_users.csv');
    }
    
  } catch (error) {
    console.error('Fatal error:', error);
  }
}

// Run the restoration
checkAndRestoreUsers()
  .then(() => {
    console.log('\nProcess completed successfully!');
    process.exit(0);
  })
  .catch(err => {
    console.error('Process failed:', err);
    process.exit(1);
  });