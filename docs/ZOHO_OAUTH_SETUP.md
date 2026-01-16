# Zoho OAuth Setup (Backend)

The backend (`server/services/zohoService.js`) uses a **refresh token** to obtain short-lived Zoho access tokens automatically.

## Required environment variables

- `ZOHO_REFRESH_TOKEN`
- `ZOHO_CLIENT_ID`
- `ZOHO_CLIENT_SECRET`
- `ZOHO_ORGANIZATION_ID`

## Quick test

From the repo root:

```bash
npm run get-zoho-token
```

If it succeeds, you'll see a Zoho access token printed (hidden when `NODE_ENV=production`).

