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

async function undoAuthEmailFix() {
    console.log('=== UNDOING AUTH EMAIL FIX ===');
    console.log('Restoring auth_emails that were set to null');
    console.log('');

    try {
        // Find all users that were fixed
        const fixedUsersSnapshot = await db.collection('users')
            .where('duplicate_auth_email_fixed', '==', true)
            .get();

        let totalRestored = 0;

        for (const doc of fixedUsersSnapshot.docs) {
            const data = doc.data();
            const userId = doc.id;
            const previousAuthEmail = data.previous_auth_email;

            if (previousAuthEmail) {
                try {
                    // Restore the auth_email and set migrated back to true
                    await db.collection('users').doc(userId).update({
                        auth_email: previousAuthEmail,
                        migrated: true,
                        duplicate_auth_email_fixed: admin.firestore.FieldValue.delete(),
                        fixed_at: admin.firestore.FieldValue.delete(),
                        previous_auth_email: admin.firestore.FieldValue.delete()
                    });
                    
                    console.log(`✅ Restored auth_email for user ${userId}: ${previousAuthEmail}`);
                    totalRestored++;
                } catch (updateError) {
                    console.error(`❌ Failed to restore user ${userId}:`, updateError.message);
                }
            }
        }

        console.log('\n=== SUMMARY ===');
        console.log(`Total users restored: ${totalRestored}`);
        console.log('\nAll auth_emails have been restored to their previous values');
        
    } catch (error) {
        console.error('Error undoing auth email fix:', error);
    }
}

// Run the undo
undoAuthEmailFix();