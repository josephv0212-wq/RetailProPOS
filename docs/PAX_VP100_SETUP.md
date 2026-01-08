# PAX Valor VP100 Terminal Setup Guide

This guide will help you set up and configure your PAX Valor VP100 payment terminal with Authorize.Net for use with the RetailPro POS system.

## Terminal Specifications

- **Model**: PAX Valor VP100
- **Connection Methods**: 
  - **WiFi**: Network IP address, Port 10009 (or as configured)
  - **USB**: localhost (127.0.0.1), Port 4430 (or as configured)
- **Payment Gateway**: Authorize.Net
- **Protocol**: PAXST (PAX Socket Transport) / JSON over TCP/IP

## Prerequisites

1. PAX Valor VP100 terminal
2. Authorize.Net merchant account with API credentials
3. **For WiFi**: WiFi network access and terminal IP address
4. **For USB**: USB cable and appropriate drivers (if required)

## Connection Methods

### Option A: WiFi Connection (Recommended for Production)
Use WiFi for wireless payment processing when the terminal is not physically connected.

### Option B: USB Connection (For Development/Testing)
Use USB for direct connection when the terminal is physically connected to your computer.

## Step 1A: Configure WiFi Connection on Terminal (Optional)

1. **Access Communication Settings**:
   - From the terminal home screen, tap the menu icon (three horizontal lines)
   - Select "Comm Config" or "Communication Settings"

2. **Configure WiFi**:
   - Tap "Wi-Fi" option
   - Select your WiFi network (SSID) from the list
   - Tap "Configure"
   - Enter your WiFi password (case-sensitive)
   - Tap "OK" to confirm
   - Press "Cancel" to exit the keyboard
   - Tap "Connect" to establish the connection

3. **Verify Connection**:
   - The active connection will be highlighted in green
   - You should see a WiFi icon in the status bar
   - Note the terminal's IP address (found in network settings)

## Step 1B: Configure USB Connection (Alternative)

If connecting via USB instead of WiFi:

1. **Connect Terminal to Computer**:
   - Connect the PAX VP100 terminal to your laptop/computer using a USB cable
   - Ensure the terminal is powered on
   - The terminal should be recognized by the system

2. **Configure Terminal for USB Mode**:
   - On the terminal, check communication settings
   - Select USB as the connection method (if available)
   - Note: Some terminals may need drivers installed - check PAX documentation

3. **USB Connection Settings**:
   - Use IP address: `localhost` or `127.0.0.1`
   - Port: Usually `4430` (check with terminal administrator or PAX documentation)
   - Connection is direct via USB cable

4. **Verify USB Connection**:
   - Terminal should be recognized by your computer
   - Check device manager (Windows) or system information (Mac) to verify connection
   - Some terminals may require USB drivers to be installed first

## Step 2: Configure Authorize.Net on Terminal

1. **Obtain Authorize.Net Credentials**:
   - Log in to your Authorize.Net Merchant Interface
   - Navigate to "Account" > "API Credentials & Keys"
   - Generate a new Transaction Key if needed
   - Note your API Login ID

2. **Configure Terminal Gateway**:
   - Access the terminal's settings menu
   - Enter the default password: `pax9876@@` (change this for security)
   - Navigate to "Payment Gateway" or "Gateway Configuration"
   - Select "Authorize.Net" as the payment gateway
   - Enter your API Login ID
   - Enter your Transaction Key
   - Save the settings
   - Restart the terminal if prompted

## Step 3: Configure Application Settings

1. **Set Environment Variables**:

   Add the following to your `.env` file:

   ```env
   # PAX Terminal Configuration
   # For WiFi Connection:
   PAX_TERMINAL_IP=192.168.1.100  # Replace with your terminal's IP address
   PAX_TERMINAL_PORT=10009         # Default port for WiFi
   
   # For USB Connection (use localhost):
   # PAX_TERMINAL_IP=localhost     # or 127.0.0.1 for USB connection
   # PAX_TERMINAL_PORT=4430        # Typical USB port (check with your terminal admin)
   
   PAX_TERMINAL_TIMEOUT=120000    # 2 minutes timeout for transactions
   
   # Authorize.Net Credentials (for reference, terminal uses its own config)
   AUTHORIZE_NET_API_LOGIN_ID=your_api_login_id
   AUTHORIZE_NET_TRANSACTION_KEY=your_transaction_key
   ```

2. **Update User Terminal IP** (Optional):
   - In the POS application, go to Settings
   - Enter your terminal IP address in the "Terminal IP" field
   - This allows the IP to be pre-filled during payment processing

## Step 4: Test Terminal Connection

1. **Test Connection**:
   - In the POS application, go to Settings
   - Click "Test Terminal Connection"
   - Verify that the connection is successful

2. **Test Payment**:
   - Process a small test transaction ($0.01 or $1.00)
   - Verify the transaction appears in your Authorize.Net account
   - Check that the terminal processes the payment correctly

## Step 5: Using the Terminal in POS

1. **During Checkout**:
   - Select "Card" as payment method
   - Choose "WiFi Terminal" option
   - Select "PAX Terminal" (not EBizCharge)
   - Enter or verify the terminal IP address
   - Click "Confirm Payment"

2. **On Terminal**:
   - The terminal will display the transaction amount
   - Customer can insert, swipe, or tap their card
   - Follow prompts on terminal screen
   - Transaction will be processed through Authorize.Net

3. **After Transaction**:
   - Terminal will display approval/decline message
   - Receipt will print automatically (if configured)
   - Transaction details will appear in POS system

## Troubleshooting

### Connection Issues

**Problem**: Cannot connect to terminal
- **Solution**: 
  - Verify terminal is powered on
  - Check IP address is correct
  - Ensure terminal and POS system are on same network
  - Check firewall settings (port 10009 should be open)
  - Verify WiFi connection on terminal

**Problem**: Connection timeout
- **Solution**:
  - Check network connectivity
  - Verify terminal is not processing another transaction
  - Increase timeout in environment variables if needed

### Payment Processing Issues

**Problem**: Transaction declined
- **Solution**:
  - Verify Authorize.Net credentials are correct on terminal
  - Check Authorize.Net account status
  - Verify card is valid and has funds
  - Check terminal logs for error codes

**Problem**: Terminal not responding
- **Solution**:
  - Restart the terminal
  - Check WiFi connection
  - Verify terminal firmware is up to date
  - Contact PAX support if issues persist

### Network Issues

**Problem**: Terminal IP not found
- **Solution**:
  - Check terminal network settings
  - Verify terminal is connected to WiFi
  - Use terminal discovery feature in POS (if available)
  - Manually configure static IP if needed

## Security Best Practices

1. **Change Default Password**:
   - Change the default terminal password from `pax9876@@`
   - Use a strong, unique password

2. **Network Security**:
   - Use secure WiFi (WPA2 or WPA3)
   - Consider using a dedicated network for payment terminals
   - Enable firewall rules to restrict access

3. **Credential Management**:
   - Store Authorize.Net credentials securely
   - Never share credentials
   - Rotate credentials periodically

4. **Terminal Security**:
   - Keep terminal firmware updated
   - Enable terminal lock/screen timeout
   - Restrict physical access to terminal

## Additional Resources

- [Authorize.Net Developer Documentation](https://developer.authorize.net/)
- [PAX Terminal Documentation](https://www.pax.us/support/)
- [Valor VP100 User Manual](https://www.pax.us/products/valor-vp100/)

## Support

For issues with:
- **Terminal Hardware**: Contact PAX support
- **Authorize.Net**: Contact Authorize.Net merchant support
- **POS Application**: Contact your system administrator

## Notes

- The terminal must be pre-configured with Authorize.Net credentials
- The terminal handles all card processing and gateway communication
- The POS application only sends transaction requests to the terminal
- All sensitive card data is handled by the terminal (PCI compliant)
- Transactions are processed in real-time through Authorize.Net
