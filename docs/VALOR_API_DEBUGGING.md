# Valor Connect API - Debugging 400 Errors

## Common Causes of 400 Bad Request

### 1. Authentication Issues

**Check:**
- Verify `VALOR_APP_ID` and `VALOR_APP_KEY` are set correctly in `.env`
- Ensure credentials match what's in Valor Portal
- Check that App ID and App Key are bound to the correct EPI

**Test:**
```bash
curl -X POST http://localhost:3000/valor/test \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{"epi": "2501357713"}'
```

### 2. EPI Not Active

**Check:**
- Verify EPI is correct (e.g., "2501357713")
- Check EPI status in Valor Portal
- Ensure terminal is configured for Valor Connect (Cloud mode)
- Terminal should display "Waiting for Valor Connect"

**Test:**
```bash
curl -X POST http://localhost:3000/valor/checkepi \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{"epi": "2501357713"}'
```

### 3. Request Format Issues

**Current Request Format:**
```json
{
  "EPI": "2501357713",
  "AMOUNT": "2.21",
  "TRAN_MODE": "1",
  "TRAN_CODE": "01",
  "INVOICE_NUMBER": "POS-1768410304920",
  "DESCRIPTION": "POS Sale - POS-1768410304920"
}
```

**Possible Issues:**
- Field names might need to be lowercase
- Amount format might need adjustment
- Missing required fields
- Extra fields causing issues

### 4. Endpoint URL Issues

**Current Endpoint:**
```
https://securelink-staging.valorpaytech.com:4430/?status
```

**Check:**
- Verify this is the correct staging endpoint
- The `?status` query parameter might be incorrect
- May need production endpoint instead

## Debugging Steps

### Step 1: Check Server Logs

Look for these log messages in your server console:

```
📤 Sending terminal payment request to Valor Connect API
📤 Request body: {...}
📤 Request headers: {...}
📥 Valor Connect Publish API response status: 400
📥 Valor Connect Publish API response data: {...}
❌ Valor Connect API returned error status: {...}
```

The response data will show the actual error from Valor Connect.

### Step 2: Test Authentication

```bash
# Test credentials
curl -X POST http://localhost:3000/valor/test \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{"epi": "2501357713"}'
```

### Step 3: Test EPI Status

```bash
# Check if EPI is active
curl -X POST http://localhost:3000/valor/checkepi \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{"epi": "2501357713"}'
```

### Step 4: Check Actual Error Response

The improved error handling now returns the actual error message from Valor Connect. Check the response:

```json
{
  "success": false,
  "message": "Actual error message from Valor Connect",
  "data": {
    "error": "...",
    "errorCode": 400,
    "errorDetails": {...}
  }
}
```

## Common Error Messages

### "Invalid App Key"
- **Solution:** Verify `VALOR_APP_KEY` is correct in `.env`
- Regenerate App Key in Valor Portal if needed

### "EPI not found" or "EPI not active"
- **Solution:** 
  - Verify EPI in Valor Portal
  - Ensure terminal is registered and active
  - Check terminal shows "Waiting for Valor Connect"

### "Invalid request format"
- **Solution:** 
  - Check field names match exactly (case-sensitive)
  - Verify amount format (should be string with 2 decimals)
  - Remove any extra fields

### "Missing required field"
- **Solution:** Check Valor Connect API documentation for all required fields

## Next Steps

1. **Check Server Logs** - Look for the detailed error response from Valor Connect
2. **Verify Credentials** - Test with `/valor/test` endpoint
3. **Check EPI** - Verify EPI is active with `/valor/checkepi`
4. **Contact Valor Support** - If issue persists, contact with:
   - EPI: 2501357713
   - Error message from logs
   - Request payload
   - Response details

## Testing with Different Formats

If the current format doesn't work, try these variations:

### Format 1: Lowercase field names
```json
{
  "epi": "2501357713",
  "amount": "2.21",
  "tran_mode": "1",
  "tran_code": "01"
}
```

### Format 2: Without optional fields
```json
{
  "EPI": "2501357713",
  "AMOUNT": "2.21",
  "TRAN_MODE": "1",
  "TRAN_CODE": "01"
}
```

### Format 3: Amount as number
```json
{
  "EPI": "2501357713",
  "AMOUNT": 2.21,
  "TRAN_MODE": "1",
  "TRAN_CODE": "01"
}
```

## Getting Help

When contacting Valor/Blackstone support, provide:

1. **EPI:** 2501357713
2. **Error Message:** (from server logs)
3. **Request Payload:** (from server logs)
4. **Response Details:** (from server logs)
5. **App ID:** (first few characters, redact the rest)
6. **Terminal Status:** (from Valor Portal)
