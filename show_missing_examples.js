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

async function showMissingExamples() {
    try {
        // Read the CSV files
        const mzs1Data = await readCSV('MZS1.csv');
        const mzs2Data = await readCSV('MZS2.csv');
        
        // Create comprehensive map of MZS2 users with ALL possible variations
        const mzs2Map = new Map();
        console.log('=== Building MZS2 map with all possible variations ===\n');
        
        mzs2Data.forEach(user => {
            const userId = user.user_id || user.id;
            if (userId) {
                // Store all possible variations
                const variations = [
                    userId,
                    userId.replace(/[-\s]/g, ''), // Remove dashes and spaces
                    userId.replace(/\D/g, ''), // Digits only
                ];
                
                // Also try different dash/space patterns
                const digits = userId.replace(/\D/g, '');
                if (digits.length >= 10) {
                    variations.push(
                        digits.substring(0, 3) + '-' + digits.substring(3, 7) + '-' + digits.substring(7),
                        digits.substring(0, 3) + '-' + digits.substring(3, 6) + '-' + digits.substring(6),
                        digits.substring(0, 3) + ' ' + digits.substring(3, 7) + ' ' + digits.substring(7),
                        digits.substring(0, 3) + digits.substring(3)
                    );
                }
                
                variations.forEach(v => {
                    if (v) mzs2Map.set(v, user);
                });
            }
        });
        
        console.log(`MZS2 map contains ${mzs2Map.size} total variations for ${mzs2Data.length} users\n`);
        
        // Find examples of users only in MZS1
        console.log('=== Examples of users ONLY in MZS1 (not in MZS2) ===\n');
        let exampleCount = 0;
        const maxExamples = 10;
        
        for (const user of mzs1Data) {
            const userId = user.user_id || user.id;
            if (!userId) continue;
            
            // Check all possible formats
            const formats = [
                userId,
                userId.replace(/[-\s]/g, ''),
                userId.replace(/\D/g, ''),
            ];
            
            // For phone numbers, try additional formats
            const digits = userId.replace(/\D/g, '');
            if (digits.length >= 10 && digits.startsWith('010')) {
                formats.push(
                    digits.substring(0, 3) + '-' + digits.substring(3, 7) + '-' + digits.substring(7),
                    digits.substring(0, 3) + '-' + digits.substring(3, 6) + '-' + digits.substring(6),
                    digits.substring(0, 3) + ' ' + digits.substring(3, 7) + ' ' + digits.substring(7)
                );
            }
            
            let foundInMzs2 = false;
            let foundAs = null;
            
            for (const format of formats) {
                if (mzs2Map.has(format)) {
                    foundInMzs2 = true;
                    foundAs = format;
                    break;
                }
            }
            
            if (!foundInMzs2 && exampleCount < maxExamples) {
                console.log(`Example ${exampleCount + 1}:`);
                console.log(`  User ID: ${userId}`);
                console.log(`  Email: ${user.email || 'No email'}`);
                console.log(`  Password Hash: ${user.password_hash ? user.password_hash.substring(0, 20) + '...' : 'None'}`);
                console.log(`  Created: ${user.created_at || 'Unknown'}`);
                console.log(`  Tried formats: ${formats.join(', ')}`);
                console.log('  Status: NOT FOUND in MZS2\n');
                exampleCount++;
            }
        }
        
        // Now show examples that ARE found (for comparison)
        console.log('\n=== Examples of users found in BOTH MZS1 and MZS2 ===\n');
        exampleCount = 0;
        
        for (const user of mzs1Data) {
            const userId = user.user_id || user.id;
            if (!userId) continue;
            
            // Check all possible formats
            const formats = [
                userId,
                userId.replace(/[-\s]/g, ''),
                userId.replace(/\D/g, ''),
            ];
            
            let foundInMzs2 = false;
            let foundAs = null;
            let mzs2User = null;
            
            for (const format of formats) {
                if (mzs2Map.has(format)) {
                    foundInMzs2 = true;
                    foundAs = format;
                    mzs2User = mzs2Map.get(format);
                    break;
                }
            }
            
            if (foundInMzs2 && exampleCount < 5) {
                console.log(`Example ${exampleCount + 1}:`);
                console.log(`  MZS1 User ID: ${userId}`);
                console.log(`  Found in MZS2 as: ${foundAs}`);
                console.log(`  MZS2 data:`);
                console.log(`    - Address: ${mzs2User.address ? mzs2User.address.substring(0, 20) + '...' : 'None'}`);
                console.log(`    - Private Key: ${mzs2User.private_key ? mzs2User.private_key.substring(0, 20) + '...' : 'None'}`);
                console.log('');
                exampleCount++;
            }
        }
        
        // Debug: Let's check a specific missing user
        console.log('\n=== Detailed check for specific missing user: 01011115555 ===');
        const testUserId = '01011115555';
        
        // Check if it exists in MZS2 in any form
        console.log('Checking all possible variations:');
        const variations = [
            testUserId,
            '010-1111-5555',
            '010 1111 5555',
            '010-111-5555',
            '01011115555'
        ];
        
        variations.forEach(v => {
            console.log(`  Checking "${v}": ${mzs2Map.has(v) ? 'FOUND' : 'NOT FOUND'}`);
        });
        
        // Show some actual MZS2 user IDs for comparison
        console.log('\n=== Sample of actual user IDs in MZS2 ===');
        let sampleCount = 0;
        for (const [key, user] of mzs2Map) {
            if (sampleCount >= 10) break;
            if (key.startsWith('010') && key.length >= 10) {
                console.log(`  ${key}`);
                sampleCount++;
            }
        }
        
    } catch (error) {
        console.error('Error:', error);
    }
}

showMissingExamples();