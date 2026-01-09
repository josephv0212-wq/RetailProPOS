/**
 * Authorize.Net Terminal Payment Service (Valor Connect)
 * Handles cloud-to-cloud payment processing through Authorize.Net with VP100 terminal integration
 * 
 * Flow:
 * 1. App sends payment request to Authorize.Net with terminalNumber
 * 2. Authorize.Net routes to VP100 via Valor Connect (WebSocket/TCP)
 * 3. VP100 displays payment prompt to customer
 * 4. Customer completes payment on VP100 device
 * 5. VP100 sends payment data to Authorize.Net
 * 6. App polls Authorize.Net for payment status
 * 7. App shows notification when payment confirmed
 * 
 * Documentation:
 * - Authorize.Net API Reference: https://developer.authorize.net/api/reference/
 * - Valor Connect Integration: VP100 must be registered in Valor Portal/Authorize.Net
 */

import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

// Use sandbox endpoint in development, production endpoint in production
// All Authorize.Net API requests use the same base endpoint
const AUTHORIZE_NET_ENDPOINT = process.env.NODE_ENV === 'production'
  ? 'https://api.authorize.net/xml/v1/request.api'  // Production endpoint
  : 'https://apitest.authorize.net/xml/v1/request.api';  // Sandbox endpoint (development)

if (!global.AUTHORIZE_NET_ENDPOINT_LOGGED) {
  console.log(`💳 Authorize.Net endpoint: ${AUTHORIZE_NET_ENDPOINT} (${process.env.NODE_ENV || 'development'})`);
  global.AUTHORIZE_NET_ENDPOINT_LOGGED = true;
}

/**
 * Initiates a terminal payment request with Authorize.Net (Valor Connect).
 * The VP100 terminal must be registered in Valor Portal/Authorize.Net merchant interface.
 * @param {Object} paymentData - Payment information
 * @param {string} terminalNumber - VP100 serial number or terminal number (REQUIRED for Valor Connect)
 * @returns {Promise<Object>} Payment result with pending status
 */
export const initiateTerminalPayment = async (paymentData, terminalNumber) => {
  const { amount, invoiceNumber, description } = paymentData;

  // Validate terminal number - REQUIRED for Valor Connect
  if (!terminalNumber || terminalNumber.trim() === '') {
    return {
      success: false,
      error: 'Terminal number is required. Please configure your VP100 serial number in Settings. The terminal must be registered in Valor Portal/Authorize.Net.'
    };
  }

  // Note: Authorize.Net API structure for terminal payments
  // The terminalNumber may need to be in a different location or format
  // Based on Valor Connect documentation, we use terminalNumber in transactionRequest
  const requestBody = {
    createTransactionRequest: {
      merchantAuthentication: {
        name: process.env.AUTHORIZE_NET_API_LOGIN_ID,
        transactionKey: process.env.AUTHORIZE_NET_TRANSACTION_KEY
      },
      refId: `TERMINAL-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      transactionRequest: {
        transactionType: 'authCaptureTransaction',
        amount: parseFloat(amount).toFixed(2),
        // Terminal number for Valor Connect - routes payment to VP100 device
        // This is the VP100 serial number registered in Valor Portal/Authorize.Net
        // Note: If this field is not recognized, we may need to use a different API structure
        terminalNumber: terminalNumber.trim(),
        order: {
          invoiceNumber: invoiceNumber || `POS-${Date.now()}`,
          description: description || 'POS Sale - Terminal Payment'
        },
        transactionSettings: {
          setting: [
            {
              settingName: 'allowPartialAuth',
              settingValue: 'false'
            },
            {
              settingName: 'duplicateWindow',
              settingValue: '0'
            }
          ]
        }
      }
    }
  };

  try {
    console.log('📤 Sending terminal payment request to Authorize.Net:', {
      endpoint: AUTHORIZE_NET_ENDPOINT,
      terminalNumber: terminalNumber.trim(),
      amount: parseFloat(amount).toFixed(2)
    });

    const response = await axios.post(AUTHORIZE_NET_ENDPOINT, requestBody, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    console.log('📥 Authorize.Net response:', JSON.stringify(response.data, null, 2));

    const result = response.data.transactionResponse;

    // Response code meanings:
    // 1 = Approved
    // 2 = Declined
    // 3 = Error
    // 4 = Held for Review
    if (result && result.responseCode === '1') {
      // Transaction approved (may still be pending on terminal)
      return {
        success: true,
        pending: true,
        transactionId: result.transId,
        refId: response.data.refId,
        message: 'Payment request sent to VP100 terminal. Please complete payment on device.',
        status: 'pending'
      };
    } else if (result && (result.responseCode === '3' || result.responseCode === '4')) {
      // Transaction pending - waiting for terminal response
      return {
        success: true,
        pending: true,
        transactionId: result.transId || response.data.refId,
        refId: response.data.refId,
        message: 'Payment request sent to terminal. Please complete payment on VP100 device.',
        status: 'pending'
      };
    } else if (result && result.responseCode === '2') {
      // Transaction declined
      const errorMessage = result?.errors?.[0]?.errorText || 
                          result?.messages?.message?.[0]?.text || 
                          result?.messages?.[0]?.description || 
                          'Transaction declined';
      const errorCode = result?.errors?.[0]?.errorCode || result?.messages?.message?.[0]?.code;
      
      console.error('❌ Authorize.Net transaction declined:', {
        responseCode: result?.responseCode,
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
      // Check if there's a messages array at the root level (API-level errors)
      const rootMessages = response.data?.messages;
      const rootErrors = response.data?.messages?.message;
      
      const errorMessage = result?.errors?.[0]?.errorText || 
                          (Array.isArray(rootErrors) ? rootErrors[0]?.text : rootErrors?.text) ||
                          rootMessages?.message?.text ||
                          result?.messages?.message?.[0]?.text || 
                          result?.messages?.[0]?.description || 
                          'Transaction failed';
      const errorCode = result?.errors?.[0]?.errorCode || 
                       (Array.isArray(rootErrors) ? rootErrors[0]?.code : rootErrors?.code) ||
                       rootMessages?.message?.code ||
                       result?.messages?.message?.[0]?.code;
      
      console.error('❌ Authorize.Net transaction error:', {
        responseCode: result?.responseCode,
        errorCode: errorCode,
        errorMessage: errorMessage,
        fullResponse: response.data,
        transactionResponse: result
      });

      return {
        success: false,
        error: errorMessage,
        errorCode: errorCode
      };
    }
  } catch (error) {
    console.error('❌ Authorize.Net Terminal Payment Error:', error.message);
    if (error.response?.data) {
      console.error('Error response data:', JSON.stringify(error.response.data, null, 2));
    }
    if (error.response?.status) {
      console.error('Error status:', error.response.status);
    }
    if (error.request) {
      console.error('Request that failed:', JSON.stringify(requestBody, null, 2));
    }
    
    return {
      success: false,
      error: error.response?.data?.message || 
             error.response?.data?.messages?.message?.[0]?.text ||
             error.message ||
             'Failed to connect to Authorize.Net'
    };
  }
};

/**
 * Get list of devices/terminals registered with Authorize.Net
 * Note: Authorize.Net doesn't have a direct API to list devices
 * This function attempts to get device information or returns a structure
 * that can be populated from merchant interface configuration
 * @returns {Promise<Object>} List of devices/terminals
 */
export const getAuthorizeNetDevices = async () => {
  // Note: Authorize.Net API doesn't have a direct endpoint to list registered devices/terminals
  // Device information is typically managed through the Merchant Interface
  // This function provides a structure that can be used to display device information
  // In a real implementation, you might need to:
  // 1. Store device information in your database when devices are registered
  // 2. Use Authorize.Net's Merchant Interface API (if available)
  // 3. Query device information from Valor Portal API (if available)
  
  try {
    // For now, we'll return an empty array with a note
    // In production, you would:
    // - Query your database for registered devices
    // - Call Valor Portal API to get device list
    // - Use Authorize.Net Merchant Interface API (if available)
    
    console.log('📱 Fetching Authorize.Net devices...');
    
    // Placeholder: In a real implementation, you would fetch from:
    // - Your database (devices registered by users)
    // - Valor Portal API
    // - Authorize.Net Merchant Interface
    
    return {
      success: true,
      devices: [],
      message: 'Device list will be populated from registered terminals. Devices must be registered in Valor Portal/Authorize.Net Merchant Interface.'
    };
  } catch (error) {
    console.error('❌ Error fetching Authorize.Net devices:', error.message);
    return {
      success: false,
      error: error.message || 'Failed to fetch devices',
      devices: []
    };
  }
};

/**
 * Check payment status by polling Authorize.Net using getTransactionDetailsRequest
 * @param {string} transactionId - Transaction ID
 * @returns {Promise<Object>} Payment status
 */
export const checkPaymentStatus = async (transactionId) => {
  const requestBody = {
    getTransactionDetailsRequest: {
      merchantAuthentication: {
        name: process.env.AUTHORIZE_NET_API_LOGIN_ID,
        transactionKey: process.env.AUTHORIZE_NET_TRANSACTION_KEY
      },
      transId: transactionId
    }
  };

  try {
    const response = await axios.post(AUTHORIZE_NET_ENDPOINT, requestBody, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    const result = response.data.transaction;

    if (result) {
      const status = result.transactionStatus || 'unknown';
      const isApproved = status === 'settledSuccessfully' || status === 'authorizedPendingCapture' || status === 'capturedPendingSettlement';
      const isPending = status === 'authorizedPendingCapture' || status === 'FDSPendingReview' || status === 'FDSAuthorizedPendingReview';
      const isDeclined = status === 'declined' || status === 'voided' || status === 'refundSettledSuccessfully' || status === 'refundPendingSettlement';

      return {
        success: isApproved,
        pending: isPending && !isApproved && !isDeclined,
        declined: isDeclined,
        transactionId: result.transId,
        status: status,
        amount: result.settleAmount || result.authAmount,
        authCode: result.authCode,
        message: result.responseReasonDescription || `Transaction ${status}`,
        timestamp: result.submitTimeUTC
      };
    } else {
      const errorMessage = response.data?.messages?.message?.[0]?.text || 'Failed to retrieve transaction details';
      return {
        success: false,
        error: errorMessage
      };
    }
  } catch (error) {
    console.error('Authorize.Net Check Payment Status Error:', error.message);
    if (error.response?.data) {
      console.error('Error response:', JSON.stringify(error.response.data, null, 2));
    }
    return {
      success: false,
      error: error.response?.data?.message || error.message
    };
  }
};

/**
 * Poll payment status until completion or timeout
 * @param {string} transactionId - Transaction ID
 * @param {number} maxAttempts - Maximum polling attempts (default: 60)
 * @param {number} intervalMs - Polling interval in milliseconds (default: 2000 = 2 seconds)
 * @param {Function} onStatusUpdate - Callback function for status updates
 * @returns {Promise<Object>} Final payment status
 */
export const pollPaymentStatus = async (
  transactionId,
  maxAttempts = 60,
  intervalMs = 2000,
  onStatusUpdate = null
) => {
  let attempts = 0;
  
  while (attempts < maxAttempts) {
    attempts++;
    
    const status = await checkPaymentStatus(transactionId);
    
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
