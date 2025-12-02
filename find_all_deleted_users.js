const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const fs = require('fs').promises;

async function findAllDeletedUsers() {
  console.log('Searching for ALL deleted users in old logs...\n');
  
  // Get the complete list of failed logins
  const { stdout: failedEmails } = await execPromise(`ssh root@91.108.105.43 "cat /tmp/failed_logins.txt"`);
  const emailList = failedEmails.split('\n').map(e => e.trim().replace(/'$/, '')).filter(e => e);
  
  console.log(`Total emails to search: ${emailList.length}\n`);
  
  const allDeletedUsers = [];
  let processedCount = 0;
  
  // Process in batches to avoid overwhelming the server
  for (let i = 0; i < emailList.length; i += 5) {
    const batch = emailList.slice(i, i + 5);
    const batchPromises = batch.map(async (email) => {
      try {
        // Clean the email
        const cleanEmail = email.replace(/'$/, '');
        
        // Search for user data in old logs
        const searchCmd = `ssh root@91.108.105.43 "grep -B20 -A20 '${cleanEmail}' /root/.pm2/logs/mzswallet-out.log 2>/dev/null | grep -E '(user_id:|email:|auth_email:|address:|User data found|password_hash)' | head -40"`;
        const { stdout } = await execPromise(searchCmd);
        
        if (stdout && (stdout.includes('user_id:') || stdout.includes('auth_email:'))) {
          const userData = parseUserData(stdout, cleanEmail);
          if (userData) {
            allDeletedUsers.push(userData);
            console.log(`✓ Found data for: ${cleanEmail}`);
          }
        } else {
          console.log(`✗ No data found for: ${cleanEmail}`);
        }
      } catch (error) {
        console.log(`✗ Error searching: ${email}`);
      }
      processedCount++;
    });
    
    await Promise.all(batchPromises);
    console.log(`Progress: ${processedCount}/${emailList.length}`);
  }
  
  // Remove duplicates and organize data
  const uniqueUsers = removeDuplicates(allDeletedUsers);
  
  // Save to CSV
  await saveToCSV(uniqueUsers);
  
  // Display summary
  console.log('\n=== SUMMARY ===');
  console.log(`Total failed login attempts: ${emailList.length}`);
  console.log(`Users with data found: ${uniqueUsers.length}`);
  console.log(`Users with auth_email: ${uniqueUsers.filter(u => u.auth_email && u.auth_email !== 'N/A').length}`);
  console.log('\nData saved to: deleted_users_complete.csv');
}

function parseUserData(stdout, searchEmail) {
  const lines = stdout.split('\n');
  const userData = { searched_email: searchEmail };
  
  for (const line of lines) {
    // Extract user_id
    const userIdMatch = line.match(/user_id: '([^']+)'/);
    if (userIdMatch && !userData.user_id) {
      userData.user_id = userIdMatch[1];
    }
    
    // Extract email
    const emailMatch = line.match(/email: '([^']+)'/);
    if (emailMatch && !userData.email) {
      userData.email = emailMatch[1];
    }
    
    // Extract auth_email
    const authEmailMatch = line.match(/auth_email: '([^']+)'/);
    if (authEmailMatch) {
      userData.auth_email = authEmailMatch[1];
    }
    
    // Extract wallet address
    const addressMatch = line.match(/address: '(0x[a-fA-F0-9]+)'/);
    if (addressMatch && !userData.wallet_address) {
      userData.wallet_address = addressMatch[1];
    }
  }
  
  // Only return if we found meaningful data
  if (userData.user_id || userData.auth_email || userData.wallet_address) {
    return userData;
  }
  return null;
}

function removeDuplicates(users) {
  const seen = new Map();
  
  users.forEach(user => {
    // Use combination of user_id and wallet_address as key
    const key = `${user.user_id || 'no-id'}_${user.wallet_address || 'no-wallet'}`;
    
    // If we haven't seen this user, or if this version has more data, keep it
    if (!seen.has(key) || 
        (user.auth_email && !seen.get(key).auth_email) ||
        (user.email && !seen.get(key).email)) {
      seen.set(key, user);
    }
  });
  
  return Array.from(seen.values());
}

async function saveToCSV(users) {
  const csvContent = [
    'user_id,email,auth_email,wallet_address,searched_email',
    ...users.map(u => 
      `"${u.user_id || ''}","${u.email || ''}","${u.auth_email || ''}","${u.wallet_address || ''}","${u.searched_email || ''}"`
    )
  ].join('\n');
  
  await fs.writeFile('deleted_users_complete.csv', csvContent);
}

findAllDeletedUsers()
  .then(() => {
    console.log('\nDone!');
    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });