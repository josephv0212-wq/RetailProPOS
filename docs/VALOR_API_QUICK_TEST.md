# Valor Connect API - Quick Test Guide

## Quick Start Testing

### 1. Set Environment Variables

Create or update your `.env` file:

```env
VALOR_APP_ID=your_app_id_here
VALOR_APP_KEY=your_app_key_here
```

### 2. Start the Server

```bash
cd server
npm run dev
```

### 3. Quick Test Commands

Replace `YOUR_JWT_TOKEN` and `YOUR_EPI` with your actual values.

#### Test Credentials
```bash
curl -X POST http://localhost:3000/valor/test \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{"epi": "YOUR_EPI"}'
```

#### Test Payment ($1.00)
```bash
curl -X POST http://localhost:3000/valor/payment \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "amount": "1.00",
    "epi": "YOUR_EPI",
    "invoiceNumber": "TEST-001"
  }'
```

**Save the `reqTxnId` from the response!**

#### Check Status
```bash
curl -X GET "http://localhost:3000/valor/status/REQ_TXN_ID?epi=YOUR_EPI" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## What to Expect

1. **Payment Request Sent** → VP100 terminal should immediately show payment prompt
2. **Customer Completes Payment** → Status changes from "pending" to "approved" or "declined"
3. **Check Status** → Returns current transaction status

## Troubleshooting

- **"Missing credentials"** → Check `.env` file and restart server
- **"EPI not active"** → Verify terminal shows "Waiting for Valor Connect"
- **"Terminal not responding"** → Check WiFi connection and restart Valor Connect on terminal

For detailed testing, see `VALOR_API_TESTING.md`.
