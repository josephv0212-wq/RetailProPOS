# Payment Reconciliation System Guide

## Overview

This payment reconciliation system allows your POS web application to work seamlessly with the Authorize.net 2.0 Windows app for card-present payments (chip/tap/swipe). The system automatically matches completed transactions from Authorize.net to orders created in your POS.

## Architecture

### Workflow

1. **POS creates order** → Frontend calls `POST /api/orders` to create an order with a unique invoice number
2. **Display invoice number** → POS shows the invoice number to the cashier
3. **Cashier enters invoice in Authorize.net app** → Cashier enters the same invoice number in Authorize.net 2.0 Windows app and processes payment
4. **Reconciliation worker** → Background worker runs every 60 seconds, fetches recent transactions from Authorize.net, and matches them to orders
5. **Status update** → Frontend polls `GET /api/orders/:id/payment-status` every 10-15 seconds to check payment status
6. **Payment complete** → Once matched, order status changes to PAID and payment details are stored

### Key Components

- **Order Model** (`server/models/Order.js`): Stores POS orders with invoice numbers
- **Payment Model** (`server/models/Payment.js`): Stores matched payment transactions
- **Reconciliation Worker** (`server/workers/reconciliationWorker.js`): Background job that matches transactions
- **Order Controller** (`server/controllers/orderController.js`): API endpoints for orders and payments
- **Payment Reconciliation Component** (`client/src/components/PaymentReconciliation.jsx`): Frontend component for polling and displaying payment status

## Database Schema

### Orders Table

```sql
- id (PK)
- invoiceNumber (unique, indexed) - Format: LANE01-YYYYMMDD-000123
- laneId (string) - e.g., "LANE-01"
- amount (decimal)
- status (OPEN | PAID | VOIDED | REFUNDED)
- userId (FK to Users)
- notes (text)
- created_at, updated_at
```

### Payments Table

```sql
- id (PK)
- orderId (FK to Orders)
- provider ("AUTHORIZE_NET")
- transactionId (unique, indexed)
- authCode
- status (AUTHORIZED | CAPTURED | VOIDED | REFUNDED)
- amount (decimal)
- rawResponse (JSON - minimal safe fields only)
- settledAt (datetime)
- created_at, updated_at
```

## API Endpoints

### POST /api/orders

Create a new order with invoice number.

**Request:**
```json
{
  "amount": 100.00,
  "laneId": "LANE-01",
  "notes": "Optional notes"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Order created successfully",
  "data": {
    "order": {
      "id": 1,
      "invoiceNumber": "LANE01-20240115-000123",
      "laneId": "LANE-01",
      "amount": 100.00,
      "status": "OPEN",
      "createdAt": "2024-01-15T10:30:00Z"
    }
  }
}
```

### GET /api/orders/:id/payment-status

Get current payment status for an order (used by frontend polling).

**Response:**
```json
{
  "success": true,
  "data": {
    "order": {
      "id": 1,
      "invoiceNumber": "LANE01-20240115-000123",
      "status": "PAID",
      "amount": 100.00
    },
    "payment": {
      "id": 1,
      "transactionId": "1234567890",
      "authCode": "ABC123",
      "status": "CAPTURED",
      "amount": 100.00,
      "settledAt": "2024-01-15T10:35:00Z"
    },
    "actions": {
      "canVoid": false,
      "canRefund": true
    }
  }
}
```

### POST /api/orders/:orderId/void

Void an unsettled transaction.

**Response:**
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

### POST /api/orders/:orderId/refund

Refund a settled transaction.

**Request (optional partial refund):**
```json
{
  "amount": 50.00
}
```

**Response:**
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
      "amount": 50.00
    }
  }
}
```

## Frontend Usage

### Creating an Order

```javascript
import { ordersAPI } from '../services/api';

const createOrder = async (amount, laneId) => {
  try {
    const response = await ordersAPI.create({
      amount: 100.00,
      laneId: 'LANE-01'
    });
    
    const order = response.data.data.order;
    console.log('Invoice Number:', order.invoiceNumber);
    // Display invoice number to cashier
  } catch (error) {
    console.error('Failed to create order:', error);
  }
};
```

### Using Payment Reconciliation Component

```javascript
import PaymentReconciliation from '../components/PaymentReconciliation';

function POSScreen() {
  const [orderId, setOrderId] = useState(null);
  const [showPaymentStatus, setShowPaymentStatus] = useState(false);

  const handleOrderCreated = (order) => {
    setOrderId(order.id);
    setShowPaymentStatus(true);
  };

  const handlePaymentComplete = (order) => {
    console.log('Payment completed!', order);
    // Show receipt, print, etc.
  };

  return (
    <>
      {/* Your POS UI */}
      
      {showPaymentStatus && orderId && (
        <PaymentReconciliation
          orderId={orderId}
          onPaymentComplete={handlePaymentComplete}
          onClose={() => setShowPaymentStatus(false)}
        />
      )}
    </>
  );
}
```

## Reconciliation Worker

The reconciliation worker runs automatically every 60 seconds. It:

1. Fetches recent transactions from Authorize.net (last 10-15 minutes)
2. Matches transactions to orders using:
   - **Primary**: `invoiceNumber` (must match exactly)
   - **Secondary**: `amount` (must match within $0.01 tolerance)
   - **Time window**: Transaction must be within 15 minutes of order creation
3. Updates order status to PAID when matched
4. Creates payment record with transaction details

### Manual Reconciliation

You can manually trigger reconciliation for testing:

```javascript
import { triggerReconciliation } from './workers/reconciliationWorker.js';

// Trigger once
await triggerReconciliation();
```

## Business Rules

### Payment Types

- Default: **Authorize + Capture** (`authCaptureTransaction`)
- Transactions are authorized and captured immediately

### VOID vs REFUND

- **VOID**: Allowed only if transaction is **unsettled** (not yet batched)
- **REFUND**: Allowed only if transaction is **settled** (already batched)
- System automatically checks transaction status before allowing void/refund

### Invoice Number Format

- Format: `LANE{ID}-YYYYMMDD-{SEQUENCE}`
- Example: `LANE01-20240115-000123`
- Lane ID extracted from `laneId` (e.g., "LANE-01" → "01")
- Sequence increments daily per lane

## Environment Variables

Required environment variables (already in your `.env`):

```env
AUTHORIZE_NET_API_LOGIN_ID=your_login_id
AUTHORIZE_NET_TRANSACTION_KEY=your_transaction_key
NODE_ENV=production  # or development (uses sandbox)
```

## Error Handling

### Common Issues

1. **Transaction not matching**
   - Verify invoice number matches exactly (case-sensitive)
   - Check amount matches within $0.01
   - Ensure transaction is within 15-minute window

2. **Reconciliation worker not running**
   - Check server logs for errors
   - Verify Authorize.net credentials are correct
   - Check network connectivity to Authorize.net API

3. **VOID/REFUND fails**
   - Verify transaction status (unsettled for void, settled for refund)
   - Check transaction ID is correct
   - Verify transaction hasn't already been voided/refunded

## Testing

### Test Order Creation

```bash
curl -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "amount": 100.00,
    "laneId": "LANE-01"
  }'
```

### Test Payment Status

```bash
curl -X GET http://localhost:3000/api/orders/1/payment-status \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Test Reconciliation

1. Create an order via API
2. Process payment in Authorize.net 2.0 Windows app using the invoice number
3. Wait up to 60 seconds for reconciliation worker to run
4. Check payment status via API

## Security Notes

- **No raw card data** is ever stored or handled by the POS
- Only minimal safe transaction data is stored in `rawResponse` JSON field
- All API endpoints require authentication
- Transaction matching uses multiple validation checks (invoice number, amount, time window)

## Performance

- Reconciliation worker runs every 60 seconds
- Frontend polls every 12 seconds (configurable in component)
- Maximum polling duration: 24 minutes (120 attempts × 12 seconds)
- Reconciliation queries last 10-15 minutes of transactions

## Troubleshooting

### Check Reconciliation Worker Status

Look for these log messages in server console:

```
🚀 Starting reconciliation worker (runs every 60 seconds)...
🔄 Starting reconciliation cycle...
📊 Found X recent transaction(s) to process
✅ Matched and processed: Order LANE01-20240115-000123 -> Transaction 1234567890
✅ Reconciliation complete: X matched, Y processed (Z seconds)
```

### Check Order Status

Query database directly:

```sql
SELECT * FROM Orders WHERE invoiceNumber = 'LANE01-20240115-000123';
SELECT * FROM Payments WHERE orderId = 1;
```

### Manual Reconciliation

If automatic reconciliation fails, you can manually trigger it or check Authorize.net merchant interface for transaction details.

## Support

For issues with:
- **Authorize.net API**: Check Authorize.net merchant dashboard and API documentation
- **Reconciliation matching**: Check server logs and database records
- **Frontend polling**: Check browser console and network tab

