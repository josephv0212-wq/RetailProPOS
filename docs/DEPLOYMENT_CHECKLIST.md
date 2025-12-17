# VPS Deployment Checklist

Quick checklist for deploying RetailPro POS to your VPS.

## Pre-Deployment

- [ ] VPS with Ubuntu/Debian ready
- [ ] Domain name pointing to VPS IP
- [ ] SSH access credentials
- [ ] MobaXterm installed
- [ ] All environment variables documented

## VPS Setup

- [ ] Connected to VPS via MobaXterm SSH
- [ ] System packages updated (`sudo apt update && sudo apt upgrade`)
- [ ] Node.js 18+ installed
- [ ] Nginx installed and running
- [ ] PM2 installed globally
- [ ] Certbot installed
- [ ] PostgreSQL installed (if using cloud database)

## File Transfer

- [ ] Project files transferred to `/var/www/retailpro-pos`
- [ ] `node_modules` excluded from transfer
- [ ] File permissions set correctly

## Application Setup

- [ ] All dependencies installed (root, server, client)
- [ ] `.env` file created in `server/` directory
- [ ] All required environment variables set:
  - [ ] `JWT_SECRET`
  - [ ] `NODE_ENV=production`
  - [ ] `PORT=3000`
  - [ ] `FRONTEND_URL` (with your domain)
  - [ ] Database configuration (DATABASE_URL or DATABASE_SETTING)
- [ ] Frontend built (`npm run build` in client/)
- [ ] Database configured (PostgreSQL or SQLite)

## PM2 Setup

- [ ] `ecosystem.config.js` created
- [ ] Logs directory created
- [ ] Application started with PM2
- [ ] PM2 startup script configured
- [ ] PM2 configuration saved

## Nginx Configuration

- [ ] Nginx config file created at `/etc/nginx/sites-available/retailpro-pos`
- [ ] Domain name updated in config
- [ ] Site enabled (symlink created)
- [ ] Nginx config tested (`sudo nginx -t`)
- [ ] Nginx reloaded

## SSL/HTTPS

- [ ] SSL certificate obtained via Certbot
- [ ] Auto-renewal tested
- [ ] HTTPS working (test in browser)

## Firewall

- [ ] UFW configured
- [ ] Port 22 (SSH) allowed
- [ ] Port 80 (HTTP) allowed
- [ ] Port 443 (HTTPS) allowed
- [ ] Firewall enabled

## Testing

- [ ] Backend health check works: `curl https://yourdomain.com/api/health`
- [ ] Frontend loads at `https://yourdomain.com`
- [ ] Login functionality works
- [ ] API endpoints accessible
- [ ] SSL certificate valid (green lock in browser)

## Security

- [ ] Strong `JWT_SECRET` set
- [ ] `REGISTRATION_KEY` set (if needed)
- [ ] Database credentials secure
- [ ] `.env` file not in public directory
- [ ] Only necessary ports open

## Post-Deployment

- [ ] Application monitoring setup
- [ ] Backup strategy configured
- [ ] Log rotation configured
- [ ] Documentation updated

---

## Quick Test Commands

```bash
# Test backend
curl https://yourdomain.com/api/health

# Check PM2
pm2 status

# Check Nginx
sudo systemctl status nginx

# Check SSL
sudo certbot certificates

# View logs
pm2 logs retailpro-pos-server
```

---

**Status**: ⬜ Not Started | 🟡 In Progress | ✅ Complete | ❌ Failed

