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
- ✅ Domain name you control (e.g. `subzerodryice-pos.com`)
- ✅ MobaXterm installed on your Windows machine
- ✅ SSH credentials (IP address, username, password/key)

> **Important:** Before you can get an HTTPS certificate, your domain must point to your VPS IP.

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

### Step 3: Configure DNS for Your Domain

You must point your domain (e.g. `subzerodryice-pos.com`) to your VPS **before** requesting SSL.

1. Log into your domain provider (e.g. **Hostinger**)
2. Open **DNS Zone / Manage DNS** for `subzerodryice-pos.com`
3. Create or update the following **A records** (replace `YOUR_VPS_IP`):

   - **Name**: `@`  
     **Type**: `A`  
     **Value**: `YOUR_VPS_IP`  
     **TTL**: 300 (or default)

   - **Name**: `www`  
     **Type**: `A`  
     **Value**: `YOUR_VPS_IP`  
     **TTL**: 300 (or default)

4. Remove or disable any old A/CNAME records for `@` or `www` that point to parking/hosting pages.

DNS changes can take 5–30 minutes (sometimes longer). You can test from the VPS:

```bash
curl http://subzerodryice-pos.com
```

When this returns your Nginx page instead of a registrar/parking page, DNS is correctly pointing to your VPS.

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
sudo git clone https://github.com/josephv0212-wq/RetailProPOS.git RetailProPOS
cd RetailProPOS
```

## Install Dependencies

```bash
# Navigate to project directory
cd /var/www/RetailProPOS

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

### Step 5: Setup PostgreSQL (If using cloud database)

```bash
# Install PostgreSQL
sudo apt install -y postgresql postgresql-contrib

# Switch to postgres user
sudo -u postgres psql

# In PostgreSQL prompt, run:
CREATE DATABASE retailpro_pos;
CREATE USER retailpro_user WITH PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE retailpro_pos TO retailpro_user;
GRANT ALL ON SCHEMA public TO retailpro_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO retailpro_user;
\q

# Update DATABASE_URL in .env file
# DATABASE_URL=postgresql://retailpro_user:your_secure_password@localhost:5432/retailpro_pos
```

If you are using a managed Postgres provider (e.g. Neon, RDS), make sure the user in your
`DATABASE_URL` has permission to create tables in the `public` schema. The equivalent of the
`GRANT` commands above must be executed in that database.

---

## Build Frontend

```bash
cd /var/www/RetailProPOS/client

# Build for production
npm run build

# This creates a 'dist' folder with static files
# Verify build was successful
ls -la dist/
```

---

## Setup Process Manager (PM2)

### Step 1: Create PM2 Ecosystem File

Because the project uses ES modules (`"type": "module"` in `package.json`), PM2 config
should be a CommonJS file with the `.cjs` extension.

```bash
cd /var/www/RetailProPOS
nano ecosystem.config.cjs
```

Add the following content:

```javascript
module.exports = {
  apps: [{
    name: 'RetailProPOS-server',
    script: './server/server.js',
    cwd: '/var/www/RetailProPOS',
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
mkdir -p /var/www/RetailProPOS/logs
```

### Step 3: Start Application with PM2

```bash
cd /var/www/RetailProPOS
pm2 start ecosystem.config.cjs

# Save PM2 configuration
pm2 save

# Setup PM2 to start on system boot
pm2 startup
# Follow the instructions shown (copy and run the command it provides)
```

### Step 4: Verify PM2 Status

```bash
pm2 status
pm2 logs RetailProPOS-server
```

---

## Configure Nginx Reverse Proxy

### Step 1: Create Nginx Configuration (HTTP only first)

Start with a simple HTTP-only configuration. This avoids errors about missing
certificate files when you haven't obtained an SSL certificate yet.

```bash
sudo nano /etc/nginx/sites-available/RetailProPOS
```

Add the following configuration:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name subzerodryice-pos.com www.subzerodryice-pos.com;

    # Root directory for frontend
    root /var/www/RetailProPOS/client/dist;
    index index.html;

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

**Important**: Replace `subzerodryice-pos.com` with your actual domain name.

### Step 2: Enable the Site

```bash
# Create symbolic link
sudo ln -s /etc/nginx/sites-available/RetailProPOS /etc/nginx/sites-enabled/

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

Make sure:
- Your domain `subzerodryice-pos.com` points to this VPS IP (DNS A record)
- Port 80 is open in the firewall
- Nginx is running and serving HTTP with the config above

Then run:

```bash
sudo certbot --nginx -d subzerodryice-pos.com -d www.subzerodryice-pos.com
```

Follow the prompts:
- Enter your email address
- Agree to terms of service
- Choose whether to redirect HTTP to HTTPS (recommended: Yes)

Certbot will:
- Obtain the SSL certificate
- Create `/etc/letsencrypt/live/subzerodryice-pos.com/fullchain.pem` and `privkey.pem`
- Update your Nginx configuration to use HTTPS

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
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
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
pm2 logs RetailProPOS-server --lines 50
```

### Step 2: Test Backend API

```bash
# Test health endpoint
curl http://localhost:3000/health

# Or from your local machine
curl https://subzerodryice-pos.com/api/health
```

### Step 3: Access Your Application

Open your browser and navigate to:
```
https://subzerodryice-pos.com
```

---

## Troubleshooting

### Backend Not Starting

```bash
# Check PM2 logs
pm2 logs RetailProPOS-server

# Check if port 3000 is in use
sudo lsof -i :3000

# Restart PM2
pm2 restart RetailProPOS-server

# Check environment variables
cd /var/www/RetailProPOS/server
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
cd /var/www/RetailProPOS/server
ls -la database.sqlite
```

### Frontend Not Loading

```bash
# Check if dist folder exists
ls -la /var/www/RetailProPOS/client/dist

# Rebuild frontend
cd /var/www/RetailProPOS/client
npm run build

# Check Nginx root directory
sudo nginx -T | grep root
```

### Permission Issues

```bash
# Fix ownership
sudo chown -R $USER:$USER /var/www/RetailProPOS

# Fix permissions
chmod -R 755 /var/www/RetailProPOS
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
cd /var/www/RetailProPOS

# Pull latest changes (if using Git)
git pull

# Install/update dependencies
npm install
cd server && npm install && cd ..
cd client && npm install && cd ..

# Rebuild frontend
cd client && npm run build && cd ..

# Restart application
pm2 restart RetailProPOS-server
```

### Backup Database

```bash
# PostgreSQL backup
pg_dump -U retailpro_user retailpro_pos > backup_$(date +%Y%m%d).sql

# SQLite backup
cp /var/www/RetailProPOS/server/database.sqlite /var/www/RetailProPOS/server/database.sqlite.backup
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

## Daily Development Workflow: Fix Code → Push → Deploy

This section explains the simple workflow for making code changes locally, pushing to Git, and deploying to your VPS.

### Overview

1. **Fix code on your local PC** (Windows)
2. **Commit and push to Git** (GitHub)
3. **Pull changes on VPS** (via SSH)
4. **Rebuild and redeploy** (on VPS)

---

### Step 1: Fix Code on Local PC

Make your code changes on your local Windows machine:

```bash
# Navigate to your project
cd C:\Users\Admin\Documents\GitHub\RetailProPOSBackend\RetailProPOS

# Make your code changes using your editor (VS Code, etc.)
# Edit files, test locally, etc.
```

**Important Notes:**
- Test your changes locally before pushing
- Don't commit `.env` files (they're in `.gitignore`)
- Don't commit `node_modules` folders

---

### Step 2: Commit and Push to Git

Once your changes are ready:

```bash
# Check what files changed
git status

# Add all changed files (or specific files)
git add .

# Or add specific files only:
# git add client/src/components/PaymentModal.jsx
# git add server/services/bbposService.js

# Commit with a descriptive message
git commit -m "Add BBPOS Chipper 3X card reader support"

# Push to GitHub
git push origin main
```

**If you get errors about `.env` files:**

If Git complains about `.env` files, they might have been tracked before. Fix it:

```bash
# Remove .env files from Git tracking (but keep local copies)
git rm --cached .env 2>/dev/null || true
git rm --cached client/.env 2>/dev/null || true
git rm --cached server/.env 2>/dev/null || true

# Commit the removal
git commit -m "Remove .env files from Git tracking"

# Push
git push origin main
```

---

### Step 3: Pull Changes on VPS

Connect to your VPS via SSH (using MobaXterm or any SSH client):

```bash
# Connect to VPS (replace with your VPS IP)
ssh root@86.104.72.45

# Navigate to your project directory
cd /var/www/RetailProPOS

# Backup your .env files first (IMPORTANT!)
cp .env .env.backup 2>/dev/null || true
cp client/.env client/.env.backup 2>/dev/null || true
cp server/.env server/.env.backup 2>/dev/null || true

# Stash any local changes (if you made changes directly on VPS)
git stash push -m "VPS local changes" 2>/dev/null || true

# Remove .env files from Git tracking (if they were tracked)
git rm --cached .env 2>/dev/null || true
git rm --cached client/.env 2>/dev/null || true
git rm --cached server/.env 2>/dev/null || true

# Pull latest changes from GitHub
git pull origin main

# Restore your .env files
if [ -f .env.backup ]; then mv .env.backup .env; fi
if [ -f client/.env.backup ]; then mv client/.env.backup client/.env; fi
if [ -f server/.env.backup ]; then mv server/.env.backup server/.env; fi
```

**If you get merge conflicts:**

```bash
# If git pull shows conflicts, you can:
# Option 1: Discard local changes and use remote version
git reset --hard origin/main
git pull

# Option 2: Keep local changes and merge
git stash
git pull
git stash pop
# Then resolve conflicts manually
```

---

### Step 4: Install Dependencies (if needed)

If you added new packages or updated `package.json`:

```bash
# Install root dependencies
npm install

# Install server dependencies
cd server
npm install
cd ..

# Install client dependencies
cd client
npm install
cd ..
```

---

### Step 5: Rebuild Frontend

Always rebuild the frontend after pulling changes:

```bash
cd /var/www/RetailProPOS/client

# Build for production
npm run build

# Verify build was successful
ls -la dist/
```

---

### Step 6: Restart Application

Restart the PM2 process to apply changes:

```bash
cd /var/www/RetailProPOS

# Restart the server
pm2 restart RetailProPOS-server

# Check status
pm2 status

# View logs to verify it started correctly
pm2 logs RetailProPOS-server --lines 20
```

---

### Complete One-Line Workflow Script

For convenience, you can create a script on your VPS to do all steps at once:

```bash
# Create deployment script
nano /var/www/RetailProPOS/deploy.sh
```

Add this content:

```bash
#!/bin/bash
# Quick deployment script for RetailPro POS

echo "🚀 Starting deployment..."

# Backup .env files
echo "📦 Backing up .env files..."
cp .env .env.backup 2>/dev/null || true
cp client/.env client/.env.backup 2>/dev/null || true
cp server/.env server/.env.backup 2>/dev/null || true

# Stash local changes
echo "💾 Stashing local changes..."
git stash push -m "Auto-stash before pull" 2>/dev/null || true

# Pull latest changes
echo "⬇️  Pulling latest changes from Git..."
git pull origin main

# Restore .env files
echo "🔧 Restoring .env files..."
if [ -f .env.backup ]; then mv .env.backup .env; fi
if [ -f client/.env.backup ]; then mv client/.env.backup client/.env; fi
if [ -f server/.env.backup ]; then mv server/.env.backup server/.env; fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install
cd server && npm install && cd ..
cd client && npm install && cd ..

# Rebuild frontend
echo "🏗️  Rebuilding frontend..."
cd client && npm run build && cd ..

# Restart application
echo "🔄 Restarting application..."
pm2 restart RetailProPOS-server

echo "✅ Deployment complete!"
echo "📊 Checking status..."
pm2 status

echo ""
echo "🎉 Done! Your application is updated."
```

Make it executable:

```bash
chmod +x /var/www/RetailProPOS/deploy.sh
```

Then you can simply run:

```bash
cd /var/www/RetailProPOS
./deploy.sh
```

---

### Quick Reference: Common Commands

| Task | Command |
|------|---------|
| **Local: Check changes** | `git status` |
| **Local: Commit changes** | `git add . && git commit -m "message"` |
| **Local: Push to GitHub** | `git push origin main` |
| **VPS: Pull changes** | `git pull origin main` |
| **VPS: Rebuild frontend** | `cd client && npm run build && cd ..` |
| **VPS: Restart app** | `pm2 restart RetailProPOS-server` |
| **VPS: View logs** | `pm2 logs RetailProPOS-server` |
| **VPS: Quick deploy** | `./deploy.sh` (if script created) |

---

### Troubleshooting Deployment

**Problem: Git pull fails with .env conflicts**

```bash
# Solution: Remove .env from tracking and pull again
git rm --cached .env client/.env server/.env
git commit -m "Remove .env files"
git pull
```

**Problem: Frontend build fails**

```bash
# Solution: Clean and rebuild
cd client
rm -rf node_modules dist
npm install
npm run build
```

**Problem: PM2 won't restart**

```bash
# Solution: Stop and start fresh
pm2 stop RetailProPOS-server
pm2 delete RetailProPOS-server
pm2 start ecosystem.config.cjs
pm2 save
```

**Problem: Changes not showing after deployment**

```bash
# Solution: Clear browser cache and check logs
# 1. Hard refresh browser (Ctrl+F5)
# 2. Check PM2 logs
pm2 logs RetailProPOS-server
# 3. Verify frontend was rebuilt
ls -la client/dist/
# 4. Check Nginx is serving new files
sudo systemctl reload nginx
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
| Start PM2 app | `pm2 start RetailProPOS-server` |
| Stop PM2 app | `pm2 stop RetailProPOS-server` |
| Restart PM2 app | `pm2 restart RetailProPOS-server` |
| View PM2 logs | `pm2 logs RetailProPOS-server` |
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

