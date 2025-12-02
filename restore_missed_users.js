const fs = require('fs').promises;
const csv = require('csv-parse/sync');
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// Initialize Firebase Admin
if (!getApps().length) {
  try {
    let privateKey = process.env.FIREBASE_PRIVATE_KEY;
    if (privateKey) {
      privateKey = privateKey.replace(/^["']|["']$/g, '');
      privateKey = privateKey.replace(/\\n/g, '\n');
      if (!privateKey.includes('\n') && privateKey.includes('-----BEGIN PRIVATE KEY-----')) {
        privateKey = privateKey
          .replace('-----BEGIN PRIVATE KEY-----', '-----BEGIN PRIVATE KEY-----\n')
          .replace('-----END PRIVATE KEY-----', '\n-----END PRIVATE KEY-----');
      }
    }
    
    const credential = cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: privateKey,
    });
    
    initializeApp({
      credential: credential,
    });
    
    console.log('✅ Firebase Admin initialized successfully');
  } catch (error) {
    console.error('❌ Firebase Admin initialization error:', error);
  }
}

const db = getFirestore();

async function restoreMissedUsers() {
  console.log('=== RESTORING MISSED USERS ===\n');
  
  try {
    // Load all data files
    console.log('Loading data files...');
    const missedUsers = await fs.readFile('missed_deleted_users.csv', 'utf8');
    const mzs1Data = await fs.readFile('MZS1.csv', 'utf8');
    const mzs2Data = await fs.readFile('MZS2.csv', 'utf8');
    
    // Parse CSV files
    const missedUsersParsed = csv.parse(missedUsers, { columns: true });
    const mzs1Parsed = csv.parse(mzs1Data, { columns: true });
    const mzs2Parsed = csv.parse(mzs2Data, { columns: true });
    
    console.log(`Found ${missedUsersParsed.length} missed users`);
    console.log(`MZS1 has ${mzs1Parsed.length} records`);
    console.log(`MZS2 has ${mzs2Parsed.length} records`);
    
    // Create lookup maps for MZS data
    const mzs1Map = {};
    const mzs2Map = {};
    
    // Index MZS1 by multiple fields for better matching
    mzs1Parsed.forEach(row => {
      // Try to match by wallet address (address field)
      if (row.address) {
        mzs1Map[row.address.toLowerCase()] = row;
      }
      // Also index by user_id
      if (row.user_id) {
        mzs1Map[row.user_id] = row;
      }
      // Also index by email if present
      if (row.email) {
        mzs1Map[row.email.toLowerCase()] = row;
      }
    });
    
    // Index MZS2 by wallet address (column is named 'address' not 'wallet_address')
    mzs2Parsed.forEach(row => {
      if (row.address) {
        mzs2Map[row.address.toLowerCase()] = row;
      }
      // Also index by user_id for better matching
      if (row.user_id) {
        mzs2Map[row.user_id] = row;
      }
    });
    
    // Process each missed user
    let updated = 0;
    let added = 0;
    let errors = 0;
    
    for (const user of missedUsersParsed) {
      console.log(`\n📦 Processing: ${user.auth_email}`);
      
      try {
        const wallet = user.wallet_address?.toLowerCase();
        const userId = user.user_id;
        
        // Find matching data in MZS1 and MZS2
        const mzs1Match = mzs1Map[wallet] || mzs1Map[userId] || mzs1Map[user.auth_email.toLowerCase()];
        const mzs2Match = mzs2Map[wallet] || mzs2Map[userId];
        
        if (mzs1Match) {
          console.log(`   ✅ Found in MZS1 - has password and private key`);
        }
        if (mzs2Match) {
          console.log(`   ✅ Found in MZS2 - additional data`);
        }
        
        // Prepare user data
        const userData = {
          auth_email: user.auth_email,
          email: user.email || user.auth_email,
          user_id: user.user_id,
          wallet_address: user.wallet_address,
          address: user.wallet_address, // Some code expects 'address' field
          migrated: true,
          migratedAt: new Date(),
          service: 'MZS-WALLET'
        };
        
        // Add data from MZS1
        if (mzs1Match) {
          if (mzs1Match.private_key) userData.private_key = mzs1Match.private_key;
          if (mzs1Match.password_hash) userData.password_hash = mzs1Match.password_hash;
          if (mzs1Match.created_at) userData.created_at = mzs1Match.created_at;
          if (mzs1Match.username) userData.username = mzs1Match.username;
        }
        
        // Add data from MZS2 if available
        if (mzs2Match) {
          if (mzs2Match.private_key && !userData.private_key) {
            userData.private_key = mzs2Match.private_key;
          }
        }
        
        // Check if we have private key
        if (!userData.private_key) {
          console.log(`   ⚠️  WARNING: No private key found for ${user.auth_email}`);
        }
        
        // Update or create in database
        const docRef = db.collection('mzs').doc(user.user_id);
        const doc = await docRef.get();
        
        if (doc.exists) {
          // Update existing document with missing fields
          console.log(`   📝 Updating existing user...`);
          await docRef.update(userData);
          updated++;
        } else {
          // Create new document
          console.log(`   ➕ Creating new user...`);
          await docRef.set(userData);
          added++;
        }
        
        console.log(`   ✅ Success!`);
        
      } catch (error) {
        console.error(`   ❌ Error processing ${user.auth_email}:`, error.message);
        errors++;
      }
    }
    
    console.log('\n\n=== RESTORATION COMPLETE ===');
    console.log(`✅ Updated: ${updated} users`);
    console.log(`➕ Added: ${added} users`);
    console.log(`❌ Errors: ${errors}`);
    
    // Create final report
    const report = {
      timestamp: new Date().toISOString(),
      totalProcessed: missedUsersParsed.length,
      updated,
      added,
      errors,
      users: missedUsersParsed.map(u => ({
        user_id: u.user_id,
        auth_email: u.auth_email,
        wallet: u.wallet_address
      }))
    };
    
    await fs.writeFile('missed_users_restoration_report.json', JSON.stringify(report, null, 2));
    console.log('\nReport saved to: missed_users_restoration_report.json');
    
  } catch (error) {
    console.error('Fatal error:', error);
  }
  
  process.exit(0);
}

// Load environment variables
require('dotenv').config({ path: '.env.local' });

restoreMissedUsers().catch(console.error);