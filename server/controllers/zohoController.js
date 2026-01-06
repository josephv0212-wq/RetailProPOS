import { syncCustomersFromZoho, syncItemsFromZoho, getOrganizationDetails, getCustomerById, getTaxRates, getLocations } from '../services/zohoService.js';
import { Customer, Item } from '../models/index.js';

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
export const syncCustomersToDatabase = async () => {
  try {
    const zohoCustomers = await syncCustomersFromZoho();
    
    let created = 0;
    let updated = 0;

    for (const zohoCustomer of zohoCustomers) {
      const contactType = (zohoCustomer.contact_type || 'customer').toLowerCase();
      if (contactType !== 'customer') {
        continue;
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
        lastSyncedAt: new Date()
      });

      if (isNew) created++;
      else updated++;
    }

    return {
      success: true,
      message: 'Customers synced successfully',
      stats: { total: zohoCustomers.length, created, updated }
    };
  } catch (err) {
    console.error('Customer sync error:', err);
    throw err;
  }
};

export const syncZohoCustomers = async (req, res) => {
  try {
    const result = await syncCustomersToDatabase();
    res.json({ 
      success: result.success,
      message: result.message,
      data: {
        stats: result.stats
      }
    });
  } catch (err) {
    console.error('Customer sync error:', err);
    const isDevelopment = process.env.NODE_ENV === 'development';
    res.status(500).json({ 
      success: false,
      message: 'Customer sync failed',
      ...(isDevelopment && { error: err.message })
    });
  }
};

export const syncZohoItems = async (req, res) => {
  try {
    const zohoItems = await syncItemsFromZoho();
    
    let created = 0;
    let updated = 0;

    for (const zohoItem of zohoItems) {
      const [item, isNew] = await Item.upsert({
        zohoId: zohoItem.item_id,
        name: zohoItem.name,
        sku: zohoItem.sku || null,
        description: zohoItem.description || null,
        price: parseFloat(zohoItem.rate) || 0,
        taxId: zohoItem.tax_id || null,
        taxName: zohoItem.tax_name || null,
        taxPercentage: parseFloat(zohoItem.tax_percentage) || 0,
        unit: zohoItem.unit || null,
        isActive: zohoItem.status === 'active',
        lastSyncedAt: new Date()
      });

      if (isNew) created++;
      else updated++;
    }

    res.json({ 
      success: true,
      message: 'Items synced successfully',
      data: {
        stats: { total: zohoItems.length, created, updated }
      }
    });
  } catch (err) {
    console.error('Item sync error:', err);
    const isDevelopment = process.env.NODE_ENV === 'development';
    res.status(500).json({ 
      success: false,
      message: 'Item sync failed',
      ...(isDevelopment && { error: err.message })
    });
  }
};

export const syncAll = async (req, res) => {
  try {
    const [zohoCustomers, zohoItems] = await Promise.all([
      syncCustomersFromZoho(),
      syncItemsFromZoho()
    ]);

    let customersCreated = 0;
    let customersUpdated = 0;
    let itemsCreated = 0;
    let itemsUpdated = 0;

    for (const zohoCustomer of zohoCustomers) {
      const location = extractLocation(zohoCustomer);
      const paymentMethod = extractPaymentMethod(zohoCustomer);
      
      const [customer, isNew] = await Customer.upsert({
        zohoId: zohoCustomer.contact_id,
        contactName: zohoCustomer.contact_name,
        companyName: zohoCustomer.company_name || null,
        email: zohoCustomer.email || null,
        phone: zohoCustomer.phone || null,
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

      if (isNew) customersCreated++;
      else customersUpdated++;
    }

    for (const zohoItem of zohoItems) {
      const [item, isNew] = await Item.upsert({
        zohoId: zohoItem.item_id,
        name: zohoItem.name,
        sku: zohoItem.sku || null,
        description: zohoItem.description || null,
        price: parseFloat(zohoItem.rate) || 0,
        taxId: zohoItem.tax_id || null,
        taxName: zohoItem.tax_name || null,
        taxPercentage: parseFloat(zohoItem.tax_percentage) || 0,
        unit: zohoItem.unit || null,
        isActive: zohoItem.status === 'active',
        lastSyncedAt: new Date()
      });

      if (isNew) itemsCreated++;
      else itemsUpdated++;
    }

    res.json({
      success: true,
      message: 'Zoho data synced successfully',
      data: {
        customers: { total: zohoCustomers.length, created: customersCreated, updated: customersUpdated },
        items: { total: zohoItems.length, created: itemsCreated, updated: itemsUpdated }
      }
    });
  } catch (err) {
    console.error('Zoho sync error:', err);
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
    console.error('Get organization error:', err);
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
    console.error('❌ Get tax rates error:', err);
    console.error('   Error details:', {
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
    console.error('❌ Get locations error:', err);
    console.error('   Error details:', {
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

