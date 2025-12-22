# Payment Reconciliation Testing Guide

## Quick Test Steps

### 1. Start the Server

```bash
cd server
npm start
```

Verify you see:
```
✅ Payment reconciliation worker started
🚀 Starting reconciliation worker (runs every 60 seconds)...
```

### 2. Test Order Creation via API

```bash
# Get your auth token first (login via frontend or API)
TOKEN="your_jwt_token_here"

# Create an order
curl -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "amount": 100.00,
    "laneId": "LANE-01",
    "notes": "Test order"
  }'
```

Expected response:
```json
{
  "success": true,
  "message": "Order created successfully",
  "data": {
    "order": {
      "id": 1,
      "invoiceNumber": "LANE01-20240115-000123",
      "laneId": "LANE-01",
      "amount": "100.00",
      "status": "OPEN",
      "createdAt": "2024-01-15T10:30:00.000Z"
    }
  }
}
```

### 3. Check Payment Status

```bash
# Check payment status (polling endpoint)
curl -X GET http://localhost:3000/api/orders/1/payment-status \
  -H "Authorization: Bearer $TOKEN"
```

Expected response (before payment):
```json
{
  "success": true,
  "data": {
    "order": {
      "id": 1,
      "invoiceNumber": "LANE01-20240115-000123",
      "status": "OPEN",
      "amount": "100.00"
    },
    "payment": null,
    "actions": {
      "canVoid": false,
      "canRefund": false
    }
  }
}
```

### 4. Process Payment in Authorize.net 2.0 Windows App

1. Open Authorize.net 2.0 Windows app
2. Start a new transaction
3. Enter the invoice number: `LANE01-20240115-000123`
4. Enter amount: `100.00`
5. Process payment (chip/tap/swipe)
6. Complete the transaction

### 5. Wait for Reconciliation

The reconciliation worker runs every 60 seconds. Wait up to 60 seconds, then check payment status again:

```bash
curl -X GET http://localhost:3000/api/orders/1/payment-status \
  -H "Authorization: Bearer $TOKEN"
```

Expected response (after payment):
```json
{
  "success": true,
  "data": {
    "order": {
      "id": 1,
      "invoiceNumber": "LANE01-20240115-000123",
      "status": "PAID",
      "amount": "100.00"
    },
    "payment": {
      "id": 1,
      "transactionId": "1234567890",
      "authCode": "ABC123",
      "status": "CAPTURED",
      "amount": "100.00",
      "settledAt": "2024-01-15T10:35:00.000Z"
    },
    "actions": {
      "canVoid": false,
      "canRefund": true
    }
  }
}
```

### 6. Test Frontend Integration

1. Open POS screen in browser
2. Add items to cart
3. Click "Checkout"
4. Select "Card (Windows App)" payment method
5. Click "Create Order"
6. Payment Reconciliation component should appear
7. Invoice number should be displayed prominently
8. Process payment in Authorize.net Windows app
9. Wait for automatic reconciliation (up to 60 seconds)
10. Payment status should update to "PAID"
11. Sale should be created automatically
12. Receipt should be displayed

## Testing VOID

### Prerequisites
- Order must be PAID
- Transaction must be UNSETTLED (not yet batched)

### Steps

```bash
# Void an unsettled transaction
curl -X POST http://localhost:3000/api/orders/1/void \
  -H "Authorization: Bearer $TOKEN"
```

Expected response:
```json
{
  "success": true,
  "message": "Transaction voided successfully",
  "data": {
    "order": {
      "id": 1,
      "status": "VOIDED"
    },
    "payment": {
      "id": 1,
      "status": "VOIDED"
    }
  }
}
```

## Testing REFUND

### Prerequisites
- Order must be PAID
- Transaction must be SETTLED (already batched)

### Steps

```bash
# Full refund
curl -X POST http://localhost:3000/api/orders/1/refund \
  -H "Authorization: Bearer $TOKEN"

# Partial refund (optional)
curl -X POST http://localhost:3000/api/orders/1/refund \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "amount": 50.00
  }'
```

Expected response:
```json
{
  "success": true,
  "message": "Refund processed successfully",
  "data": {
    "order": {
      "id": 1,
      "status": "REFUNDED"
    },
    "payment": {
      "id": 1,
      "status": "REFUNDED",
      "amount": "50.00"
    }
  }
}
```

## Monitoring Reconciliation Worker

### Check Server Logs

Look for these messages:

```
🔄 Starting reconciliation cycle...
📊 Found X recent transaction(s) to process
✅ Matched and processed: Order LANE01-20240115-000123 -> Transaction 1234567890 (CAPTURED)
✅ Reconciliation complete: 1 matched, 1 processed (2.34s)
```

### Manual Reconciliation Trigger

If you need to trigger reconciliation immediately (for testing):

```javascript
// In server console or create a test endpoint
import { triggerReconciliation } from './workers/reconciliationWorker.js';
await triggerReconciliation();
```

## Troubleshooting

### Order Not Matching

1. **Check invoice number matches exactly**
   - Case-sensitive
   - No extra spaces
   - Format: `LANE01-YYYYMMDD-000123`

2. **Check amount matches**
   - Must match within $0.01
   - Check for rounding differences

3. **Check time window**
   - Transaction must be within 15 minutes of order creation
   - Check order `createdAt` vs transaction `submittedAt`

4. **Check transaction exists in Authorize.net**
   - Log into Authorize.net merchant dashboard
   - Verify transaction was processed
   - Check invoice number in transaction details

### Reconciliation Worker Not Running

1. **Check server startup logs**
   - Should see: `✅ Payment reconciliation worker started`
   - If not, check for errors

2. **Check Authorize.net credentials**
   ```env
   AUTHORIZE_NET_API_LOGIN_ID=your_login_id
   AUTHORIZE_NET_TRANSACTION_KEY=your_transaction_key
   ```

3. **Check network connectivity**
   - Worker needs to reach Authorize.net API
   - Check firewall/proxy settings

### Frontend Not Updating

1. **Check browser console**
   - Look for API errors
   - Check network tab for failed requests

2. **Check authentication**
   - Verify JWT token is valid
   - Check token expiration

3. **Check polling**
   - Component polls every 12 seconds
   - Check browser console for polling messages

### Authorize.net API Issues

If you see errors about API format:

1. **Check API version**
   - Some Authorize.net Reporting APIs use XML, not JSON
   - May need to update `authorizeNetService.js` to support XML

2. **Check API permissions**
   - Verify API credentials have reporting permissions
   - Check Authorize.net account settings

3. **Check API endpoint**
   - Sandbox: `https://apitest.authorize.net/xml/v1/request.api`
   - Production: `https://api.authorize.net/xml/v1/request.api`

## Database Queries

### Check Orders

```sql
SELECT * FROM Orders ORDER BY createdAt DESC LIMIT 10;
```

### Check Payments

```sql
SELECT * FROM Payments ORDER BY createdAt DESC LIMIT 10;
```

### Check Order-Payment Link

```sql
SELECT 
  o.id as order_id,
  o.invoiceNumber,
  o.status as order_status,
  p.id as payment_id,
  p.transactionId,
  p.status as payment_status,
  p.amount
FROM Orders o
LEFT JOIN Payments p ON p.orderId = o.id
ORDER BY o.createdAt DESC
LIMIT 10;
```

## Expected Behavior

### Order Lifecycle

1. **OPEN** → Order created, waiting for payment
2. **PAID** → Payment matched and confirmed
3. **VOIDED** → Transaction voided (unsettled)
4. **REFUNDED** → Transaction refunded (settled)

### Payment Lifecycle

1. **AUTHORIZED** → Transaction authorized but not settled
2. **CAPTURED** → Transaction settled
3. **VOIDED** → Transaction voided
4. **REFUNDED** → Transaction refunded

### Reconciliation Timing

- **Worker interval**: 60 seconds
- **Frontend polling**: 12 seconds
- **Transaction lookback**: 15 minutes
- **Max polling duration**: 24 minutes (120 attempts)

## Success Criteria

✅ Order created with unique invoice number
✅ Invoice number displayed in POS
✅ Payment processed in Authorize.net Windows app
✅ Transaction matched within 60 seconds
✅ Order status updated to PAID
✅ Payment record created
✅ Frontend shows payment complete
✅ Sale created automatically
✅ Receipt displayed

## Next Steps After Testing

1. **Monitor production logs** for reconciliation activity
2. **Adjust polling intervals** if needed (worker: 60s, frontend: 12s)
3. **Add notifications** when payment is matched (optional)
4. **Customize invoice number format** if needed
5. **Add receipt printing** after payment (optional)

