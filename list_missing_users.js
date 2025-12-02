require('dotenv').config({ path: '.env.local' });
const admin = require('firebase-admin');
const fs = require('fs');
const csvParser = require('csv-parser');

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

async function readCSV(filename) {
    return new Promise((resolve, reject) => {
        const results = [];
        fs.createReadStream(filename)
            .pipe(csvParser({
                mapHeaders: ({ header }) => header.trim()
            }))
            .on('data', (data) => {
                // Clean up the data - remove any empty values
                const cleanData = {};
                Object.keys(data).forEach(key => {
                    if (data[key] && data[key].trim() !== '') {
                        cleanData[key] = data[key].trim();
                    }
                });
                results.push(cleanData);
            })
            .on('end', () => {
                console.log(`Read ${results.length} rows from ${filename}`);
                resolve(results);
            })
            .on('error', reject);
    });
}

async function listMissingUsers() {
    try {
        // Read CSV file
        console.log('Reading CSV file...');
        const csvData = await readCSV('MZS1.csv');
        
        // Get existing user_id field values from mzs collection
        console.log('\nChecking existing users in mzs collection...');
        const existingUserIds = new Set();
        const mzsSnapshot = await db.collection('mzs').select('user_id').get();
        
        mzsSnapshot.forEach(doc => {
            const data = doc.data();
            if (data.user_id) {
                existingUserIds.add(data.user_id);
            }
        });
        
        console.log(`Found ${existingUserIds.size} existing user_ids in mzs collection`);
        
        // Find missing users
        const missingUsers = [];
        
        csvData.forEach(user => {
            const userId = user.user_id || user.id;
            
            if (userId && !existingUserIds.has(userId)) {
                missingUsers.push({
                    user_id: userId,
                    email: user.email || '',
                    password_hash: user.password_hash ? '***' : '',
                    created_at: user.created_at || '',
                    // Include other important fields
                    address: user.address || user.wallet_address || '',
                    private_key: user.private_key ? '***' : '',
                    auth_email: user.auth_email || ''
                });
            }
        });
        
        console.log(`\n=== FOUND ${missingUsers.length} MISSING USERS ===\n`);
        
        // Sort by user_id for easier viewing
        missingUsers.sort((a, b) => a.user_id.localeCompare(b.user_id));
        
        // Save to CSV file
        const csvContent = [
            'user_id,email,has_password,created_at,address,has_private_key,auth_email',
            ...missingUsers.map(user => 
                `"${user.user_id}","${user.email}","${user.password_hash ? 'Yes' : 'No'}","${user.created_at}","${user.address}","${user.private_key ? 'Yes' : 'No'}","${user.auth_email}"`
            )
        ].join('\n');
        
        fs.writeFileSync('missing_users_list.csv', csvContent);
        console.log('✅ Saved missing users list to: missing_users_list.csv');
        
        // Also save as JSON for easier reading
        fs.writeFileSync('missing_users_list.json', JSON.stringify(missingUsers, null, 2));
        console.log('✅ Saved missing users list to: missing_users_list.json');
        
        // Show first 10 as sample
        console.log('\nFirst 10 missing users:');
        missingUsers.slice(0, 10).forEach(user => {
            console.log(`- ${user.user_id} | Email: ${user.email || 'N/A'} | Created: ${user.created_at}`);
        });
        
        console.log('\n... and', missingUsers.length - 10, 'more users');
        
    } catch (error) {
        console.error('Error:', error);
    }
}

console.log('=== LIST MISSING USERS FROM MZS COLLECTION ===');
listMissingUsers();