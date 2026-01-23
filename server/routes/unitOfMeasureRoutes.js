import express from 'express';
import { getUnits, getAllUnits, createUnit, deleteUnit } from '../controllers/unitOfMeasureController.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

router.get('/', authenticate, getUnits);
router.get('/all', authenticate, getAllUnits); // Get all units including basic UMs
router.post('/', authenticate, requireAdmin, createUnit);
router.delete('/:id', authenticate, requireAdmin, deleteUnit);

export default router;
