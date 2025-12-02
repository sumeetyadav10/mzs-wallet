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
const BATCH_SIZE = 500;
const DRY_RUN = false; // Set to false to actually add users
const PROGRESS_FILE = 'add_users_progress.json';

// Load progress if exists
function loadProgress() {
    try {
        if (fs.existsSync(PROGRESS_FILE)) {
            const progress = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
            console.log('🔄 Found previous progress, resuming from where we left off...');
            console.log(`   Previously processed: ${progress.processed_count} users`);
            console.log(`   Previously added: ${progress.restored_count} users`);
            return progress;
        }
    } catch (error) {
        console.log('⚠️ Could not load progress file, starting fresh');
    }
    return null;
}

// Save progress
function saveProgress(progress) {
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

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

async function checkExistingUserIds() {
    console.log('\n=== CHECKING EXISTING USER_ID FIELDS IN MZS COLLECTION ===\n');
    
    // Get all user_id FIELD values from mzs collection
    const existingUserIds = new Set();
    const mzsSnapshot = await db.collection('mzs').select('user_id').get();
    
    mzsSnapshot.forEach(doc => {
        const data = doc.data();
        // ONLY check the user_id FIELD, not document ID
        if (data.user_id) {
            existingUserIds.add(data.user_id);
        }
    });
    
    console.log(`Found ${existingUserIds.size} user_id fields in mzs collection`);
    return existingUserIds;
}

async function addMissingUsers() {
    try {
        // Read from the file with complete data (merged from MZS1 and MZS2)
        console.log('Reading CSV file with complete user data...');
        const completeUsersData = await readCSV('missing_users_with_private_keys.csv');
        
        // Use users that have complete data including private keys
        const allUsers = [...completeUsersData];
        console.log(`Total users with complete data from CSV: ${allUsers.length}`);
        
        // Get existing user_id field values
        const existingUserIds = await checkExistingUserIds();
        
        // Filter out users that need to be added
        const usersToAdd = [];
        const skippedUsers = [];
        
        // Load previous progress if exists
        const previousProgress = loadProgress();
        const processedUserIds = previousProgress ? new Set(previousProgress.processed_user_ids) : new Set();
        const restoredUserIdsFromPrevious = previousProgress ? previousProgress.restored_user_ids : [];
        
        // Track user_ids we're planning to add to avoid duplicates
        const userIdsToAdd = new Set();
        
        allUsers.forEach(user => {
            // Handle both 'user_id' and 'id' fields
            const userId = user.user_id || user.id;
            
            if (userId) {
                // Skip if already processed in previous run
                if (processedUserIds.has(userId)) {
                    console.log(`Already processed in previous run: ${userId}`);
                    return;
                }
                
                // Check if already in DB
                if (existingUserIds.has(userId)) {
                    skippedUsers.push(userId);
                } 
                // Check if we've already planned to add this user_id (avoid duplicates in CSV)
                else if (userIdsToAdd.has(userId)) {
                    console.log(`Duplicate user_id in CSV files, skipping: ${userId}`);
                } 
                // New user to add
                else {
                    // Ensure user_id field is set
                    user.user_id = userId;
                    usersToAdd.push(user);
                    userIdsToAdd.add(userId);
                }
            } else {
                console.log('Warning: User without user_id or id found:', user);
            }
        });
        
        console.log(`\n=== ANALYSIS ===`);
        console.log(`Users to add: ${usersToAdd.length}`);
        console.log(`Users already in mzs (skipped): ${skippedUsers.length}`);
        
        if (DRY_RUN) {
            console.log('\n=== DRY RUN MODE - NO CHANGES WILL BE MADE ===');
            console.log('\nSample of users that would be added:');
            usersToAdd.slice(0, 5).forEach(user => {
                console.log(`\nUser ID: ${user.user_id}`);
                console.log(`Address: ${user.address || user.wallet_address || 'N/A'}`);
                console.log(`Email: ${user.email || 'N/A'}`);
                console.log(`Auth Email: ${user.auth_email || 'N/A'}`);
                console.log(`Has Password: ${user.password_hash ? 'Yes' : 'No'}`);
                console.log(`Has Private Key: ${user.private_key ? 'Yes' : 'No'}`);
            });
            
            console.log('\n\nTo actually add these users, set DRY_RUN = false in the script');
            return;
        }
        
        // Add users in batches
        console.log('\n=== ADDING MISSING USERS ===');
        let successCount = previousProgress ? previousProgress.restored_count : 0;
        let errorCount = previousProgress ? previousProgress.error_count : 0;
        const restoredUserIds = [...restoredUserIdsFromPrevious];
        const allProcessedUserIds = new Set(processedUserIds);
        
        // SAFETY CHECK: Verify no duplicates in our add list
        const uniqueCheck = new Set(usersToAdd.map(u => u.user_id));
        if (uniqueCheck.size !== usersToAdd.length) {
            console.error('ERROR: Duplicate user_ids detected in users to add!');
            return;
        }
        
        if (previousProgress) {
            console.log(`Resuming from previous progress...`);
            console.log(`Already restored: ${restoredUserIds.length} users`);
        }
        
        for (let i = 0; i < usersToAdd.length; i += BATCH_SIZE) {
            const batch = db.batch();
            const batchUsers = usersToAdd.slice(i, Math.min(i + BATCH_SIZE, usersToAdd.length));
            
            for (const user of batchUsers) {
                try {
                    // DOUBLE CHECK: Make sure this user_id doesn't exist
                    // This is a safety check in case something changed between our initial check
                    const existingDoc = await db.collection('mzs').where('user_id', '==', user.user_id).limit(1).get();
                    if (!existingDoc.empty) {
                        console.log(`✓ ALREADY EXISTS: User ${user.user_id} already in database, skipping (no changes made)`);
                        continue;
                    }
                    
                    // Validate required fields before adding
                    if (!user.user_id) {
                        console.log(`✗ ERROR: User missing user_id field, skipping`);
                        errorCount++;
                        continue;
                    }
                    
                    if (!user.password_hash) {
                        console.log(`⚠️ WARNING: User ${user.user_id} missing password_hash`);
                    }
                    
                    if (!user.address) {
                        console.log(`⚠️ WARNING: User ${user.user_id} missing address`);
                    }
                    
                    if (!user.private_key) {
                        console.log(`⚠️ WARNING: User ${user.user_id} missing private_key`);
                    }
                    
                    // Prepare user data - keep ALL fields from CSV exactly as they are
                    const userData = {
                        // Core fields from CSV
                        user_id: user.user_id,
                        email: user.email || null,
                        password_hash: user.password_hash || null,
                        created_at: user.created_at || new Date().toISOString(),
                        address: user.address || null,
                        private_key: user.private_key || null,
                        
                        // Additional fields that might be in the CSV
                        auth_email: user.auth_email || null,
                        
                        // Metadata fields
                        migrated: false, // Mark as not migrated since they're being restored
                        restored_from_csv: true,
                        restored_at: new Date().toISOString()
                    };
                    
                    // Remove any empty fields
                    Object.keys(userData).forEach(key => {
                        if (userData[key] === '' || userData[key] === null || userData[key] === undefined) {
                            delete userData[key];
                        }
                    });
                    
                    // Create document with auto-generated ID, user_id will be a field
                    const docRef = db.collection('mzs').doc();
                    batch.set(docRef, userData);
                    restoredUserIds.push(user.user_id);
                    allProcessedUserIds.add(user.user_id);
                    successCount++;
                    
                    // Log successful addition
                    console.log(`➕ ADDED: User ${user.user_id} (email: ${user.email || 'none'}, has private_key: ${!!user.private_key})`);
                    
                    // Log first few additions in detail
                    if (successCount <= 3) {
                        console.log(`   Details: address=${userData.address ? userData.address.substring(0, 20) + '...' : 'none'}`);
                    }
                } catch (error) {
                    console.error(`Error preparing user ${user.user_id}:`, error);
                    errorCount++;
                    allProcessedUserIds.add(user.user_id); // Mark as processed even if error
                }
            }
            
            try {
                await batch.commit();
                console.log(`Batch ${Math.floor(i / BATCH_SIZE) + 1} committed: ${batchUsers.length} users`);
                
                // Save progress after each batch
                if (!DRY_RUN) {
                    const progress = {
                        timestamp: new Date().toISOString(),
                        processed_count: allProcessedUserIds.size,
                        processed_user_ids: Array.from(allProcessedUserIds),
                        restored_count: restoredUserIds.length,
                        restored_user_ids: restoredUserIds,
                        error_count: errorCount,
                        last_batch: Math.floor(i / BATCH_SIZE) + 1
                    };
                    saveProgress(progress);
                    console.log(`Progress saved - can resume if interrupted`);
                }
            } catch (error) {
                console.error('Error committing batch:', error);
                errorCount += batchUsers.length;
                successCount -= batchUsers.length;
            }
        }
        
        console.log('\n=== SUMMARY ===');
        console.log(`Successfully added: ${successCount} users`);
        console.log(`Errors: ${errorCount} users`);
        console.log(`Skipped (already exist): ${skippedUsers.length} users`);
        
        if (restoredUserIds.length > 0) {
            console.log('\n=== RESTORED USER IDs ===');
            console.log(`Total restored: ${restoredUserIds.length}`);
            console.log('\nList of restored user_ids:');
            restoredUserIds.forEach(userId => {
                console.log(`  - ${userId}`);
            });
        }
        
        // Save detailed report
        const report = {
            timestamp: new Date().toISOString(),
            dry_run: DRY_RUN,
            total_csv_users: allUsers.length,
            users_to_add: usersToAdd.length,
            users_added: successCount,
            errors: errorCount,
            skipped: skippedUsers.length,
            skipped_user_ids: skippedUsers,
            restored_user_ids: restoredUserIds
        };
        
        fs.writeFileSync('add_missing_users_report.json', JSON.stringify(report, null, 2));
        console.log('\nDetailed report saved to add_missing_users_report.json');
        
        // Also save just the restored user_ids to a separate file
        if (!DRY_RUN && restoredUserIds.length > 0) {
            fs.writeFileSync('restored_user_ids.txt', restoredUserIds.join('\n'));
            console.log(`Restored user IDs list saved to restored_user_ids.txt`);
            
            // Clean up progress file on successful completion
            if (fs.existsSync(PROGRESS_FILE)) {
                fs.unlinkSync(PROGRESS_FILE);
                console.log('Progress file cleaned up after successful completion');
            }
        }
        
        console.log('\n✅ Script completed successfully!');
        
    } catch (error) {
        console.error('Fatal error:', error);
    }
}

// Run the script
console.log('=== ADD MISSING USERS WITH COMPLETE DATA TO MZS COLLECTION ===');
console.log('This script will:');
console.log('1. Read 162 users from missing_users_with_private_keys.csv');
console.log('2. These users have complete data from both MZS1 and MZS2 CSVs');
console.log('3. Check if user_id already exists in mzs collection');
console.log('4. Add only missing users with all fields including:');
console.log('   - user_id, email, password_hash (from MZS1)');
console.log('   - address, private_key (from MZS2)');
console.log('5. Create new documents with user_id as a field');
console.log('\nCurrent mode: ' + (DRY_RUN ? 'DRY RUN' : 'LIVE - WILL MAKE CHANGES'));
console.log('============================================\n');

addMissingUsers();