# Quick Start: Testing Bluetooth Reader from Your PC

## Your Setup
- **POS Server**: `http://86.104.72.45:5000` (on VPS)
- **Your PC**: Different IP, has Bluetooth reader connected
- **Browser**: Chrome or Edge

## ⚠️ Important Limitation

**Web Bluetooth requires HTTPS** - Since your server uses HTTP, Web Bluetooth won't work directly. But **Test Mode will work perfectly** for testing!

## Step-by-Step Testing

### Step 1: Prepare Reader
1. Power on your BBPOS card reader
2. Pair it with your PC:
   - Windows Settings → Bluetooth & devices
   - Click "Add device"
   - Select your BBPOS reader
   - Wait for "Connected"

### Step 2: Open POS
1. Open Chrome/Edge browser on your PC
2. Go to: `http://86.104.72.45:5000`
3. Log in to your POS account

### Step 3: Create Sale
1. Add some items to cart
2. Click "Checkout" or "Payment"

### Step 4: Select Payment
1. Click "Credit Card" or "Debit Card" button
2. Check the "📱 Bluetooth Card Reader" checkbox (green box)

### Step 5: Pair Reader
1. Click "🔗 Pair Bluetooth Reader" button
2. You'll see: "Web Bluetooth not available" - **This is normal!**
3. **Test Mode will appear automatically** (yellow box)

### Step 6: Enter Test Data

In the Test Mode section, you need to enter:

**For Testing (You have 2 options):**

#### Option A: Use Accept.js to Generate Test Data

1. **Open Authorize.Net's Accept.js test page**:
   - Go to: https://developer.authorize.net/api/reference/index.html#accept-js
   - Or use their sandbox test environment

2. **Generate opaqueData**:
   - Use a test card: `4111111111111111` (Visa test card)
   - Expiration: Any future date (e.g., `12/25`)
   - CVV: `123`
   - This will generate opaqueData for you

3. **Copy the values**:
   - Copy the `dataDescriptor` (usually `COMMON.ACCEPT.INAPP.PAYMENT`)
   - Copy the `dataValue` (long encrypted string)

#### Option B: Use Regular Card Entry First (Easier for Testing)

1. **Disable Bluetooth Reader** (uncheck the checkbox)
2. **Enter card manually**:
   - Card: `4111111111111111`
   - Expiration: `12/25`
   - CVV: `123`
   - ZIP: `12345`
3. **Complete payment** - This will work and process through Authorize.Net
4. **Note**: This tests the payment flow, but not the Bluetooth reader specifically

### Step 7: Load Test Data (If using Option A)

1. In Test Mode, enter:
   - **Data Descriptor**: `COMMON.ACCEPT.INAPP.PAYMENT`
   - **Data Value**: (paste the encrypted value from Accept.js)
   - **Session ID**: (leave empty or enter `TEST-001`)

2. Click "Load Test Data" button

3. You should see:
   - ✅ Ready
   - Reader: Test Bluetooth Reader
   - Card: ****TEST

### Step 8: Complete Payment

1. Review the total amount
2. Click the payment button (e.g., "Pay $XX.XX")
3. Wait for processing
4. You should see success message

## What You'll See

### When Test Mode Appears:
```
🧪 Test Mode - Manual Entry
For testing: Enter opaqueData manually

Data Descriptor: [input field]
Data Value: [input field]
Session ID: [input field]
[Load Test Data button]
```

### After Loading Test Data:
```
✅ Ready
Reader: Test Bluetooth Reader
Card: ****TEST
Battery: 100%
```

## Quick Test Without Real opaqueData

**Simplest way to test the flow:**

1. Enable Bluetooth Reader checkbox
2. Click "Pair Bluetooth Reader"
3. Test Mode appears
4. **Instead of entering real opaqueData**, just:
   - Enter any descriptor: `COMMON.ACCEPT.INAPP.PAYMENT`
   - Enter any test value: `TEST_VALUE_12345`
   - Click "Load Test Data"
5. Try to complete payment
6. It will fail at payment processing (expected), but you'll see:
   - The flow works
   - The UI works
   - The backend receives the data

**To test actual payment**, you need real opaqueData from Accept.js or Accept Mobile SDK.

## For Real Card Reading

To actually read cards from the Bluetooth reader, you need:

1. **HTTPS on your server** (SSL certificate)
2. **Accept Mobile SDK integrated** in your frontend
3. Then cards can be read automatically

## Troubleshooting

### "Web Bluetooth not available"
✅ **This is normal** - Your server uses HTTP, not HTTPS
✅ **Test Mode will work** - Use that instead

### "Reader not found"
- Make sure reader is powered on
- Check it's paired in Windows Bluetooth settings
- Use Test Mode as alternative

### "Invalid opaqueData" or "Payment failed"
- Make sure you entered both descriptor and value
- For real testing, use Accept.js to generate valid opaqueData
- Or test with regular card entry first

## Summary

**For your current setup (HTTP on VPS):**
1. ✅ Test Mode works perfectly
2. ✅ You can test the payment flow
3. ❌ Web Bluetooth won't work (needs HTTPS)
4. ❌ Automatic card reading needs Accept Mobile SDK

**To test right now:**
- Use Test Mode with manually entered opaqueData
- Or use regular card entry to test payment processing
- Both will work over HTTP

**For production:**
- Set up HTTPS on your VPS
- Integrate Accept Mobile SDK
- Then full Bluetooth card reading will work

