const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

async function findDeletedUsers() {
  console.log('Finding all deleted users with their details...\n');
  
  // List of users who couldn't login (from recent logs)
  const failedLogins = [
    'parksangdunk@gmail.com',
    'oolee2000@gmail.com',
    'kim1203hy@gmail.com',
    'ingugsong0@gmail.com',
    'hanmjmj3@hanmail.net',
    'brandcho11@gmail.com',
    'heyyo2511@gmail.com',
    'suda159',
    'kcoco21@naver.com',
    'jskim22929@daum.net',
    'jay7031@gmail.com',
    'kgbboy77@gmail.com',
    'askung@hanmail.net',
    'ch88529004@gmail.com'
  ];
  
  const deletedUsers = [];
  
  for (const email of failedLogins) {
    try {
      // Search for this email in old logs
      const { stdout } = await execPromise(`ssh root@91.108.105.43 "grep -B15 -A15 '${email}' /root/.pm2/logs/mzswallet-out.log | grep -E '(user_id:|email:|auth_email:|address:|User data found)' | head -30" 2>/dev/null`);
      
      if (stdout && stdout.includes('User data found')) {
        // Parse the user data
        const lines = stdout.split('\n');
        let currentUser = {};
        
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          
          if (line.includes('User data found')) {
            // Start of a new user record
            if (currentUser.user_id || currentUser.auth_email) {
              // Save previous user if it has data
              deletedUsers.push({...currentUser});
            }
            currentUser = { searched_email: email };
          } else {
            // Extract fields
            const userIdMatch = line.match(/user_id: '([^']+)'/);
            const emailMatch = line.match(/email: '([^']+)'/);
            const authEmailMatch = line.match(/auth_email: '([^']+)'/);
            const addressMatch = line.match(/address: '(0x[^']+)'/);
            
            if (userIdMatch) currentUser.user_id = userIdMatch[1];
            if (emailMatch && !currentUser.email) currentUser.email = emailMatch[1];
            if (authEmailMatch) currentUser.auth_email = authEmailMatch[1];
            if (addressMatch) currentUser.wallet_address = addressMatch[1];
          }
        }
        
        // Don't forget the last user
        if (currentUser.user_id || currentUser.auth_email) {
          deletedUsers.push(currentUser);
        }
      }
    } catch (error) {
      console.error(`Error searching for ${email}:`, error.message);
    }
  }
  
  // Remove duplicates based on user_id
  const uniqueUsers = Array.from(new Map(deletedUsers.map(u => [u.user_id || u.auth_email, u])).values());
  
  // Display results
  console.log('DELETED USERS FOUND:\n');
  console.log('user_id,email,auth_email,wallet_address');
  console.log('--------------------------------------------------------------');
  
  uniqueUsers.forEach(user => {
    console.log(`${user.user_id || 'N/A'},${user.email || user.searched_email},${user.auth_email || 'N/A'},${user.wallet_address || 'N/A'}`);
  });
  
  console.log('\n\nSummary:');
  console.log(`Total deleted users found: ${uniqueUsers.length}`);
  console.log(`Users with auth_email: ${uniqueUsers.filter(u => u.auth_email).length}`);
}

findDeletedUsers()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });