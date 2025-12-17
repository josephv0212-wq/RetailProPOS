# Quick Deploy Guide - RetailPro POS

**TL;DR**: Fast deployment steps for your VPS.

## Prerequisites

- VPS with Ubuntu/Debian
- Domain name pointing to VPS IP
- MobaXterm installed
- SSH access to VPS

## Step-by-Step (15 minutes)

### 1. Connect to VPS
- Open MobaXterm → Session → SSH
- Enter VPS IP, username, port 22
- Connect

### 2. Install Required Software

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js (choose one)
# Option 1: Node.js 23.x (matches development - v23.11.0)
curl -fsSL https://deb.nodesource.com/setup_23.x | sudo -E bash -
sudo apt install -y nodejs

# Option 2: Node.js 20.x (LTS - recommended for production)
# curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
# sudo apt install -y nodejs

# Install Nginx, PM2, Certbot
sudo apt install -y nginx
sudo npm install -g pm2
sudo apt install -y certbot python3-certbot-nginx
```

### 3. Transfer Files

**Using MobaXterm SFTP:**
1. Session → SFTP
2. Connect to VPS
3. Navigate to `/var/www/` on remote
4. Upload your project folder (exclude `node_modules`)

**Or using Git:**
```bash
cd /var/www
sudo git clone <your-repo-url> retailpro-pos
sudo chown -R $USER:$USER retailpro-pos
```

### 4. Setup Application

```bash
cd /var/www/retailpro-pos

# Option A: Use deployment script
chmod +x deploy.sh
./deploy.sh

# Option B: Manual setup
npm install
cd server && npm install && cd ..
cd client && npm install && npm run build && cd ..
```

### 5. Configure Environment

```bash
cd /var/www/retailpro-pos/server
nano .env
```

**Minimum required:**
```env
JWT_SECRET=generate-with-openssl-rand-base64-32
NODE_ENV=production
PORT=3000
FRONTEND_URL=https://yourdomain.com
DATABASE_SETTING=local
```

**Generate JWT_SECRET:**
```bash
openssl rand -base64 32
```

### 6. Start with PM2

```bash
cd /var/www/retailpro-pos

# Create ecosystem.config.js (see full guide)
pm2 start ecosystem.config.js
pm2 save
pm2 startup  # Follow instructions
```

### 7. Configure Nginx

```bash
sudo nano /etc/nginx/sites-available/retailpro-pos
```

**Paste this (replace `yourdomain.com`):**
```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com www.yourdomain.com;
    
    root /var/www/retailpro-pos/client/dist;
    index index.html;

    location /api {
        proxy_pass http://localhost:3000;
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

```bash
sudo ln -s /etc/nginx/sites-available/retailpro-pos /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 8. Setup SSL

```bash
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

### 9. Configure Firewall

```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

### 10. Test

```bash
# Test backend
curl https://yourdomain.com/api/health

# Check PM2
pm2 status

# View logs
pm2 logs retailpro-pos-server
```

**Open in browser:** `https://yourdomain.com`

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Backend not starting | `pm2 logs retailpro-pos-server` |
| Nginx error | `sudo nginx -t` then `sudo tail -f /var/log/nginx/error.log` |
| SSL issues | `sudo certbot certificates` |
| Port in use | `sudo lsof -i :3000` |

---

## Full Documentation

For detailed instructions, see:
- **[VPS_DEPLOYMENT_GUIDE.md](./VPS_DEPLOYMENT_GUIDE.md)** - Complete guide
- **[DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md)** - Step-by-step checklist

---

**Need help?** Check the logs:
- PM2: `pm2 logs`
- Nginx: `sudo tail -f /var/log/nginx/error.log`
- System: `sudo journalctl -u nginx -f`

