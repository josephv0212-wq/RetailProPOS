import express from 'express';
import { getCustomers, getCustomerById, getCustomerByLocation, getCustomerPriceList, getCustomerPaymentProfiles, getCustomerCheckoutData } from '../controllers/customerController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

router.get('/', authenticate, getCustomers);
router.get('/:id/checkout-data', authenticate, getCustomerCheckoutData);
router.get('/:id/price-list', authenticate, getCustomerPriceList);
router.get('/:id/payment-profiles', authenticate, getCustomerPaymentProfiles);
router.get('/:id', authenticate, getCustomerById);
router.get('/location/:locationId', authenticate, getCustomerByLocation);

export default router;
