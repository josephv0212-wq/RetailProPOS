/**
 * Authorize.Net Terminal Payment Service (Valor Connect)
 * Handles cloud-to-cloud payment processing through Authorize.Net with VP100 terminal integration
 * 
 * Flow:
 * 1. App sends payment request to Authorize.Net with terminalId
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
 * @param {string} terminalId - VP100 serial number or terminal ID (REQUIRED for Valor Connect)
 * @returns {Promise<Object>} Payment result with pending status
 */
export const initiateTerminalPayment = async (paymentData, terminalId) => {
  const { amount, invoiceNumber, description } = paymentData;

  // Validate terminal ID - REQUIRED for Valor Connect
  if (!terminalId || terminalId.trim() === '') {
    return {
      success: false,
      error: 'Terminal ID is required. Please configure your VP100 serial number in Settings. The terminal must be registered in Valor Portal/Authorize.Net.'
    };
  }

  const requestBody = {
    createTransactionRequest: {
      merchantAuthentication: {
        name: process.env.AUTHORIZE_NET_API_LOGIN_ID,
        transactionKey: process.env.AUTHORIZE_NET_TRANSACTION_KEY
      },
      transactionRequest: {
        transactionType: 'authCaptureTransaction',
        amount: parseFloat(amount).toFixed(2),
        // Terminal ID for Valor Connect - routes payment to VP100 device
        // This is the VP100 serial number registered in Valor Portal/Authorize.Net
        terminalId: terminalId.trim(),
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
    const response = await axios.post(AUTHORIZE_NET_ENDPOINT, requestBody, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

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
    } else {
      const errorMessage = result?.errors?.[0]?.errorText || result?.messages?.[0]?.description || 'Transaction failed';
      return {
        success: false,
        error: errorMessage,
        errorCode: result?.errors?.[0]?.errorCode
      };
    }
  } catch (error) {
    console.error('Authorize.Net Terminal Payment Error:', error.message);
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
