# Valor Connect Setup Guide for PAX VP100

## Overview

This guide explains how to set up **Valor Connect** (cloud-to-cloud integration) for PAX VP100 terminals with Authorize.Net in the RetailPro POS application.

## What is Valor Connect?

Valor Connect is a cloud-to-cloud payment integration that allows your POS application to send payment requests to Authorize.Net, which then routes them to your VP100 terminal via WebSocket/TCP. The terminal displays the payment prompt, and after the customer completes payment, the transaction status is sent back to Authorize.Net, which your app polls for confirmation.

## Prerequisites

1. **PAX Valor VP100 Terminal** - Must be a VP100 model
2. **Authorize.Net Merchant Account** - Active account with API credentials
3. **Valor Portal Access** - Access to register and manage terminals
4. **VP100 Serial Number** - Found on the device or in Valor Portal

## Step-by-Step Setup

### Step 1: Register Terminal in Valor Portal/Authorize.Net

1. **Log into Authorize.Net Merchant Interface**
   - Go to [https://account.authorize.net](https://account.authorize.net)
   - Log in with your merchant credentials

2. **Navigate to Terminal Settings**
   - Go to **Account** → **Settings** → **Terminal Settings**
   - Or access Valor Portal directly (if available)

3. **Register Your VP100 Terminal**
   - Click **Add Terminal** or **Register Device**
   - Enter your VP100 serial number
   - Select **Valor Connect** as the integration method
   - Link the terminal to your Authorize.Net merchant account
   - Save the registration

4. **Verify Terminal Status**
   - Ensure terminal shows as **Active** or **Online**
   - Verify **Valor Connect** is enabled for the terminal

### Step 2: Find Your Terminal ID (Serial Number)

Your Terminal ID is the VP100 serial number. You can find it in several ways:

1. **On the Device**
   - Check the back or bottom of the VP100 terminal
   - Look for a label with "Serial Number" or "S/N"
   - Format is typically alphanumeric (e.g., `VP100-123456`)

2. **In Valor Portal**
   - Log into Valor Portal
   - Navigate to **Devices** or **Terminals**
   - Find your VP100 and note the serial number

3. **In Authorize.Net Merchant Interface**
   - Go to **Account** → **Settings** → **Terminal Settings**
   - Find your registered VP100 terminal
   - The serial number should be displayed

### Step 3: Configure Terminal ID in POS App

1. **Open Settings**
   - Log into the RetailPro POS app
   - Navigate to **Settings** (gear icon or menu)

2. **Find PAX Terminal Section**
   - Scroll to **PAX Terminal Support (VP100) - Valor Connect**

3. **Enter Terminal ID**
   - In the **Terminal ID (VP100 Serial Number)** field, enter your VP100 serial number
   - Example: `VP100-123456` or `VP100123456`
   - The field accepts alphanumeric characters, dashes, and underscores

4. **Optional: Configure IP and Port**
   - **Terminal IP Address**: Only needed if you want direct terminal communication (optional for Valor Connect)
   - **Terminal Port**: Only needed for direct terminal communication (optional for Valor Connect)
   - For Valor Connect, these are optional since communication is cloud-based

5. **Save Settings**
   - Click **Save** to store your Terminal ID
   - You should see a success message

### Step 4: Verify Backend Configuration

Ensure your backend `.env` file has the correct Authorize.Net credentials:

```env
# Authorize.Net API Credentials
AUTHORIZE_NET_API_LOGIN_ID=your_api_login_id
AUTHORIZE_NET_TRANSACTION_KEY=your_transaction_key

# Environment (development uses sandbox, production uses live)
NODE_ENV=development  # or 'production'
```

**To get your API credentials:**
1. Log into Authorize.Net Merchant Interface
2. Go to **Account** → **Settings** → **API Credentials & Keys**
3. View your **API Login ID**
4. Generate or view your **Transaction Key**

### Step 5: Test the Integration

1. **Create a Test Sale**
   - Add items to cart in the POS app
   - Click **Checkout**

2. **Select PAX WiFi Terminal**
   - In the payment modal, select **PAX WiFi Terminal** as payment method
   - Click **Confirm Payment**

3. **Check VP100 Terminal**
   - The VP100 terminal should display a payment prompt
   - The amount should match your sale total

4. **Complete Payment**
   - Insert, swipe, or tap a test card on the VP100
   - Follow prompts on the terminal

5. **Verify Confirmation**
   - The POS app should show a success notification
   - The sale should be completed
   - A receipt should be generated

## Troubleshooting

### Terminal ID Not Found Error

**Error:** "Terminal ID is required for PAX WiFi terminal payments"

**Solution:**
- Ensure Terminal ID is entered in Settings
- Verify Terminal ID matches the serial number registered in Valor Portal
- Check that Terminal ID field is not empty

### Payment Request Fails

**Error:** Payment request fails with API error

**Possible Causes:**
- Terminal ID doesn't match registered terminal
- Terminal not registered in Valor Portal/Authorize.Net
- Authorize.Net API credentials incorrect
- Terminal not online/connected

**Solutions:**
- Verify Terminal ID in Settings matches Valor Portal registration
- Check terminal registration in Authorize.Net Merchant Interface
- Verify Authorize.Net API credentials in backend `.env`
- Ensure terminal is online and connected to WiFi

### Terminal Doesn't Show Payment Prompt

**Possible Causes:**
- Terminal not connected to internet/WiFi
- Terminal not registered correctly
- Valor Connect not enabled for terminal
- Terminal ID mismatch

**Solutions:**
- Verify terminal is online (check WiFi connection)
- Check terminal registration in Valor Portal
- Ensure Valor Connect is enabled for the terminal
- Verify Terminal ID matches registered serial number

### Polling Times Out

**Possible Causes:**
- Customer didn't complete payment on terminal
- Terminal communication issue
- Payment declined on terminal

**Solutions:**
- Check terminal for error messages
- Verify customer completed payment on terminal
- Check Authorize.Net transaction logs
- Try payment again

## Important Notes

1. **Terminal ID is Required**: For Valor Connect payments, the Terminal ID (VP100 serial number) is mandatory. Without it, payments will fail.

2. **Terminal Registration**: The terminal must be registered in Valor Portal/Authorize.Net before it can receive payment requests.

3. **Network Connectivity**: The VP100 terminal must be connected to WiFi and have internet access for Valor Connect to work.

4. **API Credentials**: Ensure your Authorize.Net API credentials are correct and have the necessary permissions.

5. **Environment**: Use `NODE_ENV=development` for sandbox testing, and `NODE_ENV=production` for live payments.

## Additional Resources

- [Authorize.Net API Reference](https://developer.authorize.net/api/reference/)
- [Authorize.Net Payment Transactions Guide](https://developer.authorize.net/api/reference/features/payment-transactions.html)
- [PAX VP100 Documentation](https://www.pax.us/)
- [Valor Connect Documentation](https://www.valor.com/)

## Support

If you encounter issues:
1. Check the troubleshooting section above
2. Verify terminal registration in Valor Portal
3. Check Authorize.Net transaction logs
4. Contact Authorize.Net support for API issues
5. Contact Valor support for terminal-specific issues
