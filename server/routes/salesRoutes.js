import express from 'express';
import { createSale, getSales, getSaleById, retryZohoSync, getSyncStatus, chargeInvoicesSalesOrders, cancelZohoTransaction, getTransactions, getInvoicePayments } from '../controllers/salesController.js';
import { authenticate, requireLocation } from '../middleware/auth.js';
import { validateSale } from '../middleware/validation.js';

const router = express.Router();

router.post('/', authenticate, requireLocation, validateSale, createSale);
router.post('/charge-invoices', authenticate, requireLocation, chargeInvoicesSalesOrders);
router.get('/', authenticate, requireLocation, getSales);
router.get('/transactions', authenticate, requireLocation, getTransactions);
router.get('/invoice-payments', authenticate, requireLocation, getInvoicePayments);
router.get('/sync/status', authenticate, requireLocation, getSyncStatus);
router.post('/:id/sync/zoho', authenticate, retryZohoSync);
router.post('/:id/cancel-zoho', authenticate, requireLocation, cancelZohoTransaction);
router.get('/:id', authenticate, getSaleById);

export default router;
