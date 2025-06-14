const bcrypt = require('bcryptjs');

async function generateHash() {
  const password = 'test123'; // This is the password we want to hash
  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash(password, salt);
  
  console.log('Password:', password);
  console.log('Generated Hash:', hash);
  
  // Verify the hash works
  const isValid = await bcrypt.compare(password, hash);
  console.log('Hash verification:', isValid ? 'Success' : 'Failed');
}

generateHash().catch(console.error); 