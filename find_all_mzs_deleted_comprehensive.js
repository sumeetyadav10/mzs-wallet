const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const fs = require('fs').promises;

async function findAllMZSDeletedUsers() {
  console.log('=== COMPREHENSIVE MZS DELETED USERS SEARCH ===\n');
  console.log('Searching past 2 months of MZS wallet logs...\n');
  
  // First get ALL failed logins from server
  console.log('Step 1: Getting all failed login emails...');
  const { stdout: allFailedRaw } = await execPromise(`ssh root@91.108.105.43 "cat /tmp/all_mzs_failed.txt"`);
  let emailList = allFailedRaw.split('\n')
    .map(e => e.trim())
    .filter(e => e && e.includes('@') && e !== 'User not found')
    .map(e => e.replace(/['"]/g, ''));
  
  // Also search for phone numbers and user IDs that failed
  console.log('Step 2: Finding phone numbers and user IDs...');
  const { stdout: phoneNumbers } = await execPromise(`ssh root@91.108.105.43 "grep -h 'user_not_found' /root/.pm2/logs/mzs*.log | grep -oE 'email: .([0-9]{10,11})' | sed 's/email: //' | sed 's/[^0-9]//g' | sort | uniq"`);
  const phoneList = phoneNumbers.split('\n').filter(p => p.length >= 10);
  
  // Search for user_ids directly
  const { stdout: userIds } = await execPromise(`ssh root@91.108.105.43 "grep -h 'Failed OTP attempt' /root/.pm2/logs/mzs*.log | grep -B2 'user_not_found' | grep -oE 'email: .([a-zA-Z0-9_]+)' | grep -v '@' | sed 's/email: //' | sed 's/[^a-zA-Z0-9_]//g' | sort | uniq | head -50"`);
  const userIdList = userIds.split('\n').filter(u => u && !u.includes('@'));
  
  console.log(`\nFound:`);
  console.log(`- ${emailList.length} email addresses`);
  console.log(`- ${phoneList.length} phone numbers`);
  console.log(`- ${userIdList.length} user IDs`);
  
  const allSearchTerms = [...emailList, ...phoneList, ...userIdList];
  console.log(`Total search terms: ${allSearchTerms.length}\n`);
  
  const allDeletedUsers = [];
  let processedCount = 0;
  
  // Process in smaller batches
  for (let i = 0; i < allSearchTerms.length; i += 3) {
    const batch = allSearchTerms.slice(i, i + 3);
    const batchPromises = batch.map(async (searchTerm) => {
      try {
        // Search in both current and old logs
        const searchCmd = `ssh root@91.108.105.43 "
          grep -B30 -A30 '${searchTerm}' /root/.pm2/logs/mzswallet-out.log 2>/dev/null | 
          grep -E '(user_id:|email:|auth_email:|address:|User data found|password_hash|created_at)' | 
          head -60
        "`;
        
        const { stdout } = await execPromise(searchCmd, { maxBuffer: 1024 * 1024 * 10 });
        
        if (stdout && (stdout.includes('user_id:') || stdout.includes('auth_email:'))) {
          const userData = parseUserData(stdout, searchTerm);
          if (userData) {
            allDeletedUsers.push(userData);
            console.log(`✓ Found: ${searchTerm}`);
          }
        } else {
          // Try alternate search in current logs
          const altSearchCmd = `ssh root@91.108.105.43 "
            grep -B20 -A20 '${searchTerm}' /root/.pm2/logs/mzs-wallet*.log 2>/dev/null | 
            grep -E '(user_id:|email:|auth_email:|address:|wallet)' | 
            head -20
          "`;
          
          const { stdout: altStdout } = await execPromise(altSearchCmd, { maxBuffer: 1024 * 1024 * 10 });
          if (altStdout) {
            const userData = parseUserData(altStdout, searchTerm);
            if (userData) {
              allDeletedUsers.push(userData);
              console.log(`✓ Found (alt): ${searchTerm}`);
            } else {
              console.log(`✗ No data: ${searchTerm}`);
            }
          }
        }
      } catch (error) {
        console.log(`✗ Error: ${searchTerm}`);
      }
      processedCount++;
      if (processedCount % 10 === 0) {
        console.log(`Progress: ${processedCount}/${allSearchTerms.length}`);
      }
    });
    
    await Promise.all(batchPromises);
  }
  
  // Find additional users by searching transaction logs
  console.log('\nStep 3: Searching transaction and migration logs...');
  const { stdout: migrationUsers } = await execPromise(`ssh root@91.108.105.43 "
    grep -h 'migrated\\|migration' /root/.pm2/logs/mzswallet*.log | 
    grep -B5 -A5 'success' | 
    grep -oE '(user_id|email|auth_email): .([^,}]+)' | 
    head -100
  "`, { maxBuffer: 1024 * 1024 * 10 });
  
  // Remove duplicates with better logic
  const uniqueUsers = removeDuplicatesComprehensive(allDeletedUsers);
  
  // Save comprehensive results
  await saveToCSV(uniqueUsers, 'mzs_deleted_users_comprehensive.csv');
  
  // Create summary report
  await createSummaryReport(uniqueUsers);
  
  console.log('\n=== FINAL SUMMARY ===');
  console.log(`Total search terms processed: ${allSearchTerms.length}`);
  console.log(`Total deleted users found: ${uniqueUsers.length}`);
  console.log(`Users with auth_email: ${uniqueUsers.filter(u => u.auth_email && u.auth_email !== 'N/A').length}`);
  console.log(`Users with wallet address: ${uniqueUsers.filter(u => u.wallet_address).length}`);
  console.log('\nFiles created:');
  console.log('- mzs_deleted_users_comprehensive.csv');
  console.log('- mzs_deleted_users_summary.txt');
}

function parseUserData(stdout, searchTerm) {
  const lines = stdout.split('\n');
  const userData = { searched_term: searchTerm };
  
  for (const line of lines) {
    // More flexible parsing
    let match;
    
    // user_id patterns
    match = line.match(/user_id:\s*['"]?([^'",\s}]+)['"]?/);
    if (match && !userData.user_id) userData.user_id = match[1];
    
    // email patterns
    match = line.match(/email:\s*['"]?([^'",\s}]+@[^'",\s}]+)['"]?/);
    if (match && !userData.email) userData.email = match[1];
    
    // auth_email patterns
    match = line.match(/auth_email:\s*['"]?([^'",\s}]+@[^'",\s}]+)['"]?/);
    if (match) userData.auth_email = match[1];
    
    // wallet address patterns
    match = line.match(/(?:address|wallet_address):\s*['"]?(0x[a-fA-F0-9]{40})['"]?/);
    if (match && !userData.wallet_address) userData.wallet_address = match[1];
    
    // created_at pattern
    match = line.match(/created_at:\s*([0-9.]+)/);
    if (match) userData.created_at = match[1];
  }
  
  // Return if we found meaningful data
  if (userData.user_id || userData.auth_email || userData.wallet_address || userData.email) {
    return userData;
  }
  return null;
}

function removeDuplicatesComprehensive(users) {
  const seen = new Map();
  
  users.forEach(user => {
    // Create multiple keys for deduplication
    const walletKey = user.wallet_address || 'no-wallet';
    const userIdKey = user.user_id || 'no-id';
    const authEmailKey = user.auth_email || 'no-auth';
    const emailKey = user.email || 'no-email';
    
    // Primary key is wallet + user_id combination
    const primaryKey = `${walletKey}_${userIdKey}`;
    
    // Check if we should keep this version
    const existing = seen.get(primaryKey);
    if (!existing || 
        (user.auth_email && !existing.auth_email) ||
        (user.email && !existing.email) ||
        (Object.keys(user).length > Object.keys(existing).length)) {
      seen.set(primaryKey, user);
      
      // Also index by other keys for cross-reference
      if (user.auth_email) seen.set(`auth_${authEmailKey}`, user);
      if (user.email) seen.set(`email_${emailKey}`, user);
    }
  });
  
  // Get unique values
  const uniqueMap = new Map();
  seen.forEach((value, key) => {
    if (!key.startsWith('auth_') && !key.startsWith('email_')) {
      uniqueMap.set(key, value);
    }
  });
  
  return Array.from(uniqueMap.values());
}

async function saveToCSV(users, filename) {
  const csvContent = [
    'user_id,email,auth_email,wallet_address,searched_term,created_at',
    ...users.map(u => 
      `"${u.user_id || ''}","${u.email || ''}","${u.auth_email || ''}","${u.wallet_address || ''}","${u.searched_term || ''}","${u.created_at || ''}"`
    )
  ].join('\n');
  
  await fs.writeFile(filename, csvContent);
}

async function createSummaryReport(users) {
  const summary = `MZS WALLET DELETED USERS COMPREHENSIVE REPORT
Generated: ${new Date().toISOString()}
============================================

TOTAL DELETED USERS FOUND: ${users.length}

BREAKDOWN:
- Users with auth_email: ${users.filter(u => u.auth_email && u.auth_email !== 'N/A').length}
- Users with wallet address: ${users.filter(u => u.wallet_address).length}
- Users with user_id: ${users.filter(u => u.user_id).length}
- Users with email: ${users.filter(u => u.email).length}

TOP AUTH EMAILS:
${getTopItems(users, 'auth_email', 20)}

TOP DOMAINS:
${getTopDomains(users)}

SAMPLE ENTRIES:
${users.slice(0, 10).map(u => 
  `User: ${u.user_id || 'N/A'} | Email: ${u.email || 'N/A'} | Auth: ${u.auth_email || 'N/A'} | Wallet: ${u.wallet_address || 'N/A'}`
).join('\n')}
`;
  
  await fs.writeFile('mzs_deleted_users_summary.txt', summary);
}

function getTopItems(users, field, limit = 10) {
  const counts = {};
  users.forEach(u => {
    if (u[field] && u[field] !== 'N/A') {
      counts[u[field]] = (counts[u[field]] || 0) + 1;
    }
  });
  
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([email, count]) => `  ${email}: ${count} users`)
    .join('\n');
}

function getTopDomains(users) {
  const domains = {};
  users.forEach(u => {
    ['email', 'auth_email'].forEach(field => {
      if (u[field] && u[field].includes('@')) {
        const domain = u[field].split('@')[1];
        domains[domain] = (domains[domain] || 0) + 1;
      }
    });
  });
  
  return Object.entries(domains)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([domain, count]) => `  ${domain}: ${count} users`)
    .join('\n');
}

findAllMZSDeletedUsers()
  .then(() => {
    console.log('\nSearch complete!');
    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });