import { Customer, AutoInvoiceCustomer } from '../models/index.js';
import { Op } from 'sequelize';
import { syncCustomersFromZoho, getCustomerById as getZohoCustomerById, getCustomerCards, createZohoHostedCardUpdateLink, fetchZohoBooksBankaccountsForCustomer } from '../services/zohoService.js';
import { getCustomerProfile, getCustomerProfileDetails, extractPaymentProfiles, extractBankAccountInfo, searchAllCustomerProfilesByEmail, searchCustomerProfilesByCardLast4, resolveExistingCustomerProfileId } from '../services/authorizeNetService.js';
import { sendSuccess, sendError, sendNotFound } from '../utils/responseHelper.js';
import { logSuccess, logWarning, logError, logInfo } from '../utils/logger.js';

// Server-side payment profiles cache (5 min TTL) - speeds up repeat loads
const PAYMENT_PROFILES_CACHE_MS = 5 * 60 * 1000;
/** Bump when profile resolution logic changes so stale empty caches are not reused */
const PAYMENT_PROFILES_CACHE_VERSION = 11;
const paymentProfilesCache = new Map();
export const invalidatePaymentProfilesCacheServer = (customerId) => {
  if (customerId) paymentProfilesCache.delete(Number(customerId));
  else paymentProfilesCache.clear();
};

export const invalidatePaymentProfilesCacheHandler = async (req, res) => {
  const { id } = req.params;
  invalidatePaymentProfilesCacheServer(id ? Number(id) : null);
  return sendSuccess(res, { invalidated: true });
};

const normalizeContactType = (value) => {
  if (!value) return null;
  return value.toString().trim().toLowerCase();
};

// Helper functions for syncing customers (shared with zohoController logic)
const extractLocation = (zohoCustomer) => {
  if (zohoCustomer.custom_fields && Array.isArray(zohoCustomer.custom_fields)) {
    const locationField = zohoCustomer.custom_fields.find(
      field => field.label === 'location' || field.label === 'Location'
    );
    if (locationField) {
      return {
        locationId: locationField.value,
        locationName: locationField.value
      };
    }
  }
  
  if (zohoCustomer.place_of_contact) {
    return {
      locationId: zohoCustomer.place_of_contact,
      locationName: zohoCustomer.place_of_contact
    };
  }
  
  return { locationId: null, locationName: null };
};

const extractPaymentMethod = (zohoCustomer) => {
  // First, check if customer has cards array with last_four_digits
  if (zohoCustomer.cards && Array.isArray(zohoCustomer.cards) && zohoCustomer.cards.length > 0) {
    // Get the first active card
    const activeCard = zohoCustomer.cards.find(card => card.status === 'active') || zohoCustomer.cards[0];
    if (activeCard && activeCard.last_four_digits) {
      // Capitalize card_type (visa -> Visa, mastercard -> Mastercard, etc.)
      const cardType = activeCard.card_type || null;
      const cardBrand = cardType ? cardType.charAt(0).toUpperCase() + cardType.slice(1).toLowerCase() : 'Card';
      return {
        hasPaymentMethod: true,
        paymentMethodType: 'card',
        last_four_digits: activeCard.last_four_digits,
        cardBrand: cardBrand
      };
    }
  }
  
  if (zohoCustomer.payment_terms_label && zohoCustomer.payment_terms_label.includes('Card')) {
    return {
      hasPaymentMethod: true,
      paymentMethodType: 'card'
    };
  }
  
  if (zohoCustomer.custom_fields && Array.isArray(zohoCustomer.custom_fields)) {
    const cardLast4Field = zohoCustomer.custom_fields.find(
      field => field.label === 'card_last_4' || field.label === 'Card Last 4' || field.label === 'last_4_digits'
    );
    const cardBrandField = zohoCustomer.custom_fields.find(
      field => field.label === 'card_brand' || field.label === 'Card Brand'
    );
    
    if (cardLast4Field && cardLast4Field.value) {
      return {
        hasPaymentMethod: true,
        paymentMethodType: 'card',
        last_four_digits: cardLast4Field.value,
        cardBrand: cardBrandField?.value || 'Card'
      };
    }
  }
  
  return {
    hasPaymentMethod: false,
    paymentMethodType: null,
    last_four_digits: null,
    cardBrand: null
  };
};

const DEFAULT_CUSTOMERS = {
  'LOC001': 'MIA Dry Ice - WALK IN MIAMI',
  'LOC002': 'FLL Dry Ice - Walk in FT Lauderdale',
  'LOC003': 'WC Dry Ice - Walk in West Coast',
  'LOC004': 'ORL Dry Ice - Walk in Orlando'
};

const isDefaultCustomer = (contactName) => {
  return Object.values(DEFAULT_CUSTOMERS).some(defaultName => 
    contactName.toLowerCase().includes(defaultName.toLowerCase().substring(0, 15))
  );
};

/**
 * Refresh a single customer's payment/profile info from Zoho (cards, bank, pricebook, tax).
 * Used by getCustomerPriceList and by syncAll for bulk refresh.
 * @param {import('../models/Customer.js').Customer} customer
 * @returns {Promise<boolean>} true if updated, false if skipped or failed
 */
export const refreshCustomerProfileFromZoho = async (customer) => {
  if (!customer?.zohoId) return false;
  try {
    const zohoContact = await getZohoCustomerById(customer.zohoId).catch(() => null);
    if (!zohoContact) return false;
    const cards = await getCustomerCards(customer.zohoId, zohoContact);

    const pricebook_name = zohoContact?.pricebook_name ?? zohoContact?.price_list_name ?? (zohoContact?.custom_fields && Array.isArray(zohoContact.custom_fields)
      ? (zohoContact.custom_fields.find(f => (f.label || '').toLowerCase().includes('pricebook') || (f.label || '').toLowerCase().includes('price_list'))?.value)
      : undefined) ?? null;
    const tax_preference = zohoContact?.tax_preference ?? zohoContact?.tax_exemption_code ?? (zohoContact?.custom_fields && Array.isArray(zohoContact.custom_fields)
      ? (zohoContact.custom_fields.find(f => (f.label || '').toLowerCase().includes('tax'))?.value)
      : undefined) ?? null;

    const firstCard = cards.length > 0 ? cards[0] : null;
    const last_four_digits = firstCard?.last_four_digits ?? firstCard?.last4 ?? null;
    const card_type = firstCard?.card_type
      ? (String(firstCard.card_type).charAt(0).toUpperCase() + String(firstCard.card_type).slice(1).toLowerCase())
      : (firstCard?.brand ? (String(firstCard.brand).charAt(0).toUpperCase() + String(firstCard.brand).slice(1).toLowerCase()) : null);

    let bank_account_last4 = customer.bankAccountLast4 || null;
    if (zohoContact?.custom_fields && Array.isArray(zohoContact.custom_fields)) {
      const bankField = zohoContact.custom_fields.find(f => {
        const label = (f.label || '').toLowerCase();
        return label.includes('bank_account') || label.includes('bank_last') || label.includes('ach_last') || label.includes('bank_last4');
      });
      if (bankField?.value) {
        bank_account_last4 = String(bankField.value).replace(/\D/g, '').slice(-4) || bankField.value;
      }
    }
    if (!bank_account_last4 && zohoContact?.payment_methods && Array.isArray(zohoContact.payment_methods)) {
      const achMethod = zohoContact.payment_methods.find(pm => (pm.type || '').toLowerCase() === 'ach' || (pm.payment_type || '').toLowerCase() === 'ach');
      if (achMethod?.last_four_digits) bank_account_last4 = achMethod.last_four_digits;
      else if (achMethod?.last4) bank_account_last4 = achMethod.last4;
      else if (achMethod?.account_last4) bank_account_last4 = achMethod.account_last4;
    }

    await customer.update({
      pricebook_name,
      tax_preference,
      zohoCards: JSON.stringify(cards),
      zohoProfileSyncedAt: new Date(),
      last_four_digits: last_four_digits || customer.last_four_digits || null,
      cardBrand: card_type || customer.cardBrand || null,
      bankAccountLast4: bank_account_last4 || customer.bankAccountLast4 || null
    });
    return true;
  } catch (err) {
    logWarning(`Could not refresh profile for customer ${customer.id} (${customer.contactName}): ${err?.message}`);
    return false;
  }
};

/**
 * Refresh a single customer's payment info from Authorize.net (card, bank, profile IDs).
 * Uses email-only search, last matching profile - same logic as getCustomerPaymentProfiles.
 * @param {import('../models/Customer.js').Customer} customer
 * @returns {Promise<boolean>} true if updated, false if skipped or failed
 */
export const refreshCustomerPaymentFromAuthNet = async (customer) => {
  if (!customer?.email) return false;
  try {
    const allResult = await searchAllCustomerProfilesByEmail(customer.email);
    if (!allResult.success || !allResult.profiles || allResult.profiles.length === 0) return false;

    const lastProfile = allResult.profiles[allResult.profiles.length - 1];
    const paymentProfiles = extractPaymentProfiles(lastProfile.profile);

    if (paymentProfiles.length === 0) return false;

    // Use last card and last bank (same logic as getCustomerPaymentProfiles)
    const cards = paymentProfiles.filter(p => p.type === 'card');
    const banks = paymentProfiles.filter(p => p.type === 'ach');
    const lastCard = cards.length > 0 ? cards[cards.length - 1] : null;
    const lastBank = banks.length > 0 ? banks[banks.length - 1] : null;

    let last_four_digits = null;
    let cardBrand = null;
    let bankAccountLast4 = null;

    if (lastCard) {
      const cn = lastCard.cardNumber || '';
      last_four_digits = cn.replace(/\D/g, '').slice(-4) || null;
      cardBrand = 'Card';
    }
    if (lastBank) {
      const an = lastBank.accountNumber || '';
      bankAccountLast4 = an.replace(/\D/g, '').slice(-4) || null;
    }

    const customerProfileId = lastProfile.customerProfileId || null;
    // Prefer card's payment profile ID; otherwise use bank's
    const customerPaymentProfileId = (lastCard || lastBank)?.paymentProfileId || null;

    await customer.update({
      last_four_digits: last_four_digits || customer.last_four_digits || null,
      cardBrand: cardBrand || customer.cardBrand || null,
      bankAccountLast4: bankAccountLast4 || customer.bankAccountLast4 || null,
      customerProfileId: customerProfileId || customer.customerProfileId || null,
      customerPaymentProfileId: customerPaymentProfileId || customer.customerPaymentProfileId || null
    });
    return true;
  } catch (err) {
    logWarning(`Could not refresh Auth.net payment for customer ${customer.id} (${customer.contactName}): ${err?.message}`);
    return false;
  }
};

export const getCustomers = async (req, res) => {
  try {
    const { search, locationId, isActive } = req.query;
    const where = {};

    if (search) {
      where[Op.or] = [
        { contactName: { [Op.iLike]: `%${search}%` } },
        { companyName: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } }
      ];
    }

    if (locationId) {
      where.locationId = locationId;
    }

    if (isActive !== undefined) {
      where.isActive = isActive === 'true';
    }

    let customers = await Customer.findAll({
      where,
      order: [['contactName', 'ASC']]
    });

    // If no customers found and no search filter, try syncing from Zoho first
    if (customers.length === 0 && !search) {
      logInfo('No customers found in DB. Syncing from Zoho...');
      try {
        const zohoCustomers = await syncCustomersFromZoho();
        
        // Save customers to database
        for (const zohoCustomer of zohoCustomers) {
        const contactType = normalizeContactType(zohoCustomer.contact_type) || 'customer';
        if (contactType !== 'customer') {
            continue;
          }
          const location = extractLocation(zohoCustomer);
          const paymentMethod = extractPaymentMethod(zohoCustomer);
          
          await Customer.upsert({
            zohoId: zohoCustomer.contact_id,
            contactName: zohoCustomer.contact_name,
            companyName: zohoCustomer.company_name || null,
            email: zohoCustomer.email || null,
            phone: zohoCustomer.phone || null,
            contactType,
            locationId: location.locationId,
            locationName: location.locationName,
            isDefaultCustomer: isDefaultCustomer(zohoCustomer.contact_name),
            hasPaymentMethod: paymentMethod.hasPaymentMethod,
            paymentMethodType: paymentMethod.paymentMethodType,
            last_four_digits: paymentMethod.last_four_digits,
            cardBrand: paymentMethod.cardBrand,
            isActive: zohoCustomer.status === 'active',
            status: zohoCustomer.status || null,
            lastSyncedAt: new Date()
          });
        }
        
        // Fetch customers again after sync
        customers = await Customer.findAll({
          where,
          order: [['contactName', 'ASC']]
        });
      } catch (syncError) {
        logError('Failed to sync customers from Zoho', syncError);
        // Continue to return empty list even if sync fails
      }
    }

    const filteredCustomers = customers.filter(customer => normalizeContactType(customer.contactType) !== 'vendor');
    return sendSuccess(res, { customers: filteredCustomers });
  } catch (err) {
    logError('Get customers error', err);
    return sendError(res, 'Failed to fetch customers', 500, err);
  }
};

export const getCustomerById = async (req, res) => {
  try {
    const { id } = req.params;
    const customer = await Customer.findByPk(id);

    if (!customer) {
      return sendNotFound(res, 'Customer');
    }

    // Customer data is returned without console logging

    return sendSuccess(res, { customer });
  } catch (err) {
    logError('Get customer error', err);
    return sendError(res, 'Failed to fetch customer', 500, err);
  }
};

export const getCustomerByLocation = async (req, res) => {
  try {
    const { locationId } = req.params;
    
    const customers = await Customer.findAll({
      where: { locationId, isActive: true },
      order: [['contactName', 'ASC']]
    });

    return sendSuccess(res, { customers });
  } catch (err) {
    logError('Get customers by location error', err);
    return sendError(res, 'Failed to fetch customers', 500, err);
  }
};

export const getCustomerPriceList = async (req, res) => {
  try {
    const { id } = req.params;
    const customer = await Customer.findByPk(id);

    if (!customer) {
      return sendNotFound(res, 'Customer');
    }

    // Defer Auth.net bank lookup to background - it was blocking 25+ seconds and is not needed for price list.
    // Bank info is updated during sync and when opening payment profiles.
    if (customer.email) {
      const cust = customer;
      searchAllCustomerProfilesByEmail(cust.email)
        .then((allResult) => {
          if (allResult.success && allResult.profiles && allResult.profiles.length > 0) {
            const lastProfile = allResult.profiles[allResult.profiles.length - 1];
            const bankAccountInfo = extractBankAccountInfo(lastProfile.profile);
            if (bankAccountInfo.hasBankAccount && bankAccountInfo.bankAccountLast4) {
              return cust.update({ bankAccountLast4: bankAccountInfo.bankAccountLast4 });
            }
          }
        })
        .catch(() => {});
    }

    // If customer has no Zoho ID, return with existing last_four_digits
    if (!customer.zohoId) {
      return sendSuccess(res, {
        pricebook_name: null,
        tax_preference: null,
        cards: [],
        last_four_digits: customer.last_four_digits || null,
        card_type: customer.cardBrand || null,
        has_card_info: customer.last_four_digits ? true : false,
        card_info_checked: false,
        bank_account_last4: customer.bankAccountLast4 || null
      });
    }

    const PRICE_LIST_CACHE_MS = 5 * 60 * 1000;
    const useCached = customer.zohoProfileSyncedAt &&
      (Date.now() - new Date(customer.zohoProfileSyncedAt).getTime()) < PRICE_LIST_CACHE_MS;

    let zohoContact = null;
    let cards = [];
    if (useCached && customer.zohoCards) {
      try {
        cards = JSON.parse(customer.zohoCards) || [];
      } catch (_) {
        cards = [];
      }
    }
    if (!useCached) {
      zohoContact = await getZohoCustomerById(customer.zohoId).catch((err) => {
        logError('Get customer price list: failed to fetch Zoho customer', err);
        return null;
      });
      if (!zohoContact) {
        return sendError(res, 'Failed to fetch customer profile from Zoho', 502);
      }
      cards = await getCustomerCards(customer.zohoId, zohoContact);
    }

    let pricebook_name;
    let tax_preference;
    let last_four_digits;
    let card_type;
    if (useCached) {
      pricebook_name = customer.pricebook_name ?? null;
      tax_preference = customer.tax_preference ?? null;
      last_four_digits = customer.last_four_digits ?? null;
      card_type = customer.cardBrand ?? null;
    } else {
      pricebook_name = zohoContact?.pricebook_name ?? zohoContact?.price_list_name ?? (zohoContact?.custom_fields && Array.isArray(zohoContact.custom_fields)
        ? (zohoContact.custom_fields.find(f => (f.label || '').toLowerCase().includes('pricebook') || (f.label || '').toLowerCase().includes('price_list'))?.value)
        : undefined) ?? null;
      tax_preference = zohoContact?.tax_preference ?? zohoContact?.tax_exemption_code ?? (zohoContact?.custom_fields && Array.isArray(zohoContact.custom_fields)
        ? (zohoContact.custom_fields.find(f => (f.label || '').toLowerCase().includes('tax'))?.value)
        : undefined) ?? null;
      const firstCard = cards.length > 0 ? cards[0] : null;
      last_four_digits = firstCard?.last_four_digits ?? firstCard?.last4 ?? customer.last_four_digits ?? null;
      card_type = firstCard?.card_type
        ? (String(firstCard.card_type).charAt(0).toUpperCase() + String(firstCard.card_type).slice(1).toLowerCase())
        : (firstCard?.brand ? (String(firstCard.brand).charAt(0).toUpperCase() + String(firstCard.brand).slice(1).toLowerCase()) : (customer.cardBrand || null));
    }

    // Best-effort DB update for observability/history (only when we fetched from Zoho)
    if (!useCached) {
      try {
        await customer.update({
          pricebook_name: pricebook_name || customer.pricebook_name || null,
          tax_preference: tax_preference || customer.tax_preference || null,
          zohoCards: JSON.stringify(cards),
          zohoProfileSyncedAt: new Date(),
          last_four_digits: last_four_digits || customer.last_four_digits || null,
          cardBrand: card_type || customer.cardBrand || null
        });
      } catch (persistErr) {
        logWarning('Get customer price list: could not persist Zoho profile snapshot');
      }
    }

    return sendSuccess(res, {
      pricebook_name: pricebook_name || null,
      tax_preference: tax_preference || null,
      cards,
      last_four_digits: last_four_digits || null,
      card_type: card_type || null,
      has_card_info: !!last_four_digits || cards.length > 0,
      card_info_checked: true,
      bank_account_last4: customer.bankAccountLast4 || null
    });
  } catch (err) {
    logError('Get customer price list error', err);
    return sendError(res, 'Failed to fetch customer price list', 500, err);
  }
};

/**
 * Run a handler with a mock response that captures the result.
 * Used to combine getCustomerPriceList and getCustomerPaymentProfiles in one request.
 */
const runHandlerCapture = async (handler, req) => {
  const captured = { statusCode: null, body: null };
  const mockRes = {
    status: (code) => { captured.statusCode = code; return mockRes; },
    json: (body) => { captured.body = body; return mockRes; }
  };
  try {
    await handler(req, mockRes);
  } catch (err) {
    logError('Checkout handler error', { handler: handler.name, error: err });
    captured.statusCode = 500;
    captured.body = { success: false, message: err?.message || 'Handler failed' };
  }
  return captured;
};

/**
 * Get checkout data (price list + payment profiles) in a single request.
 * GET /customers/:id/checkout-data
 */
export const getCustomerCheckoutData = async (req, res) => {
  try {
    const { id } = req.params;
    const handlerReq = { params: { id } };

    const [priceListResult, paymentProfilesResult] = await Promise.all([
      runHandlerCapture(getCustomerPriceList, handlerReq),
      runHandlerCapture(getCustomerPaymentProfiles, handlerReq)
    ]);

    if (priceListResult.statusCode === 404 || paymentProfilesResult.statusCode === 404) {
      return sendNotFound(res, 'Customer');
    }

    if (priceListResult.statusCode !== 200 || paymentProfilesResult.statusCode !== 200) {
      const failed = priceListResult.statusCode !== 200 ? priceListResult : paymentProfilesResult;
      const errMsg = failed.body?.message || failed.body?.error || 'Failed to fetch checkout data';
      const statusCode = failed.statusCode >= 400 ? failed.statusCode : 500;
      return sendError(res, errMsg, statusCode);
    }

    const priceListData = priceListResult.body?.data ?? priceListResult.body;
    const paymentProfilesData = paymentProfilesResult.body?.data ?? paymentProfilesResult.body;

    return sendSuccess(res, {
      priceList: priceListData,
      paymentProfiles: paymentProfilesData
    });
  } catch (err) {
    logError('Get customer checkout data error', err);
    return sendError(res, 'Failed to fetch checkout data', 500, err);
  }
};

/**
 * Get customer payment profiles from Authorize.net CIM
 * Also fetches Zoho payment info (cards, bank last4) for display when Auth.net has no profiles.
 * GET /customers/:id/payment-profiles
 */
export const getCustomerPaymentProfiles = async (req, res) => {
  try {
    const { id } = req.params;
    const customerId = Number(id);
    const customer = await Customer.findByPk(id);

    if (!customer) {
      return sendNotFound(res, 'Customer');
    }

    // Return cached result when fresh (speeds up repeat loads)
    const cached = paymentProfilesCache.get(customerId);
    if (
      cached &&
      cached.version === PAYMENT_PROFILES_CACHE_VERSION &&
      (Date.now() - cached.timestamp) < PAYMENT_PROFILES_CACHE_MS
    ) {
      return sendSuccess(res, cached.data);
    }

    // Load Zoho card last4 first so Authorize.Net fallback can search CIM by last4 when stored profileId misses.
    let zohoCards = [];
    let zohoLastFour = null;
    let zohoCardType = null;
    /** Last4 of bank / ACH on file in Zoho (custom field, contact payment_methods, or GET /bankaccounts). */
    const zohoBankLast4Set = new Set();
    let zohoBankLast4 = null;

    const loadZohoData = async () => {
      const normBank = (v) => (v && String(v).replace(/\D/g, '').slice(-4)) || '';
      /** Same bank last4 the Shopping Cart uses (price list → customer.bankAccountLast4). */
      const mergeCartAlignedBankLast4 = () => {
        if (customer.bankAccountLast4) {
          const n = normBank(customer.bankAccountLast4);
          if (n) zohoBankLast4Set.add(n);
        }
      };
      if (!customer.zohoId) {
        mergeCartAlignedBankLast4();
        zohoBankLast4 = zohoBankLast4Set.size > 0 ? [...zohoBankLast4Set].sort()[0] : null;
        return;
      }
      try {
        const zohoContact = await getZohoCustomerById(customer.zohoId).catch(() => null);
        zohoCards = zohoContact ? await getCustomerCards(customer.zohoId, zohoContact) : [];
        const firstCard = zohoCards.length > 0 ? zohoCards[0] : null;
        zohoLastFour = firstCard?.last_four_digits ?? firstCard?.last4 ?? null;
        zohoCardType = firstCard?.card_type
          ? (String(firstCard.card_type).charAt(0).toUpperCase() + String(firstCard.card_type).slice(1).toLowerCase())
          : (firstCard?.brand ? (String(firstCard.brand).charAt(0).toUpperCase() + String(firstCard.brand).slice(1).toLowerCase()) : null);
        if (zohoContact?.custom_fields && Array.isArray(zohoContact.custom_fields)) {
          const bankField = zohoContact.custom_fields.find(f => {
            const label = (f.label || '').toLowerCase();
            return label.includes('bank_account') || label.includes('bank_last') || label.includes('ach_last') || label.includes('bank_last4');
          });
          if (bankField?.value) {
            const n = normBank(bankField.value);
            if (n) zohoBankLast4Set.add(n);
          }
        }
        if (zohoContact?.payment_methods && Array.isArray(zohoContact.payment_methods)) {
          const achMethod = zohoContact.payment_methods.find(pm => (pm.type || '').toLowerCase() === 'ach' || (pm.payment_type || '').toLowerCase() === 'ach');
          const achL4 = achMethod?.last_four_digits || achMethod?.last4 || achMethod?.account_last4;
          if (achL4) {
            const n = normBank(achL4);
            if (n) zohoBankLast4Set.add(n);
          }
        }
        const booksBanks = await fetchZohoBooksBankaccountsForCustomer(customer.zohoId);
        for (const a of booksBanks.accounts || []) {
          if (a.last4) {
            const n = normBank(a.last4);
            if (n) zohoBankLast4Set.add(n);
          }
        }
      } catch (_) {
        /* live Zoho / Books may fail; cart-aligned bank still merged in finally */
      } finally {
        mergeCartAlignedBankLast4();
        zohoBankLast4 = zohoBankLast4Set.size > 0 ? [...zohoBankLast4Set].sort()[0] : null;
      }
    };

    // Collect payment profiles from Authorize.net (last4 → Zoho merchant id → email fallback)
    let allPaymentProfiles = [];
    let firstCustomerProfileId = null;

    const loadAuthNetData = async () => {
      const mergeCimProfilesIntoAll = async (cimProfiles, persistSingleCustomerProfileId = false) => {
        if (!cimProfiles || cimProfiles.length === 0) return;
        const seenPaymentIds = new Set(allPaymentProfiles.map((p) => p.paymentProfileId));
        for (const { profile: p, customerProfileId: cpid } of cimProfiles) {
          const profileName = (Array.isArray(p.description) ? p.description[0] : p.description) || null;
          const extracted = extractPaymentProfiles(p);
          if (!firstCustomerProfileId && cpid) firstCustomerProfileId = cpid;
          for (const pp of extracted) {
            if (!seenPaymentIds.has(pp.paymentProfileId)) {
              seenPaymentIds.add(pp.paymentProfileId);
              allPaymentProfiles.push({
                ...pp,
                customerProfileId: cpid,
                profileName: profileName || undefined
              });
            }
          }
        }
        if (persistSingleCustomerProfileId && firstCustomerProfileId && cimProfiles.length === 1) {
          try {
            await customer.update({ customerProfileId: firstCustomerProfileId.toString() });
          } catch (_) {
            /* non-fatal */
          }
        }
      };

      /** CIM scan using live Zoho card last4. */
      const trySearchByCardLast4FromZoho = async () => {
        const normalizeL4 = (v) => (v && String(v).replace(/\D/g, '').slice(-4)) || '';
        const candidates = [];
        if (zohoLastFour) candidates.push(zohoLastFour);
        (zohoCards || []).forEach((c) => {
          const n = c.last_four_digits || c.last4;
          if (n) candidates.push(n);
        });
        zohoBankLast4Set.forEach((n) => candidates.push(n));
        const uniq = [...new Set(candidates.map((x) => normalizeL4(x)).filter(Boolean))];
        if (uniq.length === 0) return;

        const allResult = await searchCustomerProfilesByCardLast4(uniq);
        if (!allResult.success || !allResult.profiles || allResult.profiles.length === 0) return;
        await mergeCimProfilesIntoAll(allResult.profiles, allResult.profiles.length === 1);
      };

      const trySearchByEmail = async () => {
        if (!customer.email) return;
        const allResult = await searchAllCustomerProfilesByEmail(customer.email);
        if (!allResult.success || !allResult.profiles || allResult.profiles.length === 0) return;
        await mergeCimProfilesIntoAll(allResult.profiles, allResult.profiles.length === 1);
      };

      const tryLoadByZohoMerchantId = async () => {
        const zohoId = customer.zohoId ? String(customer.zohoId).trim() : '';
        if (!zohoId || allPaymentProfiles.length > 0) return;
        const resolved = await resolveExistingCustomerProfileId({
          merchantCustomerId: zohoId,
          email: customer.email || ''
        });
        if (!resolved.success || !resolved.customerProfileId) return;
        const profileResult = await getCustomerProfile(resolved.customerProfileId);
        if (!profileResult.success || !profileResult.profile) return;
        const p = profileResult.profile;
        const profileMerchantId =
          (Array.isArray(p.merchantCustomerId) ? p.merchantCustomerId[0] : p.merchantCustomerId) || '';
        if (profileMerchantId && String(profileMerchantId).trim() !== zohoId) return;
        const profileName = (Array.isArray(p.description) ? p.description[0] : p.description) || null;
        const extracted = extractPaymentProfiles(p);
        if (extracted.length === 0) return;
        firstCustomerProfileId = resolved.customerProfileId;
        allPaymentProfiles = extracted.map((pp) => ({
          ...pp,
          customerProfileId: resolved.customerProfileId,
          profileName: profileName || undefined
        }));
        try {
          await customer.update({ customerProfileId: resolved.customerProfileId.toString() });
        } catch (_) {
          /* non-fatal */
        }
      };

      await trySearchByCardLast4FromZoho();
      // When Zoho has no card last4, email search merges every CIM profile for that email (often unrelated
      // wallets). Prefer the Authorize.Net customer profile whose merchantCustomerId matches Zoho contact id.
      if (allPaymentProfiles.length === 0 && customer.zohoId) {
        await tryLoadByZohoMerchantId();
      }
      if (allPaymentProfiles.length === 0 && customer.email) {
        await trySearchByEmail();
      }
    };

    await loadZohoData();
    await loadAuthNetData();

    // Return ALL cards and ALL banks from Auth.net, deduped by last4 to avoid showing same card twice
    // (can happen when same card exists in multiple Auth.net profiles for same email).
    const cards = allPaymentProfiles.filter(p => p.type === 'card');
    const banks = allPaymentProfiles.filter(p => p.type === 'ach');
    const normalizeLast4 = (v) => (v && String(v).replace(/\D/g, '').slice(-4)) || '';
    const storedPaymentProfileId = null;
    const dedupeByLast4 = (items, getLast4) => {
      const byLast4 = new Map();
      for (const item of items) {
        const last4 = normalizeLast4(getLast4(item));
        if (!last4) continue;
        const existing = byLast4.get(last4);
        const isStored = item.paymentProfileId === storedPaymentProfileId;
        if (!existing || (isStored && existing.paymentProfileId !== storedPaymentProfileId)) {
          byLast4.set(last4, item);
        }
      }
      return [...byLast4.values()];
    };
    const uniqueCards = dedupeByLast4(cards, c => c.last4 || c.cardNumber);
    const uniqueBanks = dedupeByLast4(banks, b => b.last4 || b.accountNumber);
    const zohoCardLast4Set = new Set();
    (zohoCards || []).forEach(c => {
      const n = normalizeLast4(c.last_four_digits || c.last4);
      if (n) zohoCardLast4Set.add(n);
    });
    if (zohoLastFour) zohoCardLast4Set.add(normalizeLast4(zohoLastFour));
    // Only show Authorize.Net methods that match Zoho (same last4). No Zoho card/bank on file → show none.
    const matchedCards = zohoCardLast4Set.size > 0
      ? uniqueCards.filter(c => zohoCardLast4Set.has(normalizeLast4(c.last4 || c.cardNumber)))
      : [];
    const matchedBanks = zohoBankLast4Set.size > 0
      ? uniqueBanks.filter(b => zohoBankLast4Set.has(normalizeLast4(b.last4 || b.accountNumber)))
      : [];
    const sortedCards = [...matchedCards].sort((a, b) => {
      const a4 = normalizeLast4(a.last4 || a.cardNumber);
      const b4 = normalizeLast4(b.last4 || b.cardNumber);
      const aMatch = zohoCardLast4Set.has(a4) ? 1 : 0;
      const bMatch = zohoCardLast4Set.has(b4) ? 1 : 0;
      return bMatch - aMatch;
    });
    const sortedBanks = [...matchedBanks].sort((a, b) => {
      const a4 = normalizeLast4(a.last4 || a.accountNumber);
      const b4 = normalizeLast4(b.last4 || b.accountNumber);
      const aMatch = zohoBankLast4Set.has(a4) ? 1 : 0;
      const bMatch = zohoBankLast4Set.has(b4) ? 1 : 0;
      return bMatch - aMatch;
    });
    allPaymentProfiles = [...sortedCards, ...sortedBanks];

    const zohoBankLast4List = [...zohoBankLast4Set].sort().join(',') || 'none';
    const authNetAchMatched = allPaymentProfiles
      .filter((p) => p.type === 'ach')
      .map((p) => normalizeLast4(p.last4 || p.accountNumber))
      .filter(Boolean)
      .join(',') || 'none';
    logInfo(
      `[Customer bank] posId=${customerId} zohoId=${customer.zohoId ?? 'n/a'} ` +
        `name="${(customer.contactName || '').replace(/"/g, "'")}" ` +
        `zohoBankLast4s=[${zohoBankLast4List}] authNetAchMatchedLast4s=[${authNetAchMatched}]`
    );

    // Do not infer stored profile defaults from local DB snapshot.
    const storedCustomerProfileId = null;

    // Mark default/stored profile
    const profilesWithDefault = allPaymentProfiles.map(p => ({
      ...p,
      customerProfileId: p.customerProfileId || firstCustomerProfileId,
      isStored: p.paymentProfileId === storedPaymentProfileId &&
        (p.customerProfileId === storedCustomerProfileId || (!p.customerProfileId && !storedCustomerProfileId))
    }));

    const responseData = {
      customerProfileId: firstCustomerProfileId?.toString() || null,
      paymentProfiles: profilesWithDefault,
      zohoCards,
      last_four_digits: zohoLastFour,
      card_type: zohoCardType,
      bank_account_last4: zohoBankLast4,
      message: allPaymentProfiles.length === 0
        ? (zohoCardLast4Set.size > 0 || zohoBankLast4Set.size > 0
          ? 'No Authorize.net payment method matches the card or bank on file in Zoho.'
          : 'No payment method on file in Zoho to match with Authorize.net.')
        : null
    };
    paymentProfilesCache.set(customerId, {
      data: responseData,
      timestamp: Date.now(),
      version: PAYMENT_PROFILES_CACHE_VERSION
    });
    return sendSuccess(res, responseData);
  } catch (err) {
    logError('Get customer payment profiles error', err);
    return sendError(res, 'Failed to fetch customer payment profiles', 500, err);
  }
};

// --- Auto Invoice Customer List ---

export const getAutoInvoiceCustomers = async (req, res) => {
  try {
    const records = await AutoInvoiceCustomer.findAll({
      include: [{ model: Customer, as: 'customer', attributes: ['id', 'contactName', 'companyName', 'email', 'phone', 'zohoId'] }],
      order: [['createdAt', 'DESC']]
    });
    const list = records
      .filter(r => r.customer)
      .map(r => ({
        id: r.id,
        customerId: r.customerId,
        frequency: r.frequency,
        customer: {
          id: r.customer.id,
          name: r.customer.contactName,
          contactName: r.customer.contactName,
          company: r.customer.companyName,
          companyName: r.customer.companyName,
          email: r.customer.email,
          phone: r.customer.phone,
          zohoId: r.customer.zohoId
        }
      }));
    return sendSuccess(res, { autoInvoiceCustomers: list });
  } catch (err) {
    logError('Get auto invoice customers error', err);
    return sendError(res, 'Failed to fetch auto invoice customer list', 500, err);
  }
};

export const addAutoInvoiceCustomer = async (req, res) => {
  try {
    const { customerId, frequency } = req.body;
    if (!customerId) {
      return sendValidationError(res, 'customerId is required');
    }
    const freq = (frequency === 'monthly' ? 'monthly' : 'weekly');
    const customer = await Customer.findByPk(customerId);
    if (!customer) {
      return sendNotFound(res, 'Customer');
    }
    const [record, created] = await AutoInvoiceCustomer.findOrCreate({
      where: { customerId: Number(customerId) },
      defaults: { frequency: freq }
    });
    if (!created) {
      await record.update({ frequency: freq });
    }
    const withCustomer = await AutoInvoiceCustomer.findByPk(record.id, {
      include: [{ model: Customer, as: 'customer', attributes: ['id', 'contactName', 'companyName', 'email', 'phone', 'zohoId'] }]
    });
    const c = withCustomer?.customer;
    return sendSuccess(res, {
      autoInvoiceCustomer: {
        id: record.id,
        customerId: record.customerId,
        frequency: record.frequency,
        customer: c ? { id: c.id, name: c.contactName, contactName: c.contactName, company: c.companyName, companyName: c.companyName, email: c.email, phone: c.phone, zohoId: c.zohoId } : null
      }
    }, created ? 'Customer added to auto invoice list' : 'Customer updated in auto invoice list');
  } catch (err) {
    logError('Add auto invoice customer error', err);
    return sendError(res, 'Failed to add customer to auto invoice list', 500, err);
  }
};

export const removeAutoInvoiceCustomer = async (req, res) => {
  try {
    const { customerId } = req.params;
    const deleted = await AutoInvoiceCustomer.destroy({ where: { customerId: Number(customerId) } });
    if (deleted === 0) {
      return sendNotFound(res, 'Auto invoice customer');
    }
    return sendSuccess(res, { removed: true }, 'Customer removed from auto invoice list');
  } catch (err) {
    logError('Remove auto invoice customer error', err);
    return sendError(res, 'Failed to remove customer from auto invoice list', 500, err);
  }
};

export const createZohoCardLink = async (req, res) => {
  try {
    const { id } = req.params;
    const customer = await Customer.findByPk(id);
    if (!customer) {
      return sendNotFound(res, 'Customer');
    }
    if (!customer.zohoId) {
      return sendError(res, 'Customer is not linked to Zoho (missing Zoho ID)', 400);
    }

    const redirectUrl = process.env.FRONTEND_URL || null;
    const hosted = await createZohoHostedCardUpdateLink({
      customerId: customer.zohoId,
      redirectUrl,
      cancelUrl: redirectUrl,
      referenceId: `customer_${customer.id}`
    });

    if (!hosted.success || !hosted.hostedPageUrl) {
      const booksBase = process.env.ZOHO_BOOKS_APP_BASE_URL || 'https://books.zoho.com/app';
      const manualLinkUrl = `${booksBase}#/contacts/${encodeURIComponent(String(customer.zohoId))}`;
      return sendSuccess(res, {
        hostedPageUrl: null,
        hostedPageId: null,
        endpoint: hosted.endpoint || null,
        manualLinkUrl,
        fallback: true,
        reason: hosted.error || 'Zoho hosted update-card endpoint is not available for this account'
      }, 'Zoho hosted link unavailable. Opening customer page for manual card update instead.');
    }

    return sendSuccess(res, {
      hostedPageUrl: hosted.hostedPageUrl,
      hostedPageId: hosted.hostedPageId || null,
      endpoint: hosted.endpoint || null
    });
  } catch (err) {
    logError('Create Zoho card link error', err);
    return sendError(res, 'Failed to create Zoho card link', 500, err);
  }
};
