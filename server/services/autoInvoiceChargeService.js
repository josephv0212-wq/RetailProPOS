/**
 * Auto Invoice Charge Service
 * Reusable logic for charging invoices via stored payment (Authorize.net CIM).
 * Used by both the HTTP handler and the background auto-invoice job.
 */

import { Customer, InvoicePayment } from '../models/index.js';
import { chargeCustomerProfile, getCustomerProfileDetails, extractPaymentProfiles, searchAllCustomerProfilesByEmail } from './authorizeNetService.js';
import { createCustomerPayment, createProcessingFeeJournal, createInvoice } from './zohoService.js';
import { invalidatePaymentProfilesCacheServer } from '../controllers/customerController.js';

/**
 * Get the first stored payment profile for a customer.
 * Prefers customer.customerPaymentProfileId + customer.customerProfileId if set;
 * otherwise searches Authorize.net by email and returns first card, else first ACH.
 * @param {number} customerId
 * @returns {Promise<{ paymentProfileId: string; customerProfileId: string; paymentType: 'card'|'ach' } | null>}
 */
export const getFirstStoredPaymentProfile = async (customerId) => {
  const customer = await Customer.findByPk(customerId);
  if (!customer) return null;

  // Prefer stored profile IDs
  if (customer.customerProfileId && customer.customerPaymentProfileId) {
    try {
      const profileResult = await getCustomerProfileDetails({
        customerProfileId: customer.customerProfileId
      });
      if (profileResult.success && profileResult.profile) {
        const profiles = extractPaymentProfiles(profileResult.profile);
        const stored = profiles.find(p => p.paymentProfileId === customer.customerPaymentProfileId);
        if (stored) {
          return {
            paymentProfileId: customer.customerPaymentProfileId,
            customerProfileId: customer.customerProfileId,
            paymentType: stored.type === 'ach' ? 'ach' : 'card'
          };
        }
      }
    } catch (err) {
      console.warn(`getFirstStoredPaymentProfile: stored profile lookup failed for customer ${customerId}:`, err?.message);
    }
  }

  // Fallback: search by email
  if (!customer.email) return null;

  const allResult = await searchAllCustomerProfilesByEmail(customer.email);
  if (!allResult.success || !allResult.profiles || allResult.profiles.length === 0) return null;

  const allProfiles = [];
  for (const { profile, customerProfileId: cpid } of allResult.profiles) {
    const extracted = extractPaymentProfiles(profile);
    for (const pp of extracted) {
      allProfiles.push({
        ...pp,
        customerProfileId: cpid
      });
    }
  }

  // Prefer first card, else first ACH
  const firstCard = allProfiles.find(p => p.type === 'card');
  const firstAch = allProfiles.find(p => p.type === 'ach');
  const chosen = firstCard || firstAch;
  if (!chosen) return null;

  return {
    paymentProfileId: chosen.paymentProfileId,
    customerProfileId: chosen.customerProfileId || '',
    paymentType: chosen.type === 'ach' ? 'ach' : 'card'
  };
};

/**
 * Charge invoices using stored payment (Authorize.net CIM).
 * @param {Object} params
 * @param {number} params.customerId
 * @param {string} params.paymentProfileId
 * @param {string|null} [params.customerProfileId]
 * @param {'card'|'ach'} params.paymentType
 * @param {Array<{ type: string; id: string; number: string; amount: number }>} params.items
 * @param {{ userId?: number|null; locationId?: string|null }} [params.systemContext]
 * @returns {Promise<{ success: boolean; results?: any[]; errors?: any[]; summary?: { total: number; successful: number; failed: number }; error?: string }>}
 */
export const chargeInvoicesWithStoredPayment = async ({
  customerId,
  paymentProfileId,
  customerProfileId: requestCustomerProfileId,
  paymentType,
  items,
  systemContext = {}
}) => {
  const { userId = null, locationId = null } = systemContext;

  const customer = await Customer.findByPk(customerId);
  if (!customer) {
    return { success: false, error: 'Customer not found' };
  }

  let customerProfileId = requestCustomerProfileId || customer.customerProfileId;

  if (!customerProfileId) {
    if (!customer.email) {
      return { success: false, error: 'Customer email is required to look up stored payment profiles' };
    }
    const allResult = await searchAllCustomerProfilesByEmail(customer.email);
    if (!allResult.success || !allResult.profiles || allResult.profiles.length === 0) {
      return { success: false, error: 'Customer does not have a payment profile in Authorize.net' };
    }
    let foundProfile = null;
    for (const { profile, customerProfileId: cpid } of allResult.profiles) {
      const paymentProfiles = extractPaymentProfiles(profile);
      const requested = paymentProfiles.find(p => p.paymentProfileId === paymentProfileId);
      if (requested) {
        customerProfileId = cpid;
        foundProfile = requested;
        break;
      }
    }
    if (!customerProfileId || !foundProfile) {
      return { success: false, error: `Payment profile ${paymentProfileId} not found for this customer` };
    }
    if (allResult.profiles.length === 1) {
      await customer.update({
        customerProfileId: customerProfileId.toString(),
        customerPaymentProfileId: paymentProfileId.toString()
      });
    }
  }

  let actualProfileType = paymentType;
  try {
    const profileResult = await getCustomerProfileDetails({ customerProfileId });
    if (profileResult.success && profileResult.profile) {
      const paymentProfiles = extractPaymentProfiles(profileResult.profile);
      const selected = paymentProfiles.find(p => p.paymentProfileId === paymentProfileId);
      if (selected) {
        actualProfileType = selected.type === 'ach' ? 'ach' : 'card';
      }
    }
  } catch (profileErr) {
    console.warn('Could not determine payment profile type:', profileErr?.message);
  }

  const results = [];
  const errors = [];
  const validatedItems = [];

  for (const item of items) {
    const { type, id, number, amount } = item;
    if (!type || !id || !number || amount == null) {
      errors.push({ item: { type: type || 'unknown', id: id || '', number: number || '' }, error: 'Missing required fields' });
      continue;
    }
    if (type !== 'invoice') {
      errors.push({ item: { type, id, number }, error: 'Only invoices are supported' });
      continue;
    }
    const originalAmount = parseFloat(amount);
    if (!(originalAmount > 0)) {
      errors.push({ item: { type, id, number }, error: 'Amount must be greater than 0' });
      continue;
    }
    validatedItems.push({
      type,
      id: String(id).trim(),
      number: String(number).trim(),
      amount: originalAmount
    });
  }

  if (validatedItems.length === 0) {
    return {
      success: false,
      results: [],
      errors,
      summary: { total: items.length, successful: 0, failed: errors.length },
      error: errors.length > 0 ? 'Validation failed' : 'No valid items to charge'
    };
  }

  const totalOriginal = validatedItems.reduce((sum, it) => sum + it.amount, 0);
  const addCardFee = actualProfileType === 'card';
  const totalCharge = addCardFee ? Math.round(totalOriginal * 1.03 * 100) / 100 : totalOriginal;
  const totalFee = addCardFee ? Math.round((totalCharge - totalOriginal) * 100) / 100 : 0;

  const batchInvoiceNumber = `MULTI-${Date.now().toString().slice(-8)}`.slice(0, 20);
  const DESC_MAX = 255;
  let description = validatedItems.length === 1
    ? `Invoice Payment: ${validatedItems[0].number}`
    : `Multi payment: ${validatedItems.map(it => `INV-${it.number}`).join(', ')}`;
  if (description.length > DESC_MAX) {
    description = description.substring(0, DESC_MAX - 3) + '...';
  }

  const chargeResult = await chargeCustomerProfile({
    customerProfileId,
    customerPaymentProfileId: paymentProfileId,
    amount: totalCharge,
    invoiceNumber: batchInvoiceNumber,
    description
  });

  if (!chargeResult.success) {
    return {
      success: false,
      results: [],
      errors: [{
        item: { type: 'batch', id: '', number: 'Multi payment' },
        error: chargeResult.error || 'Transaction declined',
        errorCode: chargeResult.errorCode,
        responseCode: chargeResult.responseCode
      }],
      summary: { total: validatedItems.length, successful: 0, failed: validatedItems.length },
      error: chargeResult.error || 'Charge declined'
    };
  }

  let zohoPaymentRecorded = false;
  let zohoPaymentError = null;
  const invoiceItems = validatedItems.filter(it => it.type === 'invoice');

  if (invoiceItems.length > 0) {
    const zohoCustomerId = (customer.zohoId && String(customer.zohoId).trim()) || null;
    if (zohoCustomerId) {
      const zohoPaymentMode = paymentType === 'ach' ? 'banktransfer' : 'creditcard';
      const paymentLabel = paymentType === 'ach' ? 'ACH' : 'Card';
      let invoicesForZoho = invoiceItems.map(it => ({ invoice_id: it.id, amount_applied: it.amount }));
      let paymentAmount = invoiceItems.reduce((sum, it) => sum + it.amount, 0);
      let useFeeInvoice = false;

      if (totalFee > 0) {
        const feeInvoiceResult = await createInvoice({
          customerId: zohoCustomerId,
          feeAmount: totalFee,
          referenceNumber: chargeResult.transactionId || `MULTI-${batchInvoiceNumber}`,
          date: new Date().toISOString().split('T')[0]
        });
        if (feeInvoiceResult.success && feeInvoiceResult.invoiceId) {
          invoicesForZoho.push({ invoice_id: feeInvoiceResult.invoiceId, amount_applied: totalFee });
          paymentAmount += totalFee;
          useFeeInvoice = true;
        } else {
          console.warn(`Zoho: fee invoice failed, falling back to journal: ${feeInvoiceResult.error || 'unknown'}`);
        }
      }

      const zohoPaymentResult = await createCustomerPayment({
        customerId: zohoCustomerId,
        amount: paymentAmount,
        invoices: invoicesForZoho,
        paymentMode: zohoPaymentMode,
        referenceNumber: chargeResult.transactionId || undefined,
        description: validatedItems.length === 1
          ? `Invoice ${validatedItems[0].number} - POS payment (${paymentLabel})`
          : `POS multi payment (${paymentLabel}): ${invoiceItems.map(it => it.number).join(', ')}`
      });
      if (zohoPaymentResult.success) {
        zohoPaymentRecorded = true;
        if (totalFee > 0 && !useFeeInvoice) {
          await createProcessingFeeJournal({
            feeAmount: totalFee,
            referenceNumber: chargeResult.transactionId ? `Txn ${chargeResult.transactionId}` : `MULTI-${batchInvoiceNumber}`,
            date: new Date().toISOString().split('T')[0]
          }).catch(() => {});
        }
      } else {
        zohoPaymentError = zohoPaymentResult.error || 'Unknown Zoho error';
        console.error(`Zoho: could not record invoice payment: ${zohoPaymentError}`);
      }
    } else {
      zohoPaymentError = 'Customer has no Zoho ID';
    }
  }

  let chargedSum = 0;
  let feeSum = 0;
  const perItemCharged = validatedItems.map((it, idx) => {
    const isLast = idx === validatedItems.length - 1;
    if (isLast) {
      const charge = Math.round((totalCharge - chargedSum) * 100) / 100;
      const fee = Math.round((totalFee - feeSum) * 100) / 100;
      return { amountCharged: charge, ccFee: fee };
    }
    const ratio = totalOriginal > 0 ? it.amount / totalOriginal : 0;
    const charge = Math.round(totalCharge * ratio * 100) / 100;
    const fee = Math.round(totalFee * ratio * 100) / 100;
    chargedSum += charge;
    feeSum += fee;
    return { amountCharged: charge, ccFee: fee };
  });

  const transactionId = chargeResult.transactionId || null;
  for (let i = 0; i < validatedItems.length; i++) {
    const it = validatedItems[i];
    const { amountCharged, ccFee } = perItemCharged[i];
    try {
      await InvoicePayment.create({
        customerId: customer.id,
        type: it.type,
        documentNumber: it.number,
        documentId: it.id,
        amount: it.amount,
        amountCharged,
        ccFee,
        paymentType: paymentType || 'card',
        transactionId,
        zohoPaymentRecorded: it.type === 'invoice' ? zohoPaymentRecorded : false,
        locationId,
        userId
      });
    } catch (saveErr) {
      console.warn(`Could not save invoice payment record for ${it.type} ${it.number}:`, saveErr.message);
    }
    results.push({
      type: it.type,
      id: it.id,
      number: it.number,
      amount: it.amount,
      amountCharged,
      ccFee,
      transactionId,
      authCode: chargeResult.authCode,
      message: chargeResult.message,
      success: true,
      underReview: chargeResult.underReview || false,
      reviewStatus: chargeResult.reviewStatus || null,
      zohoPaymentRecorded: it.type === 'invoice' ? zohoPaymentRecorded : undefined,
      zohoPaymentError: it.type === 'invoice' && zohoPaymentError ? zohoPaymentError : undefined
    });
  }

  invalidatePaymentProfilesCacheServer(customer.id);

  return {
    success: true,
    results,
    errors,
    summary: {
      total: validatedItems.length,
      successful: results.length,
      failed: errors.length
    }
  };
};
