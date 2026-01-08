/**
 * Authorize.Net Terminal Payment Service
 * Handles payment processing through Authorize.Net with VP100 terminal integration
 * 
 * Flow:
 * 1. App sends payment request to Authorize.Net
 * 2. Authorize.Net triggers popup on VP100 device
 * 3. Customer pays on VP100 device
 * 4. VP100 sends payment data to Authorize.Net
 * 5. App polls Authorize.Net for payment status
 * 6. App shows notification when payment confirmed
 */

import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

// Use sandbox endpoint in development, production endpoint in production
const AUTHORIZE_NET_ENDPOINT = process.env.NODE_ENV === 'production'
  ? 'https://api.authorize.net/xml/v1/request.api'  // Production endpoint
  : 'https://apitest.authorize.net/xml/v1/request.api';  // Sandbox endpoint (development)

/**
 * Initiate terminal payment - sends payment request to Authorize.Net
 * Authorize.Net will trigger popup on VP100 device
 * @param {Object} paymentData - Payment information
 * @param {string} terminalId - Terminal identifier (optional, for multi-terminal setups)
 * @returns {Promise<Object>} Payment initiation result with transaction reference
 */
export const initiateTerminalPayment = async (paymentData, terminalId = null) => {
  const { amount, invoiceNumber, description } = paymentData;

  // Create transaction request for terminal payment
  // For VP100 terminal payments via Authorize.Net:
  // - We create a transaction request that Authorize.Net will route to the terminal
  // - The terminal will prompt the customer for payment
  // - We'll poll for the transaction status
  
  // Generate a unique reference ID for this payment request
  const refId = `TERMINAL-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  const requestBody = {
    createTransactionRequest: {
      merchantAuthentication: {
        name: process.env.AUTHORIZE_NET_API_LOGIN_ID,
        transactionKey: process.env.AUTHORIZE_NET_TRANSACTION_KEY
      },
      refId: refId, // Reference ID for tracking
      transactionRequest: {
        transactionType: 'authCaptureTransaction',
        amount: parseFloat(amount).toFixed(2),
        // For terminal payments, we don't provide card data
        // Authorize.Net will route to the terminal device based on merchant configuration
        // The terminal will capture card data from customer
        // Note: Actual API structure may vary - this is a simplified implementation
        // Authorize.Net may require deviceSessionId or terminal-specific parameters
        order: {
          invoiceNumber: invoiceNumber || `POS-${Date.now()}`,
          description: description || 'POS Sale - Terminal Payment'
        },
        // Device information (if terminal is registered with Authorize.Net)
        // This helps Authorize.Net route to the correct terminal
        device: terminalId ? {
          deviceId: terminalId
        } : undefined,
        // Transaction settings
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
    // Note: Authorize.Net may use different endpoint or method for terminal payments
    // This is a simplified version - actual implementation may vary based on Authorize.Net's terminal API
    const response = await axios.post(AUTHORIZE_NET_ENDPOINT, requestBody, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    const result = response.data.transactionResponse;
    
    // If transaction is pending (waiting for terminal), return pending status
    if (result && (result.responseCode === '3' || result.responseCode === '4')) {
      // Transaction is pending - waiting for terminal response
      return {
        success: true,
        pending: true,
        transactionId: result.transId || result.refId,
        refId: result.refId,
        message: 'Payment request sent to terminal. Please complete payment on VP100 device.',
        status: 'pending'
      };
    } else if (result && result.responseCode === '1') {
      // Transaction completed immediately (unlikely for terminal payments)
      return {
        success: true,
        pending: false,
        transactionId: result.transId,
        authCode: result.authCode,
        message: result.messages?.[0]?.description || 'Transaction approved'
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
    return {
      success: false,
      error: error.response?.data?.message || error.message
    };
  }
};

/**
 * Check payment status by polling Authorize.Net
 * @param {string} transactionId - Transaction ID or reference ID
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
      const isApproved = status === 'settledSuccessfully' || status === 'authorizedPendingCapture';
      const isPending = status === 'authorizedPendingCapture' || status === 'capturedPendingSettlement';
      const isDeclined = status === 'declined' || status === 'voided' || status === 'error';
      
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
      return {
        success: false,
        pending: true,
        error: 'Transaction not found or still processing'
      };
    }
  } catch (error) {
    console.error('Check Payment Status Error:', error.message);
    return {
      success: false,
      pending: true,
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
