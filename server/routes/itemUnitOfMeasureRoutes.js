import express from 'express';
import { getItemUnits, addItemUnit, removeItemUnit, setDefaultUnit } from '../controllers/itemUnitOfMeasureController.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

router.get('/:itemId/units', authenticate, getItemUnits);
router.post('/:itemId/units', authenticate, requireAdmin, addItemUnit);
router.delete('/:itemId/units/:unitOfMeasureId', authenticate, requireAdmin, removeItemUnit);
router.patch('/:itemId/units/:unitOfMeasureId/default', authenticate, requireAdmin, setDefaultUnit);

export default router;
