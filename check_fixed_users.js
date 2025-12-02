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

async function checkFixedUsers() {
    console.log('=== CHECKING FIXED USERS ===');
    
    try {
        // Find all users that were fixed
        const fixedUsersSnapshot = await db.collection('users')
            .where('duplicate_auth_email_fixed', '==', true)
            .get();

        console.log(`Found ${fixedUsersSnapshot.size} users that were modified`);
        console.log('');

        fixedUsersSnapshot.forEach(doc => {
            const data = doc.data();
            console.log(`User: ${doc.id}`);
            console.log(`  Previous auth_email: ${data.previous_auth_email}`);
            console.log(`  Current auth_email: ${data.auth_email || 'null'}`);
            console.log(`  Fixed at: ${data.fixed_at?.toDate()}`);
            console.log('');
        });
        
    } catch (error) {
        console.error('Error checking fixed users:', error);
    }
}

// Run the check
checkFixedUsers();