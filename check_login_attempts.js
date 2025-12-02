const { exec } = require('child_process');
const fs = require('fs').promises;

async function checkLoginAttempts() {
  console.log('=== CHECKING LOGIN ATTEMPTS FOR RESTORED USERS ===\n');
  
  // Load the list of restored users
  const restoredData = await fs.readFile('mzs_deleted_users_complete_final.csv', 'utf8');
  const lines = restoredData.split('\n').filter(line => line.trim());
  
  // Extract auth_emails from restored users
  const authEmails = new Set();
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].match(/(\".*?\"|[^,]+)/g) || [];
    if (parts[2]) {
      const authEmail = parts[2].replace(/^"(.*)"$/, '$1').trim();
      if (authEmail) authEmails.add(authEmail);
    }
  }
  
  console.log(`Checking login attempts for ${authEmails.size} auth_emails...\n`);
  
  // Get recent login failures from server logs
  const command = `ssh root@91.108.105.43 "pm2 logs mzs-wallet --lines 2000 --nostream | grep 'User not found' | grep -oE 'email: .*' | sed 's/email: //' | sed 's/[^a-zA-Z0-9@._-]//g' | sort | uniq -c | sort -rn"`;
  
  exec(command, async (error, stdout, stderr) => {
    if (error) {
      console.error('Error fetching logs:', error);
      return;
    }
    
    const failedLogins = stdout.split('\n').filter(line => line.trim());
    
    console.log('Recent failed login attempts:\n');
    console.log('Count | Email | Status');
    console.log('------|-------|-------');
    
    const restoredAuthEmails = [];
    const notRestoredEmails = [];
    
    failedLogins.forEach(line => {
      const match = line.trim().match(/^\s*(\d+)\s+(.+)$/);
      if (match) {
        const count = match[1];
        const email = match[2].trim();
        const isRestored = authEmails.has(email);
        
        console.log(`${count.padStart(5)} | ${email.padEnd(30)} | ${isRestored ? '✅ Restored' : '❌ Not in deleted list'}`);
        
        if (isRestored) {
          restoredAuthEmails.push({ email, count: parseInt(count) });
        } else {
          notRestoredEmails.push({ email, count: parseInt(count) });
        }
      }
    });
    
    console.log('\n=== SUMMARY ===');
    console.log(`Total failed login emails: ${failedLogins.length}`);
    console.log(`From restored users: ${restoredAuthEmails.length}`);
    console.log(`Not in deleted list: ${notRestoredEmails.length}`);
    
    // Save results
    const report = {
      timestamp: new Date().toISOString(),
      totalFailedLogins: failedLogins.length,
      restoredUsers: restoredAuthEmails,
      unknownUsers: notRestoredEmails
    };
    
    await fs.writeFile('login_attempts_report.json', JSON.stringify(report, null, 2));
    console.log('\nDetailed report saved to: login_attempts_report.json');
  });
}

checkLoginAttempts().catch(console.error);