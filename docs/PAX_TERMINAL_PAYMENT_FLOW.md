# PAX VP100 Terminal Payment Flow (Valor Connect)

## Overview

This document describes the cloud-to-cloud payment flow for PAX VP100 WiFi terminal payments through Authorize.Net using **Valor Connect**.

## Payment Flow Architecture

The payment flow uses **Valor Connect** (cloud-to-cloud integration) and follows this pattern:

```
POS App → Authorize.Net API → Valor Connect (WebSocket/TCP) → VP100 Terminal → Authorize.Net → POS App (Polling)
```

### Step-by-Step Flow

1. **User Initiates Payment**:
   - User selects "PAX WiFi Terminal" in payment modal
   - User clicks "Confirm Payment"
   - App sends payment request to Authorize.Net API with `terminalId` (VP100 serial number)

2. **Authorize.Net Receives Request**:
   - Authorize.Net processes the payment request with `terminalId`
   - Authorize.Net routes payment to VP100 via **Valor Connect** (WebSocket/TCP cloud protocol)
   - VP100 terminal receives notification and displays payment prompt to customer

3. **Customer Completes Payment**:
   - Customer sees payment amount on VP100 terminal
   - Customer inserts, swipes, or taps card on terminal
   - Terminal processes payment and sends data to Authorize.Net

4. **POS App Polls for Status**:
   - App continuously polls Authorize.Net API for payment status using `getTransactionDetailsRequest`
   - Polling happens every 2 seconds
   - Maximum polling time: 2 minutes (60 attempts)

5. **Payment Confirmation**:
   - When payment is confirmed, Authorize.Net returns status
   - App receives payment result
   - App shows success/decline notification
   - Sale is completed and receipt is generated

## Implementation Details

### Backend Services

#### `server/services/authorizeNetTerminalService.js`

**Functions:**
- `initiateTerminalPayment()`: Sends payment request to Authorize.Net
- `checkPaymentStatus()`: Checks current payment status
- `pollPaymentStatus()`: Continuously polls until payment completes

**Payment Initiation:**
```javascript
const result = await initiateTerminalPayment({
  amount: 100.00,
  invoiceNumber: 'POS-1234567890',
  description: 'POS Sale - Terminal Payment'
}, terminalId);
```

**Status Polling:**
```javascript
const status = await pollPaymentStatus(transactionId, {
  maxAttempts: 60,
  intervalMs: 2000,
  onStatusUpdate: (status, attempt) => {
    // Update UI during polling
  }
});
```

### Frontend Services

#### `client/src/services/paymentPollingService.ts`

Handles client-side polling of payment status:
- Polls Authorize.Net API every 2 seconds
- Maximum 60 attempts (2 minutes)
- Provides status update callbacks
- Returns final payment status

#### `client/src/app/components/PaymentModal.tsx`

**Payment Flow:**
1. User selects "PAX WiFi Terminal"
2. User clicks "Confirm Payment"
3. Payment request sent to backend
4. If pending, starts polling
5. Shows notifications during polling
6. Shows success/error notification on completion

### API Endpoints

#### `POST /api/sales`
- Creates sale and initiates terminal payment
- Returns `202 Accepted` with `pending: true` if payment is pending
- Returns `200 OK` with sale data if payment completed immediately

#### `GET /api/payment/status/:transactionId`
- Checks current payment status
- Returns status: `pending`, `success`, or `declined`

#### `POST /api/payment/poll/:transactionId`
- Polls payment status until completion
- Returns final payment status

## Important Notes

### Authorize.Net API Structure

The implementation uses the **Authorize.Net Payment Transactions API** with the following structure:

**Endpoint:**
- Production: `https://api.authorize.net/xml/v1/request.api`
- Sandbox: `https://apitest.authorize.net/xml/v1/request.api`

**Request Structure:**
```json
{
  "createTransactionRequest": {
    "merchantAuthentication": {
      "name": "YOUR_API_LOGIN_ID",
      "transactionKey": "YOUR_TRANSACTION_KEY"
    },
    "transactionRequest": {
      "transactionType": "authCaptureTransaction",
      "amount": "20.00",
      "terminalId": "VP100_SERIAL_OR_ID"
    }
  }
}
```

**Status Checking:**
```json
{
  "getTransactionDetailsRequest": {
    "merchantAuthentication": {
      "name": "YOUR_API_LOGIN_ID",
      "transactionKey": "YOUR_TRANSACTION_KEY"
    },
    "transId": "1234567890"
  }
}
```

### Terminal Configuration (Valor Connect)

The VP100 terminal must be:
1. **Registered in Valor Portal/Authorize.Net**: 
   - Terminal must be registered with your Authorize.Net merchant account
   - Terminal serial number must be linked to your merchant ID
   - Terminal must be configured to use Valor Connect (cloud-to-cloud)

2. **Terminal ID Configuration**:
   - Enter your VP100 serial number in Settings → Terminal ID
   - This is the `terminalId` sent to Authorize.Net API
   - Terminal ID must match the serial number registered in Valor Portal

3. **Network Connection**:
   - Terminal must be connected to WiFi (for Valor Connect)
   - Terminal must have internet connectivity to communicate with Authorize.Net
   - Terminal IP/Port settings are optional (used for direct terminal communication if needed)

4. **Authorize.Net Credentials**:
   - Backend must have `AUTHORIZE_NET_API_LOGIN_ID` and `AUTHORIZE_NET_TRANSACTION_KEY` configured
   - These credentials authenticate API requests to Authorize.Net

### Testing

To test the flow:
1. Ensure VP100 is connected to WiFi
2. Ensure terminal is registered with Authorize.Net
3. Initiate a payment from POS app
4. Check VP100 terminal for payment prompt
5. Complete payment on terminal
6. Verify polling receives confirmation

## Troubleshooting

### Payment Request Fails

**Possible Causes:**
- Terminal ID not configured in Settings
- Terminal not registered in Valor Portal/Authorize.Net
- Authorize.Net API credentials incorrect
- Terminal ID doesn't match registered serial number

**Solutions:**
- Verify Terminal ID is entered in Settings (VP100 serial number)
- Check terminal registration in Valor Portal/Authorize.Net
- Verify Terminal ID matches the serial number in Valor Portal
- Verify Authorize.Net API credentials (`AUTHORIZE_NET_API_LOGIN_ID`, `AUTHORIZE_NET_TRANSACTION_KEY`)
- Check Authorize.Net API response for specific error messages

### Terminal Doesn't Show Popup

**Possible Causes:**
- Terminal not connected to internet/WiFi
- Terminal not registered correctly in Valor Portal
- Terminal ID mismatch (serial number doesn't match)
- Valor Connect not configured on terminal

**Solutions:**
- Verify terminal is online and connected to WiFi
- Check terminal registration in Valor Portal/Authorize.Net
- Verify Terminal ID in Settings matches terminal serial number
- Ensure terminal is configured for Valor Connect (cloud-to-cloud)
- Check terminal network connectivity

### Polling Times Out

**Possible Causes:**
- Customer didn't complete payment
- Terminal communication issue
- Payment declined on terminal

**Solutions:**
- Check terminal for error messages
- Verify customer completed payment
- Check Authorize.Net transaction logs
- Try payment again

## Code Structure

### Files Modified/Created

1. **Backend:**
   - `server/services/authorizeNetTerminalService.js` (UPDATED - uses `terminalId` for Valor Connect)
   - `server/routes/paymentRoutes.js` (NEW)
   - `server/controllers/salesController.js` (UPDATED - passes `terminalId` from user settings)
   - `server/models/User.js` (UPDATED - added `terminalId` field)
   - `server/controllers/authController.js` (UPDATED - handles `terminalId` updates)
   - `server/server.js` (UPDATED - added payment routes, migration for `terminalId` column)

2. **Frontend:**
   - `client/src/services/paymentPollingService.ts` (NEW)
   - `client/src/services/api.ts` (UPDATED - added paymentAPI)
   - `client/src/app/components/PaymentModal.tsx` (UPDATED - added polling)
   - `client/src/app/components/Settings.tsx` (UPDATED - added Terminal ID input field)
   - `client/src/app/App.tsx` (UPDATED - handle pending payments)
   - `client/src/app/contexts/AuthContext.tsx` (UPDATED - added `terminalId` to User interface)

## Next Steps

1. **Test the flow** with your VP100 terminal
2. **Adjust API structure** if Authorize.Net requires different format
3. **Configure terminal** in Authorize.Net if not already done
4. **Monitor polling** to ensure it works correctly
5. **Adjust timeout/interval** if needed based on testing

## Setup Instructions

### 1. Register VP100 Terminal in Valor Portal/Authorize.Net

1. Log into your Authorize.Net Merchant Interface
2. Navigate to **Account** → **Settings** → **Terminal Settings** (or Valor Portal)
3. Register your VP100 terminal with its serial number
4. Link the terminal to your Authorize.Net merchant account
5. Ensure Valor Connect (cloud-to-cloud) is enabled for the terminal

### 2. Configure Terminal ID in POS App

1. Open the POS app and navigate to **Settings**
2. Scroll to **PAX Terminal Support (VP100) - Valor Connect**
3. Enter your **Terminal ID** (VP100 serial number)
   - This should match the serial number registered in Valor Portal
   - Format: Alphanumeric, dashes, underscores (e.g., `VP100-123456`)
4. Optionally configure Terminal IP and Port (for direct terminal communication if needed)
5. Click **Save**

### 3. Verify Authorize.Net API Credentials

Ensure your backend `.env` file has:
```
AUTHORIZE_NET_API_LOGIN_ID=your_api_login_id
AUTHORIZE_NET_TRANSACTION_KEY=your_transaction_key
NODE_ENV=development  # or production
```

### 4. Test Payment Flow

1. Create a sale in the POS app
2. Select **PAX WiFi Terminal** as payment method
3. Click **Confirm Payment**
4. Check VP100 terminal for payment prompt
5. Complete payment on terminal
6. Verify app receives confirmation via polling

## References

- [Authorize.Net API Reference](https://developer.authorize.net/api/reference/)
- [Authorize.Net Payment Transactions Guide](https://developer.authorize.net/api/reference/features/payment-transactions.html)
- [PAX VP100 Documentation](https://www.pax.us/)
- [Valor Connect Integration Resources](https://www.valor.com/)
