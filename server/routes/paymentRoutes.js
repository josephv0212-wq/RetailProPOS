/**
 * Payment Status Polling Routes
 * For checking terminal payment status
 */

import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { checkPaymentStatus, pollPaymentStatus } from '../services/authorizeNetTerminalService.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /payment/status/:transactionId
 * Check payment status for a transaction
 */
router.get('/status/:transactionId', async (req, res) => {
  try {
    const { transactionId } = req.params;
    
    if (!transactionId) {
      return res.status(400).json({
        success: false,
        message: 'Transaction ID is required'
      });
    }

    const status = await checkPaymentStatus(transactionId);
    
    res.json({
      success: status.success || status.pending,
      pending: status.pending,
      declined: status.declined,
      data: status
    });
  } catch (error) {
    console.error('Payment status check error:', error);
    const isDevelopment = process.env.NODE_ENV === 'development';
    res.status(500).json({
      success: false,
      message: 'Failed to check payment status',
      ...(isDevelopment && { error: error.message })
    });
  }
});

/**
 * POST /payment/poll/:transactionId
 * Poll payment status until completion (with timeout)
 */
router.post('/poll/:transactionId', async (req, res) => {
  try {
    const { transactionId } = req.params;
    const { maxAttempts = 60, intervalMs = 2000 } = req.body;
    
    if (!transactionId) {
      return res.status(400).json({
        success: false,
        message: 'Transaction ID is required'
      });
    }

    // Poll payment status
    const status = await pollPaymentStatus(
      transactionId,
      parseInt(maxAttempts, 10),
      parseInt(intervalMs, 10)
    );
    
    res.json({
      success: status.success,
      pending: status.pending,
      declined: status.declined,
      data: status
    });
  } catch (error) {
    console.error('Payment polling error:', error);
    const isDevelopment = process.env.NODE_ENV === 'development';
    res.status(500).json({
      success: false,
      message: 'Failed to poll payment status',
      ...(isDevelopment && { error: error.message })
    });
  }
});

export default router;
