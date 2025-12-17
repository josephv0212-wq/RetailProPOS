import express from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  discoverTerminals,
  processTerminalPayment,
  getTerminalStatus,
  testTerminalConnection,
  voidTerminalTransaction
} from '../services/paxTerminalService.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/**
 * POST /pax/discover
 * Discover PAX terminals on the network
 */
router.post('/discover', async (req, res) => {
  try {
    const terminals = await discoverTerminals();
    res.json({
      success: true,
      message: `Found ${terminals.length} terminal(s)`,
      data: { terminals }
    });
  } catch (error) {
    console.error('Terminal discovery error:', error);
    const isDevelopment = process.env.NODE_ENV === 'development';
    res.status(500).json({
      success: false,
      message: 'Failed to discover terminals',
      ...(isDevelopment && { error: error.message })
    });
  }
});

/**
 * POST /pax/test
 * Test connection to a PAX terminal
 */
router.post('/test', async (req, res) => {
  try {
    const { terminalIP } = req.body;
    const result = await testTerminalConnection(terminalIP);
    
    if (result.success) {
      res.json({
        success: true,
        message: result.message,
        data: { ip: result.ip }
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.error || 'Connection test failed',
        data: { ip: result.ip }
      });
    }
  } catch (error) {
    console.error('Terminal test error:', error);
    const isDevelopment = process.env.NODE_ENV === 'development';
    res.status(500).json({
      success: false,
      message: 'Terminal test failed',
      ...(isDevelopment && { error: error.message })
    });
  }
});

/**
 * GET /pax/status
 * Get terminal status
 */
router.get('/status', async (req, res) => {
  try {
    const { terminalIP } = req.query;
    const status = await getTerminalStatus(terminalIP);
    
    if (status.success) {
      res.json({
        success: true,
        data: status
      });
    } else {
      res.status(400).json({
        success: false,
        message: status.error || 'Failed to get terminal status'
      });
    }
  } catch (error) {
    console.error('Get status error:', error);
    const isDevelopment = process.env.NODE_ENV === 'development';
    res.status(500).json({
      success: false,
      message: 'Failed to get terminal status',
      ...(isDevelopment && { error: error.message })
    });
  }
});

/**
 * POST /pax/payment
 * Process payment through PAX terminal
 */
router.post('/payment', async (req, res) => {
  try {
    const { amount, invoiceNumber, description, terminalIP } = req.body;
    
    if (!amount || parseFloat(amount) <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payment amount'
      });
    }
    
    const paymentResult = await processTerminalPayment({
      amount,
      invoiceNumber,
      description
    }, terminalIP);
    
    if (paymentResult.success) {
      res.json({
        success: true,
        message: 'Payment processed successfully',
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
    console.error('PAX payment error:', error);
    const isDevelopment = process.env.NODE_ENV === 'development';
    res.status(500).json({
      success: false,
      message: 'Payment processing failed',
      ...(isDevelopment && { error: error.message })
    });
  }
});

/**
 * POST /pax/void
 * Void a transaction on the terminal
 */
router.post('/void', async (req, res) => {
  try {
    const { transactionId, terminalIP } = req.body;
    
    if (!transactionId) {
      return res.status(400).json({
        success: false,
        message: 'Transaction ID is required'
      });
    }
    
    const result = await voidTerminalTransaction(transactionId, terminalIP);
    
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