import express from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  createOrder,
  getPaymentStatus,
  voidPayment,
  refundPayment
} from '../controllers/orderController.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/**
 * POST /api/orders
 * Create a new order with invoice number
 */
router.post('/', createOrder);

/**
 * GET /api/orders/:id/payment-status
 * Get current payment status for an order (used by frontend polling)
 */
router.get('/:id/payment-status', getPaymentStatus);

/**
 * POST /api/orders/:orderId/void
 * Void an unsettled transaction
 */
router.post('/:orderId/void', voidPayment);

/**
 * POST /api/orders/:orderId/refund
 * Refund a settled transaction
 */
router.post('/:orderId/refund', refundPayment);

export default router;

