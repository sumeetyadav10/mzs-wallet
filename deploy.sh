#!/bin/bash

# Exit on error
set -e

echo "Starting deployment process..."

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo "Please run as root"
    exit 1
fi

# Update system packages
echo "Updating system packages..."
apt update && apt upgrade -y

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
    apt install -y nodejs
else
    echo "Node.js is already installed"
fi

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
    echo "Installing PM2..."
    npm install -g pm2
else
    echo "PM2 is already installed"
fi

# Check if Nginx is installed
if ! command -v nginx &> /dev/null; then
    echo "Installing Nginx..."
    apt install -y nginx
else
    echo "Nginx is already installed"
fi

# Create application directory
echo "Setting up application directory..."
rm -rf /var/www/gptch-wallet
mkdir -p /var/www/gptch-wallet
cd /var/www/gptch-wallet

# Remove all contents of the directory to ensure a clean state
echo "Cleaning up the application directory..."
rm -rf /var/www/gptch-wallet/*

# Remove any existing .git directory to avoid confusion
echo "Cleaning up any previous git data..."
rm -rf .git

# Clone repository using SSH
echo "Cloning repository using SSH..."
git clone git@github.com:sumeetyadav10/gptch-wallet.git .

# Install dependencies
echo "Installing dependencies..."
npm install

# Create .env file
echo "Setting up environment variables..."
cat > .env << EOL
FIREBASE_PROJECT_ID=walletlandingpage
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-fbsvc@walletlandingpage.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvwIBADANBgkqhkiG9w0BAQEFAASCBKkwggSlAgEAAoIBAQDr9x6mXZlfY0mh\n/K8sb7wFnbBUV8ek0c+rN/4MMgM/B8OA5VgxV7lKhDqEcUCbaYOjPv+yxumjLomg\nbQQQGL9Lggk6o7g/ECz4JGy4TPaXzdrV5G8T8LeyeFY7mSE0wA5EqCa1dQ16eTN4\nbUD0Y0ZMbyRl4F8AleO7K8fAPhI59Di0GwFWWtXaIjFGkhJbCR3dQDwjIAAGinIc\noRuSMKIZs3DGdn36WqXy1Yep6bZrP1fcWXjHUfn15Bc0r07B+3ZQ2fvby8AOgeuV\nvR+pw0hF9vdylEF/dWJ8nBXFcP53bpVe7jjuORMrbuqf7CmqHLiezFmzKdr2MsJn\nAfFa1iqBAgMBAAECggEAITL/8jbNlzTkPYEMkXM4EE83Kaq/CWLGteeXHBamS8Y3\nHMnH3oth48jWZd98UFFoZr28oqXnZeDslrB3557fvUsyqrgxule3iAMx871KXaHm\nNf1hnnvaEKdrNI/vMtmJuGGzLoklSBPI6NrwTmIwWB00EQxgOXgdVi6K+HKTRGlh\npmkYRSSXbJvrC2yOQ+SbzoxtoxbaEOS5csvs14uS96FnXJs/chFG3w2Erlmjv9zT\nhqFzLTZ3LAHgtOmuKEnsHh1T8MxDykowJ7KUGwyU7F4Q6Nws4WTkfA1WU+UPasL4\n/HY3UElVsjrIRJ8OzaOuW/x7BILZDu1i5hnFkwbdpQKBgQD9eHf08FGw1nkbOJTz\nKX5H9rczstLz9VtIB2IgjJ45KxoXoQsZ9NLpNtWItYRQs8FL+AM1c19KrHz2VF7d\nb5Mhk3xKJUgvaa+RLhYupz8XMrOy8b5QTw9rbiE0Q+X4k89hVwUssqfJbN6j8Wg9\nHrEbtVhvRjGI2yv/JhI1ZUp7hQKBgQDuUe5dnvYsX3xQM+ITMbZggyDr930RElXW\nGtgHnsl1IqUs+WXA1wqDBpp+PW0JVXGOVTXDpzFbZKpKDF79IC5kKUqCEwQfDhZl\nX+gUeyZ/aUnFOwr90ARL6sm/EOHLxzkRhdGpzd60/GZ9/TyNm+Cp6+Etwl4CarH6\nV/t68VWNzQKBgQCJotfojnKdhui+Skw/eiGTbDnw/cKlLG9DvpafPBxSyL/jYtSH\nZLT+ZIMxN/fAZsuot+TuKlbtUpqMnCXjMkn/qnmMPZBkBoyKVi8/aBvPOf3wRmrk\navnhiSzIl7IR+BldLwalTeHkc5S2C0liHv9nH2MFEWWmffT3GLI8gmMejQKBgQC4\n499lypl5u2qaXmYaNgsjvReheZQR1oO5Y4IOB2aL9aDnz2Tdwvdox4q8PbOF9j/v\nCLR5YhCssuBaKlbXUkwrcM1ZNJ+R6D//zfQjT5eCaZDN7wyL9QIgU7rI/LPwgFMK\nASOz9P++scJiJEECK9iUe2drNMvyXAxQCEoWC30wUQKBgQC1QfwAZuB3Qe6Hqyq0\nFJuKYSgfclkxr0xOxCYClIe7bT/OGoVt9Ga0zE3xGI3sgocsfEsmlB9YgQGq0HKq\n/4RP4EnsuKqJk1peUr6I2HMRHRbaND4VKoy6hE4iVaDenzb1jEINcaiDqQ7vNu+4\nTtW+JVGFhn9WGxdN7wsrb0jf/w==\n-----END PRIVATE KEY-----\n"
NEXT_PUBLIC_POLYGON_RPC_URL=https://polygon-rpc.com
EOL

# Build the application
echo "Building the application..."
npm run build

# Configure Nginx
echo "Configuring Nginx..."
cat > /etc/nginx/sites-available/gptch-wallet << EOL
server {
    listen 80;
    server_name _;
    
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN";
    add_header X-XSS-Protection "1; mode=block";
    add_header X-Content-Type-Options "nosniff";
    add_header Referrer-Policy "strict-origin-when-cross-origin";
    add_header Content-Security-Policy "default-src 'self' https: 'unsafe-inline' 'unsafe-eval'; img-src 'self' data: https:; font-src 'self' data: https:;";

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Static files
    location /_next/static {
        alias /var/www/gptch-wallet/.next/static;
        expires 365d;
        access_log off;
    }

    # Error pages
    error_page 404 /404.html;
    error_page 500 502 503 504 /50x.html;
}
EOL

# Enable the site
echo "Enabling Nginx site..."
ln -sf /etc/nginx/sites-available/gptch-wallet /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Test Nginx configuration
echo "Testing Nginx configuration..."
nginx -t

# Restart Nginx
echo "Restarting Nginx..."
systemctl restart nginx

# Start the application with PM2
echo "Starting application with PM2..."
pm2 delete gptch-wallet 2>/dev/null || true
pm2 start npm --name "gptch-wallet" -- start
pm2 save
pm2 startup

echo "Deployment completed successfully!"
echo "Your application should now be running at http://91.108.105.43" 