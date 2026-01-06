# EBizCharge WiFi Terminal Setup Guide

## Environment Variables

Add the following variables to your `.env` file for EBizCharge terminal integration:

### Required EBizCharge API Credentials

These credentials are required for payment processing through EBizCharge's API:

```env
# EBizCharge API Credentials
EBIZCHARGE_USER_ID=your_ebizcharge_user_id
EBIZCHARGE_PASSWORD=your_ebizcharge_password
EBIZCHARGE_SECURITY_ID=your_ebizcharge_security_id
EBIZCHARGE_API_URL=https://secure.ebizcharge.com/ws/v1/
```

### Optional Terminal Configuration

These are optional and have defaults. Only set if you need to override:

```env
# EBizCharge Terminal Network Configuration (Optional)
EBIZCHARGE_TERMINAL_IP=192.168.1.100
EBIZCHARGE_TERMINAL_PORT=10009
EBIZCHARGE_TERMINAL_TIMEOUT=120000
```

## Getting Your EBizCharge Credentials

1. **Contact EBizCharge Support** or your merchant account provider
2. **Log in to your EBizCharge merchant portal**
3. **Navigate to API Settings** or Developer Settings
4. **Generate or retrieve your API credentials:**
   - User ID (Username)
   - Password
   - Security ID

## Important Notes

- **Keep credentials secure**: Never commit `.env` file to version control
- **Production vs Development**: EBizCharge may have separate credentials for sandbox/testing
- **API URL**: The default API URL is for production. Check with EBizCharge for sandbox/test URLs if needed

## Testing

After adding credentials, you can test the connection:

1. Go to Settings in your POS app
2. Enter your terminal IP address
3. Click "Test" to verify terminal connectivity
4. Process a test payment to verify API credentials

## Troubleshooting

If you encounter authentication errors:
- Verify credentials are correct (no extra spaces)
- Check if you're using production or sandbox credentials
- Ensure your EBizCharge account is active
- Contact EBizCharge support for credential verification
