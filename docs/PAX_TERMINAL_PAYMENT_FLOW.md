# PAX VP100 Terminal Payment Flow

## Overview

This document describes the payment flow for PAX VP100 WiFi terminal payments through Authorize.Net.

## Payment Flow Architecture

The payment flow follows this pattern:

```
POS App → Authorize.Net API → VP100 Terminal → Authorize.Net → POS App (Polling)
```

### Step-by-Step Flow

1. **User Initiates Payment**:
   - User selects "PAX WiFi Terminal" in payment modal
   - User clicks "Confirm Payment"
   - App sends payment request to Authorize.Net API

2. **Authorize.Net Receives Request**:
   - Authorize.Net processes the payment request
   - Authorize.Net triggers popup/notification on VP100 device
   - VP100 terminal displays payment prompt to customer

3. **Customer Completes Payment**:
   - Customer sees payment amount on VP100 terminal
   - Customer inserts, swipes, or taps card on terminal
   - Terminal processes payment and sends data to Authorize.Net

4. **POS App Polls for Status**:
   - App continuously polls Authorize.Net API for payment status
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

⚠️ **The current implementation uses a simplified Authorize.Net API structure.**

The actual Authorize.Net API for terminal payments may require:
- Different endpoint
- Different request structure
- Device session ID or terminal registration
- Specific terminal payment parameters

**You may need to adjust the API call structure in `server/services/authorizeNetTerminalService.js` based on:**
- Authorize.Net's actual terminal payment API documentation
- Your Authorize.Net merchant account configuration
- VP100 terminal registration with Authorize.Net

### Terminal Configuration

The VP100 terminal must be:
1. **Registered with Authorize.Net**: Terminal must be configured in your Authorize.Net merchant account
2. **Connected to WiFi**: Terminal must be on the same network
3. **Authorize.Net Credentials**: Terminal must have Authorize.Net API credentials configured

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
- Terminal not registered with Authorize.Net
- Authorize.Net API credentials incorrect
- API request structure incorrect (may need adjustment)

**Solutions:**
- Verify Authorize.Net merchant account configuration
- Check terminal registration in Authorize.Net
- Review Authorize.Net API documentation for terminal payments
- Adjust API request structure if needed

### Terminal Doesn't Show Popup

**Possible Causes:**
- Terminal not connected to Authorize.Net
- Terminal not registered correctly
- Authorize.Net not routing to terminal

**Solutions:**
- Verify terminal is online and connected
- Check terminal registration in Authorize.Net
- Verify Authorize.Net can communicate with terminal

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
   - `server/services/authorizeNetTerminalService.js` (NEW)
   - `server/routes/paymentRoutes.js` (NEW)
   - `server/controllers/salesController.js` (UPDATED)
   - `server/server.js` (UPDATED - added payment routes)

2. **Frontend:**
   - `client/src/services/paymentPollingService.ts` (NEW)
   - `client/src/services/api.ts` (UPDATED - added paymentAPI)
   - `client/src/app/components/PaymentModal.tsx` (UPDATED - added polling)
   - `client/src/app/App.tsx` (UPDATED - handle pending payments)
   - `client/src/app/contexts/AuthContext.tsx` (UPDATED - added terminalIP/Port)

## Next Steps

1. **Test the flow** with your VP100 terminal
2. **Adjust API structure** if Authorize.Net requires different format
3. **Configure terminal** in Authorize.Net if not already done
4. **Monitor polling** to ensure it works correctly
5. **Adjust timeout/interval** if needed based on testing

## References

- [Authorize.Net API Documentation](https://developer.authorize.net/api/reference/)
- [PAX VP100 Documentation](https://www.pax.us/)
- [Authorize.Net Terminal Integration](https://developer.authorize.net/)
