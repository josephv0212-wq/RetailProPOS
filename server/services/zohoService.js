import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const ZOHO_BOOKS_API_BASE = 'https://www.zohoapis.com/books/v3';
const ZOHO_BILLING_API_BASE = 'https://www.zohoapis.com/billing/v1';
const ZOHO_ACCOUNTS_API_BASE = 'https://accounts.zoho.com/oauth/v2';
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000;
const DEFAULT_PER_PAGE = 200;

import { tokenCache } from '../utils/cache.js';

let accessToken = null;
let tokenExpiry = null;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const checkZohoCredentials = () => {
  const missing = [];
  
  if (!process.env.ZOHO_REFRESH_TOKEN) missing.push('ZOHO_REFRESH_TOKEN');
  if (!process.env.ZOHO_CLIENT_ID) missing.push('ZOHO_CLIENT_ID');
  if (!process.env.ZOHO_CLIENT_SECRET) missing.push('ZOHO_CLIENT_SECRET');
  if (!process.env.ZOHO_ORGANIZATION_ID) missing.push('ZOHO_ORGANIZATION_ID');
  
  if (missing.length > 0) {
    const errorMsg = `Missing Zoho credentials: ${missing.join(', ')}`;
    console.error(`\n❌ ${errorMsg}`);
    console.error(`\n📝 To fix this:`);
    console.error(`   1. Run: npm run get-zoho-token`);
    console.error(`   2. Or read: docs/ZOHO_OAUTH_SETUP.md`);
    console.error(`   3. Add the missing secret(s) to Replit Secrets\n`);
    throw new Error(errorMsg);
  }
};

const refreshAccessToken = async () => {
  checkZohoCredentials();
  
  try {
    const response = await axios.post(`${ZOHO_ACCOUNTS_API_BASE}/token`, null, {
      params: {
        refresh_token: process.env.ZOHO_REFRESH_TOKEN,
        client_id: process.env.ZOHO_CLIENT_ID,
        client_secret: process.env.ZOHO_CLIENT_SECRET,
        grant_type: 'refresh_token'
      }
    });

    accessToken = response.data.access_token;
    tokenExpiry = Date.now() + (response.data.expires_in * 1000);
    return accessToken;
  } catch (error) {
    console.error('❌ Failed to refresh Zoho access token:', error.response?.data || error.message);
    
    if (error.response?.data?.error === 'invalid_client') {
      console.error('🔍 Your ZOHO_CLIENT_ID or ZOHO_CLIENT_SECRET is incorrect.');
      console.error('   Verify them at: https://api-console.zoho.com/');
    } else if (error.response?.data?.error === 'invalid_grant') {
      console.error('🔍 Your ZOHO_REFRESH_TOKEN is invalid or expired.');
      console.error('   Run: npm run get-zoho-token');
      console.error('   Or read: docs/ZOHO_OAUTH_SETUP.md');
    }
    
    throw new Error('Failed to refresh Zoho access token');
  }
};

const getAccessToken = async () => {
  // Check cache first
  const cachedToken = tokenCache.get('zoho_access_token');
  if (cachedToken) {
    accessToken = cachedToken;
    return accessToken;
  }
  
  if (!accessToken || !tokenExpiry || Date.now() >= tokenExpiry - 60000) {
    await refreshAccessToken();
    // Cache the token
    if (accessToken) {
      tokenCache.set('zoho_access_token', accessToken, (tokenExpiry - Date.now()));
    }
  }
  return accessToken;
};

const makeZohoRequest = async (endpoint, method = 'GET', data = null, params = {}, retryCount = 0) => {
  const token = await getAccessToken();
  const url = `${ZOHO_BOOKS_API_BASE}${endpoint}`;
  
  const config = {
    method,
    url,
    headers: {
      'Authorization': `Zoho-oauthtoken ${token}`,
      'Content-Type': 'application/json'
    },
    params: {
      organization_id: process.env.ZOHO_ORGANIZATION_ID,
      ...params
    }
  };

  if (data) {
    config.data = data;
  }

  try {
    const response = await axios(config);
    
    if (response.data.code !== undefined && response.data.code !== 0) {
      console.warn(`⚠️ Zoho API warning (${endpoint}): ${response.data.message}`);
    }
    
    return response.data;
  } catch (error) {
    const status = error.response?.status;
    const errorData = error.response?.data;
    
    if (status === 429 && retryCount < MAX_RETRIES) {
      const retryAfter = parseInt(error.response?.headers['retry-after'] || RETRY_DELAY / 1000);
      console.warn(`⏳ Rate limit hit. Retrying after ${retryAfter}s... (attempt ${retryCount + 1}/${MAX_RETRIES})`);
      await sleep(retryAfter * 1000);
      return makeZohoRequest(endpoint, method, data, params, retryCount + 1);
    }
    
    if ((status >= 500 || status === 408) && retryCount < MAX_RETRIES) {
      console.warn(`⚠️ Server error (${status}). Retrying... (attempt ${retryCount + 1}/${MAX_RETRIES})`);
      await sleep(RETRY_DELAY * (retryCount + 1));
      return makeZohoRequest(endpoint, method, data, params, retryCount + 1);
    }
    
    if (status === 401) {
      console.error('🔐 Authentication failed. Token may be expired.');
      if (retryCount === 0) {
        accessToken = null;
        tokenExpiry = null;
        return makeZohoRequest(endpoint, method, data, params, retryCount + 1);
      }
    }
    
    console.error(`❌ Zoho API Error (${endpoint}):`, {
      status,
      message: errorData?.message || error.message,
      code: errorData?.code
    });
    
    throw error;
  }
};

const fetchAllPages = async (endpoint, params = {}, dataKey) => {
  let allData = [];
  let currentPage = 1;
  let hasMorePages = true;
  
  while (hasMorePages) {
    const response = await makeZohoRequest(endpoint, 'GET', null, {
      ...params,
      page: currentPage,
      per_page: DEFAULT_PER_PAGE
    });
    
    const pageData = response[dataKey] || [];
    allData = allData.concat(pageData);
    
    const pageContext = response.page_context;
    if (pageContext) {
      hasMorePages = pageContext.has_more_page;
      currentPage++;
    } else {
      hasMorePages = false;
    }
    
    if (pageData.length === 0) {
      hasMorePages = false;
    }
  }
  
  return allData;
};

export const syncCustomersFromZoho = async (options = {}) => {
  try {
    const params = {
      // Zoho Books returns customers/vendors via /contacts; restrict to customers via filter_by
      // (per Zoho: filter_by=Status.Customers)
      filter_by: options.filter_by || 'Status.Customers',
      sort_column: options.sort_column || 'contact_name',
      ...options.params
    };
    
    if (options.search_text) {
      params.search_text = options.search_text;
    }
    
    const customers = await fetchAllPages('/contacts', params, 'contacts');
    return customers;
  } catch (error) {
    console.error('Failed to sync customers from Zoho:', error.message);
    throw error;
  }
};

export const syncItemsFromZoho = async (options = {}) => {
  try {
    const params = {
      filter_by: options.filter_by || 'Status.Active',
      sort_column: options.sort_column || 'name',
      ...options.params
    };
    
    if (options.search_text) {
      params.search_text = options.search_text;
    }
    
    if (options.is_taxable !== undefined) {
      params.is_taxable = options.is_taxable;
    }
    
    const items = await fetchAllPages('/items', params, 'items');
    return items;
  } catch (error) {
    console.error('Failed to sync items from Zoho:', error.message);
    throw error;
  }
};

export const getItemById = async (itemId) => {
  try {
    const response = await makeZohoRequest(`/items/${itemId}`);
    
    if (response.code === 0) {
      return response.item;
    } else {
      throw new Error(response.message || 'Failed to fetch item');
    }
  } catch (error) {
    console.error(`Failed to fetch item ${itemId}:`, error.message);
    throw error;
  }
};

// Lookup a sales receipt by number (search_text) to recover missing IDs
const findSalesReceiptByNumber = async (salesReceiptNumber) => {
  const params = {
    search_text: salesReceiptNumber,
    page: 1,
    per_page: 1
  };

  const response = await makeZohoRequest('/salesreceipts', 'GET', null, params);

  if (response.code !== 0) {
    throw new Error(response.message || 'Failed to lookup sales receipt by number');
  }

  const receipts = response.salesreceipts || [];
  return receipts[0] || null;
};

export const searchItems = async (searchText, filters = {}) => {
  try {
    const params = {
      search_text: searchText,
      filter_by: filters.filter_by || 'Status.Active',
      ...filters
    };
    
    const response = await makeZohoRequest('/items', 'GET', null, params);
    return response.items || [];
  } catch (error) {
    console.error('Failed to search items:', error.message);
    throw error;
  }
};

export const createSalesReceipt = async (saleData) => {
  const { 
    customerId, // This MUST be the customer's zohoId from Zoho Books
    date, 
    lineItems, 
    locationId,
    locationName,
    customerLocation, // Customer's location from Zoho (place_of_contact) - used to enforce correct tax rate
    taxAmount,
    ccFee,
    total,
    paymentType,
    notes,
    saleId
  } = saleData;

  // Validate that customerId is provided (must be Zoho customer ID)
  if (!customerId) {
    console.error('❌ Cannot create sales receipt: customerId (zohoId) is required');
    return {
      success: false,
      error: 'Customer Zoho ID is required to create invoice in Zoho Books'
    };
  }

  const paymentModeMap = {
    cash: 'cash',
    credit_card: 'creditcard',
    debit_card: 'creditcard',
    zelle: 'banktransfer',
    ach: 'banktransfer'
  };

  // Normalize payment type to avoid unexpected defaults
  const normalizedPaymentType = (paymentType || '')
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  const paymentMode = paymentModeMap[normalizedPaymentType] || 'cash';
  const processingFee = parseFloat(ccFee || 0) || 0;
  const expectedTotal = parseFloat(total || 0);

  // Use customer's location (place_of_contact) if available to enforce correct tax rate
  // Zoho uses place_of_contact to determine which tax rate to apply
  // If customer has a different assigned tax rate, we must use their location
  const placeOfContact = customerLocation || locationName || locationId || null;

  const salesReceiptData = {
    customer_id: customerId, // Zoho Books customer ID (contact_id from Zoho)
    salesreceipt_number: `POS-${saleId}`,
    date: date || new Date().toISOString().split('T')[0],
    payment_mode: paymentMode,
    line_items: lineItems.map(item => {
      const taxRate = Number(item.taxPercentage ?? 0);
      const isTaxable = !Number.isNaN(taxRate) && taxRate > 0;
      const lineItem = {
        name: item.itemName || item.name || 'Item',
        description: item.description || '',
        rate: parseFloat(item.price),
        quantity: parseFloat(item.quantity),
        is_taxable: isTaxable,
        tax_percentage: isTaxable ? taxRate : 0
      };
      // Only include item_id if it exists (Zoho allows line items without item_id)
      if (item.zohoItemId) {
        lineItem.item_id = item.zohoItemId;
      }
      
      // If we know the tax for this item, let Zoho calculate it so totals match the POS
      if (isTaxable && item.taxId) {
        lineItem.tax_id = item.taxId;
      }
      
      return lineItem;
    }),
    notes: notes || `Sale from POS - Location: ${locationName || locationId || 'Unknown'}`
  };

  // Set place_of_contact to customer's location to enforce correct tax rate
  // This ensures Zoho applies the tax rate associated with the customer's location
  if (placeOfContact) {
    salesReceiptData.place_of_contact = placeOfContact;
    console.log(`📍 Using customer location for sales receipt: ${placeOfContact} (to enforce correct tax rate)`);
  }

  // Keep Zoho total in sync with POS total (cc fee is an adjustment, not a line item)
  if (processingFee > 0) {
    salesReceiptData.adjustment = parseFloat(processingFee.toFixed(2));
    salesReceiptData.adjustment_description = 'Credit Card Processing Fee';
  }

  // Emit a warning if our calculated Zoho total would drift from the POS total
  if (!Number.isNaN(expectedTotal) && expectedTotal > 0) {
    const computedTotal = (lineItems || []).reduce((sum, item) => {
      const quantity = parseFloat(item.quantity) || 0;
      const price = parseFloat(item.price) || 0;
      const taxRate = Number(item.taxPercentage ?? 0);
      const hasTax = !Number.isNaN(taxRate) && taxRate > 0;
      const lineTotalFromItem = parseFloat(item.lineTotal);
      const calculatedLineTotal = !Number.isNaN(lineTotalFromItem)
        ? lineTotalFromItem
        : price * quantity * (1 + (hasTax ? taxRate / 100 : 0));

      return sum + calculatedLineTotal;
    }, 0) + processingFee;

    if (Math.abs(computedTotal - expectedTotal) > 0.01) {
      console.warn(
        `⚠️ Zoho sales receipt total mismatch for POS-${saleId}: ` +
        `calculated ${computedTotal.toFixed(2)} vs expected ${expectedTotal.toFixed(2)}`
      );
    }
  }

  try {
    // Log full payload for debugging/traceability (no secrets included)
    console.log(`➡️ Sending Zoho sales receipt for POS-${saleId}`);
    console.log(JSON.stringify(salesReceiptData, null, 2));

    const response = await makeZohoRequest('/salesreceipts', 'POST', salesReceiptData);
    
    if (response.code === 0) {
      const salesReceipt = response.salesreceipt || {};
      let salesReceiptId = salesReceipt.salesreceipt_id || response.salesreceipt_id || null;
      const salesReceiptNumber = salesReceipt.salesreceipt_number || response.salesreceipt_number || null;

      if (!salesReceiptId && salesReceiptNumber) {
        try {
          const fetchedReceipt = await findSalesReceiptByNumber(salesReceiptNumber);
          if (fetchedReceipt?.salesreceipt_id) {
            salesReceiptId = fetchedReceipt.salesreceipt_id;
          } else {
            console.warn('⚠️ Zoho response missing salesreceipt_id and lookup by number returned no id');
          }
        } catch (lookupErr) {
          console.warn('⚠️ Zoho response missing salesreceipt_id and lookup by number failed:', lookupErr.message);
        }
      } else if (!salesReceiptId) {
        console.warn('⚠️ Zoho response missing salesreceipt_id and no salesreceipt_number to lookup');
      }

      console.log(
        `✅ Zoho sales receipt created for POS-${saleId}: ` +
        `id=${salesReceiptId || 'n/a'}, number=${salesReceiptNumber || 'n/a'}`
      );

      return {
        success: true,
        salesReceiptId,
        salesReceiptNumber,
        data: salesReceipt,
        rawResponse: response
      };
    } else {
      const errorMsg = response.message || 'Unknown error';
      console.error(`❌ Sales receipt creation failed: ${errorMsg}`);
      console.error(`   Response code: ${response.code}`);
      if (response.errors) {
        console.error(`   Errors:`, JSON.stringify(response.errors, null, 2));
      }
      return {
        success: false,
        error: errorMsg
      };
    }
  } catch (error) {
    const errorData = error.response?.data;
    const errorMsg = errorData?.message || error.message || 'Unknown error';
    
    console.error(`❌ Failed to create sales receipt in Zoho for POS-${saleId}:`);
    console.error(`   Error: ${errorMsg}`);
    if (error.response?.status) {
      console.error(`   HTTP Status: ${error.response.status}`);
    }
    if (errorData) {
      console.error(`   Response:`, JSON.stringify(errorData, null, 2));
    }
    
    return {
      success: false,
      error: errorMsg
    };
  }
};

export const getOrganizationDetails = async () => {
  try {
    const response = await makeZohoRequest('/organizations');
    return response.organizations || [];
  } catch (error) {
    console.error('Failed to get organization details:', error.message);
    throw error;
  }
};

export const getCustomerById = async (customerId) => {
  try {
    const response = await makeZohoRequest(`/contacts/${customerId}`);
    
    if (response.code === 0) {
      return response.contact;
    } else {
      throw new Error(response.message || 'Failed to fetch customer');
    }
  } catch (error) {
    console.error(`Failed to fetch customer ${customerId}:`, error.message);
    throw error;
  }
};

// Make Zoho Billing API request (different base URL)
const makeZohoBillingRequest = async (endpoint, method = 'GET', data = null, retryCount = 0) => {
  const token = await getAccessToken();
  const url = `${ZOHO_BILLING_API_BASE}${endpoint}`;
  
  const config = {
    method,
    url,
    headers: {
      'Authorization': `Zoho-oauthtoken ${token}`,
      'X-com-zoho-subscriptions-organizationid': process.env.ZOHO_ORGANIZATION_ID,
      'Content-Type': 'application/json'
    }
  };

  if (data) {
    config.data = data;
  }

  try {
    const response = await axios(config);
    return response.data;
  } catch (error) {
    const status = error.response?.status;
    const errorData = error.response?.data;
    
    if (status === 429 && retryCount < MAX_RETRIES) {
      const retryAfter = parseInt(error.response?.headers['retry-after'] || RETRY_DELAY / 1000);
      console.warn(`⏳ Rate limit hit. Retrying after ${retryAfter}s... (attempt ${retryCount + 1}/${MAX_RETRIES})`);
      await sleep(retryAfter * 1000);
      return makeZohoBillingRequest(endpoint, method, data, retryCount + 1);
    }
    
    if ((status >= 500 || status === 408) && retryCount < MAX_RETRIES) {
      console.warn(`⚠️ Server error (${status}). Retrying... (attempt ${retryCount + 1}/${MAX_RETRIES})`);
      await sleep(RETRY_DELAY * (retryCount + 1));
      return makeZohoBillingRequest(endpoint, method, data, retryCount + 1);
    }
    
    if (status === 401) {
      console.error('🔐 Authentication failed. Token may be expired.');
      if (retryCount === 0) {
        accessToken = null;
        tokenExpiry = null;
        return makeZohoBillingRequest(endpoint, method, data, retryCount + 1);
      }
    }
    
    console.error(`❌ Zoho Billing API Error (${endpoint}):`, errorData || error.message);
    throw error;
  }
};

export const getCustomerCards = async (customerId) => {
  try {
    // Get full customer details from Zoho Books API
    const customer = await getCustomerById(customerId);
    
    if (!customer) {
      return [];
    }
    
    const cards = [];
    
    // Extract card information from customer's custom_fields
    if (customer.custom_fields && Array.isArray(customer.custom_fields)) {
      // Try to find card_last_4, card_brand, card_number, etc.
      const cardLast4Field = customer.custom_fields.find(
        field => {
          const label = (field.label || '').toLowerCase();
          return label.includes('card_last_4') || 
                 label.includes('last_4') || 
                 label.includes('last4') ||
                 label.includes('card_last4');
        }
      );
      
      const cardBrandField = customer.custom_fields.find(
        field => {
          const label = (field.label || '').toLowerCase();
          return label.includes('card_brand') || 
                 label.includes('brand') ||
                 label.includes('card_type');
        }
      );
      
      const cardNumberField = customer.custom_fields.find(
        field => {
          const label = (field.label || '').toLowerCase();
          return label.includes('card_number') || 
                 label.includes('cardnumber') ||
                 label.includes('card_no');
        }
      );
      
      const cardExpiryField = customer.custom_fields.find(
        field => {
          const label = (field.label || '').toLowerCase();
          return label.includes('card_expiry') || 
                 label.includes('expiry') ||
                 label.includes('expiration');
        }
      );
      
      const paymentMethodIdField = customer.custom_fields.find(
        field => {
          const label = (field.label || '').toLowerCase();
          return label.includes('payment_method_id') || 
                 label.includes('paymentmethodid') ||
                 label.includes('pm_id');
        }
      );
      
      // If we found card information, create a card object
      if (cardLast4Field?.value || cardNumberField?.value || paymentMethodIdField?.value) {
        const card = {
          id: paymentMethodIdField?.value || null,
          last4: cardLast4Field?.value || (cardNumberField?.value ? cardNumberField.value.slice(-4) : null),
          brand: cardBrandField?.value || null,
          number: cardNumberField?.value || null,
          expiry: cardExpiryField?.value || null,
          payment_method_id: paymentMethodIdField?.value || null
        };
        
        // Only add card if it has at least some information
        if (card.last4 || card.number || card.payment_method_id) {
          cards.push(card);
        }
      }
    }
    
    // Also check if customer has payment_methods array (if Zoho Books API includes it)
    if (customer.payment_methods && Array.isArray(customer.payment_methods)) {
      cards.push(...customer.payment_methods);
    }
    
    // Check for cards array directly in customer object
    if (customer.cards && Array.isArray(customer.cards)) {
      // Map cards to include last_four_digits in a consistent format
      const mappedCards = customer.cards.map(card => ({
        card_id: card.card_id,
        card_type: card.card_type,
        gateway: card.gateway,
        last_four_digits: card.last_four_digits,
        last4: card.last_four_digits, // Keep for backward compatibility
        status: card.status,
        is_expired: card.is_expired,
        ...card // Include all other card properties
      }));
      cards.push(...mappedCards);
    }
    
    return cards;
  } catch (error) {
    console.error(`❌ Failed to get customer cards for ${customerId}:`, error.response?.data || error.message);
    // Return empty array if customer has no cards or API fails
    return [];
  }
};

export const createItem = async (itemData) => {
  try {
    const response = await makeZohoRequest('/items', 'POST', itemData);
    
    if (response.code === 0) {
      return {
        success: true,
        item: response.item
      };
    } else {
      console.error(`❌ Item creation failed: ${response.message}`);
      return {
        success: false,
        error: response.message
      };
    }
  } catch (error) {
    console.error('Failed to create item in Zoho:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.message || error.message
    };
  }
};

export const updateItem = async (itemId, itemData) => {
  try {
    const response = await makeZohoRequest(`/items/${itemId}`, 'PUT', itemData);
    
    if (response.code === 0) {
      return {
        success: true,
        item: response.item
      };
    } else {
      console.error(`❌ Item update failed: ${response.message}`);
      return {
        success: false,
        error: response.message
      };
    }
  } catch (error) {
    console.error('Failed to update item in Zoho:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.message || error.message
    };
  }
};

export const markItemActive = async (itemId) => {
  try {
    const response = await makeZohoRequest(`/items/${itemId}/active`, 'POST');
    
    if (response.code === 0) {
      return { success: true, message: response.message };
    } else {
      return { success: false, error: response.message };
    }
  } catch (error) {
    console.error('Failed to mark item as active:', error.message);
    return { success: false, error: error.message };
  }
};

export const markItemInactive = async (itemId) => {
  try {
    const response = await makeZohoRequest(`/items/${itemId}/inactive`, 'POST');
    
    if (response.code === 0) {
      return { success: true, message: response.message };
    } else {
      return { success: false, error: response.message };
    }
  } catch (error) {
    console.error('Failed to mark item as inactive:', error.message);
    return { success: false, error: error.message };
  }
};

export const getPricebooks = async () => {
  try {
    const pricebooks = await fetchAllPages('/pricebooks', {}, 'pricebooks');
    return pricebooks;
  } catch (error) {
    console.error('Failed to fetch pricebooks from Zoho:', error.message);
    throw error;
  }
};

export const getPricebookByName = async (pricebookName) => {
  try {
    console.log(`Fetching all pricebooks to find: "${pricebookName}"`);
    const pricebooks = await getPricebooks();
    console.log(`Found ${pricebooks.length} pricebooks in Zoho`);
    
    const pricebook = pricebooks.find(
      pb => pb.name === pricebookName || pb.pricebook_name === pricebookName
    );
    
    if (!pricebook) {
      console.warn(`Pricebook "${pricebookName}" not found. Available pricebooks:`, 
        pricebooks.map(pb => pb.name || pb.pricebook_name).join(', '));
      return null;
    }
    
    console.log(`Found matching pricebook:`, {
      id: pricebook.pricebook_id || pricebook.id,
      name: pricebook.name || pricebook.pricebook_name
    });
    
    return pricebook;
  } catch (error) {
    console.error(`Failed to find pricebook "${pricebookName}":`, error.message);
    console.error('Error details:', {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status
    });
    throw error;
  }
};

export const getItemsFromPricebook = async (pricebookId) => {
  try {
    const response = await makeZohoRequest(`/pricebooks/${pricebookId}`);
    
    if (response.code === 0 && response.pricebook) {
      // Extract items from pricebook_items array
      const pricebookItems = response.pricebook.pricebook_items || [];
      
      // Map pricebook items to include item details and pricebook rate
      const items = pricebookItems.map(pbItem => ({
        item_id: pbItem.item_id,
        name: pbItem.name || pbItem.item_name,
        sku: pbItem.sku || pbItem.item_sku,
        description: pbItem.description || pbItem.item_description,
        price: parseFloat(pbItem.pricebook_rate || pbItem.rate || 0),
        tax_id: pbItem.tax_id || null,
        tax_name: pbItem.tax_name || null,
        tax_percentage: parseFloat(pbItem.tax_percentage || 0),
        unit: pbItem.unit || null,
        status: pbItem.status || 'active'
      }));
      
      return items;
    } else {
      throw new Error(response.message || 'Failed to fetch pricebook items');
    }
  } catch (error) {
    console.error(`Failed to fetch items from pricebook ${pricebookId}:`, error.message);
    throw error;
  }
};

export const getItemsFromPricebookByName = async (pricebookName) => {
  try {
    const pricebook = await getPricebookByName(pricebookName);
    
    if (!pricebook) {
      console.warn(`Pricebook "${pricebookName}" not found in Zoho`);
      return [];
    }
    
    const pricebookId = pricebook.pricebook_id || pricebook.id;
    console.log(`Found pricebook "${pricebookName}" with ID: ${pricebookId}`);
    const items = await getItemsFromPricebook(pricebookId);
    console.log(`Retrieved ${items.length} items from pricebook ID ${pricebookId}`);
    return items;
  } catch (error) {
    console.error(`Failed to get items from pricebook "${pricebookName}":`, error.message);
    console.error('Error details:', {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status
    });
    throw error;
  }
};

export const getTaxRates = async (options = {}) => {
  try {
    // Build params - organization_id is added automatically by makeZohoRequest
    // Only add filter_by if explicitly provided
    const params = {};
    if (options.filter_by) {
      params.filter_by = options.filter_by;
    }
    if (options.params) {
      Object.assign(params, options.params);
    }
    
    // Use makeZohoRequest directly for taxes endpoint
    // According to Zoho Books API: GET /books/v3/settings/taxes?organization_id=...
    const response = await makeZohoRequest('/settings/taxes', 'GET', null, params);
    
    // Check if response is successful
    if (response.code !== undefined && response.code !== 0) {
      const errorMsg = response.message || 'Failed to fetch taxes';
      console.error('❌ Tax rates API error:', errorMsg);
      throw new Error(errorMsg);
    }
    
    // Extract taxes from response
    // API returns: { code: 0, taxes: [...] }
    const taxes = response.taxes || [];
    
    if (taxes.length === 0) {
      console.warn('⚠️ No tax rates found in Zoho response');
    }
    
    // Map tax data to include name and percentage
    // According to API docs, tax object has: tax_id, tax_name, tax_percentage
    const mappedTaxes = taxes.map(tax => {
      const mappedTax = {
        taxId: tax.tax_id || tax.id,
        taxName: tax.tax_name || tax.name,
        taxPercentage: parseFloat(tax.tax_percentage || tax.tax_percentage || 0),
        taxType: tax.tax_type || null,
        isActive: tax.status === 'active' || tax.is_active === true || tax.is_active === undefined,
        // Include additional fields if available
        taxSpecificationId: tax.tax_specification_id || null,
        taxSpecificationName: tax.tax_specification_name || null
      };
      
      return mappedTax;
    });
    
    return mappedTaxes;
  } catch (error) {
    console.error('❌ Failed to fetch tax rates from Zoho:', error.message);
    if (error.response) {
      console.error('   Response status:', error.response.status);
      console.error('   Response data:', JSON.stringify(error.response.data, null, 2));
    }
    throw error;
  }
};

/**
 * Get all locations from Zoho Books
 * @returns {Promise<Array>} Array of location objects
 */
export const getLocations = async () => {
  try {
    // First try to get locations with pagination support
    try {
      const locations = await fetchAllPages('/locations', {}, 'locations');
      if (locations && locations.length > 0) {
        return locations;
      }
    } catch (paginationError) {
      // If pagination fails, try direct request (locations might not support pagination)
      console.log('⚠️ Pagination not supported for locations, trying direct request');
    }
    
    // Fallback to direct request if pagination doesn't work
    const response = await makeZohoRequest('/locations', 'GET');
    
    if (response.code === 0) {
      return response.locations || [];
    } else {
      const errorMsg = response.message || 'Failed to fetch locations';
      console.error('❌ Failed to fetch locations:', errorMsg);
      throw new Error(errorMsg);
    }
  } catch (error) {
    console.error('❌ Failed to fetch locations from Zoho:', error.message);
    if (error.response) {
      console.error('   Response status:', error.response.status);
      console.error('   Response data:', JSON.stringify(error.response.data, null, 2));
    }
    throw error;
  }
};

/**
 * Get a specific location by ID from Zoho Books
 * @param {string} locationId - The Zoho location ID
 * @returns {Promise<Object>} Location object with details
 */
export const getLocationById = async (locationId) => {
  try {
    const response = await makeZohoRequest(`/locations/${locationId}`);
    
    if (response.code === 0) {
      return response.location;
    } else {
      const errorMsg = response.message || 'Failed to fetch location';
      console.error(`❌ Failed to fetch location ${locationId}:`, errorMsg);
      throw new Error(errorMsg);
    }
  } catch (error) {
    console.error(`❌ Failed to fetch location ${locationId}:`, error.message);
    if (error.response) {
      console.error('   Response status:', error.response.status);
      console.error('   Response data:', JSON.stringify(error.response.data, null, 2));
    }
    throw error;
  }
};

/**
 * Get open sales orders for a customer
 * @param {string} customerId - The Zoho customer ID (contact_id)
 * @returns {Promise<Array>} Array of open sales orders
 */
export const getOpenSalesOrders = async (customerId) => {
  try {
    // According to Zoho API documentation:
    // - customer_id: Filter sales orders by specific customer identifier
    // - filter_by: Status.Open to get only open sales orders
    // - sort_column: 'date' to sort by date
    const params = {
      customer_id: customerId, // Filter by customer ID (required for customer-specific orders)
      filter_by: 'Status.Open', // Filter by open status
      sort_column: 'date', // Sort by date
      // Note: sort_order is not in the API docs, but we'll include it if supported
      // If it causes issues, we can remove it and sort client-side
    };
    
    // Fetch all pages of sales orders for this customer
    const salesOrders = await fetchAllPages('/salesorders', params, 'salesorders');
    
    console.log(`📦 API returned ${salesOrders.length} sales order(s) total`);
    
    // Additional client-side filtering as safety measure:
    // 1. Ensure status is open (API should handle this, but double-check)
    // 2. Verify customer_id matches (API should filter, but verify as safety)
    const openSalesOrders = salesOrders.filter(so => {
      // Check status - should be 'open' according to API response format
      const status = (so.status || '').toLowerCase();
      const isOpen = status === 'open';
      
      // Verify customer_id matches (API should filter, but verify as safety)
      const soCustomerId = so.customer_id;
      const customerMatches = soCustomerId === customerId || String(soCustomerId) === String(customerId);
      
      return isOpen && customerMatches;
    });
    
    console.log(`✅ Found ${openSalesOrders.length} open sales order(s) for customer ${customerId}`);
    
    return openSalesOrders;
  } catch (error) {
    console.error(`❌ Failed to fetch open sales orders for customer ${customerId}:`, error.message);
    throw error;
  }
};

/**
 * Get sales order details by ID
 * @param {string} salesorderId - The Zoho sales order ID
 * @returns {Promise<Object>} Sales order object with details
 */
export const getSalesOrderById = async (salesorderId) => {
  try {
    const response = await makeZohoRequest(`/salesorders/${salesorderId}`);
    
    if (response.code === 0) {
      return response.salesorder || response.salesorders?.[0] || null;
    } else {
      const errorMsg = response.message || 'Failed to fetch sales order';
      console.error(`❌ Failed to fetch sales order ${salesorderId}:`, errorMsg);
      throw new Error(errorMsg);
    }
  } catch (error) {
    console.error(`❌ Failed to fetch sales order ${salesorderId}:`, error.message);
    if (error.response) {
      console.error('   Response status:', error.response.status);
      console.error('   Response data:', JSON.stringify(error.response.data, null, 2));
    }
    throw error;
  }
};

/**
 * Get invoices for a customer
 * Uses Zoho Books API: GET /books/v3/invoices
 * @param {string} customerId - The Zoho customer ID (contact_id)
 * @param {string} status - Invoice status filter (e.g., 'unpaid', 'partially_paid', 'sent')
 * @returns {Promise<Array>} Array of invoices
 */
export const getCustomerInvoices = async (customerId, status = 'unpaid') => {
  try {
    // According to Zoho API documentation:
    // - customer_id: Filter invoices by specific customer identifier
    // - status: Filter by status (unpaid, partially_paid, sent, etc.)
    // - sort_column: 'date' to sort by date
    const params = {
      customer_id: customerId, // Filter by customer ID (required)
      status: status, // Filter by status (unpaid, partially_paid, sent, etc.)
      sort_column: 'date' // Sort by date
    };
    
    // Fetch all pages of invoices for this customer
    const invoices = await fetchAllPages('/invoices', params, 'invoices');
    
    console.log(`📦 API returned ${invoices.length} invoice(s) total`);
    
    // Filter to ensure customer_id matches (API should filter, but verify as safety)
    const customerInvoices = invoices.filter(inv => {
      const invCustomerId = inv.customer_id;
      const customerMatches = invCustomerId === customerId || String(invCustomerId) === String(customerId);
      
      if (!customerMatches) {
        console.warn(`⚠️ Invoice ${inv.invoice_number} has customer_id "${invCustomerId}" but expected "${customerId}"`);
      }
      
      return customerMatches;
    });
    
    console.log(`✅ Found ${customerInvoices.length} invoice(s) for customer ${customerId}`);
    
    return customerInvoices;
  } catch (error) {
    console.error(`❌ Failed to fetch invoices for customer ${customerId}:`, error.message);
    throw error;
  }
};

/**
 * Get invoice details by ID
 * Uses Zoho Books API: GET /books/v3/invoices/{invoice_id}
 * @param {string} invoiceId - The Zoho invoice ID
 * @returns {Promise<Object>} Invoice object with details
 */
export const getInvoiceById = async (invoiceId) => {
  try {
    const response = await makeZohoRequest(`/invoices/${invoiceId}`);
    
    if (response.code === 0) {
      return response.invoice || response.invoices?.[0] || null;
    } else {
      const errorMsg = response.message || 'Failed to fetch invoice';
      console.error(`❌ Failed to fetch invoice ${invoiceId}:`, errorMsg);
      throw new Error(errorMsg);
    }
  } catch (error) {
    console.error(`❌ Failed to fetch invoice ${invoiceId}:`, error.message);
    if (error.response) {
      console.error('   Response status:', error.response.status);
      console.error('   Response data:', JSON.stringify(error.response.data, null, 2));
    }
    throw error;
  }
};
