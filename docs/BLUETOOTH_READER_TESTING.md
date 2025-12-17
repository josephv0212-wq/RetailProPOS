# Bluetooth Card Reader Testing Guide

## Overview
This guide will help you test the BBPOS AWC Walker C3X Bluetooth card reader integration with your RetailPro POS system.

## Prerequisites

1. **Bluetooth Reader Connected**: Your BBPOS reader should be paired with your PC via Bluetooth
2. **Authorize.Net Account**: You need valid Authorize.Net sandbox credentials for testing
3. **Browser**: Use Chrome or Edge (Web Bluetooth API support required)

## Testing Methods

### Method 1: Test Mode (Recommended for Initial Testing)

This method allows you to manually enter `opaqueData` to test the payment processing flow without needing the full Accept Mobile SDK integration.

#### Steps:

1. **Start the POS Application**
   - Make sure both backend and frontend servers are running
   - Open the POS interface in Chrome/Edge browser

2. **Create a Test Sale**
   - Add items to cart
   - Click "Checkout" or "Payment"

3. **Select Payment Method**
   - Choose "Credit Card" or "Debit Card"
   - Enable "Bluetooth Card Reader" option

4. **Pair Bluetooth Reader**
   - Click "🔗 Pair Bluetooth Reader" button
   - If Web Bluetooth is available, it will try to connect to your reader
   - If connection fails or Web Bluetooth is not available, **Test Mode** will automatically appear

5. **Enter Test Data in Test Mode**
   - In the Test Mode section, you'll see fields for:
     - **Data Descriptor**: Enter `COMMON.ACCEPT.INAPP.PAYMENT` (standard descriptor)
     - **Data Value**: Enter a test encrypted value (see below for test values)
     - **Session ID**: Optional, can leave empty or enter a test ID

6. **Test Values for Authorize.Net Sandbox**

   For testing with Authorize.Net sandbox, you can use these test opaqueData values:
   
   **Note**: In a real scenario, these values come from the Accept Mobile SDK after card is scanned. For testing, you can use:
   
   - **Descriptor**: `COMMON.ACCEPT.INAPP.PAYMENT`
   - **Value**: You'll need to get this from Authorize.Net's Accept.js or Accept Mobile SDK
   
   **Alternative**: Use the regular card entry method first to get a successful transaction, then note the opaqueData format from the response.

7. **Load Test Data**
   - Click "Load Test Data" button
   - You should see "✅ Ready" status

8. **Complete Payment**
   - Click the payment button
   - The system will process the payment through Authorize.Net using the opaqueData

### Method 2: Web Bluetooth Connection (Partial)

If your browser supports Web Bluetooth API:

1. Click "Pair Bluetooth Reader"
2. Browser will prompt you to select the Bluetooth device
3. Select your BBPOS reader from the list
4. Connection will be established
5. **Note**: Card reading still requires Accept Mobile SDK - Web Bluetooth only handles the connection

### Method 3: Full Integration with Accept Mobile SDK (Production)

For full functionality, you need to integrate Authorize.Net's Accept Mobile SDK:

1. **Get Accept Mobile SDK**
   - Sign up for Authorize.Net developer account
   - Download Accept Mobile SDK
   - Follow integration documentation

2. **Integration Steps**:
   ```javascript
   // Example integration (pseudo-code)
   const acceptSDK = new AcceptMobileSDK({
     apiLoginId: 'YOUR_API_LOGIN_ID',
     clientKey: 'YOUR_CLIENT_KEY'
   });
   
   // Pair with reader
   const reader = await acceptSDK.pairReader();
   
   // Capture card
   const cardData = await acceptSDK.captureCard({
     amount: totalAmount,
     readerId: reader.id
   });
   
   // Get opaqueData
   const opaqueData = {
     descriptor: cardData.opaqueData.dataDescriptor,
     value: cardData.opaqueData.dataValue,
     sessionId: cardData.deviceSessionId
   };
   
   // Use this opaqueData in the payment flow
   ```

## Testing the Backend Directly

You can also test the backend payment processing directly using curl or Postman:

```bash
POST http://localhost:3000/api/bbpos/payment
Headers:
  Authorization: Bearer YOUR_JWT_TOKEN
  Content-Type: application/json

Body:
{
  "amount": "10.00",
  "opaqueData": {
    "descriptor": "COMMON.ACCEPT.INAPP.PAYMENT",
    "value": "YOUR_ENCRYPTED_DATA_VALUE"
  },
  "deviceSessionId": "optional-session-id",
  "invoiceNumber": "TEST-001",
  "description": "Test Payment"
}
```

## Troubleshooting

### Issue: "Web Bluetooth not available"
**Solution**: 
- Use Chrome or Edge browser
- Make sure you're using HTTPS or localhost
- Check browser permissions for Bluetooth

### Issue: "Reader not found"
**Solution**:
- Ensure reader is powered on
- Check Bluetooth is enabled on your PC
- Make sure reader is in pairing mode
- Use Test Mode to manually enter data

### Issue: "Invalid opaqueData"
**Solution**:
- Ensure both descriptor and value are provided
- Check that the value is properly formatted (base64 encoded)
- Verify you're using valid test data from Authorize.Net

### Issue: "Payment processing failed"
**Solution**:
- Check Authorize.Net credentials in `.env` file
- Verify you're using sandbox credentials for testing
- Check network connectivity
- Review backend logs for detailed error messages

## Environment Variables

Make sure these are set in your `.env` file:

```env
AUTHORIZE_NET_API_LOGIN_ID=your_sandbox_login_id
AUTHORIZE_NET_TRANSACTION_KEY=your_sandbox_transaction_key
NODE_ENV=development  # Uses sandbox endpoint
```

## Next Steps

1. **Test with Test Mode**: Verify the payment flow works with manual opaqueData entry
2. **Integrate Accept Mobile SDK**: For production use, integrate the full SDK
3. **Test with Real Cards**: Once SDK is integrated, test with actual card swipes/inserts

## Support

For issues or questions:
- Check Authorize.Net documentation: https://developer.authorize.net/
- Review Accept Mobile SDK documentation
- Check backend logs for detailed error messages

