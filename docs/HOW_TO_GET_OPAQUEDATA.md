# How to Get opaqueData for Testing

## What You Need

To test the Bluetooth card reader payment flow, you need:
- **Data Descriptor**: Usually `COMMON.ACCEPT.INAPP.PAYMENT`
- **Data Value**: Encrypted card data (long string)
- **Session ID**: Optional device session identifier

## Method 1: Using Authorize.Net Accept.js (Recommended)

### Step 1: Create a Test HTML Page

Create a simple HTML file to generate opaqueData:

```html
<!DOCTYPE html>
<html>
<head>
    <title>Generate opaqueData for Testing</title>
    <script type="text/javascript" src="https://jstest.authorize.net/v1/Accept.js" charset="utf-8"></script>
</head>
<body>
    <h2>Generate opaqueData for Testing</h2>
    
    <form id="paymentForm">
        <div>
            <label>Card Number:</label>
            <input type="text" id="cardNumber" value="4111111111111111" placeholder="4111111111111111">
        </div>
        <div>
            <label>Expiration Date (MM/YY):</label>
            <input type="text" id="expDate" value="12/25" placeholder="12/25">
        </div>
        <div>
            <label>CVV:</label>
            <input type="text" id="cvv" value="123" placeholder="123">
        </div>
        <div>
            <label>ZIP Code:</label>
            <input type="text" id="zip" value="12345" placeholder="12345">
        </div>
        <button type="button" onclick="sendPaymentDataToAnet()">Generate opaqueData</button>
    </form>
    
    <div id="result" style="margin-top: 20px; padding: 10px; background: #f0f0f0; display: none;">
        <h3>Generated opaqueData:</h3>
        <p><strong>Data Descriptor:</strong></p>
        <textarea id="descriptor" rows="2" style="width: 100%;"></textarea>
        <p><strong>Data Value:</strong></p>
        <textarea id="dataValue" rows="5" style="width: 100%;"></textarea>
        <p><strong>Copy these values to your POS Test Mode!</strong></p>
    </div>

    <script>
        function sendPaymentDataToAnet() {
            var authData = {};
            authData.clientKey = "YOUR_CLIENT_KEY"; // Get from Authorize.Net
            authData.apiLoginID = "YOUR_API_LOGIN_ID"; // Get from Authorize.Net
            
            var cardData = {};
            cardData.cardNumber = document.getElementById("cardNumber").value;
            cardData.month = document.getElementById("expDate").value.split("/")[0];
            cardData.year = "20" + document.getElementById("expDate").value.split("/")[1];
            cardData.cvv = document.getElementById("cvv").value;
            cardData.zipCode = document.getElementById("zip").value;
            
            Accept.dispatchData(secureData, responseHandler);
            
            function secureData(response) {
                if (response.messages.resultCode === "Error") {
                    alert("Error: " + response.messages.message[0].text);
                } else {
                    // Success! Display the opaqueData
                    document.getElementById("descriptor").value = response.opaqueData.dataDescriptor;
                    document.getElementById("dataValue").value = response.opaqueData.dataValue;
                    document.getElementById("result").style.display = "block";
                }
            }
        }
    </script>
</body>
</html>
```

### Step 2: Get Your Authorize.Net Credentials

1. **Log in to Authorize.Net**:
   - Sandbox: https://sandbox.authorize.net/
   - Production: https://account.authorize.net/

2. **Get your credentials**:
   - **API Login ID**: Found in Account → Settings → Security Settings → API Credentials & Keys
   - **Transaction Key**: Same location (you may need to generate it)
   - **Client Key**: Found in Account → Settings → Security Settings → Accept Customer (for Accept.js)

3. **Update the HTML file** with your credentials

4. **Open the HTML file** in a browser and generate opaqueData

## Method 2: Using Authorize.Net API Directly (Backend)

You can create a simple backend endpoint to generate opaqueData:

```javascript
// Example: Create a test endpoint in your backend
router.post('/test/generate-opaque-data', async (req, res) => {
  const { cardNumber, expDate, cvv, zip } = req.body;
  
  // Use Authorize.Net Accept.js server-side or
  // Use their API to get opaqueData
  // This requires Accept.js integration
  
  // For testing, you might want to use a mock service
});
```

## Method 3: Using Postman/API Testing Tool

### Step 1: Use Authorize.Net's Test Transaction API

```bash
POST https://apitest.authorize.net/xml/v1/request.api
Content-Type: application/json

{
  "createTransactionRequest": {
    "merchantAuthentication": {
      "name": "YOUR_API_LOGIN_ID",
      "transactionKey": "YOUR_TRANSACTION_KEY"
    },
    "transactionRequest": {
      "transactionType": "authCaptureTransaction",
      "amount": "10.00",
      "payment": {
        "creditCard": {
          "cardNumber": "4111111111111111",
          "expirationDate": "1225",
          "cardCode": "123"
        }
      }
    }
  }
}
```

**Note**: This gives you a transaction response, but not opaqueData. For opaqueData, you need Accept.js.

## Method 4: Quick Test Values (For UI Testing Only)

For **testing the UI flow only** (payment will fail, but you can see the flow):

1. **Data Descriptor**: `COMMON.ACCEPT.INAPP.PAYMENT`
2. **Data Value**: `TEST_VALUE_12345` (any string - won't process, but tests the flow)
3. **Session ID**: `TEST-SESSION-001` (optional)

This will let you:
- ✅ Test the UI
- ✅ Test the form submission
- ✅ See the flow
- ❌ Won't process actual payment (will fail at Authorize.Net)

## Method 5: Use Your Existing Card Entry (Easier for Now)

**Simplest approach for testing payment processing:**

1. In your POS, **don't enable Bluetooth Reader**
2. Use **regular card entry**:
   - Card: `4111111111111111`
   - Exp: `12/25`
   - CVV: `123`
   - ZIP: `12345`
3. Complete payment - this will work and process through Authorize.Net
4. This tests payment processing (just not via Bluetooth reader)

## Method 6: Get from Accept Mobile SDK (Production)

When you integrate Accept Mobile SDK:

```javascript
// After card is read by Bluetooth reader
const cardData = await acceptSDK.captureCard({
  amount: totalAmount,
  readerId: reader.id
});

// Extract opaqueData
const opaqueData = {
  descriptor: cardData.opaqueData.dataDescriptor,
  value: cardData.opaqueData.dataValue,
  sessionId: cardData.deviceSessionId
};

// Use these values in Test Mode
```

## Recommended Approach for Your Testing

### Right Now (Quick Test):

1. **Test the UI flow**:
   - Use Method 4 (quick test values)
   - Enter: `COMMON.ACCEPT.INAPP.PAYMENT` and `TEST123`
   - See how the flow works

2. **Test actual payment**:
   - Use Method 5 (regular card entry)
   - This processes real payments through Authorize.Net

### For Real Bluetooth Testing:

1. **Set up Accept.js** (Method 1)
   - Create the HTML test page
   - Generate real opaqueData
   - Use it in Test Mode

2. **Or integrate Accept Mobile SDK** (Method 6)
   - Full integration
   - Automatic card reading
   - Real opaqueData generation

## Step-by-Step: Using Accept.js Test Page

1. **Create the HTML file** (copy code from Method 1)

2. **Get your Authorize.Net credentials**:
   - Log in to https://sandbox.authorize.net/
   - Go to Account → Settings → Security Settings
   - Copy API Login ID and Client Key

3. **Update the HTML** with your credentials

4. **Open HTML file** in browser

5. **Enter test card**:
   - Card: `4111111111111111`
   - Exp: `12/25`
   - CVV: `123`

6. **Click "Generate opaqueData"**

7. **Copy the values**:
   - Copy Data Descriptor
   - Copy Data Value

8. **Paste into POS Test Mode**

9. **Complete payment**

## Test Card Numbers (Authorize.Net Sandbox)

- **Visa**: `4111111111111111`
- **MasterCard**: `5424000000000015`
- **Discover**: `6011000000000012`
- **Amex**: `370000000000002`

Use any future expiration date and any 3-4 digit CVV.

## Troubleshooting

### "Invalid opaqueData" error
- Make sure you copied the **entire** dataValue (it's very long)
- Check there are no extra spaces
- Verify descriptor is exactly: `COMMON.ACCEPT.INAPP.PAYMENT`

### "Payment processing failed"
- Check your Authorize.Net credentials are correct
- Verify you're using sandbox credentials for testing
- Check the dataValue is complete (not truncated)

### Can't generate opaqueData
- Make sure you have Authorize.Net account
- Verify Client Key is correct
- Check you're using Accept.js correctly

## Quick Reference

**For UI Testing (payment will fail):**
- Descriptor: `COMMON.ACCEPT.INAPP.PAYMENT`
- Value: `TEST123` (any string)
- Session ID: (leave empty)

**For Real Payment Testing:**
- Use Accept.js to generate real opaqueData
- Or use regular card entry method
- Or integrate Accept Mobile SDK

