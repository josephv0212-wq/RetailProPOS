# Simple VPS Deployment Guide - RetailPro POS

**Step-by-step guide to deploy your app to VPS with HTTPS.**

---

## Prerequisites

- ✅ VPS with Ubuntu/Debian
- ✅ Domain name: `subzerodryice-pos.com`
- ✅ VPS IP: `72.62.80.188`
- ✅ MobaXterm installed

---

## Step 1: Connect to VPS

1. Open **MobaXterm**
2. **Session** → **SSH**
3. Enter:
   - **Remote host**: `72.62.80.188`
   - **Username**: `root`
   - **Port**: `22`
4. Connect and enter password

---

## Step 2: Install Required Software

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 23.x
curl -fsSL https://deb.nodesource.com/setup_23.x | sudo -E bash -
sudo apt install -y nodejs

# Install Nginx, PM2, Certbot
sudo apt install -y nginx
sudo npm install -g pm2
sudo apt install -y certbot python3-certbot-nginx

# Verify
node --version
pm2 --version
```

---

## Step 3: Transfer Files to VPS

**Option A: Using MobaXterm SFTP**

1. In MobaXterm: **Session** → **SFTP**
2. Connect to VPS
3. Navigate to `/var/www/` on remote side
4. Upload your project folder (exclude `node_modules`)

**Option B: Using Git**

```bash
cd /var/www
sudo git clone <your-repo-url> RetailProPOS
sudo chown -R $USER:$USER RetailProPOS
cd RetailProPOS
```

---

## Step 4: Install Dependencies

```bash
cd /var/www/RetailProPOS

# Install all dependencies
npm install
cd server && npm install && cd ..
cd client && npm install && cd ..
```

---

## Step 5: Configure Environment Variables

```bash
# Create .env in server folder
cd /var/www/RetailProPOS/server
nano .env
```

**Paste this (update with your values):**

```env
JWT_SECRET=your-super-secret-key-change-this
NODE_ENV=production
PORT=3000
DATABASE_SETTING=local
FRONTEND_URL=https://subzerodryice-pos.com,https://www.subzerodryice-pos.com

# Add your other credentials (Zoho, Authorize.Net, etc.)
```

**Save:** `Ctrl+X`, then `Y`, then `Enter`

```bash
# Copy .env to root (so PM2 can find it)
cp .env /var/www/RetailProPOS/.env
```

---

## Step 6: Build Frontend

```bash
cd /var/www/RetailProPOS/client

# Create .env file
nano .env
```

**Add:**
```env
VITE_API_BASE_URL=/api
```

**Save and build:**
```bash
npm run build
```

---

## Step 7: Setup PM2

```bash
cd /var/www/RetailProPOS

# Create ecosystem file
nano ecosystem.config.cjs
```

**Paste:**
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
    autorestart: true,
    watch: false
  }]
};
```

**Save, then:**
```bash
mkdir -p logs
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
# Copy and run the command it shows
```

---

## Step 8: Configure DNS at Hostinger

1. Login to **Hostinger**
2. Go to **Domains** → `subzerodryice-pos.com` → **DNS Zone**
3. Add/Update these **A records**:

   - **Name**: `@` → **Type**: `A` → **Value**: `72.62.80.188`
   - **Name**: `www` → **Type**: `A` → **Value**: `72.62.80.188`

4. **Save** and wait 5-30 minutes

**Verify DNS:**
```bash
nslookup subzerodryice-pos.com
# Should show: 72.62.80.188
```

---

## Step 9: Configure Nginx (HTTP First)

```bash
sudo nano /etc/nginx/sites-available/RetailProPOS
```

**Paste this:**

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name subzerodryice-pos.com www.subzerodryice-pos.com;

    root /var/www/RetailProPOS/client/dist;
    index index.html;

    location /api {
        rewrite ^/api/(.*)$ /$1 break;
        proxy_pass http://localhost:3000/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

**Save, then:**
```bash
sudo ln -s /etc/nginx/sites-available/RetailProPOS /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl start nginx
sudo systemctl reload nginx
```

**Test:**
```bash
curl http://subzerodryice-pos.com
# Should show HTML (not error)
```

---

## Step 10: Get SSL Certificate

```bash
# Stop nginx
sudo systemctl stop nginx

# Get certificate
sudo certbot certonly --standalone -d subzerodryice-pos.com -d www.subzerodryice-pos.com

# Start nginx
sudo systemctl start nginx
```

---

## Step 11: Configure Nginx for HTTPS

```bash
sudo nano /etc/nginx/sites-available/RetailProPOS
```

**Replace with this (full config):**

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name subzerodryice-pos.com www.subzerodryice-pos.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name subzerodryice-pos.com www.subzerodryice-pos.com;

    ssl_certificate /etc/letsencrypt/live/subzerodryice-pos.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/subzerodryice-pos.com/privkey.pem;

    root /var/www/RetailProPOS/client/dist;
    index index.html;

    location /api {
        proxy_pass http://localhost:3000/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

**Save, then:**
```bash
sudo nginx -t
sudo systemctl reload nginx
```

---

## Step 12: Configure Firewall

```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

---

## Step 13: Verify Everything

```bash
# Check PM2
pm2 status

# Check Nginx
sudo systemctl status nginx

# Test backend
curl http://localhost:3000/health

# Test frontend
curl https://subzerodryice-pos.com
```

---

## ✅ Done!

Open in browser: **https://subzerodryice-pos.com**

---

## Troubleshooting

### Backend not working?
```bash
pm2 logs RetailProPOS-server
pm2 restart RetailProPOS-server
```

### Nginx not working?
```bash
sudo nginx -t
sudo systemctl status nginx
sudo tail -f /var/log/nginx/error.log
```

### Frontend not loading?
```bash
cd /var/www/RetailProPOS/client
npm run build
```

### SSL not working?
```bash
sudo certbot certificates
sudo certbot renew --dry-run
```

---

## Quick Commands Reference

| Task | Command |
|------|---------|
| Restart backend | `pm2 restart RetailProPOS-server` |
| View backend logs | `pm2 logs RetailProPOS-server` |
| Reload Nginx | `sudo systemctl reload nginx` |
| Check Nginx status | `sudo systemctl status nginx` |
| Rebuild frontend | `cd client && npm run build` |

---

**That's it! Follow these steps in order and your app will be live.** 🎉

