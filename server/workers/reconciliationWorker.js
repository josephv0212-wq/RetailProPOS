import { Order, Payment } from '../models/index.js';
import { getRecentTransactions, getTransactionsByBatch } from '../services/authorizeNetService.js';
import { Op } from 'sequelize';

/**
 * Reconciliation Worker
 * 
 * Runs every 60 seconds to:
 * 1. Fetch recent transactions from Authorize.net (last 10-15 minutes)
 * 2. Match transactions to orders using invoiceNumber and amount
 * 3. Update order/payment status in database
 * 
 * Matching Logic:
 * - Primary: invoiceNumber (must match exactly)
 * - Secondary: amount (must match within $0.01 tolerance)
 * - Time window: transaction must be within 15 minutes of order creation
 */

let isRunning = false;
let workerInterval = null;

/**
 * Match a transaction to an order
 * @param {Object} transaction - Transaction from Authorize.net
 * @returns {Promise<Order|null>} Matched order or null
 */
const matchTransactionToOrder = async (transaction) => {
  if (!transaction.invoiceNumber) {
    return null;
  }

  // Find order by invoice number
  const order = await Order.findOne({
    where: {
      invoiceNumber: transaction.invoiceNumber,
      status: 'OPEN' // Only match to open orders
    }
  });

  if (!order) {
    return null;
  }

  // Verify amount matches (within $0.01 tolerance for rounding)
  const orderAmount = parseFloat(order.amount);
  const transactionAmount = parseFloat(transaction.amount);
  const amountDiff = Math.abs(orderAmount - transactionAmount);

  if (amountDiff > 0.01) {
    console.warn(`⚠️  Amount mismatch for order ${order.invoiceNumber}: order=${orderAmount}, txn=${transactionAmount}`);
    return null;
  }

  // Verify time window (transaction should be within 15 minutes of order creation)
  const orderTime = new Date(order.createdAt);
  const transactionTime = transaction.submittedAt ? new Date(transaction.submittedAt) : new Date();
  const timeDiffMinutes = (transactionTime - orderTime) / (1000 * 60);

  if (timeDiffMinutes < 0 || timeDiffMinutes > 15) {
    console.warn(`⚠️  Time window mismatch for order ${order.invoiceNumber}: ${timeDiffMinutes.toFixed(2)} minutes`);
    return null;
  }

  return order;
};

/**
 * Process a matched transaction
 * Creates or updates payment record and updates order status
 */
const processMatchedTransaction = async (transaction, order) => {
  try {
    // Check if payment already exists for this transaction
    let payment = await Payment.findOne({
      where: {
        transactionId: transaction.transactionId
      }
    });

    if (payment) {
      // Payment already exists, just update if needed
      console.log(`ℹ️  Payment already exists for transaction ${transaction.transactionId}`);
      return;
    }

    // Determine payment status based on transaction status
    let paymentStatus = 'AUTHORIZED';
    if (transaction.transactionStatus === 'settledSuccessfully' || transaction.settledAt) {
      paymentStatus = 'CAPTURED';
    }

    // Create payment record
    payment = await Payment.create({
      orderId: order.id,
      provider: 'AUTHORIZE_NET',
      transactionId: transaction.transactionId,
      authCode: transaction.authCode || null,
      status: paymentStatus,
      amount: transaction.amount,
      rawResponse: transaction.rawResponse || null,
      settledAt: transaction.settledAt ? new Date(transaction.settledAt) : null
    });

    // Update order status to PAID
    await order.update({
      status: 'PAID'
    });

    console.log(`✅ Matched and processed: Order ${order.invoiceNumber} -> Transaction ${transaction.transactionId} (${paymentStatus})`);
  } catch (error) {
    console.error(`❌ Error processing matched transaction ${transaction.transactionId}:`, error.message);
  }
};

/**
 * Run reconciliation cycle
 * Fetches recent transactions and matches them to orders
 */
const runReconciliation = async () => {
  if (isRunning) {
    console.log('⏭️  Reconciliation already running, skipping...');
    return;
  }

  isRunning = true;
  const startTime = Date.now();

  try {
    console.log('🔄 Starting reconciliation cycle...');

    // Try to get transactions by batch first (more reliable)
    let transactions = await getTransactionsByBatch();

    // If batch method returns empty, fall back to date-based query
    if (transactions.length === 0) {
      console.log('ℹ️  No transactions found in recent batches, trying date-based query...');
      transactions = await getRecentTransactions(15); // Last 15 minutes
    }

    if (transactions.length === 0) {
      console.log('ℹ️  No recent transactions found');
      return;
    }

    console.log(`📊 Found ${transactions.length} recent transaction(s) to process`);

    let matchedCount = 0;
    let processedCount = 0;

    // Process each transaction
    for (const transaction of transactions) {
      try {
        // Skip if transaction already exists in our database
        const existingPayment = await Payment.findOne({
          where: {
            transactionId: transaction.transactionId
          }
        });

        if (existingPayment) {
          continue; // Already processed
        }

        // Try to match transaction to an order
        const order = await matchTransactionToOrder(transaction);

        if (order) {
          matchedCount++;
          await processMatchedTransaction(transaction, order);
          processedCount++;
        }
      } catch (error) {
        console.error(`❌ Error processing transaction ${transaction.transactionId}:`, error.message);
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`✅ Reconciliation complete: ${matchedCount} matched, ${processedCount} processed (${duration}s)`);
  } catch (error) {
    console.error('❌ Reconciliation cycle error:', error.message);
  } finally {
    isRunning = false;
  }
};

/**
 * Start the reconciliation worker
 * Runs every 60 seconds
 */
export const startReconciliationWorker = () => {
  if (workerInterval) {
    console.log('⚠️  Reconciliation worker already running');
    return;
  }

  console.log('🚀 Starting reconciliation worker (runs every 60 seconds)...');

  // Run immediately on startup
  runReconciliation();

  // Then run every 60 seconds
  workerInterval = setInterval(() => {
    runReconciliation();
  }, 60 * 1000); // 60 seconds
};

/**
 * Stop the reconciliation worker
 */
export const stopReconciliationWorker = () => {
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
    console.log('🛑 Reconciliation worker stopped');
  }
};

/**
 * Manually trigger a reconciliation cycle
 * Useful for testing or manual reconciliation
 */
export const triggerReconciliation = async () => {
  await runReconciliation();
};

