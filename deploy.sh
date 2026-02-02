#!/bin/bash

# Deployment script for GAHANGA House Construction Dashboard
# Server: root@172.234.60.19
# Domain: nifla.space

set -e

echo "🚀 Deploying GAHANGA Dashboard to server..."

# Configuration
SERVER="root@172.234.60.19"
DOMAIN="nifla.space"
REMOTE_DIR="/var/www/nifla.space"
LOCAL_DIR="$(pwd)"

# Files to deploy
FILES=(
    "index.html"
    "app.js"
    "styles.css"
)

echo "📦 Preparing files for deployment..."

# Create deployment package
TEMP_DIR=$(mktemp -d)
cp -r "${FILES[@]}" "$TEMP_DIR/"

echo "📤 Uploading files to server..."

# Create remote directory if it doesn't exist
ssh $SERVER "mkdir -p $REMOTE_DIR"

# Copy files to server
scp "${FILES[@]}" $SERVER:$REMOTE_DIR/

echo "✅ Files uploaded successfully!"

echo "🔧 Setting up web server configuration..."

# Create nginx configuration
ssh $SERVER "cat > /etc/nginx/sites-available/nifla.space << 'NGINX_CONFIG'
server {
    listen 80;
    listen [::]:80;
    server_name nifla.space www.nifla.space;

    root $REMOTE_DIR;
    index index.html;

    location / {
        try_files \$uri \$uri/ =404;
    }

    # Enable CORS for Google Sheets API
    location ~* \.(js|css|html)$ {
        add_header Access-Control-Allow-Origin *;
        add_header Access-Control-Allow-Methods 'GET, POST, OPTIONS';
        add_header Access-Control-Allow-Headers 'DNT,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,Range';
    }

    # Cache static assets
    location ~* \.(jpg|jpeg|png|gif|ico|css|js)$ {
        expires 1y;
        add_header Cache-Control \"public, immutable\";
    }

    # Security headers
    add_header X-Frame-Options \"SAMEORIGIN\" always;
    add_header X-Content-Type-Options \"nosniff\" always;
    add_header X-XSS-Protection \"1; mode=block\" always;
}
NGINX_CONFIG
"

# Enable the site
ssh $SERVER "ln -sf /etc/nginx/sites-available/nifla.space /etc/nginx/sites-enabled/"

# Test nginx configuration
echo "🧪 Testing nginx configuration..."
ssh $SERVER "nginx -t"

# Reload nginx
echo "🔄 Reloading nginx..."
ssh $SERVER "systemctl reload nginx"

# Set proper permissions
ssh $SERVER "chown -R www-data:www-data $REMOTE_DIR"
ssh $SERVER "chmod -R 755 $REMOTE_DIR"

echo ""
echo "✅ Deployment complete!"
echo ""
echo "🌐 Your dashboard should be accessible at:"
echo "   http://nifla.space"
echo ""
echo "📝 Next steps:"
echo "   1. Configure DNS: Point nifla.space A record to 172.234.60.19"
echo "   2. Set up SSL certificate (optional):"
echo "      ssh $SERVER"
echo "      certbot --nginx -d nifla.space -d www.nifla.space"
echo ""
