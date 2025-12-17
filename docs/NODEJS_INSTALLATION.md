# Node.js Installation Guide

## Application Requirements

**This application was built with Node.js v23.11.0.**

## Installation Options

### Option 1: Node.js 23.x (Current - Matches Development) ⭐ Recommended

Matches your development environment exactly:

```bash
# Add Node.js 23.x repository
curl -fsSL https://deb.nodesource.com/setup_23.x | sudo -E bash -

# Install Node.js 23.x
sudo apt install -y nodejs

# Verify installation
node --version  # Should show v23.x
npm --version
```

### Option 2: Node.js 20.x (LTS - Long Term Support)

For production stability and long-term support:

```bash
# If you already configured 18.x, remove it first (optional)
sudo rm /etc/apt/sources.list.d/nodesource.list 2>/dev/null || true

# Add Node.js 20.x repository
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -

# Install Node.js 20.x
sudo apt install -y nodejs

# Verify installation
node --version  # Should show v20.x
npm --version
```

### Option 3: Continue with Node.js 18.x (Not Recommended)

If you've already configured 18.x, you can continue:

```bash
sudo apt install -y nodejs
node --version
npm --version
```

**Note**: Node.js 18.x is deprecated and no longer receiving security updates. Use 23.x or 20.x instead.

## Verify Installation

After installation, verify:

```bash
node --version
npm --version
```

Both should show version numbers. Node.js should be v18.x or v20.x, npm should be v9.x or v10.x.

## Next Steps

After Node.js is installed, continue with the deployment guide:
1. Install Nginx
2. Install PM2
3. Transfer your files
4. Continue with deployment steps

