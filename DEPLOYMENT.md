# Deployment Guide - GAHANGA Dashboard

## Server Information
- **Server IP:** 172.234.60.19
- **SSH User:** root
- **Domain:** nifla.space
- **Web Server:** Nginx
- **Document Root:** /var/www/nifla.space

## Prerequisites

1. **SSH Access:**
   ```bash
   ssh root@172.234.60.19
   ```

2. **Server Requirements:**
   - Nginx installed
   - Proper DNS configuration

## Quick Deployment

### Option 1: Automated Deployment Script

```bash
# Make script executable
chmod +x deploy.sh

# Run deployment
./deploy.sh
```

### Option 2: Manual Deployment

#### Step 1: Connect to Server
```bash
ssh root@172.234.60.19
```

#### Step 2: Create Directory Structure
```bash
mkdir -p /var/www/nifla.space
cd /var/www/nifla.space
```

#### Step 3: Upload Files
From your local machine:
```bash
scp index.html app.js styles.css root@172.234.60.19:/var/www/nifla.space/
```

#### Step 4: Configure Nginx
```bash
# On the server, create nginx config
nano /etc/nginx/sites-available/nifla.space
```

Paste this configuration:
```nginx
server {
    listen 80;
    listen [::]:80;
    server_name nifla.space www.nifla.space;

    root /var/www/nifla.space;
    index index.html;

    location / {
        try_files $uri $uri/ =404;
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
        add_header Cache-Control "public, immutable";
    }

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
}
```

#### Step 5: Enable Site
```bash
ln -sf /etc/nginx/sites-available/nifla.space /etc/nginx/sites-enabled/
nginx -t  # Test configuration
systemctl reload nginx
```

#### Step 6: Set Permissions
```bash
chown -R www-data:www-data /var/www/nifla.space
chmod -R 755 /var/www/nifla.space
```

## DNS Configuration

### Configure DNS Records

Point your domain to the server:

1. **A Record:**
   - Name: `@` or `nifla.space`
   - Type: A
   - Value: `172.234.60.19`
   - TTL: 3600

2. **CNAME Record (optional):**
   - Name: `www`
   - Type: CNAME
   - Value: `nifla.space`
   - TTL: 3600

### Verify DNS
```bash
# Check if DNS is configured
dig nifla.space
# or
nslookup nifla.space
```

## SSL Certificate (HTTPS) - Recommended

### Install Certbot
```bash
# On the server
apt update
apt install certbot python3-certbot-nginx -y
```

### Get SSL Certificate
```bash
certbot --nginx -d nifla.space -d www.nifla.space
```

This will:
- Automatically configure SSL
- Set up auto-renewal
- Redirect HTTP to HTTPS

## Updating the Dashboard

### Quick Update
```bash
# From your local machine
./deploy.sh
```

### Manual Update
```bash
# Upload updated files
scp index.html app.js styles.css root@172.234.60.19:/var/www/nifla.space/

# No need to restart nginx for static files
```

## Troubleshooting

### Check Nginx Status
```bash
systemctl status nginx
```

### Check Nginx Logs
```bash
tail -f /var/log/nginx/error.log
tail -f /var/log/nginx/access.log
```

### Test Nginx Configuration
```bash
nginx -t
```

### Check File Permissions
```bash
ls -la /var/www/nifla.space/
```

### Verify Files Are Served
```bash
curl http://localhost
# or
curl http://172.234.60.19
```

## Security Considerations

1. **Firewall:**
   ```bash
   # Allow HTTP and HTTPS
   ufw allow 80/tcp
   ufw allow 443/tcp
   ```

2. **Regular Updates:**
   ```bash
   apt update && apt upgrade -y
   ```

3. **Backup:**
   ```bash
   # Backup dashboard files
   tar -czf dashboard-backup-$(date +%Y%m%d).tar.gz /var/www/nifla.space/
   ```

## Monitoring

### Check Dashboard Access
```bash
# From server
curl -I http://nifla.space

# Should return HTTP 200
```

### Monitor Logs
```bash
# Real-time access logs
tail -f /var/log/nginx/access.log | grep nifla.space
```

## File Structure on Server

```
/var/www/nifla.space/
├── index.html
├── app.js
└── styles.css
```

## Notes

- The dashboard fetches data directly from Google Sheets
- No backend server is required
- All processing happens in the browser
- CORS is handled by the Google Sheets published URL
- The dashboard will automatically update when Google Sheet data changes

## Support

If you encounter issues:
1. Check nginx logs: `/var/log/nginx/error.log`
2. Verify DNS is pointing correctly
3. Ensure port 80/443 is open in firewall
4. Check file permissions
