import { Op } from 'sequelize';
import { Sale, SaleItem, Item, Customer, InvoicePayment, User } from '../models/index.js';
import { sequelize } from '../config/db.js';
import { processPayment, processAchPayment, processOpaqueDataPayment, calculateCreditCardFee, chargeCustomerProfile, getCustomerProfileDetails, extractPaymentProfiles, createCustomerProfileFromTransaction } from '../services/authorizeNetService.js';
import { createSalesReceipt, emailSalesReceipt, getCustomerById as getZohoCustomerById, getZohoTaxIdForPercentage, voidSalesReceipt, createCustomerPayment, createProcessingFeeJournal, createInvoice } from '../services/zohoService.js';
import { printReceipt } from '../services/printerService.js';
import { sendSuccess, sendError, sendNotFound, sendValidationError } from '../utils/responseHelper.js';

// Authorize.Net invoiceNumber has strict limits (max 20 chars). Zoho document numbers can exceed this.
// Normalize to a safe, short identifier while keeping type prefix + uniqueness.
const normalizeAuthorizeNetInvoiceNumber = ({ type, number, id }) => {
  const prefix = type === 'salesorder' ? 'SO' : 'INV';
  const raw = `${number ?? ''}`;
  // Allow only simple characters to avoid gateway validation errors.
  const cleaned = raw.trim().replace(/[^A-Za-z0-9\-_]/g, '');
  const fallback = `${prefix}-${Date.now()}`;
  const keepPrefix = `${prefix}-`;
  const maxLen = 20;
  const tailLen = maxLen - keepPrefix.length;
  const tailSource = (cleaned && cleaned.length > 0 ? cleaned : `${id ?? ''}`.replace(/[^A-Za-z0-9]/g, '')) || fallback;
  const tail = tailSource.length > tailLen ? tailSource.slice(-tailLen) : tailSource;
  const out = `${keepPrefix}${tail}`;
  return out.length > maxLen ? out.slice(0, maxLen) : out;
};

// Best-effort loader for legacy "transactions" SQLite tables.
// This keeps the Reports > Transactions tab working when older installs stored history
// in a separate SQLite schema/table rather than the current Sequelize `Sale` table.
const fetchLegacyTransactionsForReports = async ({ locationId, startDate, endDate }) => {
  try {
    if (sequelize.getDialect() !== 'sqlite') return [];

    // Enumerate tables and look for any "transaction*" table names.
    const [tables] = await sequelize.query(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    );

    const tableNames = (tables || [])
      .map(t => t?.name)
      .filter(Boolean)
      .filter(name => typeof name === 'string')
      .filter(name => /transaction/i.test(name))
      // avoid Sequelize internals if any
      .filter(name => name !== 'SequelizeMeta')
      // safety: only allow simple identifiers
      .filter(name => /^[A-Za-z0-9_]+$/.test(name));

    if (tableNames.length === 0) return [];

    const toNumberOrZero = (v) => {
      const n = typeof v === 'string' ? parseFloat(v) : Number(v);
      return Number.isFinite(n) ? n : 0;
    };

    const normalizePaymentType = (v) => {
      const s = String(v || '').toLowerCase().trim();
      if (s === 'cash' || s === 'zelle' || s === 'ach') return s;
      if (s === 'credit_card' || s === 'debit_card' || s === 'credit' || s === 'cc' || s === 'card' || s === 'creditcard' || s === 'debit' || s === 'debitcard') return 'card';
      return 'cash';
    };

    const parseDate = (v) => {
      if (!v) return null;
      if (v instanceof Date) return v;
      // handle numeric epoch seconds/ms
      if (typeof v === 'number') {
        const ms = v > 1e12 ? v : v * 1000;
        const d = new Date(ms);
        return Number.isNaN(d.getTime()) ? null : d;
      }
      const s = String(v);
      // numeric string
      if (/^\d+$/.test(s)) {
        const num = parseInt(s, 10);
        const ms = num > 1e12 ? num : num * 1000;
        const d = new Date(ms);
        return Number.isNaN(d.getTime()) ? null : d;
      }
      const d = new Date(s);
      return Number.isNaN(d.getTime()) ? null : d;
    };

    const start = startDate ? new Date(startDate) : null;
    const end = endDate ? new Date(endDate) : null;

    const results = [];

    for (const tableName of tableNames) {
      // Inspect columns to build a best-effort mapping.
      const [cols] = await sequelize.query(`PRAGMA table_info(${tableName})`);
      const colNames = (cols || []).map(c => c?.name).filter(Boolean);
      const byLower = new Map(colNames.map(n => [String(n).toLowerCase(), n]));

      const pick = (...candidates) => {
        for (const c of candidates) {
          const found = byLower.get(String(c).toLowerCase());
          if (found) return found;
        }
        return null;
      };

      const idCol = pick('id', 'transaction_id', 'transactionid', 'rowid');
      const txnCol = pick('transactionid', 'transaction_id', 'transaction', 'txn', 'txnid', 'reference', 'ref', 'receipt', 'receipt_number');
      const dateCol = pick('createdat', 'created_at', 'date', 'timestamp', 'time', 'created');
      const paymentCol = pick('paymenttype', 'payment_type', 'type', 'method');
      const subtotalCol = pick('subtotal', 'sub_total', 'amount_subtotal', 'net');
      const taxCol = pick('taxamount', 'tax_amount', 'tax', 'sales_tax');
      const feeCol = pick('ccfee', 'cc_fee', 'fee', 'processing_fee', 'convenience_fee');
      const totalCol = pick('total', 'amount', 'grand_total');
      const locationCol = pick('locationid', 'location_id', 'location');

      // Load rows, filtered if we can.
      const whereParts = [];
      if (locationId && locationCol) whereParts.push(`"${locationCol}" = :locationId`);
      if (dateCol && start) whereParts.push(`"${dateCol}" >= :startDate`);
      if (dateCol && end) whereParts.push(`"${dateCol}" <= :endDate`);

      const whereSql = whereParts.length ? ` WHERE ${whereParts.join(' AND ')}` : '';
      const [rows] = await sequelize.query(`SELECT * FROM "${tableName}"${whereSql}`, {
        replacements: {
          locationId,
          startDate: start ? start.toISOString() : undefined,
          endDate: end ? end.toISOString() : undefined
        }
      });

      for (const row of rows || []) {
        const createdAt = parseDate(dateCol ? row?.[dateCol] : null) || new Date(0);
        const transactionId = txnCol ? row?.[txnCol] : null;
        const legacyIdVal = idCol ? row?.[idCol] : null;

        // Shape it like a `Sale` row so the existing frontend mapping works unchanged.
        results.push({
          id: typeof legacyIdVal === 'number' ? legacyIdVal : Number(legacyIdVal) || 0,
          transactionId: transactionId ? String(transactionId) : `LEGACY-${tableName}-${legacyIdVal ?? createdAt.getTime()}`,
          createdAt: createdAt.toISOString(),
          paymentType: normalizePaymentType(paymentCol ? row?.[paymentCol] : null),
          subtotal: toNumberOrZero(subtotalCol ? row?.[subtotalCol] : null).toFixed(2),
          taxAmount: toNumberOrZero(taxCol ? row?.[taxCol] : null).toFixed(2),
          ccFee: toNumberOrZero(feeCol ? row?.[feeCol] : null).toFixed(2),
          total: toNumberOrZero(totalCol ? row?.[totalCol] : null).toFixed(2),
          locationId: (locationCol ? String(row?.[locationCol] || '') : String(locationId || '')) || String(locationId || ''),
          locationName: null,
          customerId: null,
          zohoCustomerId: null,
          userId: null,
          syncedToZoho: false,
          zohoSalesReceiptId: null,
          cancelledInZoho: false,
          syncError: null,
          notes: null,
          items: [],
          customer: null,
          user: null,
          // keep updatedAt for completeness
          updatedAt: createdAt.toISOString()
        });
      }
    }

    return results;
  } catch (e) {
    // Never break reports if legacy parsing fails.
    return [];
  }
};

// Normalize a user's tax percentage, trying location name (e.g., "Miami Dade Sales Tax (7%)")
// before falling back to the default. Keeps server-side calc in sync with UI/Zoho.
const resolveTaxPercentage = (user) => {
  const direct = parseFloat(user?.taxPercentage);
  if (!Number.isNaN(direct) && Number.isFinite(direct)) {
    return direct;
  }

  const locationName = user?.locationName || '';
  const match = locationName.match(/(\d+(?:\.\d+)?)\s*%/);
  if (match) {
    const fromName = parseFloat(match[1]);
    if (!Number.isNaN(fromName) && Number.isFinite(fromName)) {
      return fromName;
    }
  }

  return 7.5;
};

export const createSale = async (req, res) => {
  try {
    const { 
      items, 
      customerId, 
      paymentType: requestPaymentType, 
      paymentDetails, 
      notes, 
      useValorApi, 
      useOpaqueData, 
      useBluetoothReader, 
      bluetoothPayload, 
      opaqueDataPayload, 
      customerTaxPreference, 
      useStoredPayment, 
      paymentProfileId, 
      terminalNumber, 
      valorTransactionId, 
      useStandaloneMode,
      // When true (or when paymentDetails.savePaymentMethod is true), we will create/update
      // an Authorize.Net CIM profile for the customer using the successful transaction.
      savePaymentMethod,
      // When true, Zoho Books will email the sales receipt to the customer.
      emailReceiptToCustomer
    } = req.body;
    // #region agent log
    fetch('http://127.0.0.1:1024/ingest/d43f1d4c-4d33-4f77-a4e3-9e9d56debc45',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'salesController.js:createSale entry',message:'createSale request',data:{paymentType:requestPaymentType,itemsCount:(items||[]).length,customerId:customerId||null,useStoredPayment:!!useStoredPayment,useValorApi:!!useValorApi,useStandaloneMode:!!(useStandaloneMode||paymentDetails?.useStandaloneMode)},timestamp:Date.now(),hypothesisId:'H1'})}).catch(()=>{});
    // #endregion
    let paymentType = requestPaymentType;
    // Merge debit_card into card: store and process as single "card" type
    if (paymentType === 'debit_card') paymentType = 'card';
    // Backward compatibility: normalize credit_card to card
    if (paymentType === 'credit_card') paymentType = 'card';

    // Support useStandaloneMode from root level OR from paymentDetails (for backward compatibility)
    const isStandaloneMode = useStandaloneMode === true || paymentDetails?.useStandaloneMode === true;
    const userId = req.user.id;
    const locationId = req.user.locationId;
    const locationName = req.user.locationName;

    // Check if customer is tax exempt
    const isTaxExempt = customerTaxPreference === 'SALES TAX EXCEPTION CERTIFICATE';
    
    // Get user's tax percentage from their location (including "(7%)" naming), default to 7.5%
    // But set to 0 if customer is tax exempt
    const userTaxPercentage = isTaxExempt ? 0 : resolveTaxPercentage(req.user);
    const taxRate = userTaxPercentage / 100;

    // Use user's zohoTaxId from DB for Zoho sales receipt tax_id (required for correct tax).
    // Fetch fresh from DB in case user updated zohoTaxId in Settings after login.
    let userZohoTaxId = null;
    const currentUser = await User.findByPk(req.user.id, { attributes: ['zohoTaxId'] });
    userZohoTaxId = currentUser?.zohoTaxId ? String(currentUser.zohoTaxId).trim() : null;
    if (!userZohoTaxId && !isTaxExempt && userTaxPercentage > 0) {
      try {
        userZohoTaxId = await getZohoTaxIdForPercentage(userTaxPercentage);
        if (!userZohoTaxId) {
          console.warn(`⚠️ No Zoho tax_id. Set zohoTaxId in User/Settings (e.g. 460000000017094 for 7.5%) for correct tax in Zoho.`);
        }
      } catch (taxLookupErr) {
        console.warn(`⚠️ Failed to lookup Zoho tax_id for ${userTaxPercentage}%: ${taxLookupErr.message}`);
      }
    }
    

    // Validation is now handled by middleware, but keep as backup
    if (!items || items.length === 0) {
      return sendValidationError(res, 'Sale must include at least one item');
    }

    let subtotal = 0;
    let taxAmount = 0;
    const saleItemsData = [];

    // Optimize: Fetch all items in a single query instead of N+1 queries
    const itemIds = items.map(saleItem => saleItem.itemId);
    const dbItems = await Item.findAll({
      where: { id: { [Op.in]: itemIds } }
    });
    
    // Create a map for O(1) lookup
    const itemsMap = new Map(dbItems.map(item => [item.id, item]));

    for (const saleItem of items) {
      const item = itemsMap.get(saleItem.itemId);
      
      if (!item) {
        return sendNotFound(res, `Item ${saleItem.itemId}`);
      }

      const quantity = parseFloat(saleItem.quantity) || 1;
      // Use provided price override (for UM conversions) or fall back to database price
      const price = saleItem.price !== undefined ? parseFloat(saleItem.price) : parseFloat(item.price);
      const lineSubtotal = price * quantity;
      // Use user's location tax rate instead of item's tax percentage
      const itemTax = lineSubtotal * taxRate;
      
      subtotal += lineSubtotal;
      taxAmount += itemTax;

      // Include selectedUM if provided
      const selectedUM = saleItem.selectedUM || null;
      const itemNameWithUM = selectedUM ? `${item.name} (${selectedUM})` : item.name;
      
      saleItemsData.push({
        itemId: item.id,
        zohoItemId: item.zohoId,
        itemName: itemNameWithUM,
        quantity: quantity,
        price: price,
        taxPercentage: userTaxPercentage, // Use user's location tax rate
        taxAmount: itemTax,
        lineTotal: lineSubtotal + itemTax,
        // Send the user's/location tax_id for taxable line items, so Zoho uses the correct tax rule.
        taxId: userTaxPercentage > 0 ? (userZohoTaxId || null) : null,
        selectedUM: selectedUM // Store selectedUM for Zoho sync
      });
    }

    const customer = customerId ? await Customer.findByPk(customerId) : null;
    
    let zohoContactType = customer?.contactType?.toLowerCase() || null;
    let zohoCustomerDetails = null;
    let customerLocation = null; // Customer's location from Zoho (place_of_contact) - used to enforce correct tax rate
    if (customer?.zohoId) {
      try {
        zohoCustomerDetails = await getZohoCustomerById(customer.zohoId);
        const fetchedContactType = zohoCustomerDetails?.contact_type?.toLowerCase();
        if (fetchedContactType) {
          zohoContactType = fetchedContactType;
          if (customer.contactType !== fetchedContactType) {
            await customer.update({ contactType: fetchedContactType });
          }
        }
        
        // Extract customer's location (place_of_contact) from Zoho to enforce correct tax rate
        // Zoho uses place_of_contact to determine which tax rate to apply
        if (zohoCustomerDetails) {
          // First check custom_fields for location
          if (zohoCustomerDetails.custom_fields && Array.isArray(zohoCustomerDetails.custom_fields)) {
            const locationField = zohoCustomerDetails.custom_fields.find(
              field => field.label === 'location' || field.label === 'Location'
            );
            if (locationField?.value) {
              customerLocation = locationField.value;
            }
          }
          
          // Fall back to place_of_contact if no custom field found
          if (!customerLocation && zohoCustomerDetails.place_of_contact) {
            customerLocation = zohoCustomerDetails.place_of_contact;
          }
          
          if (customerLocation) {
            console.log(`📍 Customer has location in Zoho: ${customerLocation} (will use for sales receipt to enforce correct tax rate)`);
          }
        }
      } catch (contactTypeError) {
        console.warn(`⚠️ Unable to verify contact type for Zoho customer ${customer?.id}:`, contactTypeError.message);
      }
    }
    
    const baseTotal = subtotal + taxAmount;
    // For stored payment, we need to determine the type first to calculate fees correctly
    let actualPaymentType = paymentType;
    let cardProcessingFee = 0;
    
    if (useStoredPayment && paymentProfileId && customer) {
      // Determine payment type from profile to calculate correct fees
      let customerProfileId = customer.customerProfileId;
      
      if (!customerProfileId) {
        const searchCriteria = {
          name: customer.contactName,
          email: customer.email,
          merchantCustomerId: customer.zohoId
        };
        const profileResult = await getCustomerProfileDetails(searchCriteria);
        if (profileResult.success && profileResult.profile) {
          const profile = profileResult.profile;
          customerProfileId = Array.isArray(profile.customerProfileId)
            ? profile.customerProfileId[0]
            : profile.customerProfileId;
        }
      }
      
      if (customerProfileId) {
        const profileResult = await getCustomerProfileDetails({
          customerProfileId: customerProfileId
        });
        if (profileResult.success && profileResult.profile) {
          const paymentProfiles = extractPaymentProfiles(profileResult.profile);
          const selectedProfile = paymentProfiles.find(p => p.paymentProfileId === paymentProfileId);
          if (selectedProfile) {
            actualPaymentType = selectedProfile.type === 'ach' ? 'ach' : 'card'; // debit_card merged to card
          }
        }
      }
    }
    
    // 3% convenience fee for card only (not for ACH, including stored ACH)
    if (useStoredPayment && (paymentType === 'ach' || actualPaymentType === 'ach')) {
      cardProcessingFee = 0;
    } else {
      cardProcessingFee = actualPaymentType === 'card'
        ? calculateCreditCardFee(subtotal, taxAmount)
        : 0;
    }

    const total = baseTotal + cardProcessingFee;

    let transactionId = null;
    let paymentResult = null;

    // Standalone mode: Skip payment processing, just record the sale (works like cash payment)
    // This handles when cardReaderMode is 'standalone' - cashier processes payment manually on external card reader
    // IMPORTANT: This must be checked BEFORE any card payment processing logic
    if (isStandaloneMode && paymentType === 'card') {
      // No payment processing required - works exactly like cash payment
      // Cashier will manually process payment on external card reader after sale is recorded
      transactionId = `STANDALONE-${Date.now()}`;
      paymentResult = {
        success: true,
        message: 'Sale recorded. Payment to be processed manually on external card reader.',
        transactionId: transactionId
      };
      // Keep payment type as card; mark as manual card reader payment
      // The description will indicate "manual card reader payment" in the sale record
      // Do NOT process any card payment - skip all card processing logic below
      // #region agent log
      fetch('http://127.0.0.1:1024/ingest/d43f1d4c-4d33-4f77-a4e3-9e9d56debc45',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'salesController.js:payment branch',message:'payment branch=card_standalone',data:{paymentType:'card',transactionId},timestamp:Date.now(),hypothesisId:'H2'})}).catch(()=>{});
      // #endregion
    } else if (useStoredPayment && paymentProfileId && customer) {
      // #region agent log
      fetch('http://127.0.0.1:1024/ingest/d43f1d4c-4d33-4f77-a4e3-9e9d56debc45',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'salesController.js:stored payment branch',message:'entering stored payment',data:{customerId:customer.id,paymentProfileId,paymentProfileIdType:typeof paymentProfileId},timestamp:Date.now(),hypothesisId:'H4'})}).catch(()=>{});
      // #endregion
      // Stored payment method via Authorize.net CIM - use same logic as chargeInvoicesSalesOrders
      let customerProfileId = customer.customerProfileId;
      let customerPaymentProfileId = paymentProfileId;

      // If profile IDs are not stored, try to find them
      if (!customerProfileId) {
        const searchCriteria = {
          name: customer.contactName,
          email: customer.email,
          merchantCustomerId: customer.zohoId
        };

        const profileResult = await getCustomerProfileDetails(searchCriteria);
        
        if (!profileResult.success || !profileResult.profile) {
          return sendError(
            res,
            'Customer does not have a payment profile in Authorize.net. Please ensure the customer has a stored payment method in Authorize.net CIM.',
            400
          );
        }

        // Extract profile ID
        const profile = profileResult.profile;
        customerProfileId = Array.isArray(profile.customerProfileId)
          ? profile.customerProfileId[0]
          : profile.customerProfileId;

        if (!customerProfileId) {
          return sendError(
            res,
            'Could not retrieve customer profile ID from Authorize.net',
            400
          );
        }

        // Extract payment profiles
        const paymentProfiles = extractPaymentProfiles(profile);
        // #region agent log
        fetch('http://127.0.0.1:1024/ingest/d43f1d4c-4d33-4f77-a4e3-9e9d56debc45',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'salesController.js:after extractPaymentProfiles',message:'profile ids',data:{requestedId:paymentProfileId,requestedType:typeof paymentProfileId,profileIds:paymentProfiles.map(p=>({id:p.paymentProfileId,type:typeof p.paymentProfileId})),match:paymentProfiles.some(p=>p.paymentProfileId==paymentProfileId)},timestamp:Date.now(),hypothesisId:'H3'})}).catch(()=>{});
        // #endregion
        if (paymentProfiles.length === 0) {
          return sendError(
            res,
            'Customer does not have any payment profiles in Authorize.net. Please add a payment method first.',
            400
          );
        }

        // Verify that the requested payment profile exists
        const requestedProfile = paymentProfiles.find(p => p.paymentProfileId === paymentProfileId);
        
        if (!requestedProfile) {
          return sendError(
            res,
            `Payment profile ID ${paymentProfileId} not found for this customer. Available profiles: ${paymentProfiles.map(p => p.paymentProfileId).join(', ')}`,
            400
          );
        }

        // Store profile IDs in database for future use
        await customer.update({
          customerProfileId: customerProfileId.toString(),
          customerPaymentProfileId: paymentProfileId.toString()
        });
      } else {
        // Verify that the stored payment profile ID matches the requested one
        if (customer.customerPaymentProfileId !== paymentProfileId) {
          // Re-verify by fetching profile
          const profileResult = await getCustomerProfileDetails({
            customerProfileId: customerProfileId
          });
          
          if (profileResult.success && profileResult.profile) {
            const paymentProfiles = extractPaymentProfiles(profileResult.profile);
            const requestedProfile = paymentProfiles.find(p => p.paymentProfileId === paymentProfileId);
            
            if (!requestedProfile) {
              return sendError(
                res,
                `Payment profile ID ${paymentProfileId} not found for this customer`,
                400
              );
            }
          }
        }
      }

      // Charge using stored payment method
      // #region agent log
      fetch('http://127.0.0.1:1024/ingest/d43f1d4c-4d33-4f77-a4e3-9e9d56debc45',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'salesController.js:before chargeCustomerProfile',message:'charging',data:{customerProfileId,paymentProfileId,amount:total},timestamp:Date.now(),hypothesisId:'H5'})}).catch(()=>{});
      // #endregion
      paymentResult = await chargeCustomerProfile({
        customerProfileId,
        customerPaymentProfileId: paymentProfileId,
        amount: total,
        invoiceNumber: `POS-${Date.now()}`,
        description: `POS Sale - ${locationName}`
      });
      // #region agent log
      fetch('http://127.0.0.1:1024/ingest/d43f1d4c-4d33-4f77-a4e3-9e9d56debc45',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'salesController.js:after chargeCustomerProfile',message:'charge result',data:{success:paymentResult.success,error:paymentResult.error,transactionId:paymentResult.transactionId},timestamp:Date.now(),hypothesisId:'H5'})}).catch(()=>{});
      // #endregion
      if (!paymentResult.success) {
        return sendError(res, 'Stored payment processing failed', 400, paymentResult.error);
      }

      transactionId = paymentResult.transactionId;
      // Update paymentType to actual type determined from profile
      paymentType = actualPaymentType;
      // #region agent log
      fetch('http://127.0.0.1:1024/ingest/d43f1d4c-4d33-4f77-a4e3-9e9d56debc45',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'salesController.js:payment branch',message:'payment branch=card_stored',data:{paymentType,transactionId},timestamp:Date.now(),hypothesisId:'H2'})}).catch(()=>{});
      // #endregion
    } else if (paymentType === 'card') {
      // IMPORTANT: Double-check standalone mode - if enabled, skip all card processing
      if (isStandaloneMode) {
        // This should have been caught earlier, but add safety check here too
        transactionId = `STANDALONE-${Date.now()}`;
        paymentResult = {
          success: true,
          message: 'Sale recorded. Payment to be processed manually on external card reader.',
          transactionId: transactionId
        };
      } else {
        // Accept.js / opaqueData flow (preferred for PCI); keep legacy flags for backward compatibility.
        const usingOpaqueData = !!useOpaqueData || !!useBluetoothReader;
        const opaquePayload = opaqueDataPayload || bluetoothPayload;

        if (usingOpaqueData) {
          if (!opaquePayload || !opaquePayload.descriptor || !opaquePayload.value) {
            return sendValidationError(res, 'Encrypted card payload (opaqueData) is required for this payment method.');
          }

          paymentResult = await processOpaqueDataPayment({
            amount: total,
            opaqueData: {
              descriptor: opaquePayload.descriptor,
              value: opaquePayload.value
            },
            deviceSessionId: opaquePayload.sessionId,
            invoiceNumber: `POS-${Date.now()}`,
            description: `POS Sale - ${locationName}`
          });

          if (!paymentResult.success) {
            return sendError(res, 'Card payment processing failed', 400, paymentResult.error);
          }

          transactionId = paymentResult.transactionId;
          // #region agent log
          fetch('http://127.0.0.1:1024/ingest/d43f1d4c-4d33-4f77-a4e3-9e9d56debc45',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'salesController.js:payment branch',message:'payment branch=card_opaque',data:{paymentType:'card',transactionId},timestamp:Date.now(),hypothesisId:'H2'})}).catch(()=>{});
          // #endregion
        } else if (useValorApi) {
        // Valor API mode - payment already processed in frontend via Valor API (NO Authorize.Net)
        // Flow: Frontend -> Valor API -> VP100 Terminal -> Valor API -> Frontend -> Backend (record sale)
        // Payment is already completed, we just need to record the sale with the Valor transaction ID
        
        if (!valorTransactionId) {
          return sendError(res, 'Valor API transaction ID is required. Payment must be processed via Valor API first.', 400);
        }

        // Payment already processed successfully via Valor API in frontend
        // Use the Valor transaction ID as our transaction ID
        transactionId = valorTransactionId;
        
        // Create a success result to match the expected format
        paymentResult = {
          success: true,
          transactionId: valorTransactionId,
          message: 'Payment processed successfully via Valor API'
        };
        // #region agent log
        fetch('http://127.0.0.1:1024/ingest/d43f1d4c-4d33-4f77-a4e3-9e9d56debc45',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'salesController.js:payment branch',message:'payment branch=card_valor',data:{paymentType:'card',transactionId:valorTransactionId},timestamp:Date.now(),hypothesisId:'H2'})}).catch(()=>{});
        // #endregion
      } else {
        // Card-not-present mode - process through API
        // Validation is now handled by middleware, but keep as backup
        if (!paymentDetails || !paymentDetails.cardNumber) {
          return sendValidationError(res, 'Payment details required for card transactions');
        }

        paymentResult = await processPayment({
          amount: total,
          cardNumber: paymentDetails.cardNumber,
          expirationDate: paymentDetails.expirationDate,
          cvv: paymentDetails.cvv,
          description: `POS Sale - ${locationName}`,
          invoiceNumber: `POS-${Date.now()}`
        });

        if (!paymentResult.success) {
          return sendError(res, 'Payment processing failed', 400, paymentResult.error);
        }

        transactionId = paymentResult.transactionId;
        // #region agent log
        fetch('http://127.0.0.1:1024/ingest/d43f1d4c-4d33-4f77-a4e3-9e9d56debc45',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'salesController.js:payment branch',message:'payment branch=card_manual',data:{paymentType:'card',transactionId:paymentResult.transactionId},timestamp:Date.now(),hypothesisId:'H2'})}).catch(()=>{});
        // #endregion
        }
      }
    } else if (paymentType === 'ach') {
      if (!paymentDetails) {
        return sendValidationError(res, 'Payment details required for ACH transactions');
      }

      paymentResult = await processAchPayment({
        amount: total,
        routingNumber: paymentDetails.routingNumber,
        accountNumber: paymentDetails.accountNumber,
        accountType: paymentDetails.accountType,
        nameOnAccount: paymentDetails.nameOnAccount,
        bankName: paymentDetails.bankName,
        description: `POS Sale - ${locationName}`,
        invoiceNumber: `POS-${Date.now()}`
      });

      if (!paymentResult.success) {
        return sendError(res, 'ACH payment processing failed', 400, paymentResult.error);
      }

      transactionId = paymentResult.transactionId;
      // #region agent log
      fetch('http://127.0.0.1:1024/ingest/d43f1d4c-4d33-4f77-a4e3-9e9d56debc45',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'salesController.js:payment branch',message:'payment branch=ach',data:{paymentType:'ach',transactionId},timestamp:Date.now(),hypothesisId:'H2'})}).catch(()=>{});
      // #endregion
    } else if (paymentType === 'cash') {
      // Cash payment - no processing needed
      transactionId = `CASH-${Date.now()}`;
      paymentResult = {
        success: true,
        message: 'Cash payment recorded',
        transactionId: transactionId
      };
      // #region agent log
      fetch('http://127.0.0.1:1024/ingest/d43f1d4c-4d33-4f77-a4e3-9e9d56debc45',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'salesController.js:payment branch',message:'payment branch=cash',data:{paymentType:'cash',transactionId},timestamp:Date.now(),hypothesisId:'H2'})}).catch(()=>{});
      // #endregion
    } else if (paymentType === 'zelle') {
      // Zelle payment - record like cash (no processing needed)
      // If a confirmation number is provided (optional), include it in transactionId for traceability.
      const zelleRef = paymentDetails?.zelleConfirmation?.trim();
      transactionId = zelleRef ? `ZELLE-${zelleRef}` : `ZELLE-${Date.now()}`;
      paymentResult = {
        success: true,
        message: 'Zelle payment recorded',
        transactionId
      };
      // #region agent log
      fetch('http://127.0.0.1:1024/ingest/d43f1d4c-4d33-4f77-a4e3-9e9d56debc45',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'salesController.js:payment branch',message:'payment branch=zelle',data:{paymentType:'zelle',transactionId},timestamp:Date.now(),hypothesisId:'H2'})}).catch(()=>{});
      // #endregion
    }

    // Optionally save payment method in Authorize.Net CIM when a customer is present and
    // we processed the payment directly through Authorize.Net (not Valor/terminal/standalone).
    const shouldSavePaymentMethod =
      !!customer &&
      !!transactionId &&
      (paymentType === 'card' || paymentType === 'ach') &&
      !useValorApi &&
      !useStoredPayment &&
      !isStandaloneMode &&
      (savePaymentMethod === true || paymentDetails?.savePaymentMethod === true);

    if (shouldSavePaymentMethod) {
      try {
        const profileResult = await createCustomerProfileFromTransaction({
          transactionId,
          email: customer.email || null,
          description: customer.contactName || null,
          merchantCustomerId: customer.zohoId || String(customer.id)
        });

        if (profileResult.success && profileResult.customerProfileId && profileResult.customerPaymentProfileId) {
          // Update customer record with CIM identifiers and masked account info (last4 only).
          const masked = paymentResult?.accountNumber || '';
          const digits = typeof masked === 'string' ? masked.replace(/\D/g, '') : '';
          const last4 = digits.length >= 4 ? digits.slice(-4) : null;

          const updates = {
            customerProfileId: profileResult.customerProfileId.toString(),
            customerPaymentProfileId: profileResult.customerPaymentProfileId.toString(),
            hasPaymentMethod: true,
            paymentMethodType: paymentType
          };

          if (paymentType === 'card') {
            if (last4) {
              updates.last_four_digits = last4;
            }
          } else if (paymentType === 'ach') {
            if (last4) {
              updates.bankAccountLast4 = last4;
            }
          }

          await customer.update(updates);
        }
      } catch (saveErr) {
        // Never fail the sale if saving to CIM fails.
        console.warn(`⚠️ Failed to save payment method to Authorize.Net CIM for customer ${customer.id}:`, saveErr.message);
      }
    }

    // Warn if customer has no Zoho ID (for production error tracking)
    if (customer && !customer.zohoId) {
      console.warn(`⚠️ Customer "${customer.contactName}" has no Zoho ID. Invoice will not be created in Zoho Books.`);
    }

    // Add note for standalone mode (manual card reader payment)
    let saleNotes = notes || '';
    if (isStandaloneMode && paymentType === 'card') {
      const manualPaymentNote = 'Manual card reader payment';
      saleNotes = saleNotes ? `${saleNotes}\n${manualPaymentNote}` : manualPaymentNote;
    }

    const sale = await Sale.create({
      subtotal: subtotal.toFixed(2),
      taxAmount: taxAmount.toFixed(2),
      taxPercentage: userTaxPercentage,
      ccFee: cardProcessingFee.toFixed(2), // Card processing fee (3% convenience fee for credit/debit cards)
      total: total.toFixed(2),
      paymentType,
      locationId,
      locationName,
      customerId: customerId || null,
      zohoCustomerId: customer?.zohoId || null,
      userId,
      transactionId,
      notes: saleNotes
    });

    // Optimize: Batch create all sale items in a single operation
    await SaleItem.bulkCreate(
      saleItemsData.map(itemData => ({
        saleId: sale.id,
        ...itemData
      }))
    );

    // Attempt Zoho sync if customer has zohoId and is a customer (or we couldn't determine type)
    // Only skip when we explicitly know the contact is not a customer (e.g. vendor)
    const isVendorOrOther = zohoContactType && zohoContactType !== 'customer';
    const isZohoCustomer = customer && customer.zohoId && !isVendorOrOther;
    if (!isZohoCustomer && customer?.zohoId && isVendorOrOther) {
      console.log(`ℹ️ Zoho sync skipped for sale: contact type "${zohoContactType}" is not a customer`);
    }
    if (isZohoCustomer) {
      try {
        // For Zoho, ccFee is the credit card processing fee (if any)
        // Pass customerLocation to enforce correct tax rate - Zoho uses place_of_contact to determine tax rate
        // Use sale.createdAt date to match the actual sale date (fixes date discrepancy issue)
        const saleDate = sale.createdAt ? new Date(sale.createdAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
        const zohoResult = await createSalesReceipt({
          customerId: customer.zohoId, // Using the customer's zohoId from Zoho Books
          date: saleDate,
          lineItems: saleItemsData,
          locationId,
          locationName,
          customerLocation, // Customer's location from Zoho - ensures correct tax rate is applied
          taxAmount: parseFloat(sale.taxAmount),
          ccFee: parseFloat(sale.ccFee), // Credit card processing fee
          total: parseFloat(sale.total),
          paymentType: sale.paymentType,
          notes: sale.notes,
          transactionId: sale.transactionId, // Transaction ID from payment processing
          // Provide user's/location Zoho tax_id so the Zoho service can enforce tax_id on all taxable line items.
          zohoTaxId: userTaxPercentage > 0 ? (userZohoTaxId || null) : null,
          saleId: sale.id
        });

        if (zohoResult.success) {
          await sale.update({
            syncedToZoho: true,
            zohoSalesReceiptId: zohoResult.salesReceiptId
          });

          // Email receipt to customer via Zoho's dedicated email endpoint (non-blocking)
          const shouldEmailReceipt = emailReceiptToCustomer === true || paymentDetails?.emailReceiptToCustomer === true;
          if (shouldEmailReceipt && zohoResult.salesReceiptId) {
            const emailOptions = customer?.email ? { to_mail_ids: [customer.email] } : {};
            // #region agent log
            try { fetch('http://127.0.0.1:1024/ingest/d43f1d4c-4d33-4f77-a4e3-9e9d56debc45',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'salesController.js:emailReceipt',message:'Attempting receipt email',data:{saleId:sale.id,salesReceiptId:zohoResult.salesReceiptId,hasCustomerEmail:!!customer?.email,toMailIdsCount:emailOptions.to_mail_ids?.length||0},timestamp:Date.now(),runId:'email-test'})}).catch(()=>{}); } catch(e){}
            // #endregion
            emailSalesReceipt(zohoResult.salesReceiptId, emailOptions)
              .then((emailResult) => {
                // #region agent log
                try { fetch('http://127.0.0.1:1024/ingest/d43f1d4c-4d33-4f77-a4e3-9e9d56debc45',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'salesController.js:emailReceipt:result',message:'Receipt email result',data:{saleId:sale.id,success:emailResult.success,error:emailResult.error||null},timestamp:Date.now(),runId:'email-test'})}).catch(()=>{}); } catch(e){}
                // #endregion
                if (!emailResult.success) {
                  console.warn(`⚠️ Sale ${sale.id}: Receipt email failed (sale completed successfully): ${emailResult.error}`);
                }
              })
              .catch((err) => {
                console.warn(`⚠️ Sale ${sale.id}: Receipt email error (sale completed successfully):`, err.message);
              });
          }
        } else {
          console.error(`❌ Sale ${sale.id} Zoho sync failed: ${zohoResult.error}`);
          await sale.update({
            syncedToZoho: false,
            syncError: zohoResult.error || 'Unknown error'
          });
        }
      } catch (zohoError) {
        console.error(`❌ Sale ${sale.id} Zoho sync exception:`, zohoError);
        const errorMessage = zohoError.response?.data?.message || zohoError.message || 'Unknown error';
        await sale.update({
          syncedToZoho: false,
          syncError: errorMessage
        });
      }
    } else if (customer && customer.zohoId) {
      // Do not treat vendor/other contact types as an error; skip Zoho sync quietly
      await sale.update({
        syncedToZoho: false,
        syncError: null
      });
      console.warn(
        `ℹ️ Zoho sync skipped for sale ${sale.id}: contact type "${zohoContactType || 'unknown'}" not supported for Zoho sales receipts`
      );
    } else {
      await sale.update({
        syncedToZoho: false,
        syncError: customer ? 'Customer has no Zoho ID. Please sync customers from Zoho first.' : 'No customer selected'
      });
    }

    const completeSale = await Sale.findByPk(sale.id, {
      include: [
        { association: 'items' },
        { association: 'customer' }
      ]
    });

    // Record sale to transactions table
    try {
      const isSQLite = sequelize.getDialect() === 'sqlite';
      const now = new Date().toISOString();
      
      // Use appropriate column quoting for SQLite vs PostgreSQL
      const quote = isSQLite ? '' : '"';
      
      await sequelize.query(`
        INSERT INTO transactions (
          ${quote}transactionId${quote}, ${quote}createdAt${quote}, ${quote}updatedAt${quote}, ${quote}subtotal${quote}, ${quote}taxAmount${quote}, ${quote}taxPercentage${quote}, 
          ${quote}ccFee${quote}, ${quote}total${quote}, ${quote}paymentType${quote}, ${quote}locationId${quote}, ${quote}locationName${quote}, ${quote}customerId${quote}, 
          ${quote}zohoCustomerId${quote}, ${quote}userId${quote}, ${quote}zohoSalesReceiptId${quote}, ${quote}syncedToZoho${quote}, ${quote}syncError${quote}, 
          ${quote}notes${quote}, ${quote}cancelledInZoho${quote}
        ) VALUES (
          :transactionId, :createdAt, :updatedAt, :subtotal, :taxAmount, :taxPercentage,
          :ccFee, :total, :paymentType, :locationId, :locationName, :customerId,
          :zohoCustomerId, :userId, :zohoSalesReceiptId, :syncedToZoho, :syncError,
          :notes, :cancelledInZoho
        )
      `, {
        replacements: {
          transactionId: sale.transactionId || String(sale.id),
          createdAt: now,
          updatedAt: now,
          subtotal: parseFloat(sale.subtotal),
          taxAmount: parseFloat(sale.taxAmount),
          taxPercentage: sale.taxPercentage,
          ccFee: parseFloat(sale.ccFee || 0),
          total: parseFloat(sale.total),
          paymentType: sale.paymentType,
          locationId: sale.locationId,
          locationName: sale.locationName || null,
          customerId: sale.customerId || null,
          zohoCustomerId: sale.zohoCustomerId || null,
          userId: sale.userId,
          zohoSalesReceiptId: completeSale.zohoSalesReceiptId || null,
          syncedToZoho: completeSale.syncedToZoho ? (isSQLite ? 1 : true) : (isSQLite ? 0 : false),
          syncError: completeSale.syncError || null,
          notes: sale.notes || null,
          cancelledInZoho: isSQLite ? 0 : false
        }
      });
      console.log(`✅ Recorded sale ${sale.id} to transactions table`);
    } catch (txnError) {
      // Log error but don't fail the sale - transaction recording is secondary
      console.error(`⚠️ Failed to record sale ${sale.id} to transactions table:`, txnError.message);
    }

    // Print receipt (non-blocking - sale completes successfully even if print fails)
    // This runs asynchronously and will not block or fail the sale
    printReceipt({
      sale: completeSale,
      items: completeSale.items,
      customer: completeSale.customer
    }, locationId)
      .then(result => {
        if (result && !result.success && !result.skipped) {
          console.warn(`⚠️ Receipt printing failed for sale ${sale.id}, but sale completed successfully`);
        }
      })
      .catch(err => {
        // Silently handle printer errors - sale is already successful
        console.warn(`⚠️ Receipt print error for sale ${sale.id}: ${err.message} (Sale completed successfully)`);
      });

    // Include Zoho sync status in response
    const zohoStatus = {
      synced: completeSale.syncedToZoho || false,
      salesReceiptId: completeSale.zohoSalesReceiptId || null,
      salesReceiptNumber: completeSale.zohoSalesReceiptId ? `POS-${sale.id}` : null,
      error: completeSale.syncError || null
    };

    // Sale is complete - return success immediately
    // Printer runs in background and won't affect the response
    // #region agent log
    fetch('http://127.0.0.1:1024/ingest/d43f1d4c-4d33-4f77-a4e3-9e9d56debc45',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'salesController.js:createSale success',message:'sale completed',data:{saleId:sale.id,transactionId:sale.transactionId,paymentType:sale.paymentType},timestamp:Date.now(),hypothesisId:'H3'})}).catch(()=>{});
    // #endregion
    return sendSuccess(res, {
      sale: completeSale,
      payment: paymentResult,
      printResult: { 
        attempted: true,
        note: 'Receipt printing runs in background and will not affect sale completion'
      },
      zoho: zohoStatus
    }, 'Sale completed successfully', 201);

  } catch (err) {
    console.error('Sale creation error:', err);
    // #region agent log
    fetch('http://127.0.0.1:1024/ingest/d43f1d4c-4d33-4f77-a4e3-9e9d56debc45',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'salesController.js:createSale error',message:'sale creation failed',data:{error:err?.message||String(err),stack:(err?.stack||'').slice(0,300)},timestamp:Date.now(),hypothesisId:'H4'})}).catch(()=>{});
    // #endregion
    return sendError(res, 'Sale creation failed. Please try again.', 500, err);
  }
};

export const getSales = async (req, res) => {
  try {
    const { locationId, startDate, endDate, syncedToZoho } = req.query;
    const userLocationId = req.user.locationId;

    const effectiveLocationId = locationId || userLocationId;
    const where = { locationId: effectiveLocationId };

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt[Op.gte] = new Date(startDate);
      }
      if (endDate) {
        where.createdAt[Op.lte] = new Date(endDate);
      }
    }
    if (syncedToZoho !== undefined) {
      where.syncedToZoho = syncedToZoho === 'true';
    }

    const sales = await Sale.findAll({
      where,
      include: [
        { association: 'items' },
        { association: 'customer' },
        { association: 'user', attributes: ['useremail'] }
      ],
      order: [['createdAt', 'DESC']]
    });

    // Include legacy transactions (older "transactions" history) in local SQLite mode.
    // Frontend Reports tab reads from /sales and maps rows to "Transaction".
    const legacySales = await fetchLegacyTransactionsForReports({
      locationId: effectiveLocationId,
      startDate,
      endDate
    });

    if (legacySales.length === 0) {
      return sendSuccess(res, { sales });
    }

    const existingTxnIds = new Set(
      (sales || []).map(s => String(s?.transactionId || s?.id)).filter(Boolean)
    );

    const merged = [
      ...(sales || []),
      ...legacySales.filter(ls => !existingTxnIds.has(String(ls?.transactionId || ls?.id)))
    ];

    merged.sort((a, b) => {
      const ta = new Date(a.createdAt).getTime();
      const tb = new Date(b.createdAt).getTime();
      return tb - ta;
    });

    return sendSuccess(res, { sales: merged });
  } catch (err) {
    console.error('Get sales error:', err);
    return sendError(res, 'Failed to fetch sales', 500, err);
  }
};

// Get transactions from transactions table
// Admin: all data. Non-admin: filtered by user's locationId.
export const getTransactions = async (req, res) => {
  try {
    const { startDate, endDate, syncedToZoho, userId: filterUserId } = req.query;
    const userId = req.user?.id;
    const isAdmin = req.user?.role === 'admin';

    const isSQLite = sequelize.getDialect() === 'sqlite';
    const createdAtCol = isSQLite ? 'createdAt' : '"createdAt"';
    const syncedCol = isSQLite ? 'syncedToZoho' : '"syncedToZoho"';
    const userIdCol = isSQLite ? 'userId' : '"userId"';

    const whereParts = [];
    const replacements = {};

    if (isAdmin && filterUserId) {
      whereParts.push(`${userIdCol} = :filterUserId`);
      replacements.filterUserId = parseInt(filterUserId, 10);
    } else if (!isAdmin && userId) {
      whereParts.push(`${userIdCol} = :userId`);
      replacements.userId = userId;
    }
    if (startDate) {
      whereParts.push(`${createdAtCol} >= :startDate`);
      replacements.startDate = new Date(startDate).toISOString();
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      whereParts.push(`${createdAtCol} <= :endDate`);
      replacements.endDate = end.toISOString();
    }
    if (syncedToZoho !== undefined) {
      whereParts.push(`${syncedCol} = :syncedToZoho`);
      replacements.syncedToZoho = syncedToZoho === 'true' ? (isSQLite ? 1 : true) : (isSQLite ? 0 : false);
    }

    const whereClause = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '';

    let transactions = [];
    try {
      const [txnRows] = await sequelize.query(`
        SELECT * FROM transactions 
        ${whereClause}
        ORDER BY ${createdAtCol} DESC
      `, { replacements });
      transactions = txnRows || [];
    } catch (txnErr) {
      console.warn(`⚠️ transactions table query failed (${txnErr.message}), falling back to Sale records`);
    }

    const initialFromTable = transactions.length;
    let mergedCount = 0;
    const txnIdsSet = new Set((transactions || []).map(t => String(t?.transactionId || '')).filter(Boolean));
    const saleWhere = {};
    if (isAdmin && filterUserId) saleWhere.userId = parseInt(filterUserId, 10);
    else if (!isAdmin && userId) saleWhere.userId = userId;
    if (startDate || endDate) {
      saleWhere.createdAt = {};
      if (startDate) saleWhere.createdAt[Op.gte] = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        saleWhere.createdAt[Op.lte] = end;
      }
    }
    if (true) {
      const salesForMerge = await Sale.findAll({
        where: Object.keys(saleWhere).length > 0 ? saleWhere : {},
        attributes: ['id', 'transactionId', 'createdAt', 'subtotal', 'taxAmount', 'taxPercentage', 'ccFee', 'total', 'paymentType', 'locationId', 'syncedToZoho', 'zohoSalesReceiptId', 'cancelledInZoho'],
        order: [['createdAt', 'DESC']],
        limit: 500
      });
      for (const s of salesForMerge || []) {
        const tId = s.transactionId ? String(s.transactionId).trim() : null;
        if (tId && !txnIdsSet.has(tId)) {
          mergedCount++;
          transactions.push({
            transactionId: tId,
            id: s.id,
            createdAt: s.createdAt,
            subtotal: s.subtotal,
            taxAmount: s.taxAmount,
            taxPercentage: s.taxPercentage,
            ccFee: s.ccFee || 0,
            total: s.total,
            paymentType: s.paymentType,
            locationId: s.locationId,
            syncedToZoho: s.syncedToZoho,
            zohoSalesReceiptId: s.zohoSalesReceiptId,
            cancelledInZoho: s.cancelledInZoho || false
          });
          txnIdsSet.add(tId);
        }
      }
      transactions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    // If we still have no transactions, use Sales directly as primary source
    if (transactions.length === 0) {
      const saleWhereFallback = {};
      if (isAdmin && filterUserId) saleWhereFallback.userId = parseInt(filterUserId, 10);
      else if (!isAdmin && userId) saleWhereFallback.userId = userId;
      if (startDate || endDate) {
        saleWhereFallback.createdAt = {};
        if (startDate) saleWhereFallback.createdAt[Op.gte] = new Date(startDate);
        if (endDate) {
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);
          saleWhereFallback.createdAt[Op.lte] = end;
        }
      }
      const salesOnly = await Sale.findAll({
        where: Object.keys(saleWhereFallback).length > 0 ? saleWhereFallback : {},
        attributes: ['id', 'transactionId', 'createdAt', 'subtotal', 'taxAmount', 'taxPercentage', 'ccFee', 'total', 'paymentType', 'locationId', 'syncedToZoho', 'zohoSalesReceiptId', 'cancelledInZoho'],
        order: [['createdAt', 'DESC']],
        limit: 500
      });
      for (const s of salesOnly || []) {
        const tId = s.transactionId ? String(s.transactionId).trim() : null;
        if (tId) {
          mergedCount++;
          transactions.push({
            transactionId: tId,
            id: s.id,
            createdAt: s.createdAt,
            subtotal: s.subtotal,
            taxAmount: s.taxAmount,
            taxPercentage: s.taxPercentage,
            ccFee: s.ccFee || 0,
            total: s.total,
            paymentType: s.paymentType,
            locationId: s.locationId,
            syncedToZoho: s.syncedToZoho,
            zohoSalesReceiptId: s.zohoSalesReceiptId,
            cancelledInZoho: s.cancelledInZoho || false
          });
        }
      }
    }

    // Look up Sale ids by transactionId (transactions.id != sales.id - different tables with separate sequences)
    const txnIds = [...new Set((transactions || []).map(t => t.transactionId).filter(Boolean))];
    const salesByTxnId = new Map();
    if (txnIds.length > 0) {
      const saleLookupWhere = { transactionId: { [Op.in]: txnIds } };
      if (!isAdmin && userId) saleLookupWhere.userId = userId;
      const sales = await Sale.findAll({
        where: saleLookupWhere,
        attributes: ['id', 'transactionId']
      });
      for (const s of sales) {
        if (s.transactionId) salesByTxnId.set(String(s.transactionId).trim(), s.id);
      }
    }

    // Transform to match frontend Transaction interface; use actual Sale id for receipt lookup
    const transformedTransactions = (transactions || []).map((txn) => {
      const txnIdStr = txn.transactionId ? String(txn.transactionId).trim() : null;
      const saleId = txnIdStr ? (salesByTxnId.get(txnIdStr) ?? txn.id) : txn.id;
      return {
        id: String(txn.transactionId || txn.id),
        saleId: saleId ?? undefined,
        date: new Date(txn.createdAt),
        paymentType: txn.paymentType || 'cash',
        subtotal: parseFloat(txn.subtotal || 0),
        tax: parseFloat(txn.taxAmount || 0),
        fee: parseFloat(txn.ccFee || 0),
        total: parseFloat(txn.total || 0),
        locationId: txn.locationId,
        syncedToZoho: Boolean(txn.syncedToZoho),
        zohoSalesReceiptId: txn.zohoSalesReceiptId || null,
        cancelledInZoho: Boolean(txn.cancelledInZoho)
      };
    });

    // #region agent log
    fetch('http://127.0.0.1:1024/ingest/d43f1d4c-4d33-4f77-a4e3-9e9d56debc45',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'salesController.js:getTransactions',message:'transactions result',data:{fromTable:initialFromTable,mergedCount,total:transformedTransactions?.length||0,userId,isAdmin},timestamp:Date.now(),hypothesisId:'H-TXN'})}).catch(()=>{});
    // #endregion
    return sendSuccess(res, { transactions: transformedTransactions });
  } catch (err) {
    console.error('Get transactions error:', err);
    return sendError(res, 'Failed to fetch transactions', 500, err);
  }
};

/**
 * Get invoice payment records
 * GET /sales/invoice-payments?startDate=&endDate=
 */
export const getInvoicePayments = async (req, res) => {
  try {
    const { startDate, endDate, userId: filterUserId } = req.query;
    const userId = req.user?.id;
    const isAdmin = req.user?.role === 'admin';

    const where = {};
    if (isAdmin && filterUserId) {
      where.userId = parseInt(filterUserId, 10);
    } else if (!isAdmin && userId) {
      where.userId = userId;
    }
    const dateRange = {};
    if (startDate) dateRange[Op.gte] = new Date(startDate);
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      dateRange[Op.lte] = end;
    }
    if (Object.keys(dateRange).length) where.createdAt = dateRange;

    const payments = await InvoicePayment.findAll({
      where,
      include: [{ model: Customer, as: 'customer', attributes: ['id', 'contactName'] }],
      order: [['createdAt', 'DESC']]
    });

    const items = (payments || []).map((p) => ({
      id: p.id,
      date: p.createdAt,
      customer: p.customer ? { id: p.customer.id, name: p.customer.contactName } : null,
      type: p.type,
      documentNumber: p.documentNumber,
      amount: parseFloat(p.amount || 0),
      ccFee: parseFloat(p.ccFee || 0),
      amountCharged: parseFloat(p.amountCharged || 0),
      paymentType: p.paymentType || 'card',
      transactionId: p.transactionId,
      zohoPaymentRecorded: Boolean(p.zohoPaymentRecorded)
    }));

    return sendSuccess(res, { invoicePayments: items });
  } catch (err) {
    console.error('Get invoice payments error:', err);
    return sendError(res, 'Failed to fetch invoice payments', 500, err);
  }
};

export const getSaleById = async (req, res) => {
  try {
    const { id } = req.params;

    const sale = await Sale.findByPk(id, {
      include: [
        { association: 'items' },
        { association: 'customer' },
        { association: 'user', attributes: ['useremail'] }
      ]
    });

    if (!sale) {
      return sendNotFound(res, 'Sale');
    }

    return sendSuccess(res, { sale });
  } catch (err) {
    console.error('Get sale error:', err);
    return sendError(res, 'Failed to fetch sale', 500, err);
  }
};

export const retryZohoSync = async (req, res) => {
  try {
    const { id } = req.params;
    
    const sale = await Sale.findByPk(id, {
      include: [
        { association: 'items' },
        { association: 'customer' }
      ]
    });

    if (!sale) {
      return sendNotFound(res, 'Sale');
    }

    if (!sale.customer) {
      return sendValidationError(res, 'Sale has no customer. Cannot sync to Zoho without a customer.');
    }

    if (!sale.customer.zohoId) {
      return sendValidationError(res, `Customer "${sale.customer.contactName}" has no Zoho ID. Please sync customers from Zoho first.`);
    }

    // Prefer the user's saved Zoho tax_id; fallback to lookup-by-percentage.
    // Retry-sync may run long after the original sale; if historical SaleItems didn't persist taxId,
    // this ensures Zoho sales receipts still receive the correct tax rule.
    const saleTaxPct = parseFloat(sale.taxPercentage);
    const isTaxableSale = !Number.isNaN(saleTaxPct) && Number.isFinite(saleTaxPct) && saleTaxPct > 0;
    let userZohoTaxId = req.user?.zohoTaxId || null;
    if (!userZohoTaxId && isTaxableSale) {
      try {
        userZohoTaxId = await getZohoTaxIdForPercentage(saleTaxPct);
        if (!userZohoTaxId) {
          console.warn(`⚠️ No Zoho tax_id found for sale tax rate ${saleTaxPct}%. Falling back to tax_percentage only.`);
        }
      } catch (taxLookupErr) {
        console.warn(`⚠️ Failed to lookup Zoho tax_id for sale tax rate ${saleTaxPct}%: ${taxLookupErr.message}`);
      }
    }

    // Only customer contacts are eligible for Zoho sales receipts
    const contactType = sale.customer.contactType?.toLowerCase();
    if (contactType && contactType !== 'customer') {
      return sendValidationError(
        res,
        `Zoho sync skipped: contact type "${contactType}" is not supported for sales receipts.`
      );
    }

    // Prepare line items data
    const saleItemsData = sale.items.map(item => ({
      itemId: item.itemId,
      zohoItemId: item.zohoItemId,
      itemName: item.itemName,
      quantity: item.quantity,
      price: item.price,
      taxPercentage: item.taxPercentage,
      taxAmount: item.taxAmount,
      lineTotal: item.lineTotal,
      // If historical SaleItems didn't persist taxId, inject the current user's/location tax_id.
      taxId: isTaxableSale ? (item.taxId || userZohoTaxId || null) : null
    }));

    // Fetch customer's location from Zoho to enforce correct tax rate
    let customerLocation = null;
    try {
      const zohoCustomerDetails = await getZohoCustomerById(sale.customer.zohoId);
      if (zohoCustomerDetails) {
        // First check custom_fields for location
        if (zohoCustomerDetails.custom_fields && Array.isArray(zohoCustomerDetails.custom_fields)) {
          const locationField = zohoCustomerDetails.custom_fields.find(
            field => field.label === 'location' || field.label === 'Location'
          );
          if (locationField?.value) {
            customerLocation = locationField.value;
          }
        }
        
        // Fall back to place_of_contact if no custom field found
        if (!customerLocation && zohoCustomerDetails.place_of_contact) {
          customerLocation = zohoCustomerDetails.place_of_contact;
        }
        
        if (customerLocation) {
          console.log(`📍 Customer has location in Zoho: ${customerLocation} (will use for sales receipt to enforce correct tax rate)`);
        }
      }
    } catch (locationError) {
      console.warn(`⚠️ Unable to fetch customer location from Zoho for retry sync:`, locationError.message);
      // Continue with sync even if location fetch fails
    }

    const zohoResult = await createSalesReceipt({
      customerId: sale.customer.zohoId, // Using the customer's zohoId from Zoho Books
      date: sale.createdAt.toISOString().split('T')[0],
      lineItems: saleItemsData,
      locationId: sale.locationId,
      locationName: sale.locationName,
      customerLocation, // Customer's location from Zoho - ensures correct tax rate is applied
      taxAmount: parseFloat(sale.taxAmount),
      ccFee: parseFloat(sale.ccFee),
      total: parseFloat(sale.total),
      paymentType: sale.paymentType,
      notes: sale.notes,
      transactionId: sale.transactionId, // Transaction ID from payment processing
      // Ensure Zoho line items always get tax_id when applicable (see mapping in zohoService)
      zohoTaxId: isTaxableSale ? (userZohoTaxId || null) : null,
      saleId: sale.id
    });

    if (zohoResult.success) {
      await sale.update({
        syncedToZoho: true,
        zohoSalesReceiptId: zohoResult.salesReceiptId,
        syncError: null
      });
      
      return sendSuccess(res, {
        salesReceiptId: zohoResult.salesReceiptId,
        salesReceiptNumber: zohoResult.salesReceiptNumber
      }, 'Sale synced to Zoho successfully');
    } else {
      await sale.update({
        syncedToZoho: false,
        syncError: zohoResult.error || 'Unknown error'
      });
      
      return sendError(res, 'Zoho sync failed', 400, zohoResult.error);
    }
  } catch (err) {
    console.error('Retry Zoho sync error:', err);
    return sendError(res, 'Failed to retry Zoho sync', 500, err);
  }
};

export const getSyncStatus = async (req, res) => {
  try {
    const { userId: filterUserId } = req.query;
    const userId = req.user?.id;
    const isAdmin = req.user?.role === 'admin';

    const saleWhere = {};
    if (isAdmin && filterUserId) saleWhere.userId = parseInt(filterUserId, 10);
    else if (!isAdmin && userId) saleWhere.userId = userId;
    const sales = await Sale.findAll({
      where: Object.keys(saleWhere).length > 0 ? saleWhere : {},
      attributes: ['id', 'transactionId', 'createdAt', 'total', 'customerId', 'zohoCustomerId', 'syncedToZoho', 'zohoSalesReceiptId', 'syncError'],
      order: [['createdAt', 'DESC']]
    });
    const transactions = (sales || []).map(s => ({
      id: s.id,
      transactionId: s.transactionId,
      createdAt: s.createdAt,
      total: s.total,
      customerId: s.customerId,
      zohoCustomerId: s.zohoCustomerId,
      syncedToZoho: s.syncedToZoho,
      zohoSalesReceiptId: s.zohoSalesReceiptId,
      syncError: s.syncError
    }));

    const customerIds = [...new Set((transactions || []).map(t => t.customerId).filter(Boolean))];
    const customersMap = new Map();
    if (customerIds.length > 0) {
      const customers = await Customer.findAll({
        where: { id: { [Op.in]: customerIds } },
        attributes: ['id', 'contactName', 'zohoId']
      });
      customers.forEach(c => customersMap.set(c.id, c));
    }

    const status = (transactions || []).map(txn => {
      const customer = txn.customerId ? customersMap.get(txn.customerId) : null;
      return {
        saleId: txn.id,
        total: parseFloat(txn.total || 0),
        createdAt: txn.createdAt,
        customer: customer ? {
          id: customer.id,
          name: customer.contactName,
          hasZohoId: !!customer.zohoId,
          zohoId: customer.zohoId
        } : (txn.zohoCustomerId ? {
          id: null,
          name: null,
          hasZohoId: true,
          zohoId: txn.zohoCustomerId
        } : null),
        syncedToZoho: Boolean(txn.syncedToZoho),
        zohoSalesReceiptId: txn.zohoSalesReceiptId || null,
        syncError: txn.syncError || null
      };
    });

    // Invoice payment sync stats - admin: all or by filterUserId, non-admin: filter by userId
    let invoicePaymentSummary = { total: 0, invoices: { total: 0, recorded: 0, notRecorded: 0 } };
    try {
      const ipWhere = (isAdmin && filterUserId) ? { userId: parseInt(filterUserId, 10) } : (!isAdmin && userId) ? { userId } : {};
      const invoicePayments = await InvoicePayment.findAll({
        where: { ...ipWhere, type: 'invoice' },
        attributes: ['type', 'zohoPaymentRecorded']
      });
      const invoices = invoicePayments || [];
      invoicePaymentSummary = {
        total: invoices.length,
        invoices: {
          total: invoices.length,
          recorded: invoices.filter(p => p.zohoPaymentRecorded).length,
          notRecorded: invoices.filter(p => !p.zohoPaymentRecorded).length
        }
      };
    } catch (ipErr) {
      console.warn('getSyncStatus: invoice payments query failed:', ipErr.message);
    }

    return sendSuccess(res, {
      sales: status,
      summary: {
        total: status.length,
        synced: status.filter(s => s.syncedToZoho).length,
        failed: status.filter(s => !s.syncedToZoho && s.syncError).length,
        noCustomer: status.filter(s => !s.customer).length,
        noZohoId: status.filter(s => s.customer && !s.customer.zohoId).length
      },
      invoicePayments: invoicePaymentSummary
    });
  } catch (err) {
    console.error('Get sync status error:', err);
    return sendError(res, 'Failed to fetch sync status', 500, err);
  }
};

/**
 * Charge customer for selected invoices and/or sales orders using Authorize.net CIM
 * POST /sales/charge-invoices
 * Body: { customerId, items: [{ type: 'invoice', id: string, number: string, amount: number }] }
 */
export const chargeInvoicesSalesOrders = async (req, res) => {
  try {
    const { customerId, items, paymentProfileId, paymentType: requestPaymentType } = req.body;
    const raw = requestPaymentType && String(requestPaymentType).toLowerCase();
    // Merge CC/DC: treat any card as card
    const paymentType = raw === 'ach' ? 'ach' : 'card';

    if (!customerId) {
      return sendValidationError(res, 'Customer ID is required');
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return sendValidationError(res, 'At least one invoice or sales order must be provided');
    }

    if (!paymentProfileId) {
      return sendValidationError(res, 'Payment profile ID is required');
    }

    // Get customer from database
    const customer = await Customer.findByPk(customerId);
    if (!customer) {
      return sendNotFound(res, 'Customer');
    }

    // Get or find customer's Authorize.net profile
    let customerProfileId = customer.customerProfileId;
    let customerPaymentProfileId = paymentProfileId; // Use the provided payment profile ID

    // If profile IDs are not stored, try to find them
    if (!customerProfileId || !customerPaymentProfileId) {
      console.log(`🔍 Customer ${customer.contactName} does not have stored profile IDs. Searching Authorize.net...`);
      
      const searchCriteria = {
        name: customer.contactName,
        email: customer.email,
        merchantCustomerId: customer.zohoId
      };

      const profileResult = await getCustomerProfileDetails(searchCriteria);
      
      if (!profileResult.success || !profileResult.profile) {
        return sendError(
          res,
          'Customer does not have a payment profile in Authorize.net. Please ensure the customer has a stored payment method in Authorize.net CIM.',
          400
        );
      }

      // Extract profile ID
      const profile = profileResult.profile;
      customerProfileId = Array.isArray(profile.customerProfileId)
        ? profile.customerProfileId[0]
        : profile.customerProfileId;

      if (!customerProfileId) {
        return sendError(
          res,
          'Could not retrieve customer profile ID from Authorize.net',
          400
        );
      }

      // Extract payment profiles
      const paymentProfiles = extractPaymentProfiles(profile);
      
      if (paymentProfiles.length === 0) {
        return sendError(
          res,
          'Customer does not have any payment profiles in Authorize.net. Please add a payment method first.',
          400
        );
      }

      // Verify that the requested payment profile exists
      const requestedProfile = paymentProfiles.find(p => p.paymentProfileId === paymentProfileId);
      
      // #region agent log
      fetch('http://127.0.0.1:1024/ingest/d43f1d4c-4d33-4f77-a4e3-9e9d56debc45',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'salesController.js:profile verification',message:'profile verification',data:{requestedPaymentProfileId:paymentProfileId,foundProfile:!!requestedProfile,profileType:requestedProfile?.type,allProfileIds:paymentProfiles.map(p=>p.paymentProfileId),profileDetails:requestedProfile},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H12'})}).catch(()=>{});
      // #endregion
      
      if (!requestedProfile) {
        return sendError(
          res,
          `Payment profile ID ${paymentProfileId} not found for this customer. Available profiles: ${paymentProfiles.map(p => p.paymentProfileId).join(', ')}`,
          400
        );
      }

      // Store profile IDs in database for future use
      await customer.update({
        customerProfileId: customerProfileId.toString(),
        customerPaymentProfileId: paymentProfileId.toString()
      });

      console.log(`✅ Found and stored Authorize.net profile IDs for customer ${customer.contactName}`);
    } else {
      // Verify that the stored payment profile ID matches the requested one
      if (customer.customerPaymentProfileId !== paymentProfileId) {
        // Re-verify by fetching profile
        const profileResult = await getCustomerProfileDetails({
          customerProfileId: customerProfileId
        });
        
        if (profileResult.success && profileResult.profile) {
          const paymentProfiles = extractPaymentProfiles(profileResult.profile);
          const requestedProfile = paymentProfiles.find(p => p.paymentProfileId === paymentProfileId);
          
          if (!requestedProfile) {
            return sendError(
              res,
              `Payment profile ID ${paymentProfileId} not found for this customer`,
              400
            );
          }
        }
      }
    }

    // Get payment profile type to determine fee structure
    let actualProfileType = paymentType; // Default to request paymentType
    try {
      const profileResult = await getCustomerProfileDetails({
        customerProfileId: customerProfileId
      });
      if (profileResult.success && profileResult.profile) {
        const paymentProfiles = extractPaymentProfiles(profileResult.profile);
        const selectedProfile = paymentProfiles.find(p => p.paymentProfileId === paymentProfileId);
        if (selectedProfile) {
          actualProfileType = selectedProfile.type === 'ach' ? 'ach' : 'card';
        }
      }
    } catch (profileErr) {
      console.warn('Could not determine payment profile type, using request type:', profileErr.message);
    }

    // Validate all items first; collect validation errors
    const results = [];
    const errors = [];
    const validatedItems = [];

    for (let index = 0; index < items.length; index++) {
      const item = items[index];
      const { type, id, number, amount } = item;

      if (!type || !id || !number || amount == null) {
        errors.push({
          item: { type: type || 'unknown', id: id || '', number: number || '' },
          error: 'Missing required fields: type, id, number, or amount'
        });
        continue;
      }

      if (type !== 'invoice') {
        errors.push({
          item: { type, id, number },
          error: 'Only invoices are supported. Sales orders are not accepted.'
        });
        continue;
      }

      const originalAmount = parseFloat(amount);
      if (!(originalAmount > 0)) {
        errors.push({
          item: { type, id, number },
          error: 'Amount must be greater than 0'
        });
        continue;
      }

      validatedItems.push({
        type,
        id: String(id).trim(),
        number: String(number).trim(),
        amount: originalAmount
      });
    }

    // If any validation failed, return without charging
    if (errors.length > 0) {
      return sendSuccess(res, {
        customer: {
          id: customer.id,
          name: customer.contactName,
          customerProfileId,
          customerPaymentProfileId
        },
        results: [],
        errors,
        summary: { total: items.length, successful: 0, failed: errors.length }
      }, 'Validation failed; no charge was made');
    }

    if (validatedItems.length === 0) {
      return sendValidationError(res, 'No valid items to charge');
    }

    // Single charge: total amount + 3% fee only for card (not for ACH)
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
      customerPaymentProfileId,
      amount: totalCharge,
      invoiceNumber: batchInvoiceNumber,
      description
    });

    if (!chargeResult.success) {
      const errorMsg = chargeResult.error || 'Transaction declined';
      console.error('❌ Batch charge failed:', {
        error: errorMsg,
        errorCode: chargeResult.errorCode,
        responseCode: chargeResult.responseCode,
        totalCharge,
        itemCount: validatedItems.length
      });
      return sendSuccess(res, {
        customer: {
          id: customer.id,
          name: customer.contactName,
          customerProfileId,
          customerPaymentProfileId
        },
        results: [],
        errors: [{
          item: { type: 'batch', id: '', number: 'Multi payment' },
          error: errorMsg,
          errorCode: chargeResult.errorCode,
          responseCode: chargeResult.responseCode
        }],
        summary: { total: validatedItems.length, successful: 0, failed: validatedItems.length }
      }, 'Charge declined; no payment was made');
    }

    // One charge succeeded: record one Zoho customer payment for all invoices, then one InvoicePayment per document
    let zohoPaymentRecorded = false;
    let zohoPaymentError = null;
    const invoiceItems = validatedItems.filter(it => it.type === 'invoice');
    // #region agent log
    fetch('http://127.0.0.1:1024/ingest/d43f1d4c-4d33-4f77-a4e3-9e9d56debc45',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'salesController:chargeInvoices Zoho entry',message:'invoice payment Zoho flow',data:{invoiceCount:invoiceItems.length,totalFee,totalOriginal,paymentType,zohoCustomerId:!!(customer.zohoId)},timestamp:Date.now(),hypothesisId:'INV3'})}).catch(()=>{});
    // #endregion

    if (invoiceItems.length > 0) {
      const zohoCustomerId = (customer.zohoId && String(customer.zohoId).trim()) || null;
      if (!zohoCustomerId) {
        zohoPaymentError = 'Customer has no Zoho ID. Sync customers from Zoho to record payment in Zoho Books.';
        console.warn(`⚠️ Zoho: skipping invoice payment recording: ${zohoPaymentError}`);
      } else {
        const zohoPaymentMode = paymentType === 'ach' ? 'banktransfer' : 'creditcard';
        const paymentLabel = paymentType === 'ach' ? 'ACH' : 'Card';
        let invoicesForZoho = invoiceItems.map(it => ({
          invoice_id: it.id,
          amount_applied: it.amount
        }));
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
            console.warn(`⚠️ Zoho: fee invoice failed, falling back to journal: ${feeInvoiceResult.error || 'unknown'}`);
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
          // #region agent log
          fetch('http://127.0.0.1:1024/ingest/d43f1d4c-4d33-4f77-a4e3-9e9d56debc45',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'salesController:createCustomerPayment success',message:'Zoho payment recorded',data:{zohoPaymentRecorded:true,useFeeInvoice},timestamp:Date.now(),hypothesisId:'INV5'})}).catch(()=>{});
          // #endregion
          if (totalFee > 0 && !useFeeInvoice) {
            const journalResult = await createProcessingFeeJournal({
              feeAmount: totalFee,
              referenceNumber: chargeResult.transactionId ? `Txn ${chargeResult.transactionId}` : `MULTI-${batchInvoiceNumber}`,
              date: new Date().toISOString().split('T')[0]
            });
            if (!journalResult.success && journalResult.error !== 'Journal account IDs not configured') {
              console.warn(`⚠️ Zoho: processing fee journal not created: ${journalResult.error}`);
            }
          }
        } else {
          zohoPaymentError = zohoPaymentResult.error || 'Unknown Zoho error';
          // #region agent log
          fetch('http://127.0.0.1:1024/ingest/d43f1d4c-4d33-4f77-a4e3-9e9d56debc45',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'salesController:createCustomerPayment failed',message:'Zoho payment failed',data:{error:zohoPaymentError},timestamp:Date.now(),hypothesisId:'INV6'})}).catch(()=>{});
          // #endregion
          console.error(`⚠️ Zoho: could not record invoice payment: ${zohoPaymentError}`);
        }
      }
    }

    // Per-item amountCharged and ccFee (proportional so sum matches totalCharge and totalFee)
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
          locationId: req.user?.locationId || null,
          userId: req.user?.id || null
        });
      } catch (saveErr) {
        console.warn(`⚠️ Could not save invoice payment record for ${it.type} ${it.number}:`, saveErr.message);
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

    return sendSuccess(res, {
      customer: {
        id: customer.id,
        name: customer.contactName,
        customerProfileId,
        customerPaymentProfileId
      },
      results,
      errors,
      summary: {
        total: validatedItems.length,
        successful: results.length,
        failed: errors.length
      }
    }, `Charged ${results.length} item(s) in one transaction successfully`);
  } catch (err) {
    console.error('Charge invoices/sales orders error:', err);
    return sendError(res, 'Failed to charge invoices/sales orders', 500, err);
  }
};

/**
 * Cancel a transaction in Zoho by voiding the associated sales receipt.
 * POST /sales/:id/cancel-zoho
 */
export const cancelZohoTransaction = async (req, res) => {
  try {
    const { id } = req.params;

    const sale = await Sale.findByPk(id, {
      include: [
        { association: 'customer' }
      ]
    });

    if (!sale) {
      return sendNotFound(res, 'Sale');
    }

    // Ensure sale has been synced to Zoho
    if (!sale.syncedToZoho || !sale.zohoSalesReceiptId) {
      return sendError(
        res,
        'Sale is not synced to Zoho or does not have a Zoho sales receipt ID',
        400
      );
    }

    // If already cancelled, prevent duplicate voids
    if (sale.cancelledInZoho) {
      return sendError(
        res,
        'This transaction has already been cancelled in Zoho',
        400
      );
    }

    // Void the sales receipt in Zoho
    const voidResult = await voidSalesReceipt(sale.zohoSalesReceiptId);

    if (!voidResult.success) {
      return sendError(
        res,
        `Failed to cancel transaction in Zoho: ${voidResult.error}`,
        400
      );
    }

    // Mark sale as cancelled locally
    await sale.update({
      cancelledInZoho: true,
      syncedToZoho: false,
      syncError: 'Cancelled in Zoho'
    });

    return sendSuccess(
      res,
      {
        sale: {
          id: sale.id,
          zohoSalesReceiptId: sale.zohoSalesReceiptId,
          cancelledInZoho: true
        },
        zoho: voidResult
      },
      'Transaction cancelled successfully in Zoho'
    );
  } catch (err) {
    console.error('Cancel Zoho transaction error:', err);
    return sendError(res, 'Failed to cancel transaction in Zoho', 500, err);
  }
};

