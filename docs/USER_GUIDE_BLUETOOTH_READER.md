# User Guide: Using Bluetooth Card Reader with RetailPro POS

## Overview
This guide is for end users who want to use the BBPOS Chipper 3X card reader (USB/Bluetooth) with the RetailPro POS system.

## Important: Browser Requirements

⚠️ **Web Bluetooth API requires HTTPS or localhost**

- If your POS is running on `http://86.104.72.45:5000` (HTTP), Web Bluetooth **will NOT work**
- You need either:
  - **HTTPS** (https://your-domain.com) - Recommended for production
  - **localhost** (http://localhost:5000) - Only works on the same machine

## Setup Steps

### Step 1: Prepare Your Card Reader

1. **Power on your BBPOS Chipper 3X card reader**
   - Make sure it's charged or plugged in
   - The LED should be blinking or solid (indicating it's on)

2. **Put reader in pairing mode** (if not already paired)
   - Usually involves holding a button for a few seconds
   - Check your reader's manual for specific instructions
   - The LED will change pattern when in pairing mode

3. **Pair with your PC via Bluetooth**
   - Open Windows Settings → Bluetooth & devices
   - Click "Add device"
   - Select your BBPOS reader from the list
   - Wait for "Connected" status

### Step 2: Access Your POS System

**Option A: If you have HTTPS set up**
- Open Chrome or Edge browser
- Go to: `https://86.104.72.45:5000` (or your domain)
- Web Bluetooth will work

**Option B: If you only have HTTP (current setup)**
- Web Bluetooth won't work directly
- You have two options:

#### Option B1: Use Test Mode (Recommended for now)
- The system will automatically show Test Mode
- You can manually enter card data for testing
- See "Using Test Mode" section below

#### Option B2: Set up HTTPS (For production)
- Install SSL certificate on your VPS
- Use a reverse proxy (nginx/Apache) with SSL
- Or use a service like Cloudflare for HTTPS

### Step 3: Create a Sale

1. **Log in to your POS system**
   - Go to your POS URL: `http://86.104.72.45:5000`
   - Enter your username and password

2. **Add items to cart**
   - Browse or search for items
   - Click items to add them to cart
   - Review the cart

3. **Select customer** (optional)
   - Choose a customer if needed
   - Or proceed without customer

4. **Click "Checkout" or "Payment"**

### Step 4: Process Payment with Bluetooth Reader

1. **Select Payment Method**
   - Click on "Credit Card" or "Debit Card" button

2. **Enable Bluetooth Reader**
   - You'll see a green box labeled "📱 Bluetooth Card Reader"
   - Check the checkbox to enable it
   - This will disable the PAX Terminal option

3. **Pair the Reader**

   **If Web Bluetooth is available (HTTPS):**
   - Click "🔗 Pair Bluetooth Reader" button
   - Browser will show a popup: "Select a device"
   - Choose your BBPOS reader from the list
   - Click "Pair"
   - You should see: "✅ Reader connected!"
   - Test Mode will appear automatically

   **If Web Bluetooth is NOT available (HTTP):**
   - Click "🔗 Pair Bluetooth Reader" button
   - You'll see a message: "Web Bluetooth not available"
   - Test Mode will appear automatically
   - This is normal for HTTP connections

4. **Capture Card Data**

   **Method 1: Using Accept Mobile SDK (Full Integration)**
   - If you have Accept Mobile SDK integrated:
   - The SDK will handle card reading automatically
   - Swipe, insert, or tap the card on the reader
   - The opaqueData will be captured automatically
   - You'll see "✅ Ready" status

   **Method 2: Using Test Mode (For Testing)**
   - Test Mode section will appear
   - You need to get opaqueData from Accept Mobile SDK or use test values
   - See "Using Test Mode" section below

5. **Complete Payment**
   - Once you see "✅ Ready" status
   - Review the payment amount
   - Click the payment button (e.g., "Pay $XX.XX")
   - Wait for processing
   - You'll see success message when done

## Using Test Mode

Test Mode allows you to manually enter card data when Web Bluetooth isn't available or for testing purposes.

### When Test Mode Appears:
- After clicking "Pair Bluetooth Reader"
- If Web Bluetooth is not available
- If reader connection fails

### How to Use Test Mode:

1. **Get opaqueData** (You need this from one of these sources):
   
   **Option A: From Accept Mobile SDK**
   - If you have Accept Mobile SDK integrated
   - Scan/insert card using the SDK
   - Copy the opaqueData values

   **Option B: From Authorize.Net Test Values**
   - Use Authorize.Net's test card data
   - Generate opaqueData using Accept.js
   - Or contact Authorize.Net support for test values

   **Option C: For Initial Testing**
   - Use regular card entry method first
   - Check the transaction response format
   - Use similar format for test data

2. **Enter Data in Test Mode:**
   - **Data Descriptor**: Usually `COMMON.ACCEPT.INAPP.PAYMENT`
   - **Data Value**: The encrypted card data (long string)
   - **Session ID**: Optional, can leave empty

3. **Load Test Data:**
   - Click "Load Test Data" button
   - You should see "✅ Ready" status
   - Reader info will show "Test Bluetooth Reader"

4. **Complete Payment:**
   - Click the payment button
   - Payment will be processed

## What You'll See

### Successful Connection:
```
✅ Reader connected!
Reader: BBPOS Reader
Status: Ready
```

### Test Mode:
```
🧪 Test Mode - Manual Entry
[Data Descriptor input field]
[Data Value input field]
[Session ID input field]
[Load Test Data button]
```

### Ready to Pay:
```
✅ Ready
Reader: BBPOS Reader
Card: ****TEST (or masked card number)
Battery: 100%
```

## Troubleshooting

### Problem: "Web Bluetooth not available"
**Solution**: 
- This is normal for HTTP connections
- Use Test Mode instead
- Or set up HTTPS on your server

### Problem: "Reader not found"
**Solution**:
- Make sure reader is powered on
- Check Bluetooth is enabled on your PC
- Ensure reader is in pairing mode
- Try pairing again in Windows Settings first
- Use Test Mode as alternative

### Problem: "Invalid opaqueData"
**Solution**:
- Make sure you entered both descriptor and value
- Check the data format is correct
- Verify you're using valid test data

### Problem: "Payment processing failed"
**Solution**:
- Check your internet connection
- Verify Authorize.Net credentials are correct
- Check backend server logs
- Try with a smaller test amount first

## For Production Use

To use the Bluetooth reader in production:

1. **Set up HTTPS**
   - Install SSL certificate
   - Configure reverse proxy with SSL
   - Use domain name instead of IP

2. **Integrate Accept Mobile SDK**
   - Get SDK from Authorize.Net
   - Follow integration documentation
   - This enables automatic card reading

3. **Test thoroughly**
   - Test with real cards
   - Verify all payment types work
   - Test error handling

## Quick Reference

**Current Setup:**
- POS URL: `http://86.104.72.45:5000`
- Web Bluetooth: ❌ Not available (HTTP)
- Solution: Use Test Mode

**For Full Functionality:**
- POS URL: `https://your-domain.com` (HTTPS)
- Web Bluetooth: ✅ Available
- Accept Mobile SDK: ✅ Integrated
- Result: Full automatic card reading

## Support

If you encounter issues:
1. Check this guide first
2. Review error messages carefully
3. Check browser console (F12) for errors
4. Check backend logs on your VPS
5. Contact support with error details

