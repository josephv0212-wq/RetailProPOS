import express from 'express';
import { 
  login, 
  createUser, 
  getCurrentUser, 
  register,
  listPendingUsers,
  approveUser,
  rejectUser,
  getAllUsers,
  updateUser,
  updateMyTerminalIP
} from '../controllers/authController.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import { validateLogin, validateCreateUser, validateRegistration } from '../middleware/validation.js';

const router = express.Router();

router.post('/login', validateLogin, login);
router.post('/register', validateRegistration, register);
router.post('/users', authenticate, validateCreateUser, createUser);
router.get('/me', authenticate, getCurrentUser);
router.patch('/me/terminal', authenticate, updateMyTerminalIP);

// Admin-only user management
router.get('/users/pending', authenticate, requireAdmin, listPendingUsers);
router.get('/users', authenticate, requireAdmin, getAllUsers);
router.patch('/users/:id', authenticate, requireAdmin, updateUser);
router.patch('/users/:id/approve', authenticate, requireAdmin, approveUser);
router.patch('/users/:id/reject', authenticate, requireAdmin, rejectUser);

export default router;
