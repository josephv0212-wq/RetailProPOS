# PAX WiFi Terminal Payment Guide

## Overview

This guide explains how to use the PAX VP100 WiFi terminal for payment processing in the RetailPro POS application.

## How PAX WiFi Terminal Works

Unlike USB card readers, PAX terminals are **network-based payment devices** that communicate over WiFi (TCP/IP):

1. **Terminal Configuration**: PAX VP100 is configured with Authorize.Net credentials
2. **Network Communication**: Terminal connects to your POS system via WiFi (TCP/IP)
3. **Payment Processing**: Terminal handles card reading and processing on the device
4. **Result Return**: Terminal sends payment result back to POS system

## Prerequisites

1. **PAX VP100 Terminal**:
   - Terminal must be powered on
   - Terminal must be connected to WiFi network
   - Terminal must be configured with Authorize.Net credentials
   - Terminal IP address must be known

2. **Network Setup**:
   - Terminal and computer must be on the **same WiFi network**
   - Terminal IP address must be accessible from your computer
   - Firewall must allow TCP connections on port 10009 (default)

3. **POS Configuration**:
   - Terminal IP address configured in Settings
   - Terminal Port configured (default: 10009 for WiFi, 4430 for USB)

## Setup Steps

### 1. Configure Terminal IP in Settings

1. Go to **Settings** page in the POS application
2. Find **"Terminal IP Address"** section
3. Enter your PAX terminal's IP address (e.g., `192.168.1.100`)
4. Enter terminal port (default: `10009` for WiFi)
5. Click **"Test Connection"** to verify
6. Click **"Save"** to save settings

### 2. Verify Terminal Connection

**From Settings Page:**
- Click **"Test Connection"** button
- System will attempt to connect to the terminal
- Success message confirms terminal is reachable

**From Terminal:**
- Terminal should show it's ready for transactions
- Terminal display should be active

## Using PAX Terminal for Payment

### Payment Flow

1. **Select Payment Method**:
   - Click **"Card"** payment method
   - Select **"PAX WiFi Terminal"** option (first button with WiFi icon)

2. **Verify Terminal Info**:
   - Check that Terminal IP and Port are displayed correctly
   - If not configured, you'll see a warning to configure in Settings

3. **Confirm Payment**:
   - Click **"Confirm Payment"** button
   - System sends payment amount to PAX terminal via WiFi

4. **Customer Interaction**:
   - Customer sees payment prompt on PAX terminal screen
   - Customer inserts, swipes, or taps card on terminal
   - Terminal processes the payment

5. **Payment Result**:
   - Terminal sends result back to POS system
   - Success/decline message displayed in POS
   - Receipt printed (if configured)
   - Sale recorded in system

## Payment Options in POS

When you select **"Card"** payment, you now have **3 options**:

1. **PAX WiFi Terminal** (New):
   - Uses PAX VP100 terminal via WiFi
   - Customer interacts with terminal device
   - Best for in-person transactions

2. **USB Reader**:
   - Uses BBPOS CHIPPER 3X via USB
   - Limited browser support (Chrome/Edge/Opera)
   - May require Manual Entry fallback

3. **Manual Entry**:
   - Enter card details manually
   - Encrypted with Accept.js
   - Works in all browsers

## Network Configuration

### Finding Terminal IP Address

**From Terminal:**
1. Navigate to terminal settings
2. Look for Network/WiFi settings
3. Note the IP address assigned to terminal

**From Router:**
1. Log into your router admin panel
2. Check connected devices
3. Look for device named "PAX" or similar

**From Terminal Display:**
- Some terminals show IP address on startup screen
- Check terminal settings menu

### Port Configuration

- **WiFi Connection**: Port `10009` (default)
- **USB Connection**: Port `4430` (if using USB-to-network bridge)
- **Custom Port**: Can be configured in terminal settings

### Network Requirements

- **Same Network**: Terminal and computer must be on same WiFi network
- **Firewall**: Allow TCP connections on terminal port
- **IP Accessibility**: Terminal IP must be reachable (ping test)

## Troubleshooting

### "Terminal IP address is required"

**Problem**: Terminal IP not configured

**Solution**:
1. Go to Settings page
2. Enter Terminal IP address
3. Enter Terminal Port (default: 10009)
4. Save settings

### "Connection failed" or "Terminal not reachable"

**Possible Causes**:
1. Terminal not powered on
2. Terminal not connected to WiFi
3. Wrong IP address
4. Terminal and computer on different networks
5. Firewall blocking connection

**Solutions**:
1. **Check Terminal Power**: Ensure terminal is on
2. **Check WiFi Connection**: Verify terminal is connected to WiFi
3. **Verify IP Address**: Ping terminal IP: `ping 192.168.1.100` (replace with your IP)
4. **Check Network**: Ensure both devices on same network
5. **Check Firewall**: Allow TCP port 10009
6. **Test Connection**: Use "Test Connection" button in Settings

### Payment Times Out

**Problem**: Payment sent but no response from terminal

**Possible Causes**:
1. Network connectivity issue
2. Terminal busy with another transaction
3. Terminal not responding

**Solutions**:
1. Check network connection
2. Wait for current transaction to complete
3. Restart terminal if needed
4. Try payment again

### Terminal Shows Error

**Problem**: Terminal displays error message

**Solutions**:
1. Check terminal display for specific error
2. Verify Authorize.Net configuration on terminal
3. Check terminal network connection
4. Restart terminal
5. Contact terminal support if issue persists

## Technical Details

### Communication Protocol

- **Protocol**: TCP/IP (Socket connection)
- **Port**: 10009 (WiFi) or 4430 (USB)
- **Format**: PAXST (PAX Socket Transport) / JSON over TCP/IP
- **Timeout**: 30 seconds (configurable)

### Payment Flow

1. POS sends payment request to terminal IP:Port
2. Terminal receives request and prompts customer
3. Customer interacts with terminal (insert/swipe/tap card)
4. Terminal processes payment with Authorize.Net
5. Terminal sends result back to POS
6. POS displays result and completes sale

### Security

- **Network Security**: Use secure WiFi network (WPA2/WPA3)
- **Terminal Security**: Terminal encrypts card data
- **PCI Compliance**: Terminal handles card data, reducing PCI scope
- **HTTPS**: POS application should use HTTPS in production

## Comparison: PAX vs USB Reader

| Feature | PAX WiFi Terminal | USB Card Reader |
|---------|------------------|----------------|
| **Connection** | WiFi (TCP/IP) | USB cable |
| **Setup** | Network configuration | Plug and play (if supported) |
| **Browser Support** | All browsers | Chrome/Edge/Opera only |
| **Customer Interaction** | On terminal device | On computer screen |
| **Reliability** | High (network dependent) | Medium (driver dependent) |
| **Best For** | In-person transactions | Web applications |

## Additional Resources

- [PAX VP100 Setup Guide](./PAX_VP100_SETUP.md)
- [PAX Integration Summary](./PAX_VP100_INTEGRATION_SUMMARY.md)
- [Authorize.Net Documentation](https://developer.authorize.net/)
- [PAX Terminal Support](https://www.pax.us/support)

## Support

For issues with:
- **Terminal Hardware**: Contact PAX support
- **Network Issues**: Check network configuration
- **Payment Processing**: Check Authorize.Net configuration
- **POS Integration**: Check application logs
