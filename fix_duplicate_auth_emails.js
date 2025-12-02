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

async function fixDuplicateAuthEmails() {
    console.log('=== FIXING DUPLICATE AUTH EMAILS ===');
    console.log('Setting auth_email to null and migrated to false for all duplicates');
    console.log('');

    try {
        // Get all users with auth_email
        const usersSnapshot = await db.collection('users')
            .where('auth_email', '!=', null)
            .get();

        // Group by auth_email to find duplicates
        const authEmailMap = new Map();
        
        usersSnapshot.forEach(doc => {
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

        let totalFixed = 0;
        let totalDuplicateEmails = 0;

        // Fix all duplicates (where auth_email appears more than once)
        for (const [authEmail, users] of authEmailMap.entries()) {
            if (users.length > 1) {
                totalDuplicateEmails++;
                console.log(`\n📧 Auth Email: ${authEmail} (${users.length} users)`);
                
                // Update ALL users with this duplicate auth_email
                for (const user of users) {
                    try {
                        await db.collection('users').doc(user.userId).update({
                            auth_email: null,
                            migrated: false,
                            duplicate_auth_email_fixed: true,
                            fixed_at: admin.firestore.FieldValue.serverTimestamp(),
                            previous_auth_email: authEmail
                        });
                        
                        console.log(`  ✅ Fixed user ${user.userId}`);
                        totalFixed++;
                    } catch (updateError) {
                        console.error(`  ❌ Failed to fix user ${user.userId}:`, updateError.message);
                    }
                }
            }
        }

        console.log('\n=== SUMMARY ===');
        console.log(`Total duplicate auth_emails found: ${totalDuplicateEmails}`);
        console.log(`Total users fixed: ${totalFixed}`);
        console.log('\nAll duplicate auth_emails have been set to null');
        console.log('All affected users have migrated status set to false');
        
    } catch (error) {
        console.error('Error fixing duplicate auth emails:', error);
    }
}

// Run the fix
fixDuplicateAuthEmails();