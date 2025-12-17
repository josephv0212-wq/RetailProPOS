import express from 'express';
import { login, createUser, getCurrentUser, register } from '../controllers/authController.js';
import { authenticate } from '../middleware/auth.js';
import { validateLogin, validateCreateUser, validateRegistration } from '../middleware/validation.js';

const router = express.Router();

router.post('/login', validateLogin, login);
router.post('/register', validateRegistration, register);
router.post('/users', authenticate, validateCreateUser, createUser);
router.get('/me', authenticate, getCurrentUser);

export default router;
