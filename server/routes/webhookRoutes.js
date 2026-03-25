import express from 'express';
import { handleAuthorizeNetWebhook } from '../controllers/webhookController.js';

const router = express.Router();

router.post('/authnet', handleAuthorizeNetWebhook);

export default router;
