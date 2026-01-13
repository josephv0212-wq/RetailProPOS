import { Op } from 'sequelize';
import { Sale, SaleItem, Item, Customer } from '../models/index.js';
import { processPayment, processAchPayment, calculateCreditCardFee, chargeCustomerProfile, getCustomerProfileDetails, extractPaymentProfiles } from '../services/authorizeNetService.js';
import { processTerminalPayment } from '../services/paxTerminalService.js';
import { processTerminalPayment as processEBizChargePayment } from '../services/ebizchargeTerminalService.js';
import { processBluetoothPayment } from '../services/bbposService.js';
import { createSalesReceipt, getCustomerById as getZohoCustomerById } from '../services/zohoService.js';
import { printReceipt } from '../services/printerService.js';
import { sendSuccess, sendError, sendNotFound, sendValidationError } from '../utils/responseHelper.js';

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
    const { items, customerId, paymentType, paymentDetails, notes, terminalIP, useTerminal, useValorApi, useEBizChargeTerminal, useBluetoothReader, bluetoothPayload, customerTaxPreference, useStoredPayment, paymentProfileId, terminalNumber, valorTransactionId } = req.body;
    const userId = req.user.id;
    const locationId = req.user.locationId;
    const locationName = req.user.locationName;
    
    // Check if customer is tax exempt
    const isTaxExempt = customerTaxPreference === 'SALES TAX EXCEPTION CERTIFICATE';
    
    // Get user's tax percentage from their location (including "(7%)" naming), default to 7.5%
    // But set to 0 if customer is tax exempt
    const userTaxPercentage = isTaxExempt ? 0 : resolveTaxPercentage(req.user);
    const taxRate = userTaxPercentage / 100;
    

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
      const price = parseFloat(item.price);
      const lineSubtotal = price * quantity;
      // Use user's location tax rate instead of item's tax percentage
      const itemTax = lineSubtotal * taxRate;
      // Only send Zoho tax_id when it matches the applied tax rate; otherwise let Zoho use our explicit percentage
      const includeTaxId = item.taxId && Math.abs((parseFloat(item.taxPercentage) || 0) - userTaxPercentage) < 0.0001;
      
      subtotal += lineSubtotal;
      taxAmount += itemTax;

      saleItemsData.push({
        itemId: item.id,
        zohoItemId: item.zohoId,
        itemName: item.name,
        quantity: quantity,
        price: price,
        taxPercentage: userTaxPercentage, // Use user's location tax rate
        taxAmount: itemTax,
        lineTotal: lineSubtotal + itemTax,
        taxId: includeTaxId ? item.taxId : null
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
            actualPaymentType = selectedProfile.type === 'ach' ? 'ach' : 'credit_card';
          }
        }
      }
    }
    
    // 3% convenience fee applies to all card payments (credit and debit)
    cardProcessingFee = (actualPaymentType === 'credit_card' || actualPaymentType === 'debit_card')
      ? calculateCreditCardFee(subtotal, taxAmount)
      : 0;

    const total = baseTotal + cardProcessingFee;

    let transactionId = null;
    let paymentResult = null;

    // Process payment based on payment type
    if (useStoredPayment && paymentProfileId && customer) {
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
      paymentResult = await chargeCustomerProfile({
        customerProfileId,
        customerPaymentProfileId: paymentProfileId,
        amount: total,
        invoiceNumber: `POS-${Date.now()}`,
        description: `POS Sale - ${locationName}`
      });

      if (!paymentResult.success) {
        return sendError(res, 'Stored payment processing failed', 400, paymentResult.error);
      }

      transactionId = paymentResult.transactionId;
      // Update paymentType to actual type determined from profile
      paymentType = actualPaymentType;
    } else if (paymentType === 'credit_card' || paymentType === 'debit_card') {
      if (useBluetoothReader) {
        // Bluetooth Card Reader mode - process using opaqueData from reader
        if (!bluetoothPayload || !bluetoothPayload.descriptor || !bluetoothPayload.value) {
          return sendValidationError(res, 'Bluetooth reader payment data is required. Please pair and scan the card with the Bluetooth reader.');
        }

        paymentResult = await processBluetoothPayment({
          amount: total,
          opaqueData: {
            descriptor: bluetoothPayload.descriptor,
            value: bluetoothPayload.value
          },
          deviceSessionId: bluetoothPayload.sessionId,
          invoiceNumber: `POS-${Date.now()}`,
          description: `POS Sale - ${locationName}`
        });

        if (!paymentResult.success) {
          return sendError(res, 'Bluetooth reader payment processing failed', 400, paymentResult.error);
        }

        transactionId = paymentResult.transactionId;
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
      } else if (useEBizChargeTerminal) {
        // EBizCharge Terminal mode - process through EBizCharge WiFi terminal
        if (!terminalIP) {
          return sendValidationError(res, 'Terminal IP address is required for EBizCharge terminal payments');
        }
        
        paymentResult = await processEBizChargePayment({
          amount: total,
          invoiceNumber: `POS-${Date.now()}`,
          description: `POS Sale - ${locationName}`
        }, terminalIP);

        if (!paymentResult.success) {
          return sendError(res, 'EBizCharge terminal payment processing failed', 400, paymentResult.error);
        }

        transactionId = paymentResult.transactionId;
      } else if (useTerminal) {
        // PAX Terminal mode - process through Authorize.Net Valor Connect (cloud-to-cloud)
        // Flow: App -> Authorize.Net -> VP100 Terminal (via Valor Connect) -> Authorize.Net -> App (polling)
        const { initiateTerminalPayment } = await import('../services/authorizeNetTerminalService.js');
        
        // Get terminalNumber from user settings (VP100 serial number registered in Valor Portal/Authorize.Net)
        const terminalNumber = req.user.terminalNumber;
        
        if (!terminalNumber) {
          return sendError(res, 'Terminal number is required for PAX WiFi terminal payments. Please configure your VP100 serial number in Settings. The terminal must be registered in Valor Portal/Authorize.Net.', 400);
        }
        
        // Initiate payment request to Authorize.Net with terminalNumber
        // Authorize.Net routes to VP100 via Valor Connect (WebSocket/TCP)
        paymentResult = await initiateTerminalPayment({
          amount: total,
          invoiceNumber: `POS-${Date.now()}`,
          description: `POS Sale - ${locationName}`
        }, terminalNumber); // terminalNumber is the VP100 serial number

        if (!paymentResult.success) {
          console.error('❌ Terminal payment initiation failed:', {
            error: paymentResult.error,
            errorCode: paymentResult.errorCode,
            terminalNumber: terminalNumber
          });
          return sendError(res, paymentResult.error || 'Failed to initiate terminal payment', 400, paymentResult);
        }

        // If payment is pending (waiting for terminal), return pending status
        // Frontend will poll for status
        if (paymentResult.pending) {
          return res.status(202).json({
            success: true,
            pending: true,
            message: paymentResult.message || 'Payment request sent to terminal. Waiting for customer to complete payment on VP100 device.',
            data: {
              transactionId: paymentResult.transactionId,
              refId: paymentResult.refId,
              status: 'pending',
              sale: null // Sale will be created after payment confirmation
            }
          });
        }

        // If payment completed immediately (unlikely for terminal)
        transactionId = paymentResult.transactionId;
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
    } else if (paymentType === 'cash') {
      // Cash payment - no processing needed
      transactionId = `CASH-${Date.now()}`;
      paymentResult = {
        success: true,
        message: 'Cash payment recorded',
        transactionId: transactionId
      };
    } else if (paymentType === 'zelle') {
      // Zelle payment - store confirmation number
      if (paymentDetails && paymentDetails.zelleConfirmation) {
        transactionId = `ZELLE-${paymentDetails.zelleConfirmation}`;
        paymentResult = {
          success: true,
          message: 'Zelle payment recorded',
          transactionId: transactionId
        };
      } else {
        return sendValidationError(res, 'Zelle confirmation number required');
      }
    }

    // Warn if customer has no Zoho ID (for production error tracking)
    if (customer && !customer.zohoId) {
      console.warn(`⚠️ Customer "${customer.contactName}" has no Zoho ID. Invoice will not be created in Zoho Books.`);
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
      notes
    });

    // Optimize: Batch create all sale items in a single operation
    await SaleItem.bulkCreate(
      saleItemsData.map(itemData => ({
        saleId: sale.id,
        ...itemData
      }))
    );

    // Attempt Zoho sync if customer has zohoId
    // IMPORTANT: We use customer.zohoId (the Zoho Books contact_id) to create invoices
    const isZohoCustomer = customer && customer.zohoId && zohoContactType === 'customer';
    if (isZohoCustomer) {
      try {
        // For Zoho, ccFee is the credit card processing fee (if any)
        // Pass customerLocation to enforce correct tax rate - Zoho uses place_of_contact to determine tax rate
        const zohoResult = await createSalesReceipt({
          customerId: customer.zohoId, // Using the customer's zohoId from Zoho Books
          date: new Date().toISOString().split('T')[0],
          lineItems: saleItemsData,
          locationId,
          locationName,
          customerLocation, // Customer's location from Zoho - ensures correct tax rate is applied
          taxAmount: parseFloat(sale.taxAmount),
          ccFee: parseFloat(sale.ccFee), // Credit card processing fee
          total: parseFloat(sale.total),
          paymentType: sale.paymentType,
          notes: sale.notes,
          saleId: sale.id
        });

        if (zohoResult.success) {
          await sale.update({
            syncedToZoho: true,
            zohoSalesReceiptId: zohoResult.salesReceiptId
          });
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
    return sendError(res, 'Sale creation failed. Please try again.', 500, err);
  }
};

export const getSales = async (req, res) => {
  try {
    const { locationId, startDate, endDate, syncedToZoho } = req.query;
    const userLocationId = req.user.locationId;

    const where = {
      locationId: locationId || userLocationId
    };

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
        { association: 'user', attributes: ['username'] }
      ],
      order: [['createdAt', 'DESC']]
    });

    return sendSuccess(res, { sales });
  } catch (err) {
    console.error('Get sales error:', err);
    return sendError(res, 'Failed to fetch sales', 500, err);
  }
};

export const getSaleById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const sale = await Sale.findByPk(id, {
      include: [
        { association: 'items' },
        { association: 'customer' },
        { association: 'user', attributes: ['username'] }
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
      taxId: item.taxId
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
    const { limit = 10 } = req.query;
    const userLocationId = req.user.locationId;
    
    const sales = await Sale.findAll({
      where: {
        locationId: userLocationId
      },
      include: [
        { 
          association: 'customer',
          attributes: ['id', 'contactName', 'zohoId']
        }
      ],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit)
    });

    const status = sales.map(sale => ({
      saleId: sale.id,
      total: sale.total,
      createdAt: sale.createdAt,
      customer: sale.customer ? {
        id: sale.customer.id,
        name: sale.customer.contactName,
        hasZohoId: !!sale.customer.zohoId,
        zohoId: sale.customer.zohoId
      } : null,
      syncedToZoho: sale.syncedToZoho,
      zohoSalesReceiptId: sale.zohoSalesReceiptId,
      syncError: sale.syncError
    }));

    return sendSuccess(res, { 
      sales: status,
      summary: {
        total: sales.length,
        synced: sales.filter(s => s.syncedToZoho).length,
        failed: sales.filter(s => !s.syncedToZoho && s.syncError).length,
        noCustomer: sales.filter(s => !s.customer).length,
        noZohoId: sales.filter(s => s.customer && !s.customer.zohoId).length
      }
    });
  } catch (err) {
    console.error('Get sync status error:', err);
    return sendError(res, 'Failed to fetch sync status', 500, err);
  }
};

/**
 * Charge customer for selected invoices and/or sales orders using Authorize.net CIM
 * POST /sales/charge-invoices
 * Body: { customerId, items: [{ type: 'invoice'|'salesorder', id: string, number: string, amount: number }] }
 */
export const chargeInvoicesSalesOrders = async (req, res) => {
  try {
    const { customerId, items, paymentProfileId } = req.body;

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

    // Process each invoice/sales order
    const results = [];
    const errors = [];

    for (const item of items) {
      const { type, id, number, amount } = item;

      if (!type || !id || !number || !amount) {
        errors.push({
          item: { type, id, number },
          error: 'Missing required fields: type, id, number, or amount'
        });
        continue;
      }

      if (amount <= 0) {
        errors.push({
          item: { type, id, number },
          error: 'Amount must be greater than 0'
        });
        continue;
      }

      try {
        const invoiceNumber = type === 'invoice' ? number : `SO-${number}`;
        const description = type === 'invoice' 
          ? `Invoice Payment: ${number}`
          : `Sales Order Payment: ${number}`;

        const chargeResult = await chargeCustomerProfile({
          customerProfileId,
          customerPaymentProfileId,
          amount: parseFloat(amount),
          invoiceNumber,
          description
        });

        if (chargeResult.success) {
          results.push({
            type,
            id,
            number,
            amount: parseFloat(amount),
            transactionId: chargeResult.transactionId,
            authCode: chargeResult.authCode,
            message: chargeResult.message,
            success: true,
            underReview: chargeResult.underReview || false,
            reviewStatus: chargeResult.reviewStatus || null
          });
        } else {
          errors.push({
            item: { type, id, number },
            error: chargeResult.error,
            errorCode: chargeResult.errorCode,
            responseCode: chargeResult.responseCode
          });
        }
      } catch (err) {
        console.error(`Error charging ${type} ${number}:`, err);
        errors.push({
          item: { type, id, number },
          error: err.message || 'Unknown error occurred'
        });
      }
    }

    // Return results
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
        total: items.length,
        successful: results.length,
        failed: errors.length
      }
    }, `Processed ${results.length} of ${items.length} items successfully`);
  } catch (err) {
    console.error('Charge invoices/sales orders error:', err);
    return sendError(res, 'Failed to charge invoices/sales orders', 500, err);
  }
};
