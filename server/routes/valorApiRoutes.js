import express from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  authenticateValorApi,
  initiateTerminalPayment,
  checkPaymentStatus,
  pollPaymentStatus,
  getValorDevices,
  voidTransaction
} from '../services/valorApiService.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/**
 * POST /valor/auth
 * Authenticate with Valor API and get Bearer token
 */
router.post('/auth', async (req, res) => {
  try {
    const result = await authenticateValorApi();
    
    if (result.success) {
      res.json({
        success: true,
        message: 'Valor API authentication successful',
        data: {
          authenticated: true,
          cached: result.cached || false,
          expiresIn: result.expiresIn
        }
      });
    } else {
      res.status(401).json({
        success: false,
        message: result.error || 'Valor API authentication failed',
        data: result
      });
    }
  } catch (error) {
    console.error('Valor API auth error:', error);
    const isDevelopment = process.env.NODE_ENV === 'development';
    res.status(500).json({
      success: false,
      message: 'Valor API authentication failed',
      ...(isDevelopment && { error: error.message })
    });
  }
});

/**
 * GET /valor/devices
 * Get list of devices/terminals registered with Valor API
 */
router.get('/devices', async (req, res) => {
  try {
    const result = await getValorDevices();
    
    if (result.success) {
      res.json({
        success: true,
        message: result.message || 'Devices retrieved successfully',
        data: {
          devices: result.devices
        }
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.error || 'Failed to fetch devices',
        data: result
      });
    }
  } catch (error) {
    console.error('Get Valor devices error:', error);
    const isDevelopment = process.env.NODE_ENV === 'development';
    res.status(500).json({
      success: false,
      message: 'Failed to fetch devices',
      ...(isDevelopment && { error: error.message })
    });
  }
});

/**
 * POST /valor/payment
 * Process payment through VP100 terminal via Valor API (cloud-to-connect)
 */
router.post('/payment', async (req, res) => {
  try {
    const { amount, invoiceNumber, description, terminalSerialNumber } = req.body;
    
    if (!amount || parseFloat(amount) <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payment amount'
      });
    }

    if (!terminalSerialNumber || terminalSerialNumber.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Terminal serial number is required for Valor API payments'
      });
    }
    
    const paymentResult = await initiateTerminalPayment({
      amount,
      invoiceNumber,
      description
    }, terminalSerialNumber);
    
    if (paymentResult.success) {
      res.json({
        success: true,
        message: paymentResult.message || 'Payment request sent to terminal',
        data: paymentResult
      });
    } else {
      res.status(400).json({
        success: false,
        message: paymentResult.error || 'Payment processing failed',
        data: paymentResult
      });
    }
  } catch (error) {
    console.error('Valor API payment error:', error);
    const isDevelopment = process.env.NODE_ENV === 'development';
    res.status(500).json({
      success: false,
      message: 'Payment processing failed',
      ...(isDevelopment && { error: error.message })
    });
  }
});

/**
 * GET /valor/status/:transactionId
 * Check payment status for a transaction
 */
router.get('/status/:transactionId', async (req, res) => {
  try {
    const { transactionId } = req.params;
    const { terminalSerialNumber } = req.query;
    
    if (!transactionId) {
      return res.status(400).json({
        success: false,
        message: 'Transaction ID is required'
      });
    }
    
    const status = await checkPaymentStatus(transactionId, terminalSerialNumber || null);
    
    if (status.success !== undefined) {
      res.json({
        success: true,
        data: status
      });
    } else {
      res.status(400).json({
        success: false,
        message: status.error || 'Failed to get payment status',
        data: status
      });
    }
  } catch (error) {
    console.error('Get payment status error:', error);
    const isDevelopment = process.env.NODE_ENV === 'development';
    res.status(500).json({
      success: false,
      message: 'Failed to get payment status',
      ...(isDevelopment && { error: error.message })
    });
  }
});

/**
 * POST /valor/poll/:transactionId
 * Poll payment status until completion or timeout
 */
router.post('/poll/:transactionId', async (req, res) => {
  try {
    const { transactionId } = req.params;
    const { terminalSerialNumber, maxAttempts, intervalMs } = req.body;
    
    if (!transactionId) {
      return res.status(400).json({
        success: false,
        message: 'Transaction ID is required'
      });
    }
    
    const maxAttemptsNum = maxAttempts ? parseInt(maxAttempts, 10) : 60;
    const intervalMsNum = intervalMs ? parseInt(intervalMs, 10) : 2000;
    
    const status = await pollPaymentStatus(
      transactionId,
      terminalSerialNumber || null,
      maxAttemptsNum,
      intervalMsNum
    );
    
    res.json({
      success: status.success || false,
      data: status
    });
  } catch (error) {
    console.error('Poll payment status error:', error);
    const isDevelopment = process.env.NODE_ENV === 'development';
    res.status(500).json({
      success: false,
      message: 'Failed to poll payment status',
      ...(isDevelopment && { error: error.message })
    });
  }
});

/**
 * POST /valor/void
 * Void a transaction via Valor API
 */
router.post('/void', async (req, res) => {
  try {
    const { transactionId, terminalSerialNumber } = req.body;
    
    if (!transactionId) {
      return res.status(400).json({
        success: false,
        message: 'Transaction ID is required'
      });
    }
    
    const result = await voidTransaction(transactionId, terminalSerialNumber || null);
    
    if (result.success) {
      res.json({
        success: true,
        message: result.message || 'Transaction voided successfully',
        data: result
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.error || 'Failed to void transaction',
        data: result
      });
    }
  } catch (error) {
    console.error('Void transaction error:', error);
    const isDevelopment = process.env.NODE_ENV === 'development';
    res.status(500).json({
      success: false,
      message: 'Failed to void transaction',
      ...(isDevelopment && { error: error.message })
    });
  }
});

export default router;
