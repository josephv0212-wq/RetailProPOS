import express from 'express';
import { getItems, getItemById, getItemsFromPricebook, updateItemImage } from '../controllers/itemController.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

router.get('/pricebook', authenticate, getItemsFromPricebook);
router.get('/', authenticate, getItems);
router.get('/:id', authenticate, getItemById);

// Admin-only: update item image (base64 data)
router.post('/:id/image', authenticate, requireAdmin, updateItemImage);

export default router;
