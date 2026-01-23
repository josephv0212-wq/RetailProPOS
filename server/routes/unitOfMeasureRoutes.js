import express from 'express';
import { getUnits, getAllUnits, createUnit, updateUnit, deleteUnit } from '../controllers/unitOfMeasureController.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

router.get('/', authenticate, getUnits);
router.get('/all', authenticate, getAllUnits); // Get all units including basic UMs
router.post('/', authenticate, requireAdmin, createUnit);
router.put('/:id', authenticate, requireAdmin, updateUnit);
router.delete('/:id', authenticate, requireAdmin, deleteUnit);

export default router;
