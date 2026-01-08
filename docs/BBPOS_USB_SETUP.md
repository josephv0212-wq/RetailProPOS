# BBPOS CHIPPER™ 3X USB Connection Setup

This guide explains how to set up and use the BBPOS CHIPPER™ 3X card reader with USB connection in your RetailPro POS application.

## Device Specifications

From your Authorize.net 2.0 application:
- **Device Name**: BBPOS CHIPPER™ 3X
- **Configuration Version**: ANAU_G kernel_v2
- **Serial Number**: CHB30D515005535
- **Firmware Version**: 2.01.00.24
- **Connection Method**: USB (direct cable connection)
- **Status**: Connected (as shown in Authorize.net app)

## USB Connection Overview

Unlike network-based terminals (like PAX), the BBPOS CHIPPER™ 3X connected via USB:
- **Does NOT require IP address or port** - it's a direct USB device connection
- Uses **Authorize.Net Accept Mobile SDK** or **Accept.js** for card data capture
- Card data is encrypted on the reader and sent as **opaqueData** to the backend
- Backend processes the opaqueData through Authorize.Net API

## USB Connection Requirements

1. **Hardware Setup**:
   - Connect BBPOS CHIPPER™ 3X to your computer via USB cable
   - Ensure the reader is powered on
   - Verify the reader is recognized by your operating system

2. **USB Drivers** (if required):
   - **Windows**: Usually **plug-and-play** (no drivers needed). If not detected:
     - Check Device Manager for "BBPOS" or "USB Serial Device"
     - Download drivers from [BBPOS Support](https://www.bbpos.com/support) if needed
     - Common drivers: CH340, FTDI, or CP210x (depending on reader model)
   - **Mac**: Usually **plug-and-play** (no drivers needed)
   - **Linux**: Usually **plug-and-play**, may need `usbserial` module
   
   **Important Note**: Even with drivers installed, BBPOS CHIPPER 3X may not work with Web Serial API because it doesn't use standard serial communication. The reader is designed to work with Authorize.Net's Accept Mobile SDK, not Web Serial API.

3. **Authorize.Net Configuration**:
   - Reader must be configured in Authorize.Net (as shown in Authorize.net 2.0 app)
   - Authorize.Net credentials must be set in your `.env` file:
     ```env
     AUTHORIZE_NET_API_LOGIN_ID=your_api_login_id
     AUTHORIZE_NET_TRANSACTION_KEY=your_transaction_key
     ```

## How USB Payment Processing Works

### 1. Card Data Capture (Client-Side)
The POS application uses Authorize.Net's Accept Mobile SDK or Accept.js to:
- Detect the connected USB reader
- Capture card data when card is inserted/swiped/tapped
- Encrypt the card data on the reader
- Return encrypted `opaqueData` to the application

### 2. Payment Processing (Backend)
The application sends the opaqueData to your backend:
```javascript
{
  amount: 100.00,
  opaqueData: {
    descriptor: 'COMMON.ACCEPT.INAPP.PAYMENT',
    value: 'encrypted_card_data_here'
  },
  deviceSessionId: 'session_id',
  invoiceNumber: 'INV-12345',
  description: 'POS Sale'
}
```

### 3. Authorize.Net Processing
The backend sends the opaqueData to Authorize.Net API for processing:
- Authorize.Net decrypts the card data
- Processes the payment
- Returns transaction result

## Configuration in RetailPro POS

### Settings Page

**Note**: For USB-connected BBPOS readers, you **do NOT need to configure IP/Port** in Settings. The USB connection is direct device-to-computer.

However, ensure:
1. Authorize.Net credentials are set in environment variables
2. The reader is properly connected and recognized by your system
3. The reader is configured in Authorize.Net (as you've done in Authorize.net 2.0 app)

### Environment Variables

Add to your `.env` file:
```env
# Authorize.Net Credentials (Required for BBPOS)
AUTHORIZE_NET_API_LOGIN_ID=your_api_login_id
AUTHORIZE_NET_TRANSACTION_KEY=your_transaction_key

# Use sandbox for testing, production for live payments
NODE_ENV=development  # or 'production'
```

## Using BBPOS Reader in POS

### Payment Flow

1. **Select Card Payment**:
   - Choose "Card" as payment method
   - Select "Bluetooth Reader" option (also works for USB)

2. **Reader Detection**:
   - The application will detect the USB-connected reader
   - If using Accept Mobile SDK, it will auto-detect the device
   - If using Web Serial API, you may need to select the device

3. **Card Transaction**:
   - Customer inserts, swipes, or taps card on reader
   - Reader encrypts card data
   - Application receives opaqueData
   - Payment is processed automatically

4. **Transaction Result**:
   - Success/decline message displayed
   - Receipt printed (if configured)
   - Sale recorded in system

## Troubleshooting USB Connection

### Reader Not Detected

**Problem**: Application can't find the USB reader

**Solutions**:
1. **Check USB Connection**:
   - Verify USB cable is securely connected
   - Try a different USB port
   - Try a different USB cable

2. **Check Device Recognition**:
   - **Windows**: Open Device Manager, look for "BBPOS" or "USB Serial Device"
   - **Mac**: Check System Information > USB
   - **Linux**: Run `lsusb` to see connected USB devices

3. **Install Drivers** (if needed):
   - Download drivers from BBPOS website
   - Install appropriate drivers for your OS
   - Restart computer after driver installation

### Payment Processing Fails

**Problem**: Card data captured but payment fails

**Solutions**:
1. **Check Authorize.Net Credentials**:
   - Verify API Login ID and Transaction Key are correct
   - Check credentials in Authorize.Net Merchant Interface

2. **Check Network Connection**:
   - Ensure internet connection is active
   - Verify Authorize.Net API endpoint is accessible

3. **Check Card**:
   - Verify card is valid and has funds
   - Try a different card
   - Check card expiration date

4. **Check Logs**:
   - Review backend logs for error messages
   - Check Authorize.Net transaction logs

### Reader Shows Error on Screen

**Problem**: Reader displays error message

**Solutions**:
1. **Power Cycle Reader**:
   - Unplug USB cable
   - Wait 5 seconds
   - Reconnect USB cable

2. **Check Firmware**:
   - Current firmware: 2.01.00.24
   - Update if newer version available (via Authorize.net 2.0 app)

3. **Reset Reader**:
   - Refer to BBPOS documentation for reset procedure
   - May need to reconfigure in Authorize.net 2.0 app after reset

## USB vs Bluetooth vs Network Terminals

| Connection Type | IP/Port Needed? | Setup Complexity | Example Device |
|----------------|-----------------|------------------|----------------|
| **USB** | ❌ No | Simple | BBPOS CHIPPER™ 3X |
| **Bluetooth** | ❌ No | Moderate | BBPOS CHIPPER™ 3X |
| **Network (WiFi)** | ✅ Yes | Complex | PAX Valor VP100 |
| **Network (USB-to-Ethernet)** | ✅ Yes | Moderate | Some terminals |

## Security Notes

- **Card Data Encryption**: All card data is encrypted on the reader before transmission
- **PCI Compliance**: Using opaqueData keeps your application PCI compliant
- **Never Store Card Data**: Only encrypted opaqueData is used, never raw card numbers
- **Secure Transmission**: All API calls should use HTTPS in production

## Additional Resources

- [BBPOS Documentation](https://www.bbpos.com/support)
- [Authorize.Net Accept Mobile SDK](https://developer.authorize.net/api/reference/features/mobile_in_app.html)
- [Authorize.Net Accept.js](https://developer.authorize.net/api/reference/features/acceptjs.html)
- [Authorize.Net Developer Center](https://developer.authorize.net/)

## Support

For issues with:
- **Reader Hardware**: Contact BBPOS support
- **Authorize.Net**: Contact Authorize.Net merchant support  
- **POS Application**: Check application logs or contact administrator

## Notes

- USB connection does NOT require network configuration (no IP/Port)
- The reader appears as a USB device in your operating system
- Card data capture happens client-side via Accept SDK
- Backend only processes the encrypted opaqueData
- USB connection is more reliable than Bluetooth for stationary setups
- The reader must be configured in Authorize.Net before use (done via Authorize.net 2.0 app)
