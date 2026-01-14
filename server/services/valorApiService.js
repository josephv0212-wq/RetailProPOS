/**
 * Valor API Service
 * Handles cloud-to-connect payment processing with VP100 PAX terminals via Valor Connect API
 * 
 * IMPORTANT: This is a DIRECT integration with Valor Connect API - NO Authorize.Net required!
 * Valor Connect API is a standalone payment gateway that communicates directly with VP100 terminals.
 * 
 * Valor Connect Cloud-to-Connect Integration:
 * - Model: PAX Valor VP100
 * - Connection: WiFi (cloud-to-connect via Valor Connect)
 * - Gateway: Valor Connect API (cloud infrastructure) - NOT Authorize.Net
 * - Protocol: REST API over HTTPS
 * - Authentication: X-VALOR-APP-ID and X-VALOR-APP-KEY headers (not Bearer tokens)
 * 
 * Flow:
 * 1. App sends payment request to Valor Connect API with EPI (Equipment Profile Identifier)
 * 2. Valor Connect API routes request to VP100 terminal via cloud infrastructure
 * 3. VP100 displays payment prompt to customer (automatically triggered)
 * 4. Customer completes payment on VP100 device
 * 5. VP100 sends payment data back to Valor Connect API
 * 6. App polls Valor Connect API for payment status
 * 7. App shows notification when payment confirmed
 * 
 * Documentation:
 * - Valor Connect uses EPI (Equipment Profile Identifier) to target terminals
 * - Terminal must be registered in Valor Portal and configured for Valor Connect (Cloud mode)
 * - Terminal must display "Waiting for Valor Connect" to receive payment requests
 * - NO Authorize.Net account or credentials needed for Valor Connect integration
 */

import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

// Valor Connect API Configuration
// Note: These are staging endpoints. Production endpoints will be provided by Valor during go-live.
const VALOR_CHECK_EPI_URL = process.env.VALOR_CHECK_EPI_URL || 'https://demo.valorpaytech.com/api/Valor/checkepi';
const VALOR_PUBLISH_URL = process.env.VALOR_PUBLISH_URL || 'https://securelink-staging.valorpaytech.com:4430/?status';
const VALOR_TXN_STATUS_URL = process.env.VALOR_TXN_STATUS_URL || 'https://securelink-staging.valorpaytech.com:4430/?txn_status';
const VALOR_CANCEL_URL = process.env.VALOR_CANCEL_URL || 'https://securelink-staging.valorpaytech.com:4430/?cancel';

// Valor API Credentials (App ID and App Key from Valor Portal)
const VALOR_APP_ID = process.env.VALOR_APP_ID;
const VALOR_APP_KEY = process.env.VALOR_APP_KEY;

// Log which endpoint is being used (only once at startup)
if (!global.VALOR_API_ENDPOINT_LOGGED) {
  console.log(`💳 Valor Connect API endpoints configured (${process.env.NODE_ENV || 'development'})`);
  console.log(`   Publish: ${VALOR_PUBLISH_URL}`);
  console.log(`   Status: ${VALOR_TXN_STATUS_URL}`);
  console.log(`   Cancel: ${VALOR_CANCEL_URL}`);
  
  // Check if credentials are configured
  if (!VALOR_APP_ID || !VALOR_APP_KEY) {
    console.error('❌ Valor API credentials NOT configured!');
    console.error('   VALOR_APP_ID:', VALOR_APP_ID ? 'SET' : 'MISSING');
    console.error('   VALOR_APP_KEY:', VALOR_APP_KEY ? 'SET' : 'MISSING');
    console.error('   Please set VALOR_APP_ID and VALOR_APP_KEY in your .env file');
  } else {
    console.log('✅ Valor API credentials configured');
    console.log(`   App ID: ${VALOR_APP_ID.substring(0, 10)}...`);
    console.log(`   App Key: ${VALOR_APP_KEY.substring(0, 10)}...`);
  }
  
  global.VALOR_API_ENDPOINT_LOGGED = true;
}

/**
 * Check if Valor API credentials are configured
 * @returns {Object} Validation result
 */
export const checkValorCredentials = () => {
  const missing = [];
  
  if (!VALOR_APP_ID) missing.push('VALOR_APP_ID');
  if (!VALOR_APP_KEY) missing.push('VALOR_APP_KEY');
  
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
 * Get Valor API headers (X-VALOR-APP-ID and X-VALOR-APP-KEY)
 * @returns {Object} Headers object
 */
const getValorHeaders = () => {
  // Check if credentials are set
  if (!VALOR_APP_ID || !VALOR_APP_KEY) {
    console.error('❌ Valor API credentials not configured!');
    console.error('VALOR_APP_ID:', VALOR_APP_ID ? 'SET' : 'MISSING');
    console.error('VALOR_APP_KEY:', VALOR_APP_KEY ? 'SET' : 'MISSING');
  }
  
  const headers = {
    'Content-Type': 'application/json',
    'X-VALOR-APP-ID': VALOR_APP_ID || '',
    'X-VALOR-APP-KEY': VALOR_APP_KEY || ''
  };
  
  // Log headers (redact key for security)
  if (VALOR_APP_ID && VALOR_APP_KEY) {
    console.log('📤 Valor headers configured:', {
      'X-VALOR-APP-ID': VALOR_APP_ID.substring(0, 10) + '...',
      'X-VALOR-APP-KEY': VALOR_APP_KEY.substring(0, 10) + '...'
    });
  }
  
  return headers;
};

/**
 * Check EPI (Equipment Profile Identifier) status
 * Validates that the EPI is active and accessible
 * @param {string} epi - Equipment Profile Identifier (e.g., "2501357713")
 * @returns {Promise<Object>} EPI status result
 */
export const checkEPI = async (epi) => {
  // Check credentials first
  const credentialCheck = checkValorCredentials();
  if (!credentialCheck.valid) {
    return {
      success: false,
      error: credentialCheck.error
    };
  }

  if (!epi || epi.trim() === '') {
    return {
      success: false,
      error: 'EPI (Equipment Profile Identifier) is required'
    };
  }

  try {
    const response = await axios.post(
      VALOR_CHECK_EPI_URL,
      { EPI: epi.trim() },
      {
        headers: getValorHeaders(),
        timeout: 30000
      }
    );

    console.log('📥 Valor Check EPI response:', JSON.stringify(response.data, null, 2));

    if (response.data && (response.data.status === 'active' || response.data.active === true)) {
      return {
        success: true,
        epi: epi.trim(),
        active: true,
        message: 'EPI is active and ready'
      };
    } else {
      return {
        success: false,
        epi: epi.trim(),
        active: false,
        error: response.data?.message || 'EPI is not active'
      };
    }
  } catch (error) {
    console.error('❌ Valor Check EPI error:', error.message);
    if (error.response?.data) {
      console.error('Error response data:', JSON.stringify(error.response.data, null, 2));
    }
    
    return {
      success: false,
      error: error.response?.data?.message || 
             error.response?.data?.error || 
             error.message || 
             'Failed to check EPI status'
    };
  }
};

/**
 * Authenticate with Valor API (legacy function - kept for compatibility)
 * Note: Valor Connect uses header-based auth, not Bearer tokens
 * @returns {Promise<Object>} Authentication result
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

  // Valor Connect uses header-based auth, so we just validate credentials exist
  return {
    success: true,
    message: 'Valor Connect credentials configured (header-based authentication)',
    authenticated: true
  };
};

/**
 * Initiate a terminal payment request via Valor Connect API (Publish API)
 * This triggers the payment dialog on the VP100 terminal
 * @param {Object} paymentData - Payment information
 * @param {string} paymentData.amount - Payment amount
 * @param {string} paymentData.invoiceNumber - Invoice number (optional)
 * @param {string} paymentData.description - Transaction description (optional)
 * @param {string} epi - Equipment Profile Identifier (REQUIRED for Valor Connect)
 * @returns {Promise<Object>} Payment result with transaction reference
 */
export const initiateTerminalPayment = async (paymentData, epi) => {
  const { amount, invoiceNumber, description } = paymentData;

  // Check credentials first
  const credentialCheck = checkValorCredentials();
  if (!credentialCheck.valid) {
    return {
      success: false,
      error: credentialCheck.error
    };
  }

  // Validate EPI - REQUIRED for Valor Connect
  if (!epi || epi.trim() === '') {
    return {
      success: false,
      error: 'EPI (Equipment Profile Identifier) is required. Please configure your EPI in Settings. The terminal must be registered in Valor Portal and configured for Valor Connect (Cloud mode).'
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
    // Valor Connect Publish API endpoint
    // This endpoint triggers the payment dialog on the VP100 terminal
    const requestBody = {
      EPI: epi.trim(),
      AMOUNT: paymentAmount.toFixed(2),
      TRAN_MODE: "1",   // 1 = Credit
      TRAN_CODE: "01"    // 01 = Sale
    };

    // Add optional fields if provided
    if (invoiceNumber) {
      requestBody.INVOICE_NUMBER = invoiceNumber;
    }
    if (description) {
      requestBody.DESCRIPTION = description;
    }

    console.log('📤 Sending terminal payment request to Valor Connect API:', {
      endpoint: VALOR_PUBLISH_URL,
      epi: epi.trim(),
      amount: paymentAmount.toFixed(2)
    });

    const response = await axios.post(VALOR_PUBLISH_URL, requestBody, {
      headers: getValorHeaders(),
      timeout: 30000 // 30 seconds for initial request
    });

    console.log('📥 Valor Connect Publish API response:', JSON.stringify(response.data, null, 2));

    const result = response.data;

    // Handle response based on Valor Connect API structure
    // The response should contain a transaction reference ID (reqTxnId or similar)
    if (result && (result.status === 'PENDING' || result.status === 'SUCCESS' || result.reqTxnId || result.transactionId)) {
      const transactionId = result.reqTxnId || result.transactionId || result.id || `TXN-${Date.now()}`;
      
      return {
        success: true,
        pending: result.status === 'PENDING' || !result.status || result.status === 'SUCCESS',
        transactionId: transactionId,
        reqTxnId: transactionId, // Valor Connect uses reqTxnId for status polling
        refId: result.refId || result.referenceId,
        message: result.status === 'PENDING' || !result.status
          ? 'Payment request sent to VP100 terminal. Please complete payment on device.'
          : result.message || 'Payment processed successfully',
        status: (result.status || 'PENDING').toLowerCase(),
        amount: result.amount || paymentAmount.toFixed(2)
      };
    } else if (result && (result.status === 'DECLINED' || result.status === 'FAILED')) {
      const errorMessage = result.message || result.error || 'Transaction declined';
      const errorCode = result.errorCode || result.code;
      
      console.error('❌ Valor Connect transaction declined:', {
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
      
      console.error('❌ Valor Connect transaction error:', {
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
    console.error('❌ Valor Connect Terminal Payment Error:', error.message);
    if (error.response?.data) {
      console.error('Error response data:', JSON.stringify(error.response.data, null, 2));
    }
    if (error.response?.status) {
      console.error('Error status:', error.response.status);
    }
    
    // Extract error message from response
    let errorMessage = 'Failed to connect to Valor Connect API';
    let errorCode = error.response?.status || null;
    let errorDetails = error.response?.data || null;
    
    if (error.response?.data) {
      // Try to extract error message from various possible formats
      if (typeof error.response.data === 'string') {
        errorMessage = error.response.data;
      } else if (error.response.data.desc) {
        errorMessage = error.response.data.desc; // Valor uses "desc" field
      } else if (error.response.data.msg) {
        errorMessage = error.response.data.msg; // Valor uses "msg" field
      } else if (error.response.data.mesg) {
        errorMessage = error.response.data.mesg; // Valor uses "mesg" field
      } else if (error.response.data.message) {
        errorMessage = error.response.data.message;
      } else if (error.response.data.error) {
        errorMessage = error.response.data.error;
      } else if (error.response.data.MESSAGE) {
        errorMessage = error.response.data.MESSAGE;
      } else if (error.response.data.ERROR) {
        errorMessage = error.response.data.ERROR;
      }
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    return {
      success: false,
      error: errorMessage,
      errorCode: errorCode,
      errorDetails: errorDetails
    };
  }
};

/**
 * Check payment status by polling Valor Connect API
 * @param {string} reqTxnId - Transaction reference ID (from Publish API response)
 * @param {string} epi - Equipment Profile Identifier (optional, may be needed for lookup)
 * @returns {Promise<Object>} Payment status
 */
export const checkPaymentStatus = async (reqTxnId, epi = null) => {
  // Check credentials first
  const credentialCheck = checkValorCredentials();
  if (!credentialCheck.valid) {
    return {
      success: false,
      error: credentialCheck.error
    };
  }

  if (!reqTxnId) {
    return {
      success: false,
      error: 'Transaction reference ID (reqTxnId) is required'
    };
  }

  try {
    // Valor Connect Transaction Status API endpoint
    const requestBody = {
      reqTxnId: reqTxnId
    };

    // Add EPI if provided (may be required for some implementations)
    if (epi) {
      requestBody.EPI = epi.trim();
    }

    const response = await axios.post(VALOR_TXN_STATUS_URL, requestBody, {
      headers: getValorHeaders(),
      timeout: 30000
    });

    const result = response.data;

    if (result) {
      const status = result.status || result.transactionStatus || result.STATUS || 'unknown';
      const isApproved = status === 'APPROVED' || status === 'SUCCESS' || status === 'SETTLED' || status === 'APPROVE';
      const isPending = status === 'PENDING' || status === 'PROCESSING' || status === 'IN_PROGRESS';
      const isDeclined = status === 'DECLINED' || status === 'FAILED' || status === 'CANCELLED' || status === 'CANCEL';

      return {
        success: isApproved,
        pending: isPending && !isApproved && !isDeclined,
        declined: isDeclined,
        transactionId: result.transactionId || result.reqTxnId || result.id || reqTxnId,
        reqTxnId: result.reqTxnId || reqTxnId,
        status: status.toLowerCase(),
        amount: result.amount || result.AMOUNT,
        authCode: result.authCode || result.authorizationCode || result.AUTH_CODE,
        message: result.message || result.responseReasonDescription || result.MESSAGE || `Transaction ${status}`,
        timestamp: result.timestamp || result.createdAt || result.submitTimeUTC || result.TIMESTAMP
      };
    } else {
      return {
        success: false,
        error: 'Failed to retrieve transaction details'
      };
    }
  } catch (error) {
    console.error('Valor Connect Check Payment Status Error:', error.message);
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
 * @param {string} reqTxnId - Transaction reference ID
 * @param {string} epi - Equipment Profile Identifier (optional)
 * @param {number} maxAttempts - Maximum polling attempts (default: 60)
 * @param {number} intervalMs - Polling interval in milliseconds (default: 2000 = 2 seconds)
 * @param {Function} onStatusUpdate - Callback function for status updates
 * @returns {Promise<Object>} Final payment status
 */
export const pollPaymentStatus = async (
  reqTxnId,
  epi = null,
  maxAttempts = 60,
  intervalMs = 2000,
  onStatusUpdate = null
) => {
  let attempts = 0;
  
  while (attempts < maxAttempts) {
    attempts++;
    
    const status = await checkPaymentStatus(reqTxnId, epi);
    
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
    transactionId: reqTxnId,
    reqTxnId: reqTxnId
  };
};

/**
 * Cancel a pending transaction via Valor Connect API
 * @param {string} reqTxnId - Transaction reference ID to cancel
 * @param {string} epi - Equipment Profile Identifier (optional)
 * @returns {Promise<Object>} Cancel result
 */
export const cancelTransaction = async (reqTxnId, epi = null) => {
  // Check credentials first
  const credentialCheck = checkValorCredentials();
  if (!credentialCheck.valid) {
    return {
      success: false,
      error: credentialCheck.error
    };
  }

  if (!reqTxnId) {
    return {
      success: false,
      error: 'Transaction reference ID (reqTxnId) is required'
    };
  }

  try {
    // Valor Connect Cancel API endpoint
    const requestBody = {
      reqTxnId: reqTxnId
    };

    // Add EPI if provided
    if (epi) {
      requestBody.EPI = epi.trim();
    }

    const response = await axios.post(VALOR_CANCEL_URL, requestBody, {
      headers: getValorHeaders(),
      timeout: 30000
    });

    const result = response.data;

    if (result && (result.status === 'SUCCESS' || result.status === 'CANCELLED' || result.status === 'CANCEL')) {
      return {
        success: true,
        message: result.message || 'Transaction cancelled successfully',
        transactionId: result.reqTxnId || reqTxnId,
        reqTxnId: result.reqTxnId || reqTxnId
      };
    } else {
      return {
        success: false,
        error: result?.message || result?.error || 'Failed to cancel transaction'
      };
    }
  } catch (error) {
    console.error('Cancel Transaction Error:', error.message);
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
 * Get list of devices/terminals registered with Valor API
 * Note: This may not be available in all Valor Connect implementations
 * @returns {Promise<Object>} List of devices/terminals
 */
export const getValorDevices = async () => {
  // Check credentials first
  const credentialCheck = checkValorCredentials();
  if (!credentialCheck.valid) {
    return {
      success: false,
      error: credentialCheck.error,
      devices: []
    };
  }

  // Note: Valor Connect may not have a devices endpoint
  // Terminals are identified by EPI, which is configured in Settings
  return {
    success: true,
    devices: [],
    message: 'Valor Connect uses EPI (Equipment Profile Identifier) to target terminals. Configure EPI in Settings.'
  };
};

/**
 * Void a transaction via Valor API (legacy function - kept for compatibility)
 * Note: Valor Connect may use cancel instead of void
 * @param {string} transactionId - Transaction ID to void
 * @param {string} epi - Equipment Profile Identifier (optional)
 * @returns {Promise<Object>} Void result
 */
export const voidTransaction = async (transactionId, epi = null) => {
  // For Valor Connect, use cancel instead of void
  return await cancelTransaction(transactionId, epi);
};
