import { Customer } from '../models/index.js';
import { Op } from 'sequelize';
import { syncCustomersFromZoho, getCustomerById as getZohoCustomerById, getCustomerCards } from '../services/zohoService.js';
import { getCustomerProfileDetails, extractPaymentProfiles } from '../services/authorizeNetService.js';
import { sendSuccess, sendError, sendNotFound } from '../utils/responseHelper.js';
import { logSuccess, logWarning, logError, logInfo } from '../utils/logger.js';

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
    const [zohoContactResult, zohoCardsResult] = await Promise.allSettled([
      getZohoCustomerById(customer.zohoId),
      getCustomerCards(customer.zohoId)
    ]);
    const zohoContact = zohoContactResult.status === 'fulfilled' ? zohoContactResult.value : null;
    const cards = zohoCardsResult.status === 'fulfilled' && Array.isArray(zohoCardsResult.value)
      ? zohoCardsResult.value
      : [];
    if (!zohoContact) return false;

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

    // Fetch and log Authorize.Net customer profile details
    try {
      const searchCriteria = {
        name: customer.contactName || null,
        email: customer.email || null,
        merchantCustomerId: customer.zohoId || null
      };

      // Only search if we have at least name or email
      if (searchCriteria.name || searchCriteria.email) {
        const authorizeNetProfile = await getCustomerProfileDetails(searchCriteria);
        
        if (authorizeNetProfile.success && authorizeNetProfile.profile) {
          // Extract and save bank account information
          const { extractBankAccountInfo } = await import('../services/authorizeNetService.js');
          const bankAccountInfo = extractBankAccountInfo(authorizeNetProfile.profile);
          
          if (bankAccountInfo.hasBankAccount && bankAccountInfo.bankAccountLast4) {
            try {
              await customer.update({
                bankAccountLast4: bankAccountInfo.bankAccountLast4
              });
              console.log(`💳 Bank Account: XXXX${bankAccountInfo.bankAccountLast4}`);
            } catch (updateError) {
              // Silently fail - don't log errors
            }
          }
        }
      }
    } catch (authNetError) {
      // Don't fail the request if Authorize.Net lookup fails - silently continue
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

    // Always fetch Zoho profile details live (do not use DB cache for Zoho data)
    const [zohoContactResult, zohoCardsResult] = await Promise.allSettled([
      getZohoCustomerById(customer.zohoId),
      getCustomerCards(customer.zohoId)
    ]);

    if (zohoContactResult.status !== 'fulfilled' || !zohoContactResult.value) {
      const err = zohoContactResult.status === 'rejected' ? zohoContactResult.reason : null;
      logError('Get customer price list: failed to fetch Zoho customer', err);
      return sendError(res, 'Failed to fetch customer profile from Zoho', 502, err);
    }

    const zohoContact = zohoContactResult.value;
    const cards = zohoCardsResult.status === 'fulfilled' && Array.isArray(zohoCardsResult.value)
      ? zohoCardsResult.value
      : [];

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
      : null;

    // Best-effort DB update for observability/history; response always uses live Zoho values above.
    try {
      await customer.update({
        pricebook_name,
        tax_preference,
        zohoCards: JSON.stringify(cards),
        zohoProfileSyncedAt: new Date(),
        last_four_digits: last_four_digits || customer.last_four_digits || null,
        cardBrand: card_type || customer.cardBrand || null
      });
    } catch (persistErr) {
      logWarning('Get customer price list: could not persist Zoho profile snapshot');
    }

    // #region agent log
    fetch('http://127.0.0.1:1024/ingest/d43f1d4c-4d33-4f77-a4e3-9e9d56debc45',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'customerController:getPriceList',message:'from Zoho live',data:{customerId:id,pricebook_name},timestamp:Date.now(),hypothesisId:'H2'})}).catch(()=>{});
    // #endregion

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
 * Get customer payment profiles from Authorize.net CIM
 * GET /customers/:id/payment-profiles
 */
export const getCustomerPaymentProfiles = async (req, res) => {
  try {
    const { id } = req.params;
    const customer = await Customer.findByPk(id);

    if (!customer) {
      return sendNotFound(res, 'Customer');
    }

    // Try to get customer profile from Authorize.net
    let customerProfileId = customer.customerProfileId;
    let profile = null;

    // If we have stored profile ID, use it directly
    if (customerProfileId) {
      const { getCustomerProfile } = await import('../services/authorizeNetService.js');
      const profileResult = await getCustomerProfile(customerProfileId);
      if (profileResult.success) {
        profile = profileResult.profile;
      }
    }

    // If not found or not stored, search for it
    if (!profile) {
      const searchCriteria = {
        name: customer.contactName || null,
        email: customer.email || null,
        merchantCustomerId: customer.zohoId || null
      };

      if (searchCriteria.name || searchCriteria.email) {
        const profileResult = await getCustomerProfileDetails(searchCriteria);
        
        if (profileResult.success && profileResult.profile) {
          profile = profileResult.profile;
          customerProfileId = Array.isArray(profile.customerProfileId)
            ? profile.customerProfileId[0]
            : profile.customerProfileId;

          // Store profile ID for future use
          if (customerProfileId) {
            await customer.update({
              customerProfileId: customerProfileId.toString()
            });
          }
        }
      }
    }

    if (!profile) {
      return sendSuccess(res, {
        customerProfileId: null,
        paymentProfiles: [],
        message: 'Customer does not have a payment profile in Authorize.net'
      });
    }

    // Extract payment profiles
    const paymentProfiles = extractPaymentProfiles(profile);

    // Get the stored payment profile ID if available
    const storedPaymentProfileId = customer.customerPaymentProfileId;

    // Mark default/stored profile
    const profilesWithDefault = paymentProfiles.map(p => ({
      ...p,
      isStored: p.paymentProfileId === storedPaymentProfileId
    }));

    return sendSuccess(res, {
      customerProfileId: customerProfileId?.toString() || null,
      paymentProfiles: profilesWithDefault
    });
  } catch (err) {
    logError('Get customer payment profiles error', err);
    return sendError(res, 'Failed to fetch customer payment profiles', 500, err);
  }
};
