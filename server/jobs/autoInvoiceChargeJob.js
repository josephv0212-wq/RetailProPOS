/**
 * Auto Invoice Charge Job
 * Runs on a schedule to charge unpaid Zoho invoices for customers on the Auto Invoice list,
 * using their first stored payment method (card or ACH).
 */

import { AutoInvoiceCustomer, Customer } from '../models/index.js';
import { getCustomerInvoices } from '../services/zohoService.js';
import { getFirstStoredPaymentProfile, chargeInvoicesWithStoredPayment } from '../services/autoInvoiceChargeService.js';
import { logInfo, logWarning, logError } from '../utils/logger.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const WEEKLY_DAYS = 7;
const MONTHLY_DAYS = 30;

/**
 * Check if a customer is due for auto-charge based on frequency and lastChargedAt.
 * @param {Object} entry - AutoInvoiceCustomer record
 * @returns {boolean}
 */
const isDueForCharge = (entry) => {
  const lastCharged = entry.lastChargedAt ? new Date(entry.lastChargedAt).getTime() : 0;
  const nowDate = new Date();
  const now = nowDate.getTime();
  const daysSinceLastCharge = (now - lastCharged) / MS_PER_DAY;

  const isSunday = nowDate.getDay() === 0;
  const isFirstOfMonth = nowDate.getDate() === 1;

  if (entry.frequency === 'weekly' && !isSunday) {
    return false;
  }

  if (entry.frequency === 'monthly' && !isFirstOfMonth) {
    return false;
  }

  if (lastCharged === 0) return true; // Never charged

  const requiredDays = entry.frequency === 'monthly' ? MONTHLY_DAYS : WEEKLY_DAYS;
  return daysSinceLastCharge >= requiredDays;
};

/**
 * Run the auto invoice charge job.
 * For each customer on the list who is due (by frequency + lastChargedAt):
 * - Fetch unpaid Zoho invoices
 * - Get first stored payment profile
 * - Charge all invoices in one transaction
 * - Update lastChargedAt on success
 */
export const runAutoInvoiceChargeJob = async () => {
  logInfo('Auto invoice charge job started');

  try {
    const entries = await AutoInvoiceCustomer.findAll({
      include: [{ model: Customer, as: 'customer', required: true }],
      order: [['id', 'ASC']]
    });

    const activeEntries = entries.filter(e => {
      const c = e.customer;
      return c && c.isActive && c.zohoId;
    });

    if (activeEntries.length === 0) {
      logInfo('Auto invoice charge job: no eligible customers on list');
      return;
    }

    const dueEntries = activeEntries.filter(isDueForCharge);
    if (dueEntries.length === 0) {
      logInfo('Auto invoice charge job: no customers due for charge this run');
      return;
    }

    logInfo(`Auto invoice charge job: processing ${dueEntries.length} customer(s)`);

    for (const entry of dueEntries) {
      const customer = entry.customer;
      const customerName = customer.contactName || customer.companyName || `ID ${customer.id}`;

      try {
        const invoices = await getCustomerInvoices(customer.zohoId, 'unpaid');
        if (!invoices || invoices.length === 0) {
          logInfo(`Auto invoice: ${customerName} - no unpaid invoices, skipping`);
          continue;
        }

        const profile = await getFirstStoredPaymentProfile(customer.id);
        if (!profile) {
          logWarning(`Auto invoice: ${customerName} - no stored payment profile, skipping`);
          continue;
        }

        const items = invoices.map(inv => ({
          type: 'invoice',
          id: String(inv.invoice_id || inv.invoiceId || inv.id),
          number: String(inv.invoice_number || inv.invoice_number || inv.reference_number || inv.id),
          amount: parseFloat(inv.balance > 0 ? inv.balance : inv.total) || 0
        })).filter(it => it.amount > 0);

        if (items.length === 0) {
          logInfo(`Auto invoice: ${customerName} - no invoices with positive balance, skipping`);
          continue;
        }

        const result = await chargeInvoicesWithStoredPayment({
          customerId: customer.id,
          paymentProfileId: profile.paymentProfileId,
          customerProfileId: profile.customerProfileId || null,
          paymentType: profile.paymentType,
          items,
          systemContext: { userId: null, locationId: null }
        });

        if (result.success && result.summary?.successful > 0) {
          await entry.update({ lastChargedAt: new Date() });
          logInfo(`Auto invoice: ${customerName} - charged ${result.summary.successful} invoice(s) successfully`);
        } else {
          const errMsg = result.error || (result.errors?.[0]?.error) || 'Charge failed';
          logWarning(`Auto invoice: ${customerName} - charge failed: ${errMsg}`);
        }
      } catch (err) {
        logError(`Auto invoice: ${customerName} - error: ${err?.message || err}`);
      }
    }

    logInfo('Auto invoice charge job completed');
  } catch (err) {
    logError(`Auto invoice charge job failed: ${err?.message || err}`);
  }
};
