# Accept.js Integration Guide

This document explains how to set up and use Authorize.Net's Accept.js for secure card data encryption in the RetailPro POS application.

## Overview

Accept.js is Authorize.Net's JavaScript library that encrypts card data in the browser before sending it to your server. This reduces your PCI compliance scope since card data never touches your server in plain text.

## Prerequisites

1. **Authorize.Net Merchant Account**: You need an active Authorize.Net merchant account
2. **Public Client Key**: Generate a Public Client Key from your Authorize.Net merchant interface
3. **HTTPS**: Accept.js requires HTTPS in production (localhost is fine for development)

## Setup Steps

### 1. Generate Public Client Key

1. Log in to your [Authorize.Net Merchant Interface](https://account.authorize.net/)
2. Navigate to **Account** > **Settings** > **Security Settings** > **General Security Settings**
3. Click **Manage Public Client Key**
4. If you don't have a public client key:
   - Click **Generate New Public Client Key**
   - Answer your security question
   - Copy the generated key (you'll need this for the environment variable)
5. If you already have a key, you can view or regenerate it

**Important**: 
- Sandbox (test) accounts have separate public client keys from production
- Production keys only work in production mode
- Test keys only work in sandbox/test mode

### 2. Configure Environment Variable

Add the public client key to your frontend environment variables:

**For development (`client/.env.local` or `.env`):**
```env
VITE_AUTHORIZE_NET_PUBLIC_CLIENT_KEY=your_sandbox_public_client_key_here
```

**For production:**
```env
VITE_AUTHORIZE_NET_PUBLIC_CLIENT_KEY=your_production_public_client_key_here
```

**Note**: The `VITE_` prefix is required for Vite to expose the variable to the client-side code.

### 3. Accept.js Library

The Accept.js library is automatically loaded from Authorize.Net's CDN in `client/index.html`:

```html
<script type="text/javascript" src="https://js.authorize.net/v1/Accept.js" charset="utf-8"></script>
```

No additional installation is required - it loads automatically when the page loads.

## How It Works

### Manual Entry Flow

1. User enters card details in the payment form
2. When payment is confirmed, the card data is encrypted using Accept.js
3. Accept.js returns `opaqueData` (a one-time-use token)
4. The `opaqueData` is sent to your backend
5. Your backend processes the payment using the `opaqueData` with Authorize.Net's API

### USB Card Reader Flow

1. User clicks "USB Card Reader" option
2. When payment is confirmed, the app requests USB device access
3. Card is read from the BBPOS USB reader via Web Serial API
4. Card data is encrypted using Accept.js
5. Encrypted `opaqueData` is sent to your backend for processing

## Code Structure

### Accept.js Service (`client/src/services/acceptJsService.ts`)

This service handles:
- Loading Accept.js library
- Encrypting card data
- Returning opaqueData for backend processing

**Key Functions:**
- `loadAcceptJs()`: Ensures Accept.js library is loaded
- `encryptCardData()`: Encrypts card data and returns opaqueData
- `isAcceptJsAvailable()`: Checks if Accept.js is ready

### Payment Modal (`client/src/app/components/PaymentModal.tsx`)

The Payment Modal component:
- Detects Accept.js availability
- Encrypts card data before sending to backend
- Handles both manual entry and USB reader modes

## Browser Compatibility

### Accept.js
- **Works in**: All modern browsers (Chrome, Firefox, Safari, Edge)
- **Requires**: HTTPS (except localhost)

### Web Serial API (for USB readers)
- **Works in**: Chrome, Edge, Opera
- **Does NOT work in**: Firefox, Safari
- **Requires**: HTTPS (except localhost) AND user permission

## Testing

### Sandbox Testing

1. Use your sandbox (test) public client key
2. Use test card numbers from Authorize.Net documentation:
   - **Success**: `4111111111111111`
   - **Decline**: `4000000000000002`
   - **Error**: `4000000000000069`
   - CVV: Any 3-4 digits
   - Expiry: Any future date (MM/YY format)

3. Test the encryption flow:
   - Enter a test card
   - Check browser console for Accept.js messages
   - Verify opaqueData is generated

### Production Testing

1. Use your production public client key
2. Use real card numbers (start with small amounts)
3. Monitor Authorize.Net merchant interface for transactions

## Troubleshooting

### Error: "Accept.js is not available"

**Possible Causes:**
- Internet connection issue
- Accept.js CDN blocked by firewall
- Script failed to load

**Solutions:**
- Check internet connection
- Check browser console for errors
- Verify Accept.js script tag in `index.html`
- Try loading Accept.js manually: Visit `https://js.authorize.net/v1/Accept.js` in browser

### Error: "Invalid public client key"

**Possible Causes:**
- Wrong public client key (sandbox vs production mismatch)
- Key not configured in environment variables
- Key expired or regenerated

**Solutions:**
- Verify `VITE_AUTHORIZE_NET_PUBLIC_CLIENT_KEY` is set correctly
- Check if you're using sandbox key in sandbox mode
- Regenerate public client key if needed

### Error: "Web Serial API not supported"

**Cause**: Using a browser that doesn't support Web Serial API

**Solutions:**
- Use Chrome, Edge, or Opera browser
- For other browsers, use Manual Entry mode instead

### Card Data Not Encrypting

**Possible Causes:**
- Public client key not configured
- Accept.js not loaded
- Encryption failed silently

**Solutions:**
- Check environment variable is set: `console.log(import.meta.env.VITE_AUTHORIZE_NET_PUBLIC_CLIENT_KEY)`
- Check browser console for Accept.js errors
- Verify Accept.js is loaded: `console.log(window.Accept)`
- If encryption fails, card data falls back to direct transmission (less secure)

## Security Best Practices

1. **Always use HTTPS in production**: Accept.js requires HTTPS (except localhost)

2. **Never log card data**: Even though Accept.js encrypts data, never log raw card numbers

3. **Use public client key correctly**:
   - Never commit public client keys to version control
   - Use different keys for sandbox and production
   - Rotate keys periodically

4. **Handle errors gracefully**: If Accept.js fails, fallback to direct card data transmission is less secure but functional

5. **Validate on backend**: Always validate opaqueData on your backend before processing

## Backend Processing

The backend receives `opaqueData` in the `bluetoothPayload` field:

```javascript
{
  useBluetoothReader: true,
  bluetoothPayload: {
    descriptor: "COMMON.ACCEPT.INAPP.PAYMENT",
    value: "encrypted_token_here",
    sessionId: "SESSION-1234567890"
  }
}
```

The backend then processes this using Authorize.Net's API. See `server/services/authorizeNetService.js` for implementation details.

## Additional Resources

- [Authorize.Net Accept.js Documentation](https://developer.authorize.net/api/reference/features/acceptjs.html)
- [Authorize.Net Developer Center](https://developer.authorize.net/)
- [Test Card Numbers](https://developer.authorize.net/hello_world/testing_guide.html)
- [Web Serial API Documentation](https://developer.mozilla.org/en-US/docs/Web/API/Web_Serial_API)

## Support

For issues with:
- **Accept.js library**: Contact Authorize.Net support
- **Integration issues**: Check browser console for errors
- **USB reader issues**: See `docs/BBPOS_USB_SETUP.md`
