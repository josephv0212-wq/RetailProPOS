# USB Card Reader Guide

## Overview
Your BBPOS AWC Walker C3X card reader is connected via **USB** instead of Bluetooth. USB card readers work differently and are often easier to set up!

## How USB Card Readers Work

USB card readers typically work in one of two ways:

### 1. HID (Keyboard) Mode (Most Common)
- The reader acts like a **keyboard**
- When you swipe/insert a card, it "types" the card data
- The data appears in whatever field has focus
- **No special drivers needed** - works automatically!

### 2. USB Serial/Communication Protocol
- Requires specific drivers or SDK
- Uses USB serial communication
- May need Authorize.Net's Accept Mobile SDK

## Using Your USB Reader

### Step-by-Step Instructions

1. **Connect Your Reader**
   - Plug USB reader into your PC
   - Windows should recognize it automatically
   - No pairing needed (unlike Bluetooth)

2. **Open Your POS**
   - Go to: `http://86.104.72.45:5000`
   - Log in and create a sale

3. **Enable Card Reader**
   - Go to payment screen
   - Select "Credit Card" or "Debit Card"
   - Enable "Card Reader (USB/Bluetooth)" checkbox
   - Select **"USB Connected"** radio button

4. **Activate Reader**
   - Click **"🔌 Activate USB Reader"** button
   - You'll see: "✓ Reader is active"

5. **Capture Card Data**
   - Click in the **"Card Number"** field (it will highlight in green)
   - **Swipe, insert, or tap** your card on the reader
   - The card number will automatically appear in the field!

6. **Complete Payment**
   - Fill in expiration, CVV, ZIP (if needed)
   - Complete the payment

## Important Notes

### For HID (Keyboard) Mode Readers:
- ✅ **Works immediately** - no setup needed
- ✅ **No HTTPS required** - works over HTTP
- ✅ **Simple to use** - just swipe and data appears
- ⚠️ **Security**: Card data is typed as plain text (not encrypted)
- ⚠️ **For production**: You may want to use Accept Mobile SDK for encrypted data

### For Encrypted USB Readers:
- Requires Authorize.Net's Accept Mobile SDK
- Provides encrypted opaqueData (more secure)
- Still works over USB connection
- Better for production use

## Testing Your USB Reader

### Quick Test:

1. Enable "Card Reader" → Select "USB Connected"
2. Click "Activate USB Reader"
3. Click in the Card Number field
4. Swipe a test card
5. Card number should appear automatically

### If Card Data Doesn't Appear:

1. **Check USB connection**
   - Make sure reader is plugged in
   - Check Windows Device Manager
   - Try a different USB port

2. **Check reader mode**
   - Some readers have a mode switch
   - Make sure it's in "HID" or "Keyboard" mode
   - Check reader manual

3. **Test in Notepad**
   - Open Notepad
   - Click in Notepad
   - Swipe a card
   - If data appears in Notepad, reader works!
   - Then try in POS again

4. **Check focus**
   - Make sure the Card Number field has focus (click in it)
   - The field should highlight when active

## USB vs Bluetooth

| Feature | USB | Bluetooth |
|---------|-----|-----------|
| Setup | ✅ Plug and play | ⚠️ Requires pairing |
| HTTPS | ❌ Not required | ✅ Required for Web Bluetooth |
| Drivers | Usually not needed | Usually not needed |
| Range | Limited by cable | Wireless (up to 30ft) |
| Security | ⚠️ May send plain text | ✅ Encrypted (with SDK) |

## For Production Use

### Option 1: Use HID Mode (Current Setup)
- ✅ Works now
- ✅ Simple
- ⚠️ Card data sent as plain text
- ✅ Still secure if using HTTPS for transmission

### Option 2: Use Accept Mobile SDK (Recommended)
- ✅ Encrypted card data (opaqueData)
- ✅ More secure
- ✅ PCI compliant
- ⚠️ Requires SDK integration

## Troubleshooting

### "Card data not appearing"
- Make sure field has focus (click in it)
- Check USB connection
- Test in Notepad first
- Check reader is in HID mode

### "Reader not recognized"
- Check USB cable connection
- Try different USB port
- Check Windows Device Manager
- Install reader drivers if needed

### "Data appears but payment fails"
- This is normal - you're testing the reader, not payment
- Use test card: `4111111111111111`
- Check Authorize.Net credentials

## Summary

**Your USB reader should work like this:**
1. Enable Card Reader → USB Connected
2. Activate reader
3. Click in Card Number field
4. Swipe card
5. Data appears automatically!

**No HTTPS needed, no pairing needed - just plug and use!**

