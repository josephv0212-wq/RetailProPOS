import express from 'express';
import { getItems, getItemById, getItemsFromPricebook } from '../controllers/itemController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

router.get('/pricebook', authenticate, getItemsFromPricebook);
router.get('/', authenticate, getItems);
router.get('/:id', authenticate, getItemById);

export default router;
