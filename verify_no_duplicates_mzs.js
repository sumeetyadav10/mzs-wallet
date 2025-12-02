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

async function verifyNoDuplicatesInMZS() {
    console.log('=== VERIFYING NO DUPLICATE AUTH_EMAILS IN MZS COLLECTION ===');
    console.log('');

    try {
        // Get all documents with auth_email from mzs collection
        const mzsSnapshot = await db.collection('mzs')
            .where('auth_email', '!=', null)
            .get();

        console.log(`Total documents with auth_email in mzs: ${mzsSnapshot.size}`);

        // Group by auth_email to find duplicates
        const authEmailMap = new Map();
        
        mzsSnapshot.forEach(doc => {
            const data = doc.data();
            const authEmail = data.auth_email;
            
            if (!authEmailMap.has(authEmail)) {
                authEmailMap.set(authEmail, []);
            }
            authEmailMap.get(authEmail).push({
                userId: doc.id,
                data: data
            });
        });

        let duplicatesFound = false;
        let totalDuplicates = 0;

        // Check for duplicates
        for (const [authEmail, users] of authEmailMap.entries()) {
            if (users.length > 1) {
                duplicatesFound = true;
                totalDuplicates++;
                console.log(`\n❌ DUPLICATE FOUND: ${authEmail} (${users.length} users)`);
                users.forEach(user => {
                    console.log(`   - User ID: ${user.userId}`);
                });
            }
        }

        if (!duplicatesFound) {
            console.log('\n✅ SUCCESS: No duplicate auth_emails found in mzs collection!');
            console.log(`Total unique auth_emails: ${authEmailMap.size}`);
        } else {
            console.log(`\n❌ FAILED: Found ${totalDuplicates} duplicate auth_emails still in mzs collection`);
        }

        // Also check for null auth_emails that were fixed
        const fixedSnapshot = await db.collection('mzs')
            .where('duplicate_auth_email_fixed', '==', true)
            .get();

        console.log(`\nTotal documents marked as fixed: ${fixedSnapshot.size}`);
        
    } catch (error) {
        console.error('Error verifying duplicates:', error);
    }
}

// Run the verification
verifyNoDuplicatesInMZS();