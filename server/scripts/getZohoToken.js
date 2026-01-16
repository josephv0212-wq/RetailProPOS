/**
 * Prints a Zoho access token using the configured refresh token flow.
 *
 * Required env vars:
 * - ZOHO_REFRESH_TOKEN
 * - ZOHO_CLIENT_ID
 * - ZOHO_CLIENT_SECRET
 * - ZOHO_ORGANIZATION_ID (required by zohoService credential check)
 */

import 'dotenv/config';
import { getZohoAccessToken } from '../services/zohoService.js';

async function main() {
  const token = await getZohoAccessToken();
  // Avoid printing in production by accident (tokens are sensitive).
  if (process.env.NODE_ENV === 'production') {
    console.log('Zoho access token acquired (hidden in production).');
    return;
  }
  console.log('Zoho access token:');
  console.log(token);
}

main().catch((err) => {
  console.error('Failed to get Zoho access token:', err?.message || err);
  process.exit(1);
});

