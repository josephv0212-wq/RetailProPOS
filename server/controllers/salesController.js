import { Op } from 'sequelize';
import { Sale, SaleItem, Item, Customer } from '../models/index.js';
import { processPayment, processAchPayment, calculateCreditCardFee } from '../services/authorizeNetService.js';
import { processTerminalPayment } from '../services/paxTerminalService.js';
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
    const { items, customerId, paymentType, paymentDetails, notes, terminalIP, useTerminal, useBluetoothReader, bluetoothPayload, customerTaxPreference } = req.body;
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
      } catch (contactTypeError) {
        console.warn(`⚠️ Unable to verify contact type for Zoho customer ${customer?.id}:`, contactTypeError.message);
      }
    }
    
    const baseTotal = subtotal + taxAmount;
    const creditCardProcessingFee = paymentType === 'credit_card'
      ? calculateCreditCardFee(subtotal, taxAmount)
      : 0;

    const total = baseTotal + creditCardProcessingFee;

    let transactionId = null;
    let paymentResult = null;

    // Process payment based on payment type
    if (paymentType === 'credit_card' || paymentType === 'debit_card') {
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
      } else if (useTerminal) {
        // PAX Terminal mode - process through physical terminal
        paymentResult = await processTerminalPayment({
          amount: total,
          invoiceNumber: `POS-${Date.now()}`,
          description: `POS Sale - ${locationName}`
        }, terminalIP);

        if (!paymentResult.success) {
          return sendError(res, 'Terminal payment processing failed', 400, paymentResult.error);
        }

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
      ccFee: creditCardProcessingFee.toFixed(2), // Credit card processing fee (if applicable)
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
        const zohoResult = await createSalesReceipt({
          customerId: customer.zohoId, // Using the customer's zohoId from Zoho Books
          date: new Date().toISOString().split('T')[0],
          lineItems: saleItemsData,
          locationId,
          locationName,
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

    const zohoResult = await createSalesReceipt({
      customerId: sale.customer.zohoId, // Using the customer's zohoId from Zoho Books
      date: sale.createdAt.toISOString().split('T')[0],
      lineItems: saleItemsData,
      locationId: sale.locationId,
      locationName: sale.locationName,
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
