# Zoho Books Webhook: Auto-Sync New Customers

When you add a new customer in Zoho Books, the POS can automatically sync it to the database via a webhook.

## Setup in Zoho Books

1. Log in to [Zoho Books](https://books.zoho.com) and open your organization.
2. Go to **Settings** → **Automation** → **Workflow Rules**.
3. Click **+ New Rule**.
4. Configure:
   - **Choose when to Trigger:** When a contact is created
   - **Immediate Action:** Webhook → Create/select a webhook
5. In the webhook configuration:
   - **URL:** `https://your-server.com/zoho/webhook/customer`
   - **Method:** POST
   - **Body:** Default Payload (application/JSON)
6. Save the workflow rule.

## Optional: Webhook Secret

To validate that requests come from Zoho, set `ZOHO_WEBHOOK_SECRET` in your environment. Then add it to the webhook URL or headers in Zoho:

- **Query param:** `https://your-server.com/zoho/webhook/customer?secret=YOUR_SECRET`
- **Header:** `X-Zoho-Webhook-Secret: YOUR_SECRET`

## Alternative: Polling (No Webhook)

If you can't expose a public URL, use the existing **auto-sync**:

- Set `ZOHO_AUTO_SYNC_INTERVAL_MS=300000` (5 minutes) in your environment.
- New customers will be synced within the interval.

Or run a manual sync: **POST /zoho/sync/all** (requires auth).
