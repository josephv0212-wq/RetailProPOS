import { Order, Payment, User } from '../models/index.js';
import { voidTransaction, refundTransaction, getTransactionDetails } from '../services/authorizeNetService.js';
import { sendSuccess, sendError, sendNotFound, sendValidationError } from '../utils/responseHelper.js';
import { Op } from 'sequelize';

/**
 * Generate a unique invoice number
 * Format: LANE{ID}-YYYYMMDD-{SEQUENCE}
 * Example: LANE01-20240115-000123
 */
const generateInvoiceNumber = (laneId) => {
  const date = new Date();
  const dateStr = date.toISOString().split('T')[0].replace(/-/g, '');
  
  // Extract lane number from laneId (e.g., "LANE-01" -> "01")
  const laneNum = laneId.replace(/[^0-9]/g, '').padStart(2, '0');
  
  // Get today's sequence number (count orders for today)
  return Order.count({
    where: {
      invoiceNumber: {
        [Op.like]: `LANE${laneNum}-${dateStr}-%`
      }
    }
  }).then(count => {
    const sequence = String(count + 1).padStart(6, '0');
    return `LANE${laneNum}-${dateStr}-${sequence}`;
  });
};

/**
 * POST /api/orders
 * Create a new order with invoice number
 * Body: { amount, laneId, notes? }
 */
export const createOrder = async (req, res) => {
  try {
    const { amount, laneId, notes } = req.body;
    const userId = req.user?.id || null;

    // Validation
    if (!amount || amount <= 0) {
      return sendValidationError(res, 'Amount is required and must be greater than 0');
    }

    if (!laneId) {
      return sendValidationError(res, 'Lane ID is required');
    }

    // Generate invoice number
    const invoiceNumber = await generateInvoiceNumber(laneId);

    // Create order
    const order = await Order.create({
      invoiceNumber,
      laneId,
      amount: parseFloat(amount).toFixed(2),
      status: 'OPEN',
      userId,
      notes: notes || null
    });

    return sendSuccess(res, {
      order: {
        id: order.id,
        invoiceNumber: order.invoiceNumber,
        laneId: order.laneId,
        amount: parseFloat(order.amount),
        status: order.status,
        createdAt: order.createdAt
      }
    }, 'Order created successfully', 201);
  } catch (error) {
    console.error('Create Order Error:', error);
    return sendError(res, error.message || 'Failed to create order');
  }
};

/**
 * GET /api/orders/:id/payment-status
 * Get current payment status for an order
 * Used by frontend polling
 */
export const getPaymentStatus = async (req, res) => {
  try {
    const { id } = req.params;

    const order = await Order.findByPk(id, {
      include: [{
        model: Payment,
        as: 'payments',
        required: false,
        order: [['createdAt', 'DESC']] // Most recent payment first
      }]
    });

    if (!order) {
      return sendNotFound(res, 'Order not found');
    }

    const latestPayment = order.payments && order.payments.length > 0 
      ? order.payments[0] 
      : null;

    // Determine if transaction is settled (can refund) or unsettled (can void)
    let canVoid = false;
    let canRefund = false;
    
    if (latestPayment) {
      // Check transaction status from Authorize.net
      const txnDetails = await getTransactionDetails(latestPayment.transactionId);
      
      if (txnDetails.success && txnDetails.transaction) {
        const txnStatus = txnDetails.transaction.transactionStatus;
        const isSettled = txnStatus === 'settledSuccessfully' || latestPayment.settledAt !== null;
        
        canVoid = !isSettled && latestPayment.status === 'AUTHORIZED';
        canRefund = isSettled && latestPayment.status === 'CAPTURED';
      } else {
        // Fallback: use payment status
        canVoid = latestPayment.status === 'AUTHORIZED';
        canRefund = latestPayment.status === 'CAPTURED';
      }
    }

    return sendSuccess(res, {
      order: {
        id: order.id,
        invoiceNumber: order.invoiceNumber,
        laneId: order.laneId,
        amount: parseFloat(order.amount),
        status: order.status,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt
      },
      payment: latestPayment ? {
        id: latestPayment.id,
        transactionId: latestPayment.transactionId,
        authCode: latestPayment.authCode,
        status: latestPayment.status,
        amount: parseFloat(latestPayment.amount),
        settledAt: latestPayment.settledAt,
        createdAt: latestPayment.createdAt
      } : null,
      actions: {
        canVoid,
        canRefund
      }
    });
  } catch (error) {
    console.error('Get Payment Status Error:', error);
    return sendError(res, error.message || 'Failed to get payment status');
  }
};

/**
 * POST /api/payments/:orderId/void
 * Void an unsettled transaction
 */
export const voidPayment = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findByPk(orderId, {
      include: [{
        model: Payment,
        as: 'payments',
        required: false,
        order: [['createdAt', 'DESC']]
      }]
    });

    if (!order) {
      return sendNotFound(res, 'Order not found');
    }

    if (order.status === 'VOIDED') {
      return sendValidationError(res, 'Order is already voided');
    }

    const latestPayment = order.payments && order.payments.length > 0 
      ? order.payments[0] 
      : null;

    if (!latestPayment) {
      return sendValidationError(res, 'No payment found for this order');
    }

    if (latestPayment.status === 'VOIDED') {
      return sendValidationError(res, 'Payment is already voided');
    }

    // Check if transaction is settled (can't void settled transactions)
    const txnDetails = await getTransactionDetails(latestPayment.transactionId);
    
    if (txnDetails.success && txnDetails.transaction) {
      const txnStatus = txnDetails.transaction.transactionStatus;
      const isSettled = txnStatus === 'settledSuccessfully' || latestPayment.settledAt !== null;
      
      if (isSettled) {
        return sendValidationError(res, 'Cannot void a settled transaction. Use refund instead.');
      }
    }

    // Void the transaction
    const voidResult = await voidTransaction(latestPayment.transactionId);

    if (!voidResult.success) {
      return sendError(res, voidResult.error || 'Failed to void transaction');
    }

    // Update payment status
    await latestPayment.update({
      status: 'VOIDED'
    });

    // Update order status
    await order.update({
      status: 'VOIDED'
    });

    return sendSuccess(res, {
      order: {
        id: order.id,
        status: order.status
      },
      payment: {
        id: latestPayment.id,
        transactionId: latestPayment.transactionId,
        status: latestPayment.status
      },
      message: voidResult.message || 'Transaction voided successfully'
    });
  } catch (error) {
    console.error('Void Payment Error:', error);
    return sendError(res, error.message || 'Failed to void payment');
  }
};

/**
 * POST /api/payments/:orderId/refund
 * Refund a settled transaction
 * Body: { amount? } - Optional, defaults to full refund
 */
export const refundPayment = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { amount } = req.body;

    const order = await Order.findByPk(orderId, {
      include: [{
        model: Payment,
        as: 'payments',
        required: false,
        order: [['createdAt', 'DESC']]
      }]
    });

    if (!order) {
      return sendNotFound(res, 'Order not found');
    }

    if (order.status === 'REFUNDED') {
      return sendValidationError(res, 'Order is already refunded');
    }

    const latestPayment = order.payments && order.payments.length > 0 
      ? order.payments[0] 
      : null;

    if (!latestPayment) {
      return sendValidationError(res, 'No payment found for this order');
    }

    if (latestPayment.status === 'REFUNDED') {
      return sendValidationError(res, 'Payment is already refunded');
    }

    // Check if transaction is settled (can only refund settled transactions)
    const txnDetails = await getTransactionDetails(latestPayment.transactionId);
    
    if (txnDetails.success && txnDetails.transaction) {
      const txnStatus = txnDetails.transaction.transactionStatus;
      const isSettled = txnStatus === 'settledSuccessfully' || latestPayment.settledAt !== null;
      
      if (!isSettled) {
        return sendValidationError(res, 'Cannot refund an unsettled transaction. Use void instead.');
      }
    }

    // Validate refund amount
    const refundAmount = amount ? parseFloat(amount) : parseFloat(latestPayment.amount);
    const paymentAmount = parseFloat(latestPayment.amount);

    if (refundAmount <= 0 || refundAmount > paymentAmount) {
      return sendValidationError(res, `Refund amount must be between 0 and ${paymentAmount.toFixed(2)}`);
    }

    // Refund the transaction
    const refundResult = await refundTransaction(
      latestPayment.transactionId,
      refundAmount === paymentAmount ? null : refundAmount, // null = full refund
      null // cardNumber not required for refunds
    );

    if (!refundResult.success) {
      return sendError(res, refundResult.error || 'Failed to refund transaction');
    }

    // Update payment status
    await latestPayment.update({
      status: 'REFUNDED',
      amount: refundAmount // Update amount if partial refund
    });

    // Update order status
    await order.update({
      status: 'REFUNDED'
    });

    return sendSuccess(res, {
      order: {
        id: order.id,
        status: order.status
      },
      payment: {
        id: latestPayment.id,
        transactionId: latestPayment.transactionId,
        status: latestPayment.status,
        amount: refundAmount
      },
      message: refundResult.message || 'Refund processed successfully'
    });
  } catch (error) {
    console.error('Refund Payment Error:', error);
    return sendError(res, error.message || 'Failed to refund payment');
  }
};

