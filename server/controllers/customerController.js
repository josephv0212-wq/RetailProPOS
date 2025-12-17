import { Customer } from '../models/index.js';
import { Op } from 'sequelize';
import { getCustomerById as getZohoCustomerById, getCustomerCards, syncCustomersFromZoho } from '../services/zohoService.js';
import { sendSuccess, sendError, sendNotFound } from '../utils/responseHelper.js';

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
      console.log('No customers found in DB. Syncing from Zoho...');
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
            lastSyncedAt: new Date()
          });
        }
        
        // Fetch customers again after sync
        customers = await Customer.findAll({
          where,
          order: [['contactName', 'ASC']]
        });
      } catch (syncError) {
        console.error('Failed to sync customers from Zoho:', syncError);
        // Continue to return empty list even if sync fails
      }
    }

    const filteredCustomers = customers.filter(customer => normalizeContactType(customer.contactType) !== 'vendor');
    return sendSuccess(res, { customers: filteredCustomers });
  } catch (err) {
    console.error('Get customers error:', err);
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

    return sendSuccess(res, { customer });
  } catch (err) {
    console.error('Get customer error:', err);
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
    console.error('Get customers by location error:', err);
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

    // If customer has no Zoho ID, return with existing last_four_digits
    if (!customer.zohoId) {
      return res.json({ 
        success: true,
        data: { 
          pricebook_name: null,
          tax_preference: null,
          cards: [],
          last_four_digits: customer.last_four_digits || null,
          card_type: customer.cardBrand || null,
          has_card_info: customer.last_four_digits ? true : false,
          card_info_checked: false // Can't check without Zoho ID
        }
      });
    }

    // Check if last_four_digits already exists in database
    const needsZohoFetch = !customer.last_four_digits;
    
    // Fetch customer details from Zoho to get pricebook_name and tax preference
    let zohoCustomer = null;
    let last_four_digits = customer.last_four_digits; // Use existing value if available
    let cardBrand = customer.cardBrand;
    let hasCardInfo = customer.last_four_digits ? true : false;
    let cardInfoChecked = false;
    
    try {
      if (needsZohoFetch) {
        console.log(`Fetching Zoho customer details for customer ID: ${customer.zohoId} (last_four_digits not in DB)`);
      } else {
        console.log(`Fetching Zoho customer details for customer ID: ${customer.zohoId} (last_four_digits already in DB, skipping card fetch)`);
      }
      
      zohoCustomer = await getZohoCustomerById(customer.zohoId);
      
      // Extract pricebook_name from Zoho customer data
      // Check multiple possible field names
      const pricebookName = zohoCustomer.pricebook_name || 
                           zohoCustomer.price_list_name || 
                           zohoCustomer.price_list?.name ||
                           zohoCustomer.pricebook?.name ||
                           null;
      
      console.log(`Customer pricebook name: ${pricebookName || 'none'}`);

      // Extract tax preference from Zoho customer data
      // Check multiple possible field names and locations
      let taxPreference = null;
      
      // Check direct fields
      if (zohoCustomer.tax_preference) {
        taxPreference = zohoCustomer.tax_preference;
      } else if (zohoCustomer.tax_exemption_code) {
        taxPreference = zohoCustomer.tax_exemption_code;
      } else if (zohoCustomer.tax_exemption_id) {
        taxPreference = zohoCustomer.tax_exemption_id;
      } else if (zohoCustomer.tax_treatment) {
        taxPreference = zohoCustomer.tax_treatment;
      }
      
      // Check custom fields for tax preference
      if (!taxPreference && zohoCustomer.custom_fields && Array.isArray(zohoCustomer.custom_fields)) {
        const taxPreferenceField = zohoCustomer.custom_fields.find(
          field => field.label?.toLowerCase().includes('tax') && 
                   (field.label?.toLowerCase().includes('preference') || 
                    field.label?.toLowerCase().includes('exemption') ||
                    field.label?.toLowerCase().includes('treatment'))
        );
        if (taxPreferenceField) {
          taxPreference = taxPreferenceField.value;
        }
      }
      
      // Check tax exemptions array if available
      if (!taxPreference && zohoCustomer.tax_exemptions && Array.isArray(zohoCustomer.tax_exemptions)) {
        if (zohoCustomer.tax_exemptions.length > 0) {
          taxPreference = zohoCustomer.tax_exemptions[0].tax_exemption_code || 
                         zohoCustomer.tax_exemptions[0].tax_exemption_id ||
                         'Tax Exempt';
        }
      }

      // Check card info from Zoho
      cardInfoChecked = true; // We've checked Zoho for card info
      if (needsZohoFetch) {
        // Need to fetch from Zoho - check if cards exist
        if (zohoCustomer.cards && Array.isArray(zohoCustomer.cards) && zohoCustomer.cards.length > 0) {
          // Get the first active card
          const activeCard = zohoCustomer.cards.find(card => card.status === 'active') || zohoCustomer.cards[0];
          if (activeCard && activeCard.last_four_digits) {
            last_four_digits = activeCard.last_four_digits || null;
            // Capitalize card_type (visa -> Visa, mastercard -> Mastercard, etc.)
            const cardType = activeCard.card_type || null;
            cardBrand = cardType ? cardType.charAt(0).toUpperCase() + cardType.slice(1).toLowerCase() : null;
            hasCardInfo = true;
          } else {
            // Cards exist but no valid card with last_four_digits
            hasCardInfo = false;
          }
        } else {
          // No cards array or empty - customer has no card info
          hasCardInfo = false;
        }
      } else {
        // Already have card info in DB - use existing status
        hasCardInfo = customer.last_four_digits ? true : false;
        cardInfoChecked = true; // We know the status from DB
      }

      // Update customer record with last_four_digits and cardBrand if found and not already in DB
      if (needsZohoFetch && last_four_digits) {
        try {
          await customer.update({
            last_four_digits: last_four_digits,
            cardBrand: cardBrand || customer.cardBrand,
            hasPaymentMethod: true,
            paymentMethodType: 'card'
          });
          console.log(`Updated customer ${customer.contactName} with last_four_digits: ${last_four_digits}, cardBrand: ${cardBrand}`);
        } catch (updateError) {
          console.error('Failed to update customer with last_four_digits:', updateError);
          // Continue even if update fails
        }
      }

      // Fetch customer cards from Zoho Billing API
      let customerCards = [];
      try {
        customerCards = await getCustomerCards(customer.zohoId);
      } catch (cardError) {
        // Silently handle card fetch errors
      }

      // Reload customer to get updated last_four_digits and cardBrand if it was just saved
      if (needsZohoFetch && last_four_digits) {
        await customer.reload();
        last_four_digits = customer.last_four_digits;
        cardBrand = customer.cardBrand;
      }

      // Use current customer cardBrand if we don't have one from Zoho
      const finalCardBrand = cardBrand || customer.cardBrand || null;

      return sendSuccess(res, { 
        pricebook_name: pricebookName,
        tax_preference: taxPreference,
        cards: customerCards,
        last_four_digits: last_four_digits,
        card_type: finalCardBrand,
        has_card_info: hasCardInfo,
        card_info_checked: cardInfoChecked
      });
    } catch (zohoError) {
      console.error('Failed to fetch customer details from Zoho:', zohoError.message);
      console.error('Zoho error details:', {
        message: zohoError.message,
        response: zohoError.response?.data,
        status: zohoError.response?.status
      });
      return sendSuccess(res, { 
        pricebook_name: null,
        tax_preference: null,
        cards: [],
        last_four_digits: customer.last_four_digits || null,
        card_type: customer.cardBrand || null,
        has_card_info: customer.last_four_digits ? true : false,
        card_info_checked: false // Error occurred, couldn't check
      });
    }
  } catch (err) {
    console.error('Get customer price list error:', err);
    return sendError(res, 'Failed to fetch customer price list', 500, err);
  }
};
