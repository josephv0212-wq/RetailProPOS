/**
 * Valor API Service
 * Handles cloud-to-connect payment processing with VP100 PAX terminals via Valor API
 * 
 * IMPORTANT: This is a DIRECT integration with Valor API - NO Authorize.Net required!
 * Valor API is a standalone payment gateway that communicates directly with VP100 terminals.
 * 
 * Valor Connect Cloud-to-Connect Integration:
 * - Model: PAX Valor VP100
 * - Connection: WiFi (cloud-to-connect via Valor API)
 * - Gateway: Valor API (cloud infrastructure) - NOT Authorize.Net
 * - Protocol: REST API over HTTPS
 * 
 * Flow:
 * 1. App authenticates with Valor API to get Bearer token
 * 2. App sends payment request to Valor API with terminal serial number
 * 3. Valor API routes request to VP100 terminal via cloud infrastructure
 * 4. VP100 displays payment prompt to customer
 * 5. Customer completes payment on VP100 device
 * 6. VP100 sends payment data back to Valor API
 * 7. App polls Valor API for payment status
 * 8. App shows notification when payment confirmed
 * 
 * Documentation:
 * - Valor API Reference: https://valorapi.readme.io/reference
 * - Terminal must be registered in Valor Portal and configured for cloud-to-connect
 * - NO Authorize.Net account or credentials needed for Valor API integration
 */

import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

// Valor API Configuration
const VALOR_API_BASE_URL = process.env.VALOR_API_BASE_URL || 'https://api.valorpaytech.com';
const VALOR_API_MERCHANT_ID = process.env.VALOR_API_MERCHANT_ID;
const VALOR_API_API_KEY = process.env.VALOR_API_API_KEY;
const VALOR_API_SECRET_KEY = process.env.VALOR_API_SECRET_KEY;

// Token cache for authentication
let bearerToken = null;
let tokenExpiry = null;

// Log which endpoint is being used (only once at startup)
if (!global.VALOR_API_ENDPOINT_LOGGED) {
  console.log(`💳 Valor API endpoint: ${VALOR_API_BASE_URL} (${process.env.NODE_ENV || 'development'})`);
  global.VALOR_API_ENDPOINT_LOGGED = true;
}

/**
 * Check if Valor API credentials are configured
 * @returns {Object} Validation result
 */
const checkValorCredentials = () => {
  const missing = [];
  
  if (!VALOR_API_MERCHANT_ID) missing.push('VALOR_API_MERCHANT_ID');
  if (!VALOR_API_API_KEY) missing.push('VALOR_API_API_KEY');
  if (!VALOR_API_SECRET_KEY) missing.push('VALOR_API_SECRET_KEY');
  
  if (missing.length > 0) {
    return {
      valid: false,
      missing,
      error: `Missing Valor API credentials: ${missing.join(', ')}. Please configure in environment variables.`
    };
  }
  
  return { valid: true };
};

/**
 * Authenticate with Valor API and get Bearer token
 * @returns {Promise<Object>} Authentication result with token
 */
export const authenticateValorApi = async () => {
  // Check credentials first
  const credentialCheck = checkValorCredentials();
  if (!credentialCheck.valid) {
    return {
      success: false,
      error: credentialCheck.error
    };
  }

  // Return cached token if still valid
  if (bearerToken && tokenExpiry && Date.now() < tokenExpiry) {
    return {
      success: true,
      token: bearerToken,
      cached: true
    };
  }

  try {
    // Valor API authentication endpoint
    // Based on Valor API documentation, authentication typically uses merchant credentials
    const authUrl = `${VALOR_API_BASE_URL}/auth/token`; // Adjust endpoint based on actual API docs
    
    const response = await axios.post(authUrl, {
      merchantId: VALOR_API_MERCHANT_ID,
      apiKey: VALOR_API_API_KEY,
      secretKey: VALOR_API_SECRET_KEY
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (response.data && response.data.token) {
      bearerToken = response.data.token;
      // Token typically expires in 1 hour, adjust based on API response
      const expiresIn = response.data.expiresIn || 3600; // Default 1 hour
      tokenExpiry = Date.now() + (expiresIn * 1000) - 60000; // Subtract 1 minute for safety
      
      console.log('✅ Valor API authentication successful');
      
      return {
        success: true,
        token: bearerToken,
        expiresIn: expiresIn
      };
    } else {
      return {
        success: false,
        error: 'Invalid authentication response from Valor API'
      };
    }
  } catch (error) {
    console.error('❌ Valor API authentication error:', error.message);
    if (error.response?.data) {
      console.error('Error response data:', JSON.stringify(error.response.data, null, 2));
    }
    
    return {
      success: false,
      error: error.response?.data?.message || 
             error.response?.data?.error || 
             error.message || 
             'Failed to authenticate with Valor API'
    };
  }
};

/**
 * Get authenticated Bearer token (with automatic authentication if needed)
 * @returns {Promise<string>} Bearer token
 */
const getBearerToken = async () => {
  // Check if we have a valid cached token
  if (bearerToken && tokenExpiry && Date.now() < tokenExpiry) {
    return bearerToken;
  }

  // Authenticate to get new token
  const authResult = await authenticateValorApi();
  if (!authResult.success) {
    throw new Error(authResult.error || 'Failed to authenticate with Valor API');
  }

  return bearerToken;
};

/**
 * Initiate a terminal payment request via Valor API (cloud-to-connect)
 * @param {Object} paymentData - Payment information
 * @param {string} paymentData.amount - Payment amount
 * @param {string} paymentData.invoiceNumber - Invoice number (optional)
 * @param {string} paymentData.description - Transaction description (optional)
 * @param {string} terminalSerialNumber - VP100 serial number (REQUIRED for Valor Connect)
 * @returns {Promise<Object>} Payment result with pending status
 */
export const initiateTerminalPayment = async (paymentData, terminalSerialNumber) => {
  const { amount, invoiceNumber, description } = paymentData;

  // Validate terminal serial number - REQUIRED for Valor Connect
  if (!terminalSerialNumber || terminalSerialNumber.trim() === '') {
    return {
      success: false,
      error: 'Terminal serial number is required. Please configure your VP100 serial number in Settings. The terminal must be registered in Valor Portal and configured for cloud-to-connect.'
    };
  }

  // Validate amount
  const paymentAmount = parseFloat(amount);
  if (isNaN(paymentAmount) || paymentAmount <= 0) {
    return {
      success: false,
      error: `Invalid payment amount: ${amount}. Amount must be a positive number.`
    };
  }

  try {
    // Get Bearer token
    const token = await getBearerToken();

    // Valor API payment endpoint
    // Adjust endpoint and request structure based on actual Valor API documentation
    const paymentUrl = `${VALOR_API_BASE_URL}/terminals/${terminalSerialNumber}/transactions/sale`;
    
    const requestBody = {
      amount: paymentAmount.toFixed(2),
      invoiceNumber: invoiceNumber || `POS-${Date.now()}`,
      description: description || 'POS Sale - Terminal Payment',
      // Add other required fields based on Valor API documentation
      transactionType: 'SALE',
      timeout: 180 // Wait up to 180 seconds for terminal response
    };

    console.log('📤 Sending terminal payment request to Valor API:', {
      endpoint: paymentUrl,
      terminalSerialNumber: terminalSerialNumber.trim(),
      amount: paymentAmount.toFixed(2)
    });

    const response = await axios.post(paymentUrl, requestBody, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      timeout: 30000 // 30 seconds for initial request
    });

    console.log('📥 Valor API response:', JSON.stringify(response.data, null, 2));

    const result = response.data;

    // Handle response based on Valor API structure
    // Adjust based on actual API response format
    if (result && result.status === 'PENDING' || result.status === 'SUCCESS') {
      return {
        success: true,
        pending: result.status === 'PENDING',
        transactionId: result.transactionId || result.id,
        refId: result.refId || result.referenceId,
        message: result.status === 'PENDING' 
          ? 'Payment request sent to VP100 terminal. Please complete payment on device.'
          : 'Payment processed successfully',
        status: result.status.toLowerCase(),
        amount: result.amount || paymentAmount.toFixed(2)
      };
    } else if (result && result.status === 'DECLINED' || result.status === 'FAILED') {
      const errorMessage = result.message || result.error || 'Transaction declined';
      const errorCode = result.errorCode || result.code;
      
      console.error('❌ Valor API transaction declined:', {
        status: result.status,
        errorCode: errorCode,
        errorMessage: errorMessage
      });

      return {
        success: false,
        error: errorMessage,
        errorCode: errorCode
      };
    } else {
      // Handle error response or invalid structure
      const errorMessage = result?.message || result?.error || 'Transaction failed';
      const errorCode = result?.errorCode || result?.code;
      
      console.error('❌ Valor API transaction error:', {
        errorCode: errorCode,
        errorMessage: errorMessage,
        fullResponse: result
      });

      return {
        success: false,
        error: errorMessage,
        errorCode: errorCode
      };
    }
  } catch (error) {
    console.error('❌ Valor API Terminal Payment Error:', error.message);
    if (error.response?.data) {
      console.error('Error response data:', JSON.stringify(error.response.data, null, 2));
    }
    if (error.response?.status) {
      console.error('Error status:', error.response.status);
    }
    
    return {
      success: false,
      error: error.response?.data?.message || 
             error.response?.data?.error || 
             error.message || 
             'Failed to connect to Valor API'
    };
  }
};

/**
 * Check payment status by polling Valor API
 * @param {string} transactionId - Transaction ID
 * @param {string} terminalSerialNumber - Terminal serial number (optional, may be needed for lookup)
 * @returns {Promise<Object>} Payment status
 */
export const checkPaymentStatus = async (transactionId, terminalSerialNumber = null) => {
  try {
    // Get Bearer token
    const token = await getBearerToken();

    // Valor API status endpoint
    // Adjust endpoint based on actual Valor API documentation
    let statusUrl;
    if (terminalSerialNumber) {
      statusUrl = `${VALOR_API_BASE_URL}/terminals/${terminalSerialNumber}/transactions/${transactionId}`;
    } else {
      statusUrl = `${VALOR_API_BASE_URL}/transactions/${transactionId}`;
    }

    const response = await axios.get(statusUrl, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    const result = response.data;

    if (result) {
      const status = result.status || result.transactionStatus || 'unknown';
      const isApproved = status === 'APPROVED' || status === 'SUCCESS' || status === 'SETTLED';
      const isPending = status === 'PENDING' || status === 'PROCESSING';
      const isDeclined = status === 'DECLINED' || status === 'FAILED' || status === 'CANCELLED';

      return {
        success: isApproved,
        pending: isPending && !isApproved && !isDeclined,
        declined: isDeclined,
        transactionId: result.transactionId || result.id,
        status: status.toLowerCase(),
        amount: result.amount,
        authCode: result.authCode || result.authorizationCode,
        message: result.message || result.responseReasonDescription || `Transaction ${status}`,
        timestamp: result.timestamp || result.createdAt || result.submitTimeUTC
      };
    } else {
      return {
        success: false,
        error: 'Failed to retrieve transaction details'
      };
    }
  } catch (error) {
    console.error('Valor API Check Payment Status Error:', error.message);
    if (error.response?.data) {
      console.error('Error response:', JSON.stringify(error.response.data, null, 2));
    }
    return {
      success: false,
      error: error.response?.data?.message || error.response?.data?.error || error.message
    };
  }
};

/**
 * Poll payment status until completion or timeout
 * @param {string} transactionId - Transaction ID
 * @param {string} terminalSerialNumber - Terminal serial number (optional)
 * @param {number} maxAttempts - Maximum polling attempts (default: 60)
 * @param {number} intervalMs - Polling interval in milliseconds (default: 2000 = 2 seconds)
 * @param {Function} onStatusUpdate - Callback function for status updates
 * @returns {Promise<Object>} Final payment status
 */
export const pollPaymentStatus = async (
  transactionId,
  terminalSerialNumber = null,
  maxAttempts = 60,
  intervalMs = 2000,
  onStatusUpdate = null
) => {
  let attempts = 0;
  
  while (attempts < maxAttempts) {
    attempts++;
    
    const status = await checkPaymentStatus(transactionId, terminalSerialNumber);
    
    // Call status update callback if provided
    if (onStatusUpdate) {
      onStatusUpdate(status, attempts);
    }
    
    // If payment is completed (approved or declined), return result
    if (!status.pending) {
      return status;
    }
    
    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  
  // Timeout - return pending status
  return {
    success: false,
    pending: true,
    error: 'Payment status check timeout. Please check terminal or transaction manually.',
    transactionId: transactionId
  };
};

/**
 * Get list of devices/terminals registered with Valor API
 * @returns {Promise<Object>} List of devices/terminals
 */
export const getValorDevices = async () => {
  try {
    // Get Bearer token
    const token = await getBearerToken();

    // Valor API devices endpoint
    const devicesUrl = `${VALOR_API_BASE_URL}/terminals`;
    
    console.log('📱 Fetching Valor API devices...');
    
    const response = await axios.get(devicesUrl, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    const devices = response.data?.devices || response.data?.terminals || response.data || [];
    
    return {
      success: true,
      devices: Array.isArray(devices) ? devices : [],
      message: 'Devices retrieved successfully'
    };
  } catch (error) {
    console.error('❌ Error fetching Valor API devices:', error.message);
    if (error.response?.data) {
      console.error('Error response:', JSON.stringify(error.response.data, null, 2));
    }
    return {
      success: false,
      error: error.response?.data?.message || error.response?.data?.error || error.message || 'Failed to fetch devices',
      devices: []
    };
  }
};

/**
 * Void a transaction via Valor API
 * @param {string} transactionId - Transaction ID to void
 * @param {string} terminalSerialNumber - Terminal serial number (optional)
 * @returns {Promise<Object>} Void result
 */
export const voidTransaction = async (transactionId, terminalSerialNumber = null) => {
  try {
    // Get Bearer token
    const token = await getBearerToken();

    // Valor API void endpoint
    let voidUrl;
    if (terminalSerialNumber) {
      voidUrl = `${VALOR_API_BASE_URL}/terminals/${terminalSerialNumber}/transactions/${transactionId}/void`;
    } else {
      voidUrl = `${VALOR_API_BASE_URL}/transactions/${transactionId}/void`;
    }

    const response = await axios.post(voidUrl, {}, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    const result = response.data;

    if (result && (result.status === 'SUCCESS' || result.status === 'VOIDED')) {
      return {
        success: true,
        message: result.message || 'Transaction voided successfully',
        transactionId: result.transactionId || transactionId
      };
    } else {
      return {
        success: false,
        error: result?.message || result?.error || 'Failed to void transaction'
      };
    }
  } catch (error) {
    console.error('Void Transaction Error:', error.message);
    if (error.response?.data) {
      console.error('Error response:', JSON.stringify(error.response.data, null, 2));
    }
    return {
      success: false,
      error: error.response?.data?.message || error.response?.data?.error || error.message
    };
  }
};
