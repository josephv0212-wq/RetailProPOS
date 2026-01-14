# Valor Connect API Testing Guide

This guide provides step-by-step instructions for testing the Valor Connect API integration with your VP100 terminal.

## Prerequisites

Before testing, ensure you have:

1. ✅ **Environment Variables Configured**
   ```env
   VALOR_APP_ID=your_app_id_here
   VALOR_APP_KEY=your_app_key_here
   ```

2. ✅ **EPI (Equipment Profile Identifier)**
   - Your EPI from Valor Portal (e.g., "2501357713")
   - Terminal must be registered in Valor Portal

3. ✅ **Terminal Setup**
   - VP100 terminal connected to WiFi
   - Terminal displays "Waiting for Valor Connect"
   - Terminal configured for Valor Connect (Cloud mode)

4. ✅ **Server Running**
   - Backend server started (`npm run dev` or `npm start`)
   - Server accessible at `http://localhost:3000` (or your configured port)

5. ✅ **Authentication Token**
   - You need a valid JWT token from `/auth/login` endpoint

## Testing Methods

### Method 1: Using cURL (Command Line)

#### Step 1: Get Authentication Token

```bash
# Login to get JWT token
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "your_username",
    "password": "your_password"
  }'
```

Save the `token` from the response. You'll need it for all subsequent requests.

#### Step 2: Test Credentials and EPI

```bash
# Test Valor Connect API credentials (without EPI)
curl -X POST http://localhost:3000/valor/test \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Test with EPI
curl -X POST http://localhost:3000/valor/test \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "epi": "2501357713"
  }'
```

**Expected Response (Success):**
```json
{
  "success": true,
  "message": "Valor Connect API credentials valid and EPI is active",
  "data": {
    "credentialsValid": true,
    "epi": "2501357713",
    "epiActive": true,
    "epiCheck": {
      "success": true,
      "epi": "2501357713",
      "active": true,
      "message": "EPI is active and ready"
    }
  }
}
```

#### Step 3: Check EPI Status

```bash
curl -X POST http://localhost:3000/valor/checkepi \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "epi": "2501357713"
  }'
```

#### Step 4: Initiate a Test Payment

**Important:** Use a small test amount (e.g., $1.00) for initial testing.

```bash
curl -X POST http://localhost:3000/valor/payment \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "amount": "1.00",
    "epi": "2501357713",
    "invoiceNumber": "TEST-001",
    "description": "Test Payment"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Payment request sent to VP100 terminal. Please complete payment on device.",
  "data": {
    "success": true,
    "pending": true,
    "transactionId": "TXN-1234567890",
    "reqTxnId": "TXN-1234567890",
    "status": "pending",
    "amount": "1.00"
  }
}
```

**What to Check:**
1. ✅ VP100 terminal should automatically display payment prompt
2. ✅ Terminal shows amount ($1.00)
3. ✅ Terminal shows "Tap / Insert / Swipe Card"
4. ✅ Save the `reqTxnId` from the response for status checking

#### Step 5: Check Payment Status

Use the `reqTxnId` from the payment response:

```bash
curl -X GET "http://localhost:3000/valor/status/TXN-1234567890?epi=2501357713" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Expected Responses:**

**While Pending:**
```json
{
  "success": true,
  "data": {
    "success": false,
    "pending": true,
    "status": "pending",
    "transactionId": "TXN-1234567890"
  }
}
```

**After Approval:**
```json
{
  "success": true,
  "data": {
    "success": true,
    "pending": false,
    "status": "approved",
    "transactionId": "TXN-1234567890",
    "amount": "1.00",
    "authCode": "AUTH123",
    "message": "Transaction approved"
  }
}
```

**After Decline:**
```json
{
  "success": true,
  "data": {
    "success": false,
    "pending": false,
    "declined": true,
    "status": "declined",
    "message": "Transaction declined"
  }
}
```

#### Step 6: Poll Payment Status (Alternative)

Instead of manually checking status, you can poll until completion:

```bash
curl -X POST http://localhost:3000/valor/poll/TXN-1234567890 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "epi": "2501357713",
    "maxAttempts": 60,
    "intervalMs": 2000
  }'
```

This will wait up to 2 minutes (60 attempts × 2 seconds) for the payment to complete.

#### Step 7: Cancel a Pending Transaction (Optional)

If you need to cancel a pending transaction:

```bash
curl -X POST http://localhost:3000/valor/cancel \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "reqTxnId": "TXN-1234567890",
    "epi": "2501357713"
  }'
```

### Method 2: Using Postman

1. **Create a Collection**
   - Create a new Postman collection: "Valor Connect API Tests"

2. **Set Environment Variables**
   - Create environment variables:
     - `base_url`: `http://localhost:3000`
     - `jwt_token`: (set after login)
     - `epi`: `2501357713`

3. **Import Requests**
   - Use the cURL commands above as templates
   - Replace `YOUR_JWT_TOKEN` with `{{jwt_token}}`
   - Replace URLs with `{{base_url}}/valor/...`

4. **Test Flow**
   - Run requests in sequence: Login → Test → Check EPI → Payment → Status

### Method 3: Using the POS UI

#### Step 1: Configure Settings

1. Log into the POS application
2. Navigate to **Settings** → **Payment Terminal**
3. Select **Valor Connect API (Cloud-to-Connect)**
4. Enter your **EPI** (e.g., "2501357713")
5. Save settings

#### Step 2: Test Payment Flow

1. **Add Items to Cart**
   - Add a test item with a small amount (e.g., $1.00)

2. **Open Payment Modal**
   - Click "Take Payment" or checkout button
   - Select **Card** payment method
   - Select **Valor API** as the card payment method

3. **Verify EPI Display**
   - Check that EPI is displayed in the payment modal
   - If not configured, you'll see a warning

4. **Initiate Payment**
   - Click "Confirm Payment"
   - Watch for:
     - ✅ "Payment request sent to VP100 terminal" notification
     - ✅ VP100 terminal displays payment prompt
     - ✅ Terminal shows amount and "Tap / Insert / Swipe Card"

5. **Complete Payment on Terminal**
   - Insert, swipe, or tap a test card on the VP100 terminal
   - Follow terminal prompts

6. **Monitor Status**
   - UI should show "Processing Payment..." while waiting
   - After completion, you should see:
     - ✅ "Payment approved! Transaction completed." (success)
     - ❌ "Payment declined. Please try again." (declined)

## Testing Checklist

### Pre-Testing Setup
- [ ] Environment variables configured (`VALOR_APP_ID`, `VALOR_APP_KEY`)
- [ ] EPI obtained from Valor Portal
- [ ] Terminal registered in Valor Portal
- [ ] Terminal connected to WiFi
- [ ] Terminal displays "Waiting for Valor Connect"
- [ ] Server running and accessible
- [ ] Authentication token obtained

### API Testing
- [ ] Test endpoint returns success (`POST /valor/test`)
- [ ] Check EPI endpoint validates EPI (`POST /valor/checkepi`)
- [ ] Payment endpoint initiates transaction (`POST /valor/payment`)
- [ ] Terminal displays payment prompt automatically
- [ ] Status endpoint returns transaction status (`GET /valor/status/:reqTxnId`)
- [ ] Poll endpoint waits for completion (`POST /valor/poll/:reqTxnId`)
- [ ] Cancel endpoint cancels pending transaction (`POST /valor/cancel`)

### Payment Flow Testing
- [ ] Small test payment ($1.00) initiates successfully
- [ ] Terminal shows correct amount
- [ ] Terminal prompts for card (tap/insert/swipe)
- [ ] Payment status updates correctly
- [ ] Approved payment completes successfully
- [ ] Declined payment shows error message
- [ ] Transaction timeout handled correctly (after 180 seconds)

### Error Handling Testing
- [ ] Missing credentials returns appropriate error
- [ ] Invalid EPI returns error
- [ ] Terminal not connected returns error
- [ ] Payment cancellation works correctly
- [ ] Network errors handled gracefully

## Common Issues and Solutions

### Issue: "Missing Valor API credentials"
**Solution:** 
- Check `.env` file has `VALOR_APP_ID` and `VALOR_APP_KEY`
- Restart server after adding environment variables
- Verify no typos in variable names

### Issue: "EPI is not active"
**Solution:**
- Verify EPI is correct in Valor Portal
- Check terminal is registered and configured for Valor Connect
- Ensure terminal displays "Waiting for Valor Connect"
- Try parameter download on terminal

### Issue: "Terminal not responding"
**Solution:**
- Check terminal WiFi connection
- Verify terminal shows "Waiting for Valor Connect"
- Restart Valor Connect on terminal (tap star → Start VC)
- Check terminal status in Valor Portal

### Issue: "Payment timeout"
**Solution:**
- Valor Connect can wait up to 180 seconds
- Verify customer is interacting with terminal
- Check terminal is online
- Use cancel endpoint if needed

### Issue: "401 Unauthorized"
**Solution:**
- Verify App ID and App Key are correct
- Check credentials are bound to correct EPI in Valor Portal
- Ensure API access is enabled for your account

## Test Scenarios

### Scenario 1: Successful Payment Flow
1. Initiate $1.00 payment
2. Terminal displays prompt
3. Insert/swipe/tap test card
4. Payment approved
5. Status shows "approved"
6. Transaction completes

### Scenario 2: Declined Payment
1. Initiate $1.00 payment
2. Terminal displays prompt
3. Use declined test card
4. Payment declined
5. Status shows "declined"
6. Error message displayed

### Scenario 3: Payment Cancellation
1. Initiate $1.00 payment
2. Terminal displays prompt
3. Cancel via API before customer completes
4. Transaction cancelled
5. Status shows "cancelled"

### Scenario 4: Payment Timeout
1. Initiate $1.00 payment
2. Terminal displays prompt
3. Wait 180+ seconds without customer interaction
4. Timeout occurs
5. Error message displayed

## Production Testing

Before going to production:

1. **Use Production Endpoints**
   - Update environment variables with production endpoints
   - Get production App ID and App Key from Valor
   - Verify production EPI

2. **Test with Real Cards**
   - Test with actual credit/debit cards
   - Test different card types (chip, swipe, tap)
   - Test different amounts

3. **Load Testing**
   - Test multiple concurrent transactions
   - Test rapid payment requests
   - Monitor for rate limiting

4. **Error Recovery**
   - Test network interruptions
   - Test terminal disconnections
   - Test API failures

## Debugging Tips

1. **Check Server Logs**
   ```bash
   # Watch server logs for Valor Connect API calls
   # Look for:
   # - "📤 Sending terminal payment request"
   # - "📥 Valor Connect API response"
   # - "❌ Valor Connect" errors
   ```

2. **Check Terminal Status**
   - Terminal should show "Waiting for Valor Connect"
   - Terminal should display payment prompt when request sent
   - Check terminal logs if available

3. **Verify API Responses**
   - Check `reqTxnId` is returned from payment
   - Verify status responses match expected format
   - Check for error codes in responses

4. **Network Debugging**
   - Verify server can reach Valor Connect API endpoints
   - Check firewall rules
   - Test with staging endpoints first

## Next Steps

After successful testing:

1. ✅ Update production environment variables
2. ✅ Configure production EPI in Settings
3. ✅ Train staff on payment flow
4. ✅ Monitor first few transactions
5. ✅ Set up error alerting
6. ✅ Document any custom configurations

## Support

If you encounter issues:

1. Check this testing guide
2. Review server logs
3. Check Valor Portal for terminal status
4. Contact Valor/Blackstone support with:
   - EPI
   - Transaction ID (reqTxnId)
   - Error messages
   - Server logs (if applicable)
