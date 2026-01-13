# Valor API Setup Guide for PAX VP100 (Cloud-to-Connect)

This guide explains how to set up **Valor API** (cloud-to-connect integration) for PAX VP100 terminals in the RetailPro POS application.

## What is Valor API?

Valor API is a cloud-based REST API that allows your POS application to send payment requests directly to VP100 terminals via Valor's cloud infrastructure. The terminal communicates through WiFi and connects to Valor's cloud servers, eliminating the need for direct TCP/IP connections.

**Important:** Valor API is a **standalone payment gateway** - it does **NOT** require Authorize.Net or any other payment processor. Valor API handles all payment processing directly through Valor's cloud infrastructure.

## Prerequisites

1. **PAX Valor VP100 Terminal** - Must be a VP100 model
2. **Valor Portal Account** - Access to register and manage terminals
3. **Valor API Credentials** - Merchant ID, API Key, and Secret Key from Valor Portal
4. **VP100 Serial Number** - Found on the device or in Valor Portal
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

3. **Get API Credentials**
   - Navigate to **API Settings** or **Developer Settings** in Valor Portal
   - Generate or retrieve your:
     - **Merchant ID**
     - **API Key**
     - **Secret Key**
   - Note the **API Base URL** (usually `https://api.valorpaytech.com`)

### Step 2: Configure Terminal for Cloud-to-Connect

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
   - Terminal should display "Waiting for Valor Connect" after download
   - If not, tap **star (★)** icon and select **Start VC**

### Step 3: Configure Environment Variables

Add the following environment variables to your `.env` file or deployment environment:

```env
# Valor API Configuration
VALOR_API_BASE_URL=https://api.valorpaytech.com
VALOR_API_MERCHANT_ID=your_merchant_id_here
VALOR_API_API_KEY=your_api_key_here
VALOR_API_SECRET_KEY=your_secret_key_here
```

**Note:** Replace the placeholder values with your actual credentials from Valor Portal.

### Step 4: Configure Terminal in POS Settings

1. **Access Settings**
   - Log into the RetailPro POS application
   - Navigate to **Settings** → **Payment Terminal**

2. **Select Valor API**
   - Choose **Valor API (Cloud-to-Connect)** as your payment terminal type
   - Enter your **Terminal Serial Number** (VP100 serial number)
   - **IP Address and Port are NOT required** for cloud-to-connect

3. **Save Settings**
   - Click **Save** to store your configuration

## API Endpoints

The Valor API integration provides the following endpoints:

### Authentication
- `POST /valor/auth` - Authenticate with Valor API and get Bearer token

### Devices
- `GET /valor/devices` - Get list of registered terminals

### Payments
- `POST /valor/payment` - Initiate a payment request
  - Body: `{ amount, invoiceNumber, description, terminalSerialNumber }`
- `GET /valor/status/:transactionId` - Check payment status
  - Query params: `terminalSerialNumber` (optional)
- `POST /valor/poll/:transactionId` - Poll payment status until completion
  - Body: `{ terminalSerialNumber, maxAttempts, intervalMs }`

### Transactions
- `POST /valor/void` - Void a transaction
  - Body: `{ transactionId, terminalSerialNumber }`

## Payment Flow

1. **POS App** sends payment request to **Valor API** with terminal serial number
2. **Valor API** routes request to **VP100 Terminal** via cloud infrastructure
3. **VP100 Terminal** displays payment prompt to customer
4. **Customer** completes payment on VP100 device (insert, swipe, or tap card)
5. **VP100 Terminal** sends payment data back to **Valor API**
6. **POS App** polls **Valor API** for payment status
7. **POS App** shows notification when payment confirmed

## Testing

### Test Authentication
```bash
curl -X POST http://localhost:3000/valor/auth \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Test Payment
```bash
curl -X POST http://localhost:3000/valor/payment \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "amount": "10.00",
    "invoiceNumber": "TEST-001",
    "description": "Test Payment",
    "terminalSerialNumber": "YOUR_TERMINAL_SERIAL"
  }'
```

### Check Payment Status
```bash
curl -X GET "http://localhost:3000/valor/status/TRANSACTION_ID?terminalSerialNumber=YOUR_TERMINAL_SERIAL" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## Troubleshooting

### Authentication Errors

**Error: "Missing Valor API credentials"**
- **Solution:** Verify all environment variables are set correctly:
  - `VALOR_API_BASE_URL`
  - `VALOR_API_MERCHANT_ID`
  - `VALOR_API_API_KEY`
  - `VALOR_API_SECRET_KEY`

**Error: "Failed to authenticate with Valor API"**
- **Solution:** 
  - Verify credentials are correct in Valor Portal
  - Check API Base URL is correct
  - Ensure your account has API access enabled

### Payment Errors

**Error: "Terminal serial number is required"**
- **Solution:** Configure terminal serial number in Settings → Payment Terminal

**Error: "Terminal not found"**
- **Solution:** 
  - Verify terminal is registered in Valor Portal
  - Ensure terminal serial number matches Valor Portal registration
  - Check terminal is configured for cloud-to-connect mode

**Error: "Terminal not connected"**
- **Solution:**
  - Verify terminal is connected to WiFi
  - Check terminal has internet access
  - Ensure terminal displays "Waiting for Valor Connect"
  - Perform Parameter Download on terminal

### Connection Issues

**Terminal not responding to payment requests**
- **Solution:**
  - Check terminal WiFi connection
  - Verify terminal is in cloud-to-connect mode
  - Restart Valor Connect on terminal (tap star → Start VC)
  - Check terminal status in Valor Portal

## Important Notes

1. **Terminal Serial Number is Required**: For Valor API payments, the terminal serial number is mandatory. Without it, payments will fail.

2. **Terminal Registration**: The terminal must be registered in Valor Portal and configured for cloud-to-connect before it can receive payment requests.

3. **Network Connectivity**: The VP100 terminal must be connected to WiFi and have internet access for Valor API to work.

4. **No IP/Port Needed**: Unlike direct TCP/IP connections, Valor API cloud-to-connect does not require terminal IP address or port configuration.

5. **API Rate Limits**: Be aware of Valor API rate limits. The service includes automatic token caching to minimize authentication requests.

6. **Transaction Timeout**: Payment requests wait up to 180 seconds for terminal response. Adjust polling settings if needed.

## Additional Resources

- [Valor API Reference](https://valorapi.readme.io/reference)
- [Valor Portal](https://valorpaytech.com)
- [Valor Connect Documentation](https://www.valor.com/)
- [PAX VP100 User Manual](https://www.pax.us/products/valor-vp100/)

## Support

For Valor API specific issues:
1. Check Valor API documentation
2. Verify terminal registration in Valor Portal
3. Contact Valor support for terminal-specific issues

For POS application issues:
1. Check application logs
2. Verify environment variables
3. Test API endpoints directly
