import express from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  authenticateValorApi,
  checkValorCredentials,
  checkEPI,
  initiateTerminalPayment,
  checkPaymentStatus,
  pollPaymentStatus,
  cancelTransaction,
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
 * POST /valor/checkepi
 * Check EPI (Equipment Profile Identifier) status
 */
router.post('/checkepi', async (req, res) => {
  try {
    const { epi } = req.body;
    
    if (!epi || epi.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'EPI (Equipment Profile Identifier) is required'
      });
    }
    
    const result = await checkEPI(epi.trim());
    
    if (result.success) {
      res.json({
        success: true,
        message: result.message || 'EPI is active',
        data: result
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.error || 'EPI check failed',
        data: result
      });
    }
  } catch (error) {
    console.error('Check EPI error:', error);
    const isDevelopment = process.env.NODE_ENV === 'development';
    res.status(500).json({
      success: false,
      message: 'Failed to check EPI',
      ...(isDevelopment && { error: error.message })
    });
  }
});

/**
 * POST /valor/payment
 * Process payment through VP100 terminal via Valor Connect API (cloud-to-connect)
 * Uses EPI (Equipment Profile Identifier) instead of terminal serial number
 */
router.post('/payment', async (req, res) => {
  try {
    const { amount, invoiceNumber, description, epi, terminalSerialNumber } = req.body;
    
    // Support both EPI and terminalSerialNumber for backward compatibility
    // EPI is the correct field for Valor Connect
    const epiValue = epi || terminalSerialNumber;
    
    if (!amount || parseFloat(amount) <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payment amount'
      });
    }

    if (!epiValue || epiValue.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'EPI (Equipment Profile Identifier) is required for Valor Connect payments. Please configure your EPI in Settings.'
      });
    }
    
    const paymentResult = await initiateTerminalPayment({
      amount,
      invoiceNumber,
      description
    }, epiValue.trim());
    
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
 * Note: transactionId should be the reqTxnId from the payment response
 */
router.get('/status/:transactionId', async (req, res) => {
  try {
    const { transactionId } = req.params;
    const { epi, terminalSerialNumber } = req.query;
    
    // Support both EPI and terminalSerialNumber for backward compatibility
    const epiValue = epi || terminalSerialNumber || null;
    
    if (!transactionId) {
      return res.status(400).json({
        success: false,
        message: 'Transaction ID (reqTxnId) is required'
      });
    }
    
    const status = await checkPaymentStatus(transactionId, epiValue);
    
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
 * Note: transactionId should be the reqTxnId from the payment response
 */
router.post('/poll/:transactionId', async (req, res) => {
  try {
    const { transactionId } = req.params;
    const { epi, terminalSerialNumber, maxAttempts, intervalMs } = req.body;
    
    // Support both EPI and terminalSerialNumber for backward compatibility
    const epiValue = epi || terminalSerialNumber || null;
    
    if (!transactionId) {
      return res.status(400).json({
        success: false,
        message: 'Transaction ID (reqTxnId) is required'
      });
    }
    
    const maxAttemptsNum = maxAttempts ? parseInt(maxAttempts, 10) : 60;
    const intervalMsNum = intervalMs ? parseInt(intervalMs, 10) : 2000;
    
    const status = await pollPaymentStatus(
      transactionId,
      epiValue,
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
 * POST /valor/cancel
 * Cancel a pending transaction via Valor Connect API
 */
router.post('/cancel', async (req, res) => {
  try {
    const { transactionId, reqTxnId, epi, terminalSerialNumber } = req.body;
    
    // Use reqTxnId if provided, otherwise use transactionId
    const txnId = reqTxnId || transactionId;
    
    // Support both EPI and terminalSerialNumber for backward compatibility
    const epiValue = epi || terminalSerialNumber || null;
    
    if (!txnId) {
      return res.status(400).json({
        success: false,
        message: 'Transaction ID (reqTxnId) is required'
      });
    }
    
    const result = await cancelTransaction(txnId, epiValue);
    
    if (result.success) {
      res.json({
        success: true,
        message: result.message || 'Transaction cancelled successfully',
        data: result
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.error || 'Failed to cancel transaction',
        data: result
      });
    }
  } catch (error) {
    console.error('Cancel transaction error:', error);
    const isDevelopment = process.env.NODE_ENV === 'development';
    res.status(500).json({
      success: false,
      message: 'Failed to cancel transaction',
      ...(isDevelopment && { error: error.message })
    });
  }
});

/**
 * POST /valor/void
 * Void a transaction via Valor API (legacy endpoint - uses cancel internally)
 */
router.post('/void', async (req, res) => {
  try {
    const { transactionId, reqTxnId, epi, terminalSerialNumber } = req.body;
    
    // Use reqTxnId if provided, otherwise use transactionId
    const txnId = reqTxnId || transactionId;
    
    // Support both EPI and terminalSerialNumber for backward compatibility
    const epiValue = epi || terminalSerialNumber || null;
    
    if (!txnId) {
      return res.status(400).json({
        success: false,
        message: 'Transaction ID is required'
      });
    }
    
    const result = await voidTransaction(txnId, epiValue);
    
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

/**
 * POST /valor/test
 * Test Valor Connect API connection and EPI status
 */
router.post('/test', async (req, res) => {
  try {
    const { epi } = req.body;
    
    // Check credentials first
    const credentialCheck = checkValorCredentials();
    if (!credentialCheck.valid) {
      return res.status(400).json({
        success: false,
        message: 'Valor Connect API credentials not configured',
        error: credentialCheck.error,
        missing: credentialCheck.missing
      });
    }
    
    // If EPI provided, check it
    if (epi) {
      const epiResult = await checkEPI(epi.trim());
      return res.json({
        success: epiResult.success,
        message: epiResult.success 
          ? 'Valor Connect API credentials valid and EPI is active' 
          : 'Valor Connect API credentials valid but EPI check failed',
        data: {
          credentialsValid: true,
          epi: epi.trim(),
          epiActive: epiResult.active || false,
          epiCheck: epiResult
        }
      });
    }
    
    // Just validate credentials
    return res.json({
      success: true,
      message: 'Valor Connect API credentials are configured',
      data: {
        credentialsValid: true,
        note: 'Provide EPI in request body to test EPI status'
      }
    });
  } catch (error) {
    console.error('Valor Connect API test error:', error);
    const isDevelopment = process.env.NODE_ENV === 'development';
    res.status(500).json({
      success: false,
      message: 'Valor Connect API test failed',
      ...(isDevelopment && { error: error.message })
    });
  }
});

export default router;
