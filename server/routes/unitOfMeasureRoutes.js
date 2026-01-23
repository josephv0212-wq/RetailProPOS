import express from 'express';
import { getUnits, createUnit, deleteUnit } from '../controllers/unitOfMeasureController.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

router.get('/', authenticate, getUnits);
router.post('/', authenticate, requireAdmin, createUnit);
router.delete('/:id', authenticate, requireAdmin, deleteUnit);

export default router;
