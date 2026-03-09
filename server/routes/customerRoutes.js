import express from 'express';
import { getCustomers, getCustomerById, getCustomerByLocation, getCustomerPriceList, getCustomerPaymentProfiles, getCustomerCheckoutData, invalidatePaymentProfilesCacheHandler, getAutoInvoiceCustomers, addAutoInvoiceCustomer, removeAutoInvoiceCustomer } from '../controllers/customerController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

router.get('/', authenticate, getCustomers);
router.get('/auto-invoice/list', authenticate, getAutoInvoiceCustomers);
router.post('/auto-invoice/add', authenticate, addAutoInvoiceCustomer);
router.delete('/auto-invoice/:customerId', authenticate, removeAutoInvoiceCustomer);
router.post('/invalidate-payment-cache', authenticate, (req, res, next) => {
  req.params = {};
  return invalidatePaymentProfilesCacheHandler(req, res, next);
});
router.post('/:id/invalidate-payment-cache', authenticate, invalidatePaymentProfilesCacheHandler);
router.get('/:id/checkout-data', authenticate, getCustomerCheckoutData);
router.get('/:id/price-list', authenticate, getCustomerPriceList);
router.get('/:id/payment-profiles', authenticate, getCustomerPaymentProfiles);
router.get('/:id', authenticate, getCustomerById);
router.get('/location/:locationId', authenticate, getCustomerByLocation);

export default router;
