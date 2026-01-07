import express from 'express';
import { syncZohoCustomers, syncZohoItems, syncAll, getOrganization, getTaxRatesList, getLocationsList, getCustomerOpenSalesOrders, getSalesOrderDetails, getCustomerInvoicesList, getInvoiceDetails } from '../controllers/zohoController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

router.post('/sync/customers', authenticate, syncZohoCustomers);
router.post('/sync/items', authenticate, syncZohoItems);
router.post('/sync/all', authenticate, syncAll);
router.get('/organization', authenticate, getOrganization);
router.get('/taxes', getTaxRatesList); // Public endpoint for registration page
router.get('/locations', getLocationsList); // Public endpoint for registration page
router.get('/salesorders', authenticate, getCustomerOpenSalesOrders);
router.get('/salesorders/:salesorder_id', authenticate, getSalesOrderDetails);
router.get('/invoices', authenticate, getCustomerInvoicesList);
router.get('/invoices/:invoice_id', authenticate, getInvoiceDetails);

export default router;
