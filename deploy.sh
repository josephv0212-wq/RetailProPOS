#!/bin/bash

# RetailPro POS Deployment Script
# This script helps automate the deployment process on your VPS

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
APP_DIR="/var/www/retailpro-pos"
APP_NAME="retailpro-pos-server"
DOMAIN=""

echo -e "${GREEN}=== RetailPro POS Deployment Script ===${NC}\n"

# Check if running as root or with sudo
if [ "$EUID" -ne 0 ]; then 
    echo -e "${YELLOW}Note: Some commands may require sudo. Running as regular user.${NC}\n"
fi

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check prerequisites
echo -e "${GREEN}Checking prerequisites...${NC}"
if ! command_exists node; then
    echo -e "${RED}Node.js is not installed. Please install Node.js 18+ first.${NC}"
    exit 1
fi

if ! command_exists npm; then
    echo -e "${RED}npm is not installed. Please install npm first.${NC}"
    exit 1
fi

if ! command_exists pm2; then
    echo -e "${YELLOW}PM2 is not installed. Installing...${NC}"
    sudo npm install -g pm2
fi

if ! command_exists nginx; then
    echo -e "${RED}Nginx is not installed. Please install Nginx first.${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Prerequisites check passed${NC}\n"

# Navigate to app directory
if [ ! -d "$APP_DIR" ]; then
    echo -e "${RED}Application directory not found: $APP_DIR${NC}"
    echo -e "${YELLOW}Please ensure you've transferred your files to the VPS first.${NC}"
    exit 1
fi

cd "$APP_DIR"
echo -e "${GREEN}Working directory: $APP_DIR${NC}\n"

# Install dependencies
echo -e "${GREEN}Installing dependencies...${NC}"
if [ -f "package.json" ]; then
    npm install
fi

if [ -d "server" ] && [ -f "server/package.json" ]; then
    echo -e "${GREEN}Installing server dependencies...${NC}"
    cd server
    npm install
    cd ..
fi

if [ -d "client" ] && [ -f "client/package.json" ]; then
    echo -e "${GREEN}Installing client dependencies...${NC}"
    cd client
    npm install
    cd ..
fi

echo -e "${GREEN}✓ Dependencies installed${NC}\n"

# Check for .env file
if [ ! -f "server/.env" ]; then
    echo -e "${YELLOW}⚠ Warning: server/.env file not found${NC}"
    echo -e "${YELLOW}Please create server/.env file with required environment variables.${NC}"
    echo -e "${YELLOW}See VPS_DEPLOYMENT_GUIDE.md for details.${NC}\n"
else
    echo -e "${GREEN}✓ .env file found${NC}\n"
fi

# Build frontend
if [ -d "client" ]; then
    echo -e "${GREEN}Building frontend...${NC}"
    cd client
    if [ -f "package.json" ]; then
        npm run build
        if [ -d "dist" ]; then
            echo -e "${GREEN}✓ Frontend built successfully${NC}\n"
        else
            echo -e "${RED}✗ Frontend build failed - dist folder not found${NC}\n"
        fi
    fi
    cd ..
fi

# Create logs directory
mkdir -p "$APP_DIR/logs"
echo -e "${GREEN}✓ Logs directory created${NC}\n"

# Check PM2 ecosystem file
if [ ! -f "ecosystem.config.js" ]; then
    echo -e "${YELLOW}⚠ ecosystem.config.js not found. Creating default...${NC}"
    cat > ecosystem.config.js << EOF
module.exports = {
  apps: [{
    name: '$APP_NAME',
    script: './server/server.js',
    cwd: '$APP_DIR',
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
EOF
    echo -e "${GREEN}✓ ecosystem.config.js created${NC}\n"
fi

# PM2 operations
echo -e "${GREEN}Managing PM2 process...${NC}"

# Stop existing process if running
if pm2 list | grep -q "$APP_NAME"; then
    echo -e "${YELLOW}Stopping existing PM2 process...${NC}"
    pm2 stop "$APP_NAME" || true
    pm2 delete "$APP_NAME" || true
fi

# Start application
echo -e "${GREEN}Starting application with PM2...${NC}"
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save

echo -e "${GREEN}✓ PM2 process started${NC}\n"

# Display status
echo -e "${GREEN}=== Deployment Summary ===${NC}"
echo -e "Application directory: $APP_DIR"
echo -e "PM2 process name: $APP_NAME"
echo -e "\n${GREEN}PM2 Status:${NC}"
pm2 status

echo -e "\n${GREEN}PM2 Logs (last 20 lines):${NC}"
pm2 logs "$APP_NAME" --lines 20 --nostream

echo -e "\n${GREEN}=== Next Steps ===${NC}"
echo -e "1. Configure Nginx (see VPS_DEPLOYMENT_GUIDE.md)"
echo -e "2. Setup SSL certificate with Certbot"
echo -e "3. Configure firewall (UFW)"
echo -e "4. Test your application: https://yourdomain.com"
echo -e "\n${GREEN}Useful commands:${NC}"
echo -e "  pm2 logs $APP_NAME    # View logs"
echo -e "  pm2 restart $APP_NAME  # Restart app"
echo -e "  pm2 status            # Check status"
echo -e "\n${GREEN}Deployment script completed!${NC}"

