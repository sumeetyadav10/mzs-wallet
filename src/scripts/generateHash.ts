import bcrypt from 'bcryptjs';

async function generateHash() {
  const password = process.argv[2] || 'example-password'; // Pass password as argument: npm run generate-hash mypassword
  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash(password, salt);
  
  console.log('Password:', password);
  console.log('Generated Hash:', hash);
  
  // Verify the hash works
  const isValid = await bcrypt.compare(password, hash);
  console.log('Hash verification:', isValid ? 'Success' : 'Failed');
}

generateHash().catch(console.error); 