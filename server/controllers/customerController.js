import { Customer } from '../models/index.js';
import { Op } from 'sequelize';
import { syncCustomersFromZoho, getCustomerById as getZohoCustomerById, getCustomerCards } from '../services/zohoService.js';
import { getCustomerProfile, getCustomerProfileDetails, extractPaymentProfiles, extractBankAccountInfo, searchAllCustomerProfilesByEmail } from '../services/authorizeNetService.js';
import { sendSuccess, sendError, sendNotFound } from '../utils/responseHelper.js';
import { logSuccess, logWarning, logError, logInfo } from '../utils/logger.js';

// Server-side payment profiles cache (5 min TTL) - speeds up repeat loads
const PAYMENT_PROFILES_CACHE_MS = 5 * 60 * 1000;
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
    if (cached && (Date.now() - cached.timestamp) < PAYMENT_PROFILES_CACHE_MS) {
      return sendSuccess(res, cached.data);
    }

    // Zoho + Auth.net: run in parallel for speed
    let zohoCards = [];
    let zohoLastFour = null;
    let zohoCardType = null;
    let zohoBankLast4 = customer.bankAccountLast4 || null;
    const useZohoCache = customer.zohoId && customer.zohoProfileSyncedAt &&
      (Date.now() - new Date(customer.zohoProfileSyncedAt).getTime()) < PAYMENT_PROFILES_CACHE_MS;
    const hasDbZoho = customer.last_four_digits || customer.zohoCards;

    const loadZohoData = async () => {
      if (!customer.zohoId) return;
      try {
        // Use DB cache when: (a) zohoProfileSyncedAt recent, or (b) we have last_four_digits/zohoCards (avoids Zoho API)
        if ((useZohoCache || hasDbZoho) && (customer.zohoCards || customer.last_four_digits)) {
          try {
            zohoCards = customer.zohoCards ? JSON.parse(customer.zohoCards) : [];
          } catch (_) {
            zohoCards = [];
          }
          zohoLastFour = customer.last_four_digits ?? (zohoCards[0]?.last_four_digits ?? zohoCards[0]?.last4) ?? null;
          zohoCardType = customer.cardBrand ?? (zohoCards[0]?.card_type ?? zohoCards[0]?.brand) ?? null;
          zohoBankLast4 = customer.bankAccountLast4 ?? zohoBankLast4;
          return;
        }
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
            zohoBankLast4 = String(bankField.value).replace(/\D/g, '').slice(-4) || bankField.value;
          }
        }
        if (!zohoBankLast4 && zohoContact?.payment_methods && Array.isArray(zohoContact.payment_methods)) {
          const achMethod = zohoContact.payment_methods.find(pm => (pm.type || '').toLowerCase() === 'ach' || (pm.payment_type || '').toLowerCase() === 'ach');
          zohoBankLast4 = achMethod?.last_four_digits || achMethod?.last4 || achMethod?.account_last4 || zohoBankLast4;
        }
      } catch (_) {
        if (hasDbZoho) {
          zohoLastFour = customer.last_four_digits ?? zohoLastFour;
          zohoCardType = customer.cardBrand ?? zohoCardType;
          zohoBankLast4 = customer.bankAccountLast4 ?? zohoBankLast4;
        }
      }
    };

    // Collect payment profiles from Authorize.net - can have multiple profiles per email
    // FAST: try stored profile first (1 API call) instead of searchAll (N+1 calls over all profiles)
    let allPaymentProfiles = [];
    let firstCustomerProfileId = null;

    const loadAuthNetData = async () => {
      const tryStoredProfile = async () => {
        if (!customer.customerProfileId) return false;
        const profileResult = await getCustomerProfile(customer.customerProfileId);
        if (!profileResult.success || !profileResult.profile) return false;
        const p = profileResult.profile;
        const profileMerchantId = (Array.isArray(p.merchantCustomerId) ? p.merchantCustomerId[0] : p.merchantCustomerId) || '';
        const zohoId = customer.zohoId ? String(customer.zohoId).trim() : '';
        if (zohoId && profileMerchantId && String(profileMerchantId).trim() !== zohoId) {
          await customer.update({ customerProfileId: null, customerPaymentProfileId: null });
          return false;
        }
        const profileName = (Array.isArray(p.description) ? p.description[0] : p.description) || null;
        const extracted = extractPaymentProfiles(p);
        firstCustomerProfileId = customer.customerProfileId;
        allPaymentProfiles = extracted.map(pp => ({
          ...pp,
          customerProfileId: customer.customerProfileId,
          profileName: profileName || undefined
        }));
        return true;
      };

      const trySearchByEmail = async (mergeIntoExisting = false) => {
        if (!customer.email) return;
        const allResult = await searchAllCustomerProfilesByEmail(customer.email);
        if (!allResult.success || !allResult.profiles || allResult.profiles.length === 0) return;
        const seenPaymentIds = mergeIntoExisting ? new Set(allPaymentProfiles.map(p => p.paymentProfileId)) : new Set();
        for (const { profile: p, customerProfileId: cpid } of allResult.profiles) {
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
        if (firstCustomerProfileId && allResult.profiles.length === 1) {
          await customer.update({ customerProfileId: firstCustomerProfileId.toString() });
        }
      };

      const fromStored = await tryStoredProfile();
      if (fromStored) {
        // Skip searchByEmail when stored profile works - saves N+1 Auth.net API calls
        // (Customer typically has one profile; full merge can be slow with many CIM profiles)
      } else {
        await trySearchByEmail(false);
      }
    };

    // Run Zoho and Auth.net in parallel (biggest speed gain)
    await Promise.all([loadZohoData(), loadAuthNetData()]);

    // Return ALL cards and ALL banks from Auth.net, deduped by last4 to avoid showing same card twice
    // (can happen when same card exists in multiple Auth.net profiles for same email).
    const cards = allPaymentProfiles.filter(p => p.type === 'card');
    const banks = allPaymentProfiles.filter(p => p.type === 'ach');
    const normalizeLast4 = (v) => (v && String(v).replace(/\D/g, '').slice(-4)) || '';
    const storedPaymentProfileId = customer.customerPaymentProfileId;
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
    const zohoBankLast4Norm = normalizeLast4(zohoBankLast4);
    // Show only Auth.net profiles that match Zoho (by last4). When Zoho has no data, show all.
    const matchedCards = zohoCardLast4Set.size > 0
      ? uniqueCards.filter(c => zohoCardLast4Set.has(normalizeLast4(c.last4 || c.cardNumber)))
      : uniqueCards;
    const matchedBanks = zohoBankLast4Norm
      ? uniqueBanks.filter(b => normalizeLast4(b.last4 || b.accountNumber) === zohoBankLast4Norm)
      : uniqueBanks;
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
      const aMatch = a4 === zohoBankLast4Norm ? 1 : 0;
      const bMatch = b4 === zohoBankLast4Norm ? 1 : 0;
      return bMatch - aMatch;
    });
    allPaymentProfiles = [...sortedCards, ...sortedBanks];

    // Get the stored payment profile ID if available
    const storedCustomerProfileId = customer.customerProfileId;

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
      message: allPaymentProfiles.length === 0 ? 'Customer does not have a payment profile in Authorize.net' : null
    };
    paymentProfilesCache.set(customerId, { data: responseData, timestamp: Date.now() });
    return sendSuccess(res, responseData);
  } catch (err) {
    logError('Get customer payment profiles error', err);
    return sendError(res, 'Failed to fetch customer payment profiles', 500, err);
  }
};
