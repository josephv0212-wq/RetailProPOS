/**
 * CLI: Update Shipping Charge Description for Zoho Sales Orders
 *
 * Updates the shipping charge description to "Fuel SurCharge 4%" for sales orders.
 * This script can update a single sales order or multiple orders based on filters.
 *
 * Usage examples:
 * - Update a single sales order by ID:
 *   node server/scripts/updateShippingChargeDescription.js --salesorder-id 123456789
 *
 * - Update all open sales orders:
 *   node server/scripts/updateShippingChargeDescription.js --filter-by Status.Open
 *
 * - Dry run (preview changes without updating):
 *   node server/scripts/updateShippingChargeDescription.js --filter-by Status.Open --dry-run
 *
 * Notes:
 * - Requires Zoho env vars: ZOHO_REFRESH_TOKEN, ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_ORGANIZATION_ID
 * - Uses adjustment_description field for shipping charge text as per Zoho Books API
 */

import 'dotenv/config';
import { listSalesOrders, getSalesOrderById, updateSalesOrder } from '../services/zohoService.js';

function getArgValue(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return undefined;
  const v = process.argv[idx + 1];
  if (!v || v.startsWith('--')) return undefined;
  return v;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function parseBool(flag, defaultValue = false) {
  if (hasFlag(`--no-${flag.replace(/^--/, '')}`)) return false;
  if (hasFlag(flag)) {
    const v = getArgValue(flag);
    if (v === undefined) return true;
    return String(v).toLowerCase() === 'true';
  }
  return defaultValue;
}

function parseNumber(flag, defaultValue) {
  const v = getArgValue(flag);
  if (v === undefined) return defaultValue;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : defaultValue;
}

function printHelp() {
  // Help text removed - no console output
}

async function main() {
  if (hasFlag('--help') || hasFlag('-h')) {
    printHelp();
    process.exit(0);
  }

  const salesOrderId = getArgValue('--salesorder-id');
  const description = getArgValue('--description') || 'Fuel SurCharge 4%';
  const dryRun = parseBool('--dry-run', false);
  const asJson = hasFlag('--json');
  const maxOrders = parseNumber('--max-orders', 100);

  const result = {
    processed: 0,
    updated: 0,
    skipped: 0,
    errors: [],
    dryRun: !!dryRun
  };

  try {
    let ordersToProcess = [];

    if (salesOrderId) {
      // Update a single sales order by ID
      const order = await getSalesOrderById(salesOrderId);
      if (!order) {
        process.exit(1);
      }
      ordersToProcess = [order];
    } else {
      // Fetch multiple sales orders based on filters
      const params = {};
      
      if (getArgValue('--filter-by')) {
        params.filter_by = getArgValue('--filter-by');
      }
      
      if (getArgValue('--sort-column')) {
        params.sort_column = getArgValue('--sort-column');
      }
      
      if (getArgValue('--sort-order')) {
        params.sort_order = getArgValue('--sort-order');
      }
      
      if (getArgValue('--search-text')) {
        params.search_text = getArgValue('--search-text');
      }

      const allOrders = await listSalesOrders(params);
      ordersToProcess = allOrders.slice(0, maxOrders);
    }

    for (const order of ordersToProcess) {
      const soId = order?.salesorder_id || order?.id;
      const soNumber = order?.salesorder_number || 'N/A';

      if (!soId) {
        result.skipped++;
        continue;
      }

      try {
        result.processed++;

        // Get full sales order details to preserve all fields
        const fullOrder = await getSalesOrderById(String(soId));
        if (!fullOrder) {
          result.skipped++;
          continue;
        }

        // Build update payload
        // Preserve existing fields and update shipping charge description
        const updatePayload = {
          customer_id: fullOrder.customer_id,
          date: fullOrder.date,
          line_items: fullOrder.line_items || []
        };

        // Preserve shipping_charge if it exists, otherwise set to 0
        if (fullOrder.shipping_charge !== undefined) {
          updatePayload.shipping_charge = fullOrder.shipping_charge;
        }

        // Set shipping charge description
        // Note: Zoho Books uses adjustment_description for shipping charge text/description
        // The adjustment field must be 0 when using adjustment_description for shipping description
        updatePayload.adjustment = 0;
        updatePayload.adjustment_description = description;

        // Preserve shipping_charge_tax_id if it exists
        if (fullOrder.shipping_charge_tax_id) {
          updatePayload.shipping_charge_tax_id = fullOrder.shipping_charge_tax_id;
        }

        if (dryRun) {
          result.updated++;
        } else {
          await updateSalesOrder(String(soId), updatePayload);
          result.updated++;
        }
      } catch (err) {
        result.errors.push({
          salesorder_id: String(soId),
          salesorder_number: soNumber,
          message: err?.response?.data?.message || err?.message || 'Unknown error'
        });
      }
    }

    if (asJson) {
      // JSON output removed - no console output
      return;
    }

    if (result.errors.length > 0) {
      process.exitCode = 1;
    }

  } catch (error) {
    process.exit(1);
  }
}

main().catch((err) => {
  process.exit(1);
});
