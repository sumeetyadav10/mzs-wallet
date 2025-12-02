const fs = require('fs').promises;
const csv = require('csv-parser');
const { createReadStream } = require('fs');

async function matchDeletedUsersWithFullData() {
  console.log('=== MATCHING DELETED USERS WITH COMPLETE DATA ===\n');
  
  // Step 1: Load deleted users
  console.log('Step 1: Loading deleted users list...');
  const deletedUsersData = await fs.readFile('mzs_deleted_users_final.csv', 'utf8');
  const deletedUsers = parseCSV(deletedUsersData);
  console.log(`Found ${deletedUsers.length} deleted users to match\n`);
  
  // Step 2: Load MZS1.csv and MZS2.csv data
  console.log('Step 2: Loading MZS user data files...');
  const mzs1Data = await loadLargeCSV('MZS1.csv');
  const mzs2Data = await loadLargeCSV('MZS2.csv');
  
  console.log(`MZS1.csv loaded: ${Object.keys(mzs1Data).length} users`);
  console.log(`MZS2.csv loaded: ${Object.keys(mzs2Data).length} users\n`);
  
  // Step 3: Match deleted users with complete data
  console.log('Step 3: Matching users...');
  const completedUsers = [];
  let matchedCount = 0;
  
  for (const deletedUser of deletedUsers) {
    let matched = false;
    let completeUserData = { ...deletedUser };
    
    // Try to match by multiple fields
    const searchKeys = [
      deletedUser.user_id,
      deletedUser.email,
      deletedUser.auth_email,
      deletedUser.wallet_address
    ].filter(key => key && key !== '');
    
    // Search in MZS1
    for (const searchKey of searchKeys) {
      if (mzs1Data[searchKey]) {
        completeUserData = mergeUserData(completeUserData, mzs1Data[searchKey]);
        matched = true;
        break;
      }
    }
    
    // Search in MZS2 if not found or to get additional data
    for (const searchKey of searchKeys) {
      if (mzs2Data[searchKey]) {
        completeUserData = mergeUserData(completeUserData, mzs2Data[searchKey]);
        matched = true;
        break;
      }
    }
    
    if (matched) {
      matchedCount++;
      console.log(`✓ Matched: ${deletedUser.user_id || deletedUser.email}`);
    } else {
      console.log(`✗ No match found: ${deletedUser.user_id || deletedUser.email}`);
    }
    
    completedUsers.push(completeUserData);
  }
  
  console.log(`\nMatched ${matchedCount} out of ${deletedUsers.length} users`);
  
  // Step 4: Save completed data
  console.log('\nStep 4: Saving completed user data...');
  await saveCompletedUsers(completedUsers);
  
  console.log('\n=== PROCESS COMPLETE ===');
  console.log('Output file: mzs_deleted_users_complete_final.csv');
}

function parseCSV(csvContent) {
  const lines = csvContent.split('\n').filter(line => line.trim());
  const headers = lines[0].split(',').map(h => h.trim());
  const users = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].match(/(".*?"|[^,]+)/g) || [];
    const user = {};
    
    headers.forEach((header, index) => {
      let value = values[index] || '';
      // Remove quotes if present
      value = value.replace(/^"(.*)"$/, '$1').trim();
      user[header] = value;
    });
    
    users.push(user);
  }
  
  return users;
}

async function loadLargeCSV(filename) {
  return new Promise((resolve, reject) => {
    const userData = {};
    const results = [];
    
    createReadStream(filename)
      .pipe(csv())
      .on('data', (data) => {
        // Index by multiple fields for better matching
        if (data.user_id) userData[data.user_id] = data;
        if (data.email) userData[data.email] = data;
        if (data.auth_email) userData[data.auth_email] = data;
        if (data.wallet_address) userData[data.wallet_address] = data;
        if (data.address) userData[data.address] = data;
      })
      .on('end', () => {
        console.log(`Loaded ${filename}`);
        resolve(userData);
      })
      .on('error', (error) => {
        console.error(`Error loading ${filename}:`, error);
        reject(error);
      });
  });
}

function mergeUserData(existingData, newData) {
  const merged = { ...existingData };
  
  // List of fields to merge (only if they don't exist or are empty)
  const fieldsToMerge = [
    'user_id', 'email', 'auth_email', 'password_hash', 'temp_password',
    'private_key', 'wallet_address', 'address', 'balance', 'created_at',
    'updated_at', 'token_contract_address', 'token_symbol', 'chains',
    'migrated', 'migratedAt', 'phone_number', 'service', 'security_version'
  ];
  
  fieldsToMerge.forEach(field => {
    if (newData[field] && (!merged[field] || merged[field] === '')) {
      merged[field] = newData[field];
    }
  });
  
  // Special handling for wallet address
  if (!merged.wallet_address && newData.address) {
    merged.wallet_address = newData.address;
  }
  
  return merged;
}

async function saveCompletedUsers(users) {
  // Get all unique fields
  const allFields = new Set();
  users.forEach(user => {
    Object.keys(user).forEach(key => allFields.add(key));
  });
  
  // Define field order
  const fieldOrder = [
    'user_id', 'email', 'auth_email', 'password_hash', 'temp_password',
    'private_key', 'wallet_address', 'balance', 'created_at', 'notes'
  ];
  
  // Add remaining fields
  allFields.forEach(field => {
    if (!fieldOrder.includes(field)) {
      fieldOrder.push(field);
    }
  });
  
  // Create CSV content
  const csvContent = [
    fieldOrder.join(','),
    ...users.map(user => 
      fieldOrder.map(field => {
        const value = user[field] || '';
        // Quote values that contain commas or quotes
        if (value.toString().includes(',') || value.toString().includes('"')) {
          return `"${value.toString().replace(/"/g, '""')}"`;
        }
        return value;
      }).join(',')
    )
  ].join('\n');
  
  await fs.writeFile('mzs_deleted_users_complete_final.csv', csvContent);
  
  // Also create a summary
  const summary = `
DELETED USERS COMPLETION SUMMARY
================================
Total deleted users processed: ${users.length}
Users with private keys: ${users.filter(u => u.private_key).length}
Users with password hash: ${users.filter(u => u.password_hash).length}
Users with temp password: ${users.filter(u => u.temp_password).length}
Users with balance data: ${users.filter(u => u.balance).length}

This file contains ONLY the ${users.length} deleted users with their complete information from MZS1.csv and MZS2.csv.
`;
  
  await fs.writeFile('mzs_deleted_users_summary_final.txt', summary);
}

// Run the matching process
matchDeletedUsersWithFullData()
  .then(() => {
    console.log('\nSuccess! Check mzs_deleted_users_complete_final.csv');
    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });