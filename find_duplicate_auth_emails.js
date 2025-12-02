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

async function findDuplicateAuthEmails() {
  console.log('=== FINDING DUPLICATE AUTH_EMAILS IN MZS COLLECTION ===\n');
  
  try {
    // Get all documents from mzs collection
    const snapshot = await db.collection('mzs').get();
    
    // Group by auth_email
    const authEmailMap = new Map();
    
    snapshot.forEach(doc => {
      const data = doc.data();
      if (data.auth_email) {
        const email = data.auth_email;
        if (!authEmailMap.has(email)) {
          authEmailMap.set(email, []);
        }
        authEmailMap.get(email).push({
          user_id: doc.id,
          wallet_address: data.wallet_address || data.address || 'NO_WALLET',
          private_key: data.private_key ? 'EXISTS' : 'MISSING'
        });
      }
    });
    
    // Find duplicates
    const duplicates = [];
    for (const [email, users] of authEmailMap) {
      if (users.length > 1) {
        duplicates.push({
          auth_email: email,
          count: users.length,
          users: users
        });
      }
    }
    
    if (duplicates.length === 0) {
      console.log('✅ No duplicate auth_emails found!');
      return;
    }
    
    console.log(`❌ Found ${duplicates.length} auth_emails with multiple users:\n`);
    
    // Sort by count
    duplicates.sort((a, b) => b.count - a.count);
    
    // Print details
    for (const dup of duplicates) {
      console.log(`\nauth_email: ${dup.auth_email} (${dup.count} users)`);
      for (const user of dup.users) {
        console.log(`  - user_id: ${user.user_id}`);
        console.log(`    wallet: ${user.wallet_address}`);
        console.log(`    private_key: ${user.private_key}`);
      }
    }
    
    // Save to file
    const report = {
      summary: {
        total_auth_emails: authEmailMap.size,
        duplicate_auth_emails: duplicates.length,
        affected_users: duplicates.reduce((sum, d) => sum + d.count, 0)
      },
      duplicates: duplicates
    };
    
    await fs.writeFile('duplicate_auth_emails_report.json', JSON.stringify(report, null, 2));
    console.log('\n\nDetailed report saved to: duplicate_auth_emails_report.json');
    
    // Create CSV for easy review
    const csvLines = ['auth_email,user_count,user_ids,wallet_addresses'];
    for (const dup of duplicates) {
      const userIds = dup.users.map(u => u.user_id).join(';');
      const wallets = dup.users.map(u => u.wallet_address).join(';');
      csvLines.push(`"${dup.auth_email}",${dup.count},"${userIds}","${wallets}"`);
    }
    
    await fs.writeFile('duplicate_auth_emails.csv', csvLines.join('\n'));
    console.log('CSV saved to: duplicate_auth_emails.csv');
    
  } catch (error) {
    console.error('Error:', error);
  }
}

// Load environment variables
require('dotenv').config({ path: '.env.local' });

findDuplicateAuthEmails()
  .then(() => {
    console.log('\n✅ Analysis complete!');
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Analysis failed:', err);
    process.exit(1);
  });