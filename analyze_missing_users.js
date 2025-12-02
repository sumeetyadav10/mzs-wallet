require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const csvParser = require('csv-parser');

async function readCSV(filename) {
    return new Promise((resolve, reject) => {
        const results = [];
        fs.createReadStream(filename)
            .pipe(csvParser({
                mapHeaders: ({ header }) => header.trim()
            }))
            .on('data', (data) => {
                const cleanData = {};
                Object.keys(data).forEach(key => {
                    if (data[key] && data[key].trim() !== '') {
                        cleanData[key] = data[key].trim();
                    }
                });
                results.push(cleanData);
            })
            .on('end', () => {
                resolve(results);
            })
            .on('error', reject);
    });
}

async function analyzeMissingPatterns() {
    try {
        // Read all CSV files
        const mzs1Data = await readCSV('MZS1.csv');
        const mzs2Data = await readCSV('MZS2.csv');
        const missingData = await readCSV('missing_users_without_private_keys.csv');
        
        // Create a Set of all user IDs from MZS2 (with various normalizations)
        const mzs2UserIds = new Set();
        mzs2Data.forEach(user => {
            const userId = user.user_id || user.id;
            if (userId) {
                // Add original
                mzs2UserIds.add(userId);
                // Add without spaces and dashes
                mzs2UserIds.add(userId.replace(/[-\s]/g, ''));
                // Add digits only
                mzs2UserIds.add(userId.replace(/\D/g, ''));
            }
        });
        
        console.log(`Total users in MZS2: ${mzs2Data.length}`);
        console.log(`Total unique user ID variants in MZS2: ${mzs2UserIds.size}`);
        
        // Check patterns in missing users
        const patterns = {
            phoneNumbers: 0,
            emailFormat: 0,
            regularUsernames: 0,
            other: 0
        };
        
        const sampleMissing = [];
        missingData.forEach(user => {
            const userId = user.user_id;
            if (!userId) return;
            
            // Categorize by pattern
            if (/^010\d{8}$/.test(userId) || /^010\d{7}$/.test(userId)) {
                patterns.phoneNumbers++;
                if (patterns.phoneNumbers <= 5) {
                    sampleMissing.push(userId);
                }
            } else if (userId.includes('@')) {
                patterns.emailFormat++;
            } else if (/^[a-zA-Z]/.test(userId)) {
                patterns.regularUsernames++;
            } else {
                patterns.other++;
            }
        });
        
        console.log('\n=== Missing User Patterns ===');
        console.log(`Phone numbers (010...): ${patterns.phoneNumbers}`);
        console.log(`Email format: ${patterns.emailFormat}`);
        console.log(`Regular usernames: ${patterns.regularUsernames}`);
        console.log(`Other patterns: ${patterns.other}`);
        
        // Let's check if these phone numbers exist in MZS2 with different formatting
        console.log('\n=== Checking Sample Missing Phone Numbers ===');
        let foundCount = 0;
        
        for (const phoneNum of sampleMissing) {
            // Try various formats
            const formats = [
                phoneNum,
                phoneNum.substring(0, 3) + '-' + phoneNum.substring(3, 7) + '-' + phoneNum.substring(7),
                phoneNum.substring(0, 3) + ' ' + phoneNum.substring(3, 7) + ' ' + phoneNum.substring(7),
                phoneNum.substring(0, 3) + '-' + phoneNum.substring(3, 6) + '-' + phoneNum.substring(6)
            ];
            
            let found = false;
            for (const format of formats) {
                if (mzs2UserIds.has(format)) {
                    console.log(`✓ Found ${phoneNum} as: ${format}`);
                    found = true;
                    foundCount++;
                    break;
                }
            }
            
            if (!found) {
                console.log(`✗ NOT found: ${phoneNum} (tried ${formats.length} formats)`);
            }
        }
        
        console.log(`\nFound ${foundCount} out of ${sampleMissing.length} sample phone numbers`);
        
        // Check if any MZS2 entries don't have corresponding MZS1 entries
        const mzs1UserIds = new Set();
        mzs1Data.forEach(user => {
            const userId = user.user_id || user.id;
            if (userId) {
                mzs1UserIds.add(userId);
                mzs1UserIds.add(userId.replace(/[-\s]/g, ''));
            }
        });
        
        let mzs2OnlyCount = 0;
        mzs2Data.forEach(user => {
            const userId = user.user_id || user.id;
            if (userId) {
                const normalized = userId.replace(/[-\s]/g, '');
                if (!mzs1UserIds.has(userId) && !mzs1UserIds.has(normalized)) {
                    mzs2OnlyCount++;
                    if (mzs2OnlyCount <= 5) {
                        console.log(`\nUser in MZS2 but not MZS1: ${userId}`);
                    }
                }
            }
        });
        
        console.log(`\n=== Summary ===`);
        console.log(`Users in MZS1: ${mzs1Data.length}`);
        console.log(`Users in MZS2: ${mzs2Data.length}`);
        console.log(`Users in MZS2 but not MZS1: ${mzs2OnlyCount}`);
        
    } catch (error) {
        console.error('Error:', error);
    }
}

console.log('=== ANALYZING MISSING USER PATTERNS ===');
analyzeMissingPatterns();