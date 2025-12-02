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

// List of duplicate auth_emails
const duplicateAuthEmails = [
  'a01085857918@gmail.com',
  'gimgijun047@gmail.com',
  'a01076558187@gmail.com',
  'gho47562@gmail.com',
  'j21449097@gmail.com',
  'kdg9775@gmail.com',
  'mface1@naver.com',
  'nigu56003@gmail.com',
  'shsh11332233@gmail.com',
  'jht26594529@gmail.com',
  'dreamham1018@gmail.com',
  'kodan6988@gmail.com',
  'missuni051938@gmail.com',
  'bless07073@gmail.com',
  'kcoco21@naver.com',
  '01090262230a@gmail.com',
  'soo1165@naver.com',
  'jskim22929@daum.net',
  'a01052271256@gmail.com',
  'kangyt7023@gmail.com',
  'minbyeong46@gmail.com',
  'ch88529004@gmail.com',
  'gimhojun413@gmail.com',
  'sk01085207785@gmail.com',
  'gimn78155@gmail.com',
  'chokakdal@gmail.com',
  'hdr3017@hanmail.net',
  'choesig16@gmail.com',
  'ggim36613@gmail.com',
  'ok54094698@gmail.com',
  'gi3466018@gmail.com',
  'le5704266@gmail.com',
  'yeomjeongmin56@gmail.com',
  'a38847710@gmail.com',
  'kdk00880077@gmail.com',
  'roie4753@gmail.com',
  'gu9170089@gmail.com',
  'hog96348@gmail.com'
];

async function analyzeDuplicates() {
  console.log('=== ANALYZING DUPLICATE AUTH_EMAILS ===\n');
  
  const analysis = [];
  
  for (const authEmail of duplicateAuthEmails) {
    console.log(`\n\nAnalyzing: ${authEmail}`);
    console.log('=' .repeat(50));
    
    // Get all users with this auth_email
    const query = await db.collection('mzs')
      .where('auth_email', '==', authEmail)
      .get();
    
    const users = [];
    query.forEach(doc => {
      const data = doc.data();
      users.push({
        user_id: doc.id,
        data: data
      });
    });
    
    console.log(`Found ${users.length} users with auth_email: ${authEmail}`);
    
    const userAnalysis = {
      auth_email: authEmail,
      total_users: users.length,
      users: []
    };
    
    // Analyze each user
    for (const user of users) {
      console.log(`\n  User ID: ${user.user_id}`);
      const userData = user.data;
      
      const userInfo = {
        user_id: user.user_id,
        wallet_address: userData.wallet_address || userData.address || 'NO_WALLET',
        private_key: userData.private_key ? 'EXISTS' : 'MISSING',
        migration_info: {},
        admin_changes: {},
        timestamps: {}
      };
      
      // Check migration flags
      if (userData.migrated) {
        userInfo.migration_info.migrated = true;
        userInfo.migration_info.migratedAt = userData.migratedAt;
        console.log(`    ✓ MIGRATED: ${userData.migratedAt?._seconds ? new Date(userData.migratedAt._seconds * 1000).toISOString() : 'No timestamp'}`);
      }
      
      if (userData.migratedFromUsers) {
        userInfo.migration_info.migratedFromUsers = true;
        userInfo.migration_info.migrationDate = userData.migrationDate;
        console.log(`    ✓ Migrated from users collection`);
      }
      
      if (userData.migratedFromMZS) {
        userInfo.migration_info.migratedFromMZS = true;
        console.log(`    ✓ Migrated from MZS collection`);
      }
      
      if (userData.createdFromCSV) {
        userInfo.migration_info.createdFromCSV = true;
        console.log(`    ✓ Created from CSV`);
      }
      
      // Check admin modifications
      if (userData.lastModifiedBy) {
        userInfo.admin_changes.lastModifiedBy = userData.lastModifiedBy;
        userInfo.admin_changes.lastModifiedByAdminId = userData.lastModifiedByAdminId;
        userInfo.admin_changes.lastModifiedAt = userData.lastModifiedAt;
        userInfo.admin_changes.adminAction = userData.adminAction;
        console.log(`    ✓ Admin modified by: ${userData.lastModifiedBy} - ${userData.adminAction || 'No action specified'}`);
        if (userData.lastModifiedAt) {
          console.log(`      Modified at: ${userData.lastModifiedAt}`);
        }
      }
      
      // Check timestamps
      if (userData.createdAt) {
        userInfo.timestamps.createdAt = userData.createdAt;
        const createdDate = userData.createdAt._seconds ? new Date(userData.createdAt._seconds * 1000).toISOString() : userData.createdAt;
        console.log(`    Created: ${createdDate}`);
      }
      
      if (userData.updatedAt) {
        userInfo.timestamps.updatedAt = userData.updatedAt;
        const updatedDate = userData.updatedAt._seconds ? new Date(userData.updatedAt._seconds * 1000).toISOString() : userData.updatedAt;
        console.log(`    Updated: ${updatedDate}`);
      }
      
      // Check service
      if (userData.service) {
        userInfo.service = userData.service;
        console.log(`    Service: ${userData.service}`);
      }
      
      userAnalysis.users.push(userInfo);
    }
    
    // Determine which is the real user
    console.log('\n  ANALYSIS SUMMARY:');
    const migratedUsers = userAnalysis.users.filter(u => 
      u.migration_info.migrated || 
      u.migration_info.migratedFromUsers || 
      u.migration_info.migratedFromMZS
    );
    
    const adminModifiedUsers = userAnalysis.users.filter(u => u.admin_changes.lastModifiedBy);
    
    console.log(`  - Migrated users: ${migratedUsers.length}`);
    console.log(`  - Admin modified users: ${adminModifiedUsers.length}`);
    
    if (migratedUsers.length === 1) {
      userAnalysis.real_user_id = migratedUsers[0].user_id;
      console.log(`  ✅ REAL USER: ${migratedUsers[0].user_id} (only migrated user)`);
    } else if (migratedUsers.length > 1) {
      console.log(`  ⚠️  WARNING: Multiple migrated users found!`);
      userAnalysis.multiple_migrations = true;
    }
    
    // Check for users that were manually set by admin
    if (adminModifiedUsers.length > 0) {
      console.log(`  📝 Admin modifications found:`);
      adminModifiedUsers.forEach(u => {
        console.log(`     - ${u.user_id}: Modified by ${u.admin_changes.lastModifiedBy}`);
      });
    }
    
    analysis.push(userAnalysis);
  }
  
  // Save detailed report
  const report = {
    summary: {
      total_auth_emails_analyzed: duplicateAuthEmails.length,
      timestamp: new Date().toISOString()
    },
    analysis: analysis
  };
  
  await fs.writeFile('duplicate_auth_emails_analysis.json', JSON.stringify(report, null, 2));
  console.log('\n\nDetailed analysis saved to: duplicate_auth_emails_analysis.json');
  
  // Create CSV summary
  const csvLines = ['auth_email,user_count,real_user_id,migration_status,admin_modified_count,notes'];
  
  for (const item of analysis) {
    const realUserId = item.real_user_id || 'UNCLEAR';
    const migrationStatus = item.multiple_migrations ? 'MULTIPLE_MIGRATIONS' : 
                           (item.users.some(u => u.migration_info.migrated) ? 'MIGRATED' : 'NO_MIGRATION');
    const adminModCount = item.users.filter(u => u.admin_changes.lastModifiedBy).length;
    const notes = item.multiple_migrations ? 'Multiple users migrated - needs investigation' : '';
    
    csvLines.push(`"${item.auth_email}",${item.total_users},"${realUserId}","${migrationStatus}",${adminModCount},"${notes}"`);
  }
  
  await fs.writeFile('duplicate_auth_emails_analysis.csv', csvLines.join('\n'));
  console.log('CSV summary saved to: duplicate_auth_emails_analysis.csv');
  
  // Create actionable report
  console.log('\n\n=== ACTIONABLE ITEMS ===');
  console.log('\n1. Auth emails with MULTIPLE MIGRATIONS (need investigation):');
  const multiMigrations = analysis.filter(a => a.multiple_migrations);
  multiMigrations.forEach(item => {
    console.log(`   - ${item.auth_email}: ${item.users.length} users`);
  });
  
  console.log('\n2. Auth emails with NO CLEAR MIGRATION (need to check which is real):');
  const unclearUsers = analysis.filter(a => !a.real_user_id);
  unclearUsers.forEach(item => {
    console.log(`   - ${item.auth_email}: ${item.users.length} users`);
  });
}

// Load environment variables
require('dotenv').config({ path: '.env.local' });

// Run analysis
analyzeDuplicates()
  .then(() => {
    console.log('\n✅ Analysis complete!');
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Analysis failed:', err);
    process.exit(1);
  });