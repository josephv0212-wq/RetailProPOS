import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { testPrinter } from '../services/printerService.js';

const router = express.Router();

// Test printer connection
router.post('/test', authenticate, async (req, res) => {
  try {
    const locationId = req.user.locationId;
    const result = await testPrinter(locationId);
    
    if (result.success) {
      res.json({ 
        success: true,
        message: 'Printer test successful',
        data: result
      });
    } else {
      const isDevelopment = process.env.NODE_ENV === 'development';
      res.status(result.skipped ? 200 : 500).json({
        success: false,
        message: result.error || 'Printer test failed',
        data: { skipped: result.skipped || false },
        ...(isDevelopment && { error: result.error })
      });
    }
  } catch (err) {
    console.error('Printer test error:', err);
    const isDevelopment = process.env.NODE_ENV === 'development';
    res.status(500).json({ 
      success: false,
      message: 'Printer test failed',
      ...(isDevelopment && { error: err.message })
    });
  }
});

export default router;
