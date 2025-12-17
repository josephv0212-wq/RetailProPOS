# VPS Deployment Guide - RetailPro POS

Complete guide to deploy your RetailPro POS application to a VPS with HTTPS using MobaXterm (SSH).

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [VPS Preparation](#vps-preparation)
3. [Transfer Files to VPS](#transfer-files-to-vps)
4. [Install Dependencies](#install-dependencies)
5. [Configure Environment Variables](#configure-environment-variables)
6. [Build Frontend](#build-frontend)
7. [Setup Process Manager (PM2)](#setup-process-manager-pm2)
8. [Configure Nginx Reverse Proxy](#configure-nginx-reverse-proxy)
9. [Setup SSL Certificate (HTTPS)](#setup-ssl-certificate-https)
10. [Configure Firewall](#configure-firewall)
11. [Start Services](#start-services)
12. [Troubleshooting](#troubleshooting)

---

## Prerequisites

Before starting, ensure you have:

- ✅ VPS with Ubuntu 20.04+ or Debian 11+ (recommended)
- ✅ Root or sudo access to your VPS
- ✅ Domain name pointing to your VPS IP (for SSL certificate)
- ✅ MobaXterm installed on your Windows machine
- ✅ SSH credentials (IP address, username, password/key)

---

## VPS Preparation

### Step 1: Connect to VPS via MobaXterm

1. Open **MobaXterm**
2. Click **Session** → **SSH**
3. Enter your VPS details:
   - **Remote host**: Your VPS IP address
   - **Username**: `root` or your sudo user
   - **Port**: `22` (default)
   - **Specify username**: Check this
4. Click **OK** and enter your password when prompted

### Step 2: Update System Packages

```bash
sudo apt update
sudo apt upgrade -y
```

### Step 3: Install Node.js

**This application was built with Node.js v23.11.0.** You can use Node.js 23.x (current) or Node.js 20.x (LTS).

#### Option A: Node.js 23.x (Current - Matches Development)

```bash
# Install Node.js 23.x (current version - matches your development environment)
curl -fsSL https://deb.nodesource.com/setup_23.x | sudo -E bash -
sudo apt install -y nodejs

# Verify installation
node --version  # Should show v23.x
npm --version
```

#### Option B: Node.js 20.x (LTS - Recommended for Production)

```bash
# Install Node.js 20.x (LTS - Long Term Support, more stable for production)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify installation
node --version  # Should show v20.x
npm --version
```

**Recommendation**: 
- Use **Node.js 23.x** if you want to match your development environment exactly
- Use **Node.js 20.x (LTS)** for production if you prefer long-term support and stability

Both versions will work with this application.

### Step 4: Install Nginx

```bash
sudo apt install -y nginx

# Start and enable Nginx
sudo systemctl start nginx
sudo systemctl enable nginx

# Verify Nginx is running
sudo systemctl status nginx
```

### Step 5: Install PM2 (Process Manager)

```bash
sudo npm install -g pm2

# Verify installation
pm2 --version
```

### Step 6: Install Certbot (for SSL certificates)

```bash
sudo apt install -y certbot python3-certbot-nginx
```

---

## Transfer Files to VPS

### Option A: Using MobaXterm SFTP (Recommended)

1. In MobaXterm, click **Session** → **SFTP**
2. Enter your VPS details (same as SSH)
3. Navigate to `/home/your-username/` or `/var/www/` in the remote panel
4. In the local panel, navigate to your project folder
5. Drag and drop the entire project folder to the remote panel
   - Or right-click → **Upload to current folder**

**Important**: Exclude `node_modules` folders before uploading to save time:
- Delete or exclude: `node_modules/`, `client/node_modules/`, `server/node_modules/`
- You can also exclude: `.git/`, `debug.log`, `*.log`

### Option B: Using Git (Alternative)

If your code is in a Git repository:

```bash
# On VPS, install git
sudo apt install -y git

# Clone your repository
cd /var/www
sudo git clone <your-repository-url> retailpro-pos
cd retailpro-pos
```

### Option C: Using SCP via MobaXterm Terminal

```bash
# In MobaXterm terminal, from your local machine
scp -r C:\Users\Admin\Documents\GitHub\RetailProPOSBackend\RetailProPOS root@YOUR_VPS_IP:/var/www/retailpro-pos
```

### Recommended Directory Structure

```bash
# Create application directory
sudo mkdir -p /var/www/retailpro-pos
sudo chown -R $USER:$USER /var/www/retailpro-pos

# Move your files here (after transfer)
# Your structure should be:
# /var/www/retailpro-pos/
#   ├── client/
#   ├── server/
#   ├── package.json
#   └── ...
```

---

## Install Dependencies

```bash
# Navigate to project directory
cd /var/www/retailpro-pos

# Install root dependencies
npm install

# Install server dependencies
cd server
npm install

# Install client dependencies
cd ../client
npm install

# Return to root
cd ..
```

---

## Configure Environment Variables

### Step 1: Create `.env` file for Server

```bash
cd /var/www/retailpro-pos/server
nano .env
```

### Step 2: Add Required Environment Variables

```env
# Required
JWT_SECRET=your-super-secret-jwt-key-change-this-to-random-string
NODE_ENV=production
PORT=3000

# Database Configuration
# Option 1: Use PostgreSQL (Cloud)
DATABASE_SETTING=cloud
DATABASE_URL=postgresql://username:password@localhost:5432/retailpro_pos

# Option 2: Use SQLite (Local)
# DATABASE_SETTING=local
# (No DATABASE_URL needed for SQLite)

# Frontend URL (Your domain)
FRONTEND_URL=https://yourdomain.com,https://www.yourdomain.com

# Optional: Registration Security
REGISTRATION_KEY=your-registration-secret-key

# Optional: Zoho Integration
ZOHO_CLIENT_ID=your-zoho-client-id
ZOHO_CLIENT_SECRET=your-zoho-client-secret
ZOHO_REFRESH_TOKEN=your-zoho-refresh-token
ZOHO_ORGANIZATION_ID=your-zoho-org-id

# Optional: Authorize.Net Payment Gateway
AUTHORIZE_NET_API_LOGIN_ID=your-api-login-id
AUTHORIZE_NET_TRANSACTION_KEY=your-transaction-key

# Optional: PAX Terminal
PAX_TERMINAL_IP=192.168.1.100
PAX_TERMINAL_PORT=10009
PAX_TERMINAL_TIMEOUT=30000

# Optional: Printer IPs
PRINTER_IP_LOC001=192.168.1.101
PRINTER_IP_LOC002=192.168.1.102
PRINTER_IP_LOC003=192.168.1.103
PRINTER_IP_LOC004=192.168.1.104
```

**Important Notes:**
- Replace `JWT_SECRET` with a strong random string (use: `openssl rand -base64 32`)
- Replace `yourdomain.com` with your actual domain
- For PostgreSQL, you'll need to install and setup PostgreSQL first (see below)

### Step 3: Save and Exit

Press `Ctrl+X`, then `Y`, then `Enter`

### Step 4: Setup PostgreSQL (If using cloud database)

```bash
# Install PostgreSQL
sudo apt install -y postgresql postgresql-contrib

# Switch to postgres user
sudo -u postgres psql

# In PostgreSQL prompt, run:
CREATE DATABASE retailpro_pos;
CREATE USER retailpro_user WITH PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE retailpro_pos TO retailpro_user;
\q

# Update DATABASE_URL in .env file
# DATABASE_URL=postgresql://retailpro_user:your_secure_password@localhost:5432/retailpro_pos
```

---

## Build Frontend

```bash
cd /var/www/retailpro-pos/client

# Build for production
npm run build

# This creates a 'dist' folder with static files
# Verify build was successful
ls -la dist/
```

---

## Setup Process Manager (PM2)

### Step 1: Create PM2 Ecosystem File

```bash
cd /var/www/retailpro-pos
nano ecosystem.config.js
```

Add the following content:

```javascript
module.exports = {
  apps: [{
    name: 'retailpro-pos-server',
    script: './server/server.js',
    cwd: '/var/www/retailpro-pos',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M'
  }]
};
```

### Step 2: Create Logs Directory

```bash
mkdir -p /var/www/retailpro-pos/logs
```

### Step 3: Start Application with PM2

```bash
cd /var/www/retailpro-pos
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save

# Setup PM2 to start on system boot
pm2 startup
# Follow the instructions shown (copy and run the command it provides)
```

### Step 4: Verify PM2 Status

```bash
pm2 status
pm2 logs retailpro-pos-server
```

---

## Configure Nginx Reverse Proxy

### Step 1: Create Nginx Configuration

```bash
sudo nano /etc/nginx/sites-available/retailpro-pos
```

Add the following configuration:

```nginx
# HTTP Server (will redirect to HTTPS)
server {
    listen 80;
    listen [::]:80;
    server_name yourdomain.com www.yourdomain.com;

    # Redirect all HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

# HTTPS Server
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name yourdomain.com www.yourdomain.com;

    # SSL Configuration (will be updated by Certbot)
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
    
    # SSL Security Settings
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Security Headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;

    # Root directory for frontend
    root /var/www/retailpro-pos/client/dist;
    index index.html;

    # Gzip Compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/x-javascript application/xml+rss application/json;

    # API Proxy - Backend Server
    location /api {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Increase timeout for long-running requests
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Frontend Static Files
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache static assets
    location ~* \.(jpg|jpeg|png|gif|ico|css|js|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Deny access to hidden files
    location ~ /\. {
        deny all;
    }
}
```

**Important**: Replace `yourdomain.com` with your actual domain name.

### Step 2: Enable the Site

```bash
# Create symbolic link
sudo ln -s /etc/nginx/sites-available/retailpro-pos /etc/nginx/sites-enabled/

# Remove default site (optional)
sudo rm /etc/nginx/sites-enabled/default

# Test Nginx configuration
sudo nginx -t

# If test passes, reload Nginx
sudo systemctl reload nginx
```

---

## Setup SSL Certificate (HTTPS)

### Step 1: Obtain SSL Certificate with Let's Encrypt

```bash
# Make sure your domain points to this VPS IP
# Run Certbot to get SSL certificate
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Follow the prompts:
# - Enter your email address
# - Agree to terms of service
# - Choose whether to redirect HTTP to HTTPS (recommended: Yes)
```

Certbot will automatically:
- Obtain the SSL certificate
- Update your Nginx configuration
- Setup auto-renewal

### Step 2: Test Auto-Renewal

```bash
# Test renewal process
sudo certbot renew --dry-run

# Certbot automatically renews certificates, but you can verify:
sudo systemctl status certbot.timer
```

### Step 3: Verify SSL Configuration

After Certbot runs, your Nginx config will be updated. Verify it:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

---

## Configure Firewall

### Step 1: Setup UFW (Uncomplicated Firewall)

```bash
# Allow SSH (important - don't lock yourself out!)
sudo ufw allow 22/tcp

# Allow HTTP and HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Enable firewall
sudo ufw enable

# Check status
sudo ufw status
```

### Step 2: Verify Ports are Open

```bash
# Check if ports are listening
sudo netstat -tulpn | grep -E ':(80|443|3000)'
```

---

## Start Services

### Step 1: Verify All Services

```bash
# Check PM2
pm2 status

# Check Nginx
sudo systemctl status nginx

# Check PostgreSQL (if using)
sudo systemctl status postgresql

# Check application logs
pm2 logs retailpro-pos-server --lines 50
```

### Step 2: Test Backend API

```bash
# Test health endpoint
curl http://localhost:3000/health

# Or from your local machine
curl https://yourdomain.com/api/health
```

### Step 3: Access Your Application

Open your browser and navigate to:
```
https://yourdomain.com
```

---

## Troubleshooting

### Backend Not Starting

```bash
# Check PM2 logs
pm2 logs retailpro-pos-server

# Check if port 3000 is in use
sudo lsof -i :3000

# Restart PM2
pm2 restart retailpro-pos-server

# Check environment variables
cd /var/www/retailpro-pos/server
cat .env
```

### Nginx Errors

```bash
# Check Nginx error logs
sudo tail -f /var/log/nginx/error.log

# Test Nginx configuration
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx
```

### SSL Certificate Issues

```bash
# Check certificate status
sudo certbot certificates

# Renew certificate manually
sudo certbot renew

# Check Certbot logs
sudo tail -f /var/log/letsencrypt/letsencrypt.log
```

### Database Connection Issues

```bash
# For PostgreSQL
sudo systemctl status postgresql
sudo -u postgres psql -c "SELECT version();"

# Test connection
psql -h localhost -U retailpro_user -d retailpro_pos

# For SQLite
cd /var/www/retailpro-pos/server
ls -la database.sqlite
```

### Frontend Not Loading

```bash
# Check if dist folder exists
ls -la /var/www/retailpro-pos/client/dist

# Rebuild frontend
cd /var/www/retailpro-pos/client
npm run build

# Check Nginx root directory
sudo nginx -T | grep root
```

### Permission Issues

```bash
# Fix ownership
sudo chown -R $USER:$USER /var/www/retailpro-pos

# Fix permissions
chmod -R 755 /var/www/retailpro-pos
```

### View All Logs

```bash
# PM2 logs
pm2 logs

# Nginx access logs
sudo tail -f /var/log/nginx/access.log

# Nginx error logs
sudo tail -f /var/log/nginx/error.log

# System logs
sudo journalctl -u nginx -f
```

---

## Maintenance Commands

### Update Application

```bash
cd /var/www/retailpro-pos

# Pull latest changes (if using Git)
git pull

# Install/update dependencies
npm install
cd server && npm install && cd ..
cd client && npm install && cd ..

# Rebuild frontend
cd client && npm run build && cd ..

# Restart application
pm2 restart retailpro-pos-server
```

### Backup Database

```bash
# PostgreSQL backup
pg_dump -U retailpro_user retailpro_pos > backup_$(date +%Y%m%d).sql

# SQLite backup
cp /var/www/retailpro-pos/server/database.sqlite /var/www/retailpro-pos/server/database.sqlite.backup
```

### Monitor Application

```bash
# PM2 monitoring
pm2 monit

# System resources
htop

# Disk usage
df -h
```

---

## Security Checklist

- ✅ Firewall configured (UFW)
- ✅ SSL certificate installed and auto-renewing
- ✅ Strong JWT_SECRET in .env
- ✅ REGISTRATION_KEY set (if registration should be restricted)
- ✅ NODE_ENV=production
- ✅ Database credentials are secure
- ✅ Only necessary ports are open (22, 80, 443)
- ✅ Regular backups configured
- ✅ PM2 auto-restart enabled
- ✅ Security headers in Nginx

---

## Quick Reference

| Service | Command |
|---------|---------|
| Start PM2 app | `pm2 start retailpro-pos-server` |
| Stop PM2 app | `pm2 stop retailpro-pos-server` |
| Restart PM2 app | `pm2 restart retailpro-pos-server` |
| View PM2 logs | `pm2 logs retailpro-pos-server` |
| Reload Nginx | `sudo systemctl reload nginx` |
| Check Nginx status | `sudo systemctl status nginx` |
| Renew SSL | `sudo certbot renew` |
| View firewall | `sudo ufw status` |

---

## Support

If you encounter issues:

1. Check the logs (PM2, Nginx, system)
2. Verify all environment variables are set correctly
3. Ensure all services are running
4. Check firewall rules
5. Verify domain DNS settings

For application-specific issues, refer to other documentation files in the `docs/` folder.

---

**Congratulations!** Your RetailPro POS application should now be running on HTTPS. 🎉

