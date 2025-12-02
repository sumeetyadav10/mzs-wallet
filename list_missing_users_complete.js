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

async function listMissingUsersComplete() {
    try {
        // Read both CSV files
        console.log('Reading CSV files...');
        const mzs1Data = await readCSV('MZS1.csv');
        const mzs2Data = await readCSV('MZS2.csv');
        
        // Create a map of MZS2 data indexed by user_id or id with multiple normalizations
        console.log('\nCreating data map from MZS2 with all normalization variants...');
        const mzs2Map = new Map();
        const mzs2NormalizedMap = new Map(); // Map normalized to original
        
        mzs2Data.forEach(user => {
            const userId = user.user_id || user.id;
            if (userId) {
                // Store with original format
                mzs2Map.set(userId, user);
                
                // Create normalized version (no dashes, no spaces, no special chars)
                const normalized = userId.replace(/[-\s]/g, '');
                mzs2NormalizedMap.set(normalized, userId);
                
                // Also handle potential variations:
                // 1. With spaces: "010 1234 5678"
                // 2. With dashes: "010-1234-5678" 
                // 3. No formatting: "01012345678"
                // All map to same normalized form
                mzs2Map.set(normalized, user);
                
                // Also try with just digits
                const digitsOnly = userId.replace(/\D/g, '');
                if (digitsOnly !== normalized) {
                    mzs2Map.set(digitsOnly, user);
                }
            }
        });
        console.log(`MZS2 map has ${mzs2Map.size} entries (including all normalized variants)`);
        
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
        
        // Find missing users and merge data from both CSVs
        const missingUsers = [];
        let foundInMzs2Count = 0;
        let notFoundInMzs2Count = 0;
        
        mzs1Data.forEach(user1 => {
            const userId = user1.user_id || user1.id;
            
            if (userId && !existingUserIds.has(userId)) {
                // Try multiple ways to find matching data from MZS2
                let user2 = null;
                let matchedAs = null;
                
                // 1. Try exact match
                user2 = mzs2Map.get(userId);
                if (user2) matchedAs = userId;
                
                // 2. Try without dashes and spaces
                if (!user2) {
                    const normalized = userId.replace(/[-\s]/g, '');
                    user2 = mzs2Map.get(normalized);
                    if (user2) matchedAs = normalized;
                }
                
                // 3. Try digits only (remove all non-digits)
                if (!user2) {
                    const digitsOnly = userId.replace(/\D/g, '');
                    user2 = mzs2Map.get(digitsOnly);
                    if (user2) matchedAs = digitsOnly;
                }
                
                // 4. For special cases like "010 2431 2626", also try without leading zero
                if (!user2 && userId.startsWith('0')) {
                    const withoutLeadingZero = userId.substring(1).replace(/[-\s]/g, '');
                    user2 = mzs2Map.get(withoutLeadingZero);
                    if (user2) matchedAs = withoutLeadingZero;
                }
                
                // Merge all fields from both CSVs
                const mergedUser = {
                    user_id: userId,  // Ensure user_id is set from MZS1
                    email: user1.email || '',
                    password_hash: user1.password_hash || '',
                    created_at: user1.created_at || '',
                    // Add fields from MZS2 if found
                    address: user2?.address || '',
                    private_key: user2?.private_key || '',
                    has_complete_data: !!user2  // Track if we found matching data in MZS2
                };
                
                if (user2) {
                    foundInMzs2Count++;
                    if (matchedAs !== userId) {
                        console.log(`✓ Found in MZS2: ${userId} → matched as: ${matchedAs}`);
                    }
                } else {
                    notFoundInMzs2Count++;
                    if (notFoundInMzs2Count <= 10) {
                        console.log(`✗ NOT found in MZS2: ${userId}`);
                    }
                }
                
                missingUsers.push(mergedUser);
            }
        });
        
        console.log(`\n=== SUMMARY ===`);
        console.log(`Total missing users: ${missingUsers.length}`);
        console.log(`Users WITH complete data (found in MZS2): ${foundInMzs2Count}`);
        console.log(`Users WITHOUT private key/address (NOT in MZS2): ${notFoundInMzs2Count}`);
        console.log('');
        
        // Sort by user_id for easier viewing
        missingUsers.sort((a, b) => (a.user_id || '').localeCompare(b.user_id || ''));
        
        // Fixed field order for CSV
        const fieldNames = ['user_id', 'email', 'password_hash', 'created_at', 'address', 'private_key', 'has_complete_data'];
        
        // Save complete data to CSV file with ALL fields
        const csvHeader = fieldNames.join(',');
        const csvRows = missingUsers.map(user => {
            return fieldNames.map(field => {
                const value = user[field] || '';
                // Escape quotes and wrap in quotes if contains comma or quote
                const escaped = value.toString().replace(/"/g, '""');
                return /[,"]/.test(escaped) ? `"${escaped}"` : escaped;
            }).join(',');
        });
        
        const csvContent = [csvHeader, ...csvRows].join('\n');
        fs.writeFileSync('missing_users_complete.csv', csvContent);
        console.log('\n✅ Saved complete missing users data to: missing_users_complete.csv');
        
        // Save as JSON with all fields
        fs.writeFileSync('missing_users_complete.json', JSON.stringify(missingUsers, null, 2));
        console.log('✅ Saved complete missing users data to: missing_users_complete.json');
        
        // Show breakdown of users with/without complete data
        const completeUsers = missingUsers.filter(u => u.has_complete_data);
        const incompleteUsers = missingUsers.filter(u => !u.has_complete_data);
        
        console.log('\n=== USERS WITH COMPLETE DATA (including private keys) ===');
        console.log(`Count: ${completeUsers.length}`);
        if (completeUsers.length > 0) {
            console.log('First 5 examples:');
            completeUsers.slice(0, 5).forEach(user => {
                console.log(`- ${user.user_id} | ${user.email || 'No email'} | Address: ${user.address.substring(0, 10)}...`);
            });
            if (completeUsers.length > 5) {
                console.log(`... and ${completeUsers.length - 5} more with complete data`);
            }
        }
        
        console.log('\n=== USERS WITHOUT PRIVATE KEYS (not in MZS2) ===');
        console.log(`Count: ${incompleteUsers.length}`);
        if (incompleteUsers.length > 0) {
            console.log('First 10 examples:');
            incompleteUsers.slice(0, 10).forEach(user => {
                console.log(`- ${user.user_id} | ${user.email || 'No email'}`);
            });
            if (incompleteUsers.length > 10) {
                console.log(`... and ${incompleteUsers.length - 10} more without private keys`);
            }
        }
        
        // Save separate files for complete and incomplete users
        fs.writeFileSync('missing_users_with_private_keys.csv', 
            [csvHeader, ...completeUsers.map(user => fieldNames.map(field => {
                const value = user[field] || '';
                const escaped = value.toString().replace(/"/g, '""');
                return /[,"]/.test(escaped) ? `"${escaped}"` : escaped;
            }).join(','))].join('\n')
        );
        console.log('\n✅ Saved users WITH private keys to: missing_users_with_private_keys.csv');
        
        fs.writeFileSync('missing_users_without_private_keys.csv', 
            [csvHeader, ...incompleteUsers.map(user => fieldNames.map(field => {
                const value = user[field] || '';
                const escaped = value.toString().replace(/"/g, '""');
                return /[,"]/.test(escaped) ? `"${escaped}"` : escaped;
            }).join(','))].join('\n')
        );
        console.log('✅ Saved users WITHOUT private keys to: missing_users_without_private_keys.csv');
        
    } catch (error) {
        console.error('Error:', error);
    }
}

console.log('=== LIST MISSING USERS WITH COMPLETE DATA FROM BOTH CSV FILES ===');
listMissingUsersComplete();