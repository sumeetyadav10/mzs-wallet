const admin = require('firebase-admin');
require('dotenv').config({ path: '.env.local' });

// Initialize Firebase Admin
const serviceAccount = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
};

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// List of wallet addresses to check
const walletAddresses = [
  { name: '김수남', address: '0x716e89f710f9df90d64e85092d5d2e3772a71581' },
  { name: '조경순', address: '0xe0fb4e14eabea06ff580add24e3dd0ae7234baf3' },
  { name: '강의영', address: '0x4f580de26675a1e4d8a402b87cda564a7325ee0b' },
  { name: '이광숙', address: '0x6eebbed6bbef369ce5097335cd39665022b41ed7' },
  { name: '정만선', address: '0x8ecde5219e364a8a4afc652e790acdf7774eded0' },
  { name: '조옥규', address: '0x3abdb57edab06360b10e262e7b83a6869d04c279' },
  { name: '김진수', address: '0x2cd133d4c69925db9fbee915ed7af2436deff363' },
  { name: '박실광', address: '0x728893ba7ec83f4b4c734450f62236194525b359' },
  { name: '김승배', address: '0x4d35a821fad20aea0c5415a56d9c3051b3a48d31' },
  { name: '나경진', address: '0x9e3a74bdf78960f7404c369c571c8c11b7ae06c6' },
  { name: '조덕향', address: '0x2bbe2b0d02c98548cf72a74069f99b488e834cd6' },
  { name: '정희태', address: '0x5e2977fb50224d27de621c316e642820b827c77a' },
  { name: '김수연', address: '0xdB6D38b513Ea10A4b638f597ee1D50C615ABb09e' }
];

async function checkWalletAuthEmails() {
  console.log('=== MZS Wallet Auth Email Check ===\n');
  
  for (const wallet of walletAddresses) {
    try {
      // Search in the mzs collection
      const userSnapshot = await db.collection('mzs')
        .where('walletAddress', '==', wallet.address.toLowerCase())
        .limit(1)
        .get();
      
      if (!userSnapshot.empty) {
        const userData = userSnapshot.docs[0].data();
        const authEmail = userData.authEmail || userData.email || 'No email found';
        const userInfo = userData.userInfo || {};
        
        console.log(`${wallet.name} (${wallet.address}):`);
        console.log(`  Auth Email: ${authEmail}`);
        if (userInfo.email && userInfo.email !== authEmail) {
          console.log(`  User Info Email: ${userInfo.email}`);
        }
        console.log(`  Created: ${userData.createdAt ? new Date(userData.createdAt._seconds * 1000).toLocaleString() : 'Unknown'}`);
        console.log('');
      } else {
        console.log(`${wallet.name} (${wallet.address}):`);
        console.log('  Not found in MZS collection\n');
      }
    } catch (error) {
      console.log(`${wallet.name} (${wallet.address}):`);
      console.log(`  Error: ${error.message}\n`);
    }
  }
  
  console.log('=== Check Complete ===');
  process.exit(0);
}

checkWalletAuthEmails().catch(error => {
  console.error('Script error:', error);
  process.exit(1);
});