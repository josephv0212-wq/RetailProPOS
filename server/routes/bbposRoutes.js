import express from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  processBluetoothPayment,
  validateOpaqueData
} from '../services/bbposService.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/**
 * POST /bbpos/pair
 * Pair with Bluetooth reader (client-side operation, this endpoint validates readiness)
 * Note: Actual pairing happens on the client using Accept Mobile SDK or Web Bluetooth
 */
router.post('/pair', async (req, res) => {
  try {
    // This endpoint is mainly for validation/status
    // Actual pairing is handled client-side via Accept Mobile SDK
    res.json({
      success: true,
      message: 'Bluetooth reader pairing is handled client-side. Use Accept Mobile SDK or Web Bluetooth API.',
      data: {
        ready: true,
        instructions: 'Pair the BBPOS AWC Walker C3X reader using the Accept Mobile SDK or Web Bluetooth API on the client side.'
      }
    });
  } catch (error) {
    console.error('Bluetooth pairing error:', error);
    const isDevelopment = process.env.NODE_ENV === 'development';
    res.status(500).json({
      success: false,
      message: 'Bluetooth pairing check failed',
      ...(isDevelopment && { error: error.message })
    });
  }
});

/**
 * POST /bbpos/generate-test-data
 * Generate test opaqueData for testing purposes
 * Note: This creates a test transaction and returns opaqueData format for testing
 */
router.post('/generate-test-data', async (req, res) => {
  try {
    const { cardNumber, expDate, cvv, zip } = req.body;
    
    // Validate inputs
    if (!cardNumber || !expDate || !cvv) {
      return res.status(400).json({
        success: false,
        message: 'Card number, expiration date, and CVV are required'
      });
    }

    // Note: Authorize.Net's Accept.js requires HTTPS and is client-side only
    // For testing, we'll return a format that matches what Accept.js would return
    // In production, opaqueData must come from Accept.js or Accept Mobile SDK
    
    // For testing purposes, we can create a test transaction first to verify the card
    // Then provide instructions on how to get real opaqueData
    
    const isDevelopment = process.env.NODE_ENV === 'development';
    
    res.json({
      success: true,
      message: 'Test opaqueData format. For real opaqueData, use Accept.js with HTTPS or Accept Mobile SDK.',
      data: {
        // Test format - this won't work for actual payment processing
        // Real opaqueData must come from Accept.js or Accept Mobile SDK
        opaqueData: {
          dataDescriptor: 'COMMON.ACCEPT.INAPP.PAYMENT',
          dataValue: `TEST_${Date.now()}_${cardNumber.slice(-4)}`, // Test value - not real encrypted data
        },
        deviceSessionId: `TEST-SESSION-${Date.now()}`,
        instructions: {
          note: 'This is a TEST format. For real payments, you need:',
          options: [
            '1. Use Accept.js with HTTPS (host HTML file on your VPS with SSL)',
            '2. Integrate Accept Mobile SDK for automatic card reading',
            '3. Use regular card entry method for now (works without opaqueData)'
          ]
        }
      }
    });
  } catch (error) {
    console.error('Generate test data error:', error);
    const isDevelopment = process.env.NODE_ENV === 'development';
    res.status(500).json({
      success: false,
      message: 'Failed to generate test data',
      ...(isDevelopment && { error: error.message })
    });
  }
});

/**
 * POST /bbpos/payment
 * Process payment through Bluetooth card reader using opaqueData
 */
router.post('/payment', async (req, res) => {
  try {
    const { amount, opaqueData, deviceSessionId, invoiceNumber, description } = req.body;
    
    // Validate amount
    if (!amount || parseFloat(amount) <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payment amount'
      });
    }

    // Validate opaqueData
    if (!validateOpaqueData(opaqueData)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid opaqueData. Both descriptor and value are required from the Bluetooth reader.'
      });
    }

    const paymentResult = await processBluetoothPayment({
      amount,
      opaqueData,
      deviceSessionId,
      invoiceNumber,
      description
    });

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
    console.error('BBPOS payment error:', error);
    const isDevelopment = process.env.NODE_ENV === 'development';
    res.status(500).json({
      success: false,
      message: 'Payment processing failed',
      ...(isDevelopment && { error: error.message })
    });
  }
});

export default router;

