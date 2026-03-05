import { syncCustomersFromZoho, syncItemsFromZoho, getOrganizationDetails, getCustomerById, getTaxRates, getLocations, getOpenSalesOrders, getSalesOrderById, getCustomerInvoices, getInvoiceById, organizeZohoSalesOrdersFuelSurcharge as organizeZohoSalesOrdersFuelSurchargeService } from '../services/zohoService.js';
import { refreshCustomerProfileFromZoho, refreshCustomerPaymentFromAuthNet } from './customerController.js';
import { Customer, Item, Sale, InvoicePayment, PricebookCache } from '../models/index.js';
import { Op } from 'sequelize';
import { sendSuccess, sendError } from '../utils/responseHelper.js';
import { logError, logInfo } from '../utils/logger.js';
import { extractUnitFromZohoItem, syncItemUnitOfMeasure } from '../utils/itemUnitOfMeasureHelper.js';
import { sequelize } from '../config/db.js';

const isSQLite = (process.env.DATABASE_SETTING || 'cloud').toLowerCase() === 'local';

const DEFAULT_CUSTOMERS = {
  'LOC001': 'MIA Dry Ice - WALK IN MIAMI',
  'LOC002': 'FLL Dry Ice - Walk in FT Lauderdale',
  'LOC003': 'WC Dry Ice - Walk in West Coast',
  'LOC004': 'ORL Dry Ice - Walk in Orlando'
};

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

const isDefaultCustomer = (contactName) => {
  return Object.values(DEFAULT_CUSTOMERS).some(defaultName => 
    contactName.toLowerCase().includes(defaultName.toLowerCase().substring(0, 15))
  );
};

// Helper function to sync customers (can be called without req/res)
export const syncCustomersToDatabase = async (options = {}) => {
  try {
    const zohoCustomers = await syncCustomersFromZoho();
    const customerContacts = (zohoCustomers || [])
      .filter(c => (c?.contact_type || 'customer').toLowerCase() === 'customer')
      .filter(c => c?.contact_id && c?.contact_name);
    
    let created = 0;
    let updated = 0;

    // Manual sync option: delete all existing customers and insert fresh list
    if (options.replaceAll === true) {
      const now = new Date();
      const rows = customerContacts.map(zohoCustomer => {
        const contactType = (zohoCustomer.contact_type || 'customer').toLowerCase();
        const location = extractLocation(zohoCustomer);
        const paymentMethod = extractPaymentMethod(zohoCustomer);
        return {
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
          lastSyncedAt: now
        };
      });

      await sequelize.transaction(async (t) => {
        // Detach FKs before truncate: Sale and InvoicePayment reference Customer
        await Sale.update({ customerId: null }, { where: {}, transaction: t });
        await InvoicePayment.update({ customerId: null }, { where: {}, transaction: t });
        await Customer.destroy({ where: {}, truncate: true, transaction: t });
        if (rows.length > 0) {
          await Customer.bulkCreate(rows, { transaction: t });
        }
      });

      created = rows.length;
      updated = 0;
    } else {
      for (const zohoCustomer of customerContacts) {
        const contactType = (zohoCustomer.contact_type || 'customer').toLowerCase();
        const location = extractLocation(zohoCustomer);
        const paymentMethod = extractPaymentMethod(zohoCustomer);
        
        const [customer, isNew] = await Customer.upsert({
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

        if (isNew) created++;
        else updated++;
      }
    }

    return {
      success: true,
      message: 'Customers synced successfully',
      stats: { total: customerContacts.length, created, updated }
    };
  } catch (err) {
    logError('Customer sync error', err);
    throw err;
  }
};

export const syncZohoCustomers = async (req, res) => {
  try {
    const result = await syncCustomersToDatabase({ replaceAll: true });
    const PROFILE_CONCURRENCY = 3;
    const ZOHO_BATCH_DELAY_MS = 2500;
    // Refresh Zoho profile (cards, pricebook, tax) for all customers with Zoho ID
    const customersWithZoho = await Customer.findAll({ where: { zohoId: { [Op.ne]: null } } });
    let profilesRefreshed = 0;
    for (let i = 0; i < customersWithZoho.length; i += PROFILE_CONCURRENCY) {
      const batch = customersWithZoho.slice(i, i + PROFILE_CONCURRENCY);
      const results = await Promise.all(batch.map((c) => refreshCustomerProfileFromZoho(c)));
      profilesRefreshed += results.filter(Boolean).length;
      if (i + PROFILE_CONCURRENCY < customersWithZoho.length) {
        await new Promise((r) => setTimeout(r, ZOHO_BATCH_DELAY_MS));
      }
    }
    // Refresh Auth.net payment info for all customers (skips those without email)
    const allCustomers = await Customer.findAll();
    let authNetRefreshed = 0;
    for (let i = 0; i < allCustomers.length; i += PROFILE_CONCURRENCY) {
      const batch = allCustomers.slice(i, i + PROFILE_CONCURRENCY);
      const results = await Promise.all(batch.map((c) => refreshCustomerPaymentFromAuthNet(c)));
      authNetRefreshed += results.filter(Boolean).length;
    }
    res.json({ 
      success: result.success,
      message: result.message,
      data: {
        stats: result.stats,
        profilesRefreshed,
        authNetPaymentRefreshed: authNetRefreshed
      }
    });
  } catch (err) {
    logError('Customer sync error', err);
    const errorMessage = err?.message || String(err);
    res.status(500).json({ 
      success: false,
      message: 'Customer sync failed',
      error: errorMessage
    });
  }
};

export const syncZohoItems = async (req, res) => {
  try {
    const zohoItems = await syncItemsFromZoho();
    
    let created = 0;
    let updated = 0;

    for (const zohoItem of zohoItems) {
      const unit = extractUnitFromZohoItem(zohoItem);
      
      const [item, isNew] = await Item.upsert({
        zohoId: zohoItem.item_id,
        name: zohoItem.name,
        sku: zohoItem.sku || null,
        description: zohoItem.description || null,
        price: parseFloat(zohoItem.rate) || 0,
        taxId: zohoItem.tax_id || null,
        taxName: zohoItem.tax_name || null,
        taxPercentage: parseFloat(zohoItem.tax_percentage) || 0,
        unit: unit,
        isActive: zohoItem.status === 'active',
        lastSyncedAt: new Date()
      }, {
        returning: true
      });

      // Ensure we have the item with ID
      const itemWithId = item.id ? item : await Item.findOne({ where: { zohoId: zohoItem.item_id } });
      
      if (!itemWithId || !itemWithId.id) {
        logError(`Failed to get item ID for "${zohoItem.name}" (Zoho ID: ${zohoItem.item_id})`);
        continue;
      }

      // Sync unit of measure if present
      if (unit) {
        await syncItemUnitOfMeasure(itemWithId, zohoItem);
      }

      if (isNew) created++;
      else updated++;
    }

    // Clear pricebook cache so POS shows updated item prices/names
    await PricebookCache.destroy({ where: {} });

    res.json({ 
      success: true,
      message: 'Items synced successfully',
      data: {
        stats: { total: zohoItems.length, created, updated }
      }
    });
  } catch (err) {
    logError('Item sync error', err);
    const isDevelopment = process.env.NODE_ENV === 'development';
    res.status(500).json({ 
      success: false,
      message: 'Item sync failed',
      ...(isDevelopment && { error: err.message })
    });
  }
};

/**
 * Core Zoho sync logic (customers + items + clear pricebook cache).
 * Used by both manual sync (syncAll) and background auto-sync.
 * @returns {{ success: boolean, data?: object, error?: string }}
 */
export const runZohoSyncCore = async () => {
  const [customerResult, zohoItems] = await Promise.all([
    syncCustomersToDatabase({ replaceAll: true }),
    syncItemsFromZoho()
  ]);

  let customersCreated = customerResult?.stats?.created || 0;
  let customersUpdated = customerResult?.stats?.updated || 0;
  let itemsCreated = 0;
  let itemsUpdated = 0;

  for (const zohoItem of zohoItems) {
    const unit = extractUnitFromZohoItem(zohoItem);

    const [item, isNew] = await Item.upsert({
      zohoId: zohoItem.item_id,
      name: zohoItem.name,
      sku: zohoItem.sku || null,
      description: zohoItem.description || null,
      price: parseFloat(zohoItem.rate) || 0,
      taxId: zohoItem.tax_id || null,
      taxName: zohoItem.tax_name || null,
      taxPercentage: parseFloat(zohoItem.tax_percentage) || 0,
      unit: unit,
      isActive: zohoItem.status === 'active',
      lastSyncedAt: new Date()
    }, {
      returning: true
    });

    const itemWithId = item.id ? item : await Item.findOne({ where: { zohoId: zohoItem.item_id } });
    if (!itemWithId || !itemWithId.id) {
      logError(`Failed to get item ID for "${zohoItem.name}" (Zoho ID: ${zohoItem.item_id})`);
      continue;
    }
    if (unit) {
      await syncItemUnitOfMeasure(itemWithId, zohoItem);
    }
    if (isNew) itemsCreated++;
    else itemsUpdated++;
  }

  await PricebookCache.destroy({ where: {} });

  return {
    success: true,
    data: {
      customers: { total: customerResult?.stats?.total || 0, created: customersCreated, updated: customersUpdated },
      items: { total: zohoItems.length, created: itemsCreated, updated: itemsUpdated }
    }
  };
};

export const syncAll = async (req, res) => {
  try {
    const result = await runZohoSyncCore();
    res.json({
      success: result.success,
      message: 'Zoho data synced successfully',
      data: result.data
    });
  } catch (err) {
    logError('Zoho sync error', err);
    const isDevelopment = process.env.NODE_ENV === 'development';
    res.status(500).json({
      success: false,
      message: 'Zoho sync failed',
      ...(isDevelopment && { error: err.message })
    });
  }
};

export const getOrganization = async (req, res) => {
  try {
    const organizations = await getOrganizationDetails();
    res.json({ 
      success: true,
      data: { organizations }
    });
  } catch (err) {
    logError('Get organization error', err);
    const isDevelopment = process.env.NODE_ENV === 'development';
    res.status(500).json({ 
      success: false,
      message: 'Failed to get organization',
      ...(isDevelopment && { error: err.message })
    });
  }
};

export const getTaxRatesList = async (req, res) => {
  try {
    // Try without filter first, then with filter if needed
    // The API documentation doesn't show filter_by parameter
    let taxes = await getTaxRates();
    
    // If no taxes found, try with active filter
    if (taxes.length === 0) {
      taxes = await getTaxRates({ filter_by: 'Status.Active' });
    }
    
    res.json({ 
      success: true,
      data: { taxes }
    });
  } catch (err) {
    logError('Get tax rates error', err);
    logError('Error details', {
      message: err.message,
      response: err.response?.data,
      status: err.response?.status
    });
    
    const isDevelopment = process.env.NODE_ENV === 'development';
    res.status(500).json({ 
      success: false,
      message: 'Failed to fetch tax rates',
      ...(isDevelopment && { 
        error: err.message,
        details: err.response?.data 
      })
    });
  }
};

export const getLocationsList = async (req, res) => {
  try {
    const locations = await getLocations();
    
    // Map locations to include only relevant fields for frontend
    const mappedLocations = locations.map(location => ({
      locationId: location.location_id || location.id,
      locationName: location.location_name || location.name,
      status: location.status || 'active',
      isPrimary: location.is_primary || false,
      type: location.type || null,
      email: location.email || null,
      phone: location.phone || null,
      address: location.address || null
    }));
    
    res.json({ 
      success: true,
      data: { locations: mappedLocations }
    });
  } catch (err) {
    logError('Get locations error', err);
    logError('Error details', {
      message: err.message,
      response: err.response?.data,
      status: err.response?.status
    });
    
    const isDevelopment = process.env.NODE_ENV === 'development';
    res.status(500).json({ 
      success: false,
      message: 'Failed to fetch locations',
      ...(isDevelopment && { 
        error: err.message,
        details: err.response?.data 
      })
    });
  }
};

export const getCustomerOpenSalesOrders = async (req, res) => {
  try {
    const { customer_id } = req.query;
    
    if (!customer_id) {
      return sendError(res, 'Customer ID (customer_id) is required', 400);
    }
    
    const salesOrders = await getOpenSalesOrders(customer_id);
    
    // Map sales orders to include only relevant fields for frontend
    const mappedSalesOrders = salesOrders.map(so => ({
      salesorder_id: so.salesorder_id || so.id,
      salesorder_number: so.salesorder_number || so.order_number,
      date: so.date,
      customer_id: so.customer_id,
      customer_name: so.customer_name,
      total: so.total || 0,
      status: so.status || so.order_status,
      reference_number: so.reference_number,
      line_items_count: so.line_items?.length || 0
    }));
    
    res.json({ 
      success: true,
      data: { salesOrders: mappedSalesOrders }
    });
  } catch (err) {
    logError('Get customer open sales orders error', err);
    const isDevelopment = process.env.NODE_ENV === 'development';
    res.status(500).json({ 
      success: false,
      message: 'Failed to fetch open sales orders',
      ...(isDevelopment && { 
        error: err.message,
        details: err.response?.data 
      })
    });
  }
};

export const getSalesOrderDetails = async (req, res) => {
  try {
    const { salesorder_id } = req.params;
    
    if (!salesorder_id) {
      return sendError(res, 'Sales order ID is required', 400);
    }
    
    const salesOrder = await getSalesOrderById(salesorder_id);
    
    if (!salesOrder) {
      return sendError(res, 'Sales order not found', 404);
    }
    
    res.json({ 
      success: true,
      data: { salesOrder }
    });
  } catch (err) {
    logError('Get sales order details error', err);
    const isDevelopment = process.env.NODE_ENV === 'development';
    res.status(500).json({ 
      success: false,
      message: 'Failed to fetch sales order details',
      ...(isDevelopment && { 
        error: err.message,
        details: err.response?.data 
      })
    });
  }
};

export const getCustomerInvoicesList = async (req, res) => {
  try {
    const { customer_id, status } = req.query;
    
    if (!customer_id) {
      return sendError(res, 'Customer ID (customer_id) is required', 400);
    }
    
    // Default to 'unpaid' status if not specified
    const invoiceStatus = status || 'unpaid';
    
    const invoices = await getCustomerInvoices(customer_id, invoiceStatus);
    
    // Map invoices to include only relevant fields for frontend
    const mappedInvoices = invoices.map(inv => ({
      invoice_id: inv.invoice_id || inv.id,
      invoice_number: inv.invoice_number,
      date: inv.date,
      due_date: inv.due_date,
      customer_id: inv.customer_id,
      customer_name: inv.customer_name,
      total: inv.total || 0,
      balance: inv.balance || 0,
      status: inv.status,
      reference_number: inv.reference_number,
      line_items_count: inv.line_items?.length || 0
    }));
    
    res.json({ 
      success: true,
      data: { invoices: mappedInvoices }
    });
  } catch (err) {
    logError('Get customer invoices error', err);
    const isDevelopment = process.env.NODE_ENV === 'development';
    res.status(500).json({ 
      success: false,
      message: 'Failed to fetch invoices',
      ...(isDevelopment && { 
        error: err.message,
        details: err.response?.data 
      })
    });
  }
};

export const getInvoiceDetails = async (req, res) => {
  try {
    const { invoice_id } = req.params;
    
    if (!invoice_id) {
      return sendError(res, 'Invoice ID is required', 400);
    }
    
    const invoice = await getInvoiceById(invoice_id);
    
    if (!invoice) {
      return sendError(res, 'Invoice not found', 404);
    }
    
    res.json({ 
      success: true,
      data: { invoice }
    });
  } catch (err) {
    logError('Get invoice details error', err);
    const isDevelopment = process.env.NODE_ENV === 'development';
    res.status(500).json({ 
      success: false,
      message: 'Failed to fetch invoice details',
      ...(isDevelopment && { 
        error: err.message,
        details: err.response?.data 
      })
    });
  }
};

/**
 * Sync a single customer from Zoho Books by contact ID.
 * Used by webhook when a new contact is created in Zoho.
 * @param {string} contactId - Zoho contact_id
 * @returns {{ success: boolean, created?: boolean, skipped?: boolean, error?: string }}
 */
export const syncSingleCustomerFromZoho = async (contactId) => {
  if (!contactId) {
    return { success: false, error: 'contact_id is required' };
  }
  try {
    const zohoCustomer = await getCustomerById(contactId);
    if (!zohoCustomer) {
      return { success: false, error: 'Contact not found in Zoho' };
    }
    const contactType = (zohoCustomer.contact_type || 'customer').toLowerCase();
    if (contactType !== 'customer') {
      return { success: true, skipped: true, reason: `Contact type "${contactType}" is not a customer` };
    }
    const location = extractLocation(zohoCustomer);
    const paymentMethod = extractPaymentMethod(zohoCustomer);
    const [customer, isNew] = await Customer.upsert({
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
    return { success: true, created: !!isNew };
  } catch (err) {
    logError('Sync single customer from Zoho error', err);
    return { success: false, error: err?.message || String(err) };
  }
};

/**
 * Webhook handler for Zoho Books Workflow Rules.
 * Configure in Zoho: Settings → Workflow Rules → Contacts → On Create → Webhook.
 * POST to this URL with Default Payload (JSON). Optionally set ZOHO_WEBHOOK_SECRET
 * and add it as a header (X-Zoho-Webhook-Secret) or query param for verification.
 */
export const handleZohoCustomerWebhook = async (req, res) => {
  try {
    const secret = process.env.ZOHO_WEBHOOK_SECRET;
    if (secret) {
      const headerSecret = req.headers['x-zoho-webhook-secret'];
      const querySecret = req.query?.secret;
      if (headerSecret !== secret && querySecret !== secret) {
        logError('Zoho webhook: invalid or missing secret');
        return res.status(401).json({ success: false, error: 'Unauthorized' });
      }
    }
    const body = req.body || {};
    const contactId = body.contact_id ?? body.contact?.contact_id ?? body.id;
    if (!contactId) {
      logError('Zoho webhook: missing contact_id in payload', { bodyKeys: Object.keys(body) });
      return res.status(400).json({ success: false, error: 'contact_id is required' });
    }
    const result = await syncSingleCustomerFromZoho(String(contactId));
    if (!result.success) {
      return res.status(500).json({ success: false, error: result.error });
    }
    if (result.skipped) {
      return res.json({ success: true, skipped: true, reason: result.reason });
    }
    const customer = await Customer.findOne({ where: { zohoId: String(contactId) } });
    if (customer) {
      await refreshCustomerProfileFromZoho(customer).catch(() => {});
    }
    res.json({
      success: true,
      created: result.created,
      contactId: String(contactId)
    });
  } catch (err) {
    logError('Zoho webhook error', err);
    res.status(500).json({ success: false, error: err?.message || 'Webhook failed' });
  }
};

/**
 * Webhook handler for Zoho Books Workflow Rules - Contact Deleted.
 * Configure in Zoho: Settings → Workflow Rules → Contacts → On Delete → Webhook.
 * Soft-deletes the customer in DB (sets isActive: false) to preserve sales history.
 */
export const handleZohoCustomerDeletedWebhook = async (req, res) => {
  try {
    const secret = process.env.ZOHO_WEBHOOK_SECRET;
    if (secret) {
      const headerSecret = req.headers['x-zoho-webhook-secret'];
      const querySecret = req.query?.secret;
      if (headerSecret !== secret && querySecret !== secret) {
        logError('Zoho webhook (delete): invalid or missing secret');
        return res.status(401).json({ success: false, error: 'Unauthorized' });
      }
    }
    const body = req.body || {};
    const contactId = body.contact_id ?? body.contact?.contact_id ?? body.id;
    if (!contactId) {
      logError('Zoho webhook (delete): missing contact_id in payload', { bodyKeys: Object.keys(body) });
      return res.status(400).json({ success: false, error: 'contact_id is required' });
    }
    const customer = await Customer.findOne({ where: { zohoId: String(contactId) } });
    if (!customer) {
      return res.json({ success: true, message: 'Customer not found in DB (already removed or never synced)' });
    }
    await customer.update({ isActive: false, status: 'inactive' });
    logInfo(`Customer ${contactId} (${customer.contactName}) marked inactive from Zoho delete webhook`);
    res.json({
      success: true,
      contactId: String(contactId),
      message: 'Customer marked inactive'
    });
  } catch (err) {
    logError('Zoho webhook (delete) error', err);
    res.status(500).json({ success: false, error: err?.message || 'Webhook failed' });
  }
};

export const organizeZohoSalesOrdersFuelSurcharge = async (req, res) => {
  try {
    const {
      filter_by,
      sort_column,
      sort_order,
      search_text,
      maxOrders,
      dryRun,
      fuelItemName
    } = req.body || {};

    const result = await organizeZohoSalesOrdersFuelSurchargeService({
      filter_by,
      sort_column,
      sort_order,
      search_text,
      maxOrders,
      dryRun,
      fuelItemName
    });

    return sendSuccess(res, { result }, 'Zoho sales orders organized successfully');
  } catch (err) {
    logError('Organize Zoho sales orders (fuel surcharge) error', err);
    const isDevelopment = process.env.NODE_ENV === 'development';
    return res.status(500).json({
      success: false,
      message: 'Failed to organize Zoho sales orders',
      ...(isDevelopment && {
        error: err.message,
        details: err.response?.data
      })
    });
  }
};
