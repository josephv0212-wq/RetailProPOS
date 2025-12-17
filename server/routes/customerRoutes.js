import express from 'express';
import { getCustomers, getCustomerById, getCustomerByLocation, getCustomerPriceList } from '../controllers/customerController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

router.get('/', authenticate, getCustomers);
router.get('/:id/price-list', authenticate, getCustomerPriceList);
router.get('/:id', authenticate, getCustomerById);
router.get('/location/:locationId', authenticate, getCustomerByLocation);

export default router;
