import express from 'express';
import { getItems, getItemById, getItemsFromPricebook, updateItemImage, syncItemsFromZoho } from '../controllers/itemController.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

router.get('/pricebook', authenticate, getItemsFromPricebook);
router.post('/sync', authenticate, syncItemsFromZoho);
router.get('/', authenticate, getItems);
router.get('/:id', authenticate, getItemById);

// Admin-only: update item image (base64 data)
router.post('/:id/image', authenticate, requireAdmin, updateItemImage);

export default router;
