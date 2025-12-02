require('dotenv').config({ path: '.env.local' });
const admin = require('firebase-admin');

// Initialize Firebase Admin
const serviceAccount = {
    type: 'service_account',
    project_id: process.env.FIREBASE_PROJECT_ID,
    private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    client_email: process.env.FIREBASE_CLIENT_EMAIL
};

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: `https://${serviceAccount.project_id}.firebaseio.com`
    });
}

const db = admin.firestore();

async function verifyUsers() {
    // Sample of users to check
    const usersToCheck = [
        'qwer1',
        'qwerqwer',
        'rbtak56@never,com',
        'rshrsh',
        'schungh',
        'sex12',
        'skm0002',
        'skyung45@gmail.com',
        'smdj777',
        'sontaeh',
        'ssan30',
        'sss',
        'ssss',
        'sung9581',
        'sunsuk',
        'tjwj12345',
        'wkdghksdn61',
        'wkdghksdn62',
        'wksel1472',
        'Wns123',
        'ww1234',
        'X_ADMIN_X',
        'y000',
        'Yangoseok',
        'YJS2242',
        'yonggum',
        'yonnggum',
        'youlg8616',
        'ZoneTester1',
        'zxcv',
        '이신희'
    ];
    
    console.log('=== VERIFYING ADDED USERS ===\n');
    
    let foundCount = 0;
    let notFoundCount = 0;
    
    for (const userId of usersToCheck) {
        const query = await db.collection('mzs').where('user_id', '==', userId).limit(1).get();
        
        if (!query.empty) {
            foundCount++;
            const userData = query.docs[0].data();
            console.log(`✅ FOUND: ${userId}`);
            console.log(`   - Document ID: ${query.docs[0].id}`);
            console.log(`   - Has address: ${!!userData.address}`);
            console.log(`   - Has private_key: ${!!userData.private_key}`);
            console.log(`   - Has password_hash: ${!!userData.password_hash}`);
            console.log(`   - Restored from CSV: ${userData.restored_from_csv === true}`);
            console.log(`   - Restored at: ${userData.restored_at || 'N/A'}\n`);
        } else {
            notFoundCount++;
            console.log(`❌ NOT FOUND: ${userId}\n`);
        }
    }
    
    console.log('\n=== SUMMARY ===');
    console.log(`Total checked: ${usersToCheck.length}`);
    console.log(`Found: ${foundCount}`);
    console.log(`Not found: ${notFoundCount}`);
    
    // Also check the total count
    const totalQuery = await db.collection('mzs')
        .where('restored_from_csv', '==', true)
        .where('restored_at', '>=', new Date(Date.now() - 3600000).toISOString())
        .get();
    
    console.log(`\nTotal users restored in the last hour: ${totalQuery.size}`);
}

verifyUsers();