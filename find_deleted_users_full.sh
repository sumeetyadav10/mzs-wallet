#!/bin/bash

# Find all users who couldn't login
echo "Finding deleted users and their auth_emails..."

# Get list of emails that failed to login
failed_emails=$(ssh root@91.108.105.43 "grep -E 'User not found|user_not_found' /root/.pm2/logs/mzs-wallet*.log | grep -oE 'email: .([^\"]+)' | sed 's/email: .//' | sed 's/.$//' | sort | uniq")

# For each failed email, find their user data in old logs
echo "user_id,email,auth_email,wallet_address"
echo "---"

for email in $failed_emails; do
    # Search for this email in old logs to find their user data
    user_data=$(ssh root@91.108.105.43 "grep -B5 -A10 \"email: '$email'\" /root/.pm2/logs/mzswallet-out.log | grep -E '(user_id:|auth_email:|address:|User data found)' | head -20" 2>/dev/null)
    
    if [ ! -z "$user_data" ]; then
        # Extract user_id, auth_email, and address
        user_id=$(echo "$user_data" | grep -oE "user_id: '[^']+'" | sed "s/user_id: '//" | sed "s/'$//" | head -1)
        auth_email=$(echo "$user_data" | grep -oE "auth_email: '[^']+'" | sed "s/auth_email: '//" | sed "s/'$//" | head -1)
        address=$(echo "$user_data" | grep -oE "address: '0x[^']+'" | sed "s/address: '//" | sed "s/'$//" | head -1)
        
        if [ ! -z "$user_id" ] || [ ! -z "$auth_email" ]; then
            echo "$user_id,$email,$auth_email,$address"
        fi
    fi
done