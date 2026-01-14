# Valor Connect API Setup Guide for PAX VP100 (Cloud-to-Connect)

This guide explains how to set up **Valor Connect API** (cloud-to-connect integration) for PAX VP100 terminals in the RetailPro POS application.

## What is Valor Connect API?

Valor Connect API is a cloud-based REST API that allows your POS application to send payment requests directly to VP100 terminals via Valor's cloud infrastructure. The terminal communicates through WiFi and connects to Valor's cloud servers, eliminating the need for direct TCP/IP connections.

**Important:** Valor Connect API is a **standalone payment gateway** - it does **NOT** require Authorize.Net or any other payment processor. Valor Connect API handles all payment processing directly through Valor's cloud infrastructure.

## Prerequisites

1. **PAX Valor VP100 Terminal** - Must be a VP100 model
2. **Valor Portal Account** - Access to register and manage terminals
3. **Valor API Credentials** - App ID and App Key from Valor Portal
4. **EPI (Equipment Profile Identifier)** - Found in Valor Portal (e.g., "2501357713")
5. **WiFi Connection** - Terminal must be connected to WiFi with internet access

## Setup Steps

### Step 1: Register Terminal in Valor Portal

1. **Log into Valor Portal**
   - Access the Valor Portal at https://valorpaytech.com
   - Navigate to **Device Management** section

2. **Register Your VP100 Terminal**
   - Add your VP100 terminal using its serial number
   - Configure terminal settings for cloud-to-connect mode
   - Enable **Valor Connect** with **Cloud** connection mode
   - Note your **EPI (Equipment Profile Identifier)** - this is required for API calls

3. **Get API Credentials**
   - Navigate to **Settings** → **Developer** → **API Credentials** (or **POS Integration** / **App Management**)
   - Click **Create Application**
   - Select / bind the application to:
     - Your Merchant
     - Your EPI (e.g., 2501357713)
   - Valor generates:
     - **App ID** (e.g., `bbU#9bIY2fUam1VLeADy@CeKIk#u363x`)
     - **App Key** (shown once - store it securely, e.g., `xj3b6dnHSHpRTA9$t2sNUqDJJ0s65yxj`)
   - ⚠️ **IMPORTANT**: Store these credentials securely. Never expose them in frontend code or public repositories.

### Step 2: Configure Terminal for Valor Connect (Cloud Mode)

1. **Connect Terminal to WiFi**
   - On the VP100 terminal, tap the **star (★)** icon
   - Press **7** for **Comm Config**
   - Press **2** for **Network Options**
   - Select **Wi-Fi**, choose your SSID, enter password, and tap **OK**

2. **Enable Valor Connect Cloud Mode**
   - In Valor Portal, navigate to your terminal's settings
   - Go to **Terminal & Transaction** tab
   - Open **Valor Connect** sub-tab
   - Enable **Connection Type**
   - Set **Connection Mode** to **Cloud**
   - Click **Save**

3. **Download Parameters to Terminal**
   - On the terminal, perform a **Parameter Download**
   - Terminal should display **"Waiting for Valor Connect"** after download
   - If not, tap **star (★)** icon and select **Start VC**

### Step 3: Configure Environment Variables

Add the following environment variables to your `.env` file or deployment environment:

```env
# Valor Connect API Configuration
# App ID and App Key from Valor Portal (Settings → Developer → API Credentials)
VALOR_APP_ID=your_app_id_here
VALOR_APP_KEY=your_app_key_here

# EPI (Equipment Profile Identifier) - e.g., "2501357713"
# This is found in Valor Portal for your terminal
VALOR_EPI=your_epi_here

# Optional: Override API endpoints (defaults shown below)
# VALOR_CHECK_EPI_URL=https://demo.valorpaytech.com/api/Valor/checkepi
# VALOR_PUBLISH_URL=https://securelink-staging.valorpaytech.com:4430/?status
# VALOR_TXN_STATUS_URL=https://securelink-staging.valorpaytech.com:4430/?txn_status
# VALOR_CANCEL_URL=https://securelink-staging.valorpaytech.com:4430/?cancel
```

**Note:** 
- Replace the placeholder values with your actual credentials from Valor Portal
- The endpoints shown are **staging/demo** endpoints. Production endpoints will be provided by Valor during go-live/certification
- **NEVER** commit these credentials to version control

### Step 4: Configure Terminal in POS Settings

1. **Access Settings**
   - Log into the RetailPro POS application
   - Navigate to **Settings** → **Payment Terminal**

2. **Select Valor Connect API**
   - Choose **Valor Connect API (Cloud-to-Connect)** as your payment terminal type
   - Enter your **EPI (Equipment Profile Identifier)** (e.g., "2501357713")
   - **IP Address and Port are NOT required** for cloud-to-connect

3. **Save Settings**
   - Click **Save** to store your configuration

## API Endpoints

The Valor Connect API integration provides the following endpoints:

### Authentication
- `POST /valor/auth` - Validate Valor Connect credentials (header-based authentication)

### EPI Validation
- `POST /valor/checkepi` - Check EPI status (validates terminal is active)
  - Body: `{ epi: "2501357713" }`

### Payments
- `POST /valor/payment` - Initiate a payment request
  - Body: `{ amount, epi: "2501357713", invoiceNumber, description }`
  - Note: `epi` is required (can also use `terminalSerialNumber` for backward compatibility)
- `GET /valor/status/:transactionId` - Check payment status
  - Query params: `epi` (optional)
  - Note: `transactionId` should be the `reqTxnId` from the payment response
- `POST /valor/poll/:transactionId` - Poll payment status until completion
  - Body: `{ epi, maxAttempts, intervalMs }`
  - Note: `transactionId` should be the `reqTxnId` from the payment response

### Transactions
- `POST /valor/cancel` - Cancel a pending transaction
  - Body: `{ reqTxnId, epi }`
  - Note: `reqTxnId` is the transaction reference ID from the payment response
- `POST /valor/void` - Void a transaction (legacy endpoint, uses cancel internally)
  - Body: `{ transactionId, reqTxnId, epi }`

## Payment Flow

1. **POS App** sends payment request to **Valor Connect API** with EPI
2. **Valor Connect API** routes request to **VP100 Terminal** via cloud infrastructure
3. **VP100 Terminal** automatically displays payment prompt to customer (tap/insert/swipe)
4. **Customer** completes payment on VP100 device
5. **VP100 Terminal** sends payment data back to **Valor Connect API**
6. **POS App** polls **Valor Connect API** for payment status using `reqTxnId`
7. **POS App** shows notification when payment confirmed

## How the Payment Dialog is Triggered

The payment dialog (tap/insert/swipe prompt) appears **automatically** when you initiate a transaction via Valor Connect API. There is no separate "open dialog" command.

**What triggers the payment screen:**
- Sending a `SALE` transaction request (TRAN_CODE: "01")
- Sending an `AUTH` transaction request
- Sending a `RETURN` (refund) transaction request
- Sending a `TIP ADJUST` (post-auth) transaction request

The dialog is always tied to a real transaction request.

## API Request Format

### Publish API (Start Transaction)

**Endpoint:** `POST https://securelink-staging.valorpaytech.com:4430/?status`

**Headers:**
```
Content-Type: application/json
X-VALOR-APP-ID: your_app_id_here
X-VALOR-APP-KEY: your_app_key_here
```

**Request Body:**
```json
{
  "EPI": "2501357713",
  "AMOUNT": "25.00",
  "TRAN_MODE": "1",
  "TRAN_CODE": "01",
  "INVOICE_NUMBER": "POS-1234567890",
  "DESCRIPTION": "POS Sale"
}
```

**Response:**
```json
{
  "reqTxnId": "TXN-1234567890",
  "status": "PENDING",
  "message": "Payment request sent to terminal"
}
```

### Transaction Status API

**Endpoint:** `POST https://securelink-staging.valorpaytech.com:4430/?txn_status`

**Headers:**
```
Content-Type: application/json
X-VALOR-APP-ID: your_app_id_here
X-VALOR-APP-KEY: your_app_key_here
```

**Request Body:**
```json
{
  "reqTxnId": "TXN-1234567890",
  "EPI": "2501357713"
}
```

**Response:**
```json
{
  "status": "APPROVED",
  "amount": "25.00",
  "authCode": "AUTH123",
  "message": "Transaction approved"
}
```

### Cancel Transaction API

**Endpoint:** `POST https://securelink-staging.valorpaytech.com:4430/?cancel`

**Headers:**
```
Content-Type: application/json
X-VALOR-APP-ID: your_app_id_here
X-VALOR-APP-KEY: your_app_key_here
```

**Request Body:**
```json
{
  "reqTxnId": "TXN-1234567890",
  "EPI": "2501357713"
}
```

## Testing

### Test Check EPI
```bash
curl -X POST http://localhost:3000/valor/checkepi \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "epi": "2501357713"
  }'
```

### Test Payment
```bash
curl -X POST http://localhost:3000/valor/payment \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "amount": "10.00",
    "epi": "2501357713",
    "invoiceNumber": "TEST-001",
    "description": "Test Payment"
  }'
```

### Check Payment Status
```bash
curl -X GET "http://localhost:3000/valor/status/TXN-1234567890?epi=2501357713" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Cancel Transaction
```bash
curl -X POST http://localhost:3000/valor/cancel \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "reqTxnId": "TXN-1234567890",
    "epi": "2501357713"
  }'
```

## Troubleshooting

### Authentication Errors

**Error: "Missing Valor API credentials"**
- **Solution:** Verify all environment variables are set correctly:
  - `VALOR_APP_ID`
  - `VALOR_APP_KEY`

**Error: "401 Unauthorized" or "Invalid App Key"**
- **Solution:** 
  - Verify credentials are correct in Valor Portal
  - Ensure App ID and App Key are bound to the correct EPI
  - Check that API access is enabled for your account

### Payment Errors

**Error: "EPI (Equipment Profile Identifier) is required"**
- **Solution:** Configure EPI in Settings → Payment Terminal

**Error: "EPI is not active"**
- **Solution:** 
  - Verify terminal is registered in Valor Portal
  - Ensure EPI matches Valor Portal registration
  - Check terminal is configured for Valor Connect (Cloud mode)
  - Use `/valor/checkepi` endpoint to validate EPI status

**Error: "Terminal not connected"**
- **Solution:**
  - Verify terminal is connected to WiFi
  - Check terminal has internet access
  - Ensure terminal displays "Waiting for Valor Connect"
  - Perform Parameter Download on terminal
  - If needed, tap **star (★)** icon and select **Start VC**

### Connection Issues

**Terminal not responding to payment requests**
- **Solution:**
  - Check terminal WiFi connection
  - Verify terminal is in Valor Connect (Cloud mode)
  - Ensure terminal displays "Waiting for Valor Connect"
  - Restart Valor Connect on terminal (tap star → Start VC)
  - Check terminal status in Valor Portal
  - Verify EPI is correct and active

**Payment timeout**
- **Solution:**
  - Valor Connect can wait up to 180 seconds for terminal response
  - Check terminal is online and displaying "Waiting for Valor Connect"
  - Verify customer is interacting with terminal
  - Use cancel endpoint if transaction needs to be aborted

## Important Notes

1. **EPI is Required**: For Valor Connect payments, the EPI (Equipment Profile Identifier) is mandatory. Without it, payments will fail.

2. **Terminal Registration**: The terminal must be registered in Valor Portal and configured for Valor Connect (Cloud mode) before it can receive payment requests.

3. **Network Connectivity**: The VP100 terminal must be connected to WiFi and have internet access for Valor Connect to work.

4. **No IP/Port Needed**: Unlike direct TCP/IP connections, Valor Connect does not require terminal IP address or port configuration.

5. **Payment Dialog**: The payment dialog (tap/insert/swipe prompt) appears automatically when a transaction is initiated. There is no separate command to open it.

6. **Transaction Reference**: Use `reqTxnId` from the payment response to check status or cancel transactions.

7. **API Rate Limits**: Be aware of Valor Connect API rate limits. Implement appropriate retry logic if needed.

8. **Transaction Timeout**: Payment requests wait up to 180 seconds for terminal response. Adjust polling settings if needed.

9. **Staging vs Production**: The endpoints shown in this guide are staging/demo endpoints. Production endpoints will be provided by Valor during go-live/certification.

10. **Security**: Never expose App ID and App Key in frontend code, public repositories, or client-side JavaScript. Always use backend-only API calls.

## Additional Resources

- [Valor Portal](https://valorpaytech.com)
- [Valor Connect Documentation](https://www.valor.com/)
- [PAX VP100 User Manual](https://www.pax.us/products/valor-vp100/)

## Support

For Valor Connect API specific issues:
1. Check Valor Connect API documentation
2. Verify terminal registration in Valor Portal
3. Use `/valor/checkepi` endpoint to validate EPI status
4. Contact Valor/Blackstone support for terminal-specific issues

For POS application issues:
1. Check application logs
2. Verify environment variables
3. Test API endpoints directly
4. Check terminal status in Valor Portal