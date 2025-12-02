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

async function checkMzsStructure() {
    console.log('=== CHECKING MZS COLLECTION STRUCTURE ===\n');
    
    try {
        // Get a few sample documents from mzs collection
        const mzsSnapshot = await db.collection('mzs').limit(5).get();
        
        console.log(`Found ${mzsSnapshot.size} documents in mzs collection\n`);
        
        mzsSnapshot.forEach((doc, index) => {
            console.log(`\nDocument ${index + 1} - ID: ${doc.id}`);
            const data = doc.data();
            
            // List all fields (excluding sensitive ones)
            const fields = Object.keys(data);
            console.log('Fields present:');
            fields.forEach(field => {
                if (field === 'private_key' || field === 'password_hash') {
                    console.log(`  - ${field}: [REDACTED]`);
                } else {
                    const value = data[field];
                    const displayValue = typeof value === 'string' && value.length > 50 
                        ? value.substring(0, 50) + '...' 
                        : value;
                    console.log(`  - ${field}: ${displayValue}`);
                }
            });
            
            // Check for important fields
            console.log('\nKey fields check:');
            console.log(`  - user_id: ${data.user_id ? '✓ Present' : '✗ MISSING'}`);
            console.log(`  - auth_email: ${data.auth_email ? '✓ Present' : '✗ MISSING'}`);
            console.log(`  - address: ${data.address ? '✓ Present' : '✗ MISSING'}`);
            console.log(`  - password_hash: ${data.password_hash ? '✓ Present' : '✗ MISSING'}`);
            console.log(`  - private_key: ${data.private_key ? '✓ Present' : '✗ MISSING'}`);
        });
        
    } catch (error) {
        console.error('Error checking MZS structure:', error);
    }
}

// Run the check
checkMzsStructure();