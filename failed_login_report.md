# MZS Wallet Failed Login Attempts Report

## Summary
Based on the recent server logs, here are all the failed login attempts:

## Failed Login Attempts by Email

### 1. Restored Users (From deleted users list)
- **bless07073@gmail.com** - Multiple failed attempts ✅ (Restored user)
- **a01041837118@gmail.com** - Multiple failed attempts ✅ (Restored user)
- **hjihai@naver.com** - Failed attempt ✅ (Restored user)

### 2. Special Case - Username vs Email Issue
- **suda159** - 3 failed attempts on 2025-12-01
  - Timestamps: 07:24:26, 07:24:35, 07:38:43
  - IP: 112.173.142.109
  - Issue: User trying to login with username "suda159" instead of email "suda159@hotmail.com"
  - This user IS in the restored list but logging in incorrectly

### 3. Unknown/Other Users (Not in deleted users list)
- **tlsaudgp@gmail.com** - Multiple failed attempts
- **kimek0463@gmail.com** - At least 3 failed attempts
- **seongtaesin@gmail.com** - Multiple failed attempts
- **a0103285653664@gmail.com** - Multiple failed attempts
- **wcyn0097@gmail.com** - Failed attempt
- **oks8003@gmail.com** - Failed attempt
- **h692773@gmail.com** - At least 4 failed attempts
- **izzima45@gmail.com** - Failed attempt
- **min720525@daum.net** - Multiple failed attempts
- **j21449097@gmail.com** - At least 3 failed attempts
- **a67283425@gmail.com** - Multiple failed attempts
- **missuni051938@gmail.com** - Failed attempt
- **jskim22929@daum.net** - Failed attempt
- **namjubag008@gmail.com** - Failed attempt

## Common Error Types
1. **"User not found in Firestore"** - User doesn't exist in database
2. **"Failed to create secure session"** - JWT token generation issue (Error: "subject" must be a string)
3. **"user_not_found"** - OTP generation failure due to missing user

## Recommendations
1. For restored users still failing - they may need to clear cache or retry
2. For suda159 - needs to use full email "suda159@hotmail.com" not just username
3. Unknown users - these accounts may not exist or could be from different services