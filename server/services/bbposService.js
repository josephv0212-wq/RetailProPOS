/**
 * BBPOS Card Reader Service
 * Handles payment processing through BBPOS Chipper 3X card reader (USB/Bluetooth)
 * 
 * The reader uses Authorize.Net's Accept Mobile SDK to capture card data
 * and returns encrypted opaqueData that is processed through Authorize.Net API
 */

import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

// Use sandbox endpoint in development, production endpoint in production
const AUTHORIZE_NET_ENDPOINT = process.env.NODE_ENV === 'production'
  ? 'https://api.authorize.net/xml/v1/request.api'  // Production endpoint
  : 'https://apitest.authorize.net/xml/v1/request.api';  // Sandbox endpoint (development)

/**
 * Process payment using opaqueData from BBPOS Bluetooth reader
 * @param {Object} paymentData - Payment information with opaqueData
 * @param {string} paymentData.amount - Payment amount
 * @param {string} paymentData.opaqueData.descriptor - Data descriptor from reader
 * @param {string} paymentData.opaqueData.value - Encrypted data value from reader
 * @param {string} paymentData.deviceSessionId - Device session ID (optional)
 * @param {string} paymentData.invoiceNumber - Invoice number (optional)
 * @param {string} paymentData.description - Transaction description (optional)
 * @returns {Promise<Object>} Payment result
 */
export const processBluetoothPayment = async (paymentData) => {
  const { 
    amount, 
    opaqueData, 
    deviceSessionId,
    invoiceNumber,
    description 
  } = paymentData;

  // Validate amount
  const paymentAmount = parseFloat(amount);
  if (isNaN(paymentAmount) || paymentAmount <= 0) {
    return {
      success: false,
      error: `Invalid payment amount: ${amount}. Amount must be a positive number.`
    };
  }

  // Validate opaqueData
  if (!opaqueData || !opaqueData.descriptor || !opaqueData.value) {
    return {
      success: false,
      error: 'Invalid opaqueData. Both descriptor and value are required from the Bluetooth reader.'
    };
  }

  // Build Authorize.Net request with opaqueData
  const requestBody = {
    createTransactionRequest: {
      merchantAuthentication: {
        name: process.env.AUTHORIZE_NET_API_LOGIN_ID,
        transactionKey: process.env.AUTHORIZE_NET_TRANSACTION_KEY
      },
      transactionRequest: {
        transactionType: 'authCaptureTransaction',
        amount: paymentAmount.toFixed(2),
        payment: {
          opaqueData: {
            dataDescriptor: opaqueData.descriptor,
            dataValue: opaqueData.value
          }
        },
        order: {
          invoiceNumber: invoiceNumber || `POS-BT-${Date.now()}`,
          description: description || 'POS Sale (Bluetooth Reader)'
        }
      }
    }
  };

  // Add deviceSessionId if provided (for tracking)
  if (deviceSessionId) {
    requestBody.createTransactionRequest.transactionRequest.deviceSessionId = deviceSessionId;
  }

  try {
    const response = await axios.post(AUTHORIZE_NET_ENDPOINT, requestBody, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    const result = response.data.transactionResponse;
    
    if (result && result.responseCode === '1') {
      return {
        success: true,
        transactionId: result.transId,
        authCode: result.authCode,
        accountNumber: result.accountNumber,
        message: result.messages?.[0]?.description || 'Transaction approved',
        paymentMethod: 'bluetooth_reader'
      };
    } else {
      const errorMessage = result?.errors?.[0]?.errorText || 
                          result?.messages?.[0]?.description || 
                          'Transaction failed';
      return {
        success: false,
        error: errorMessage,
        errorCode: result?.errors?.[0]?.errorCode,
        responseCode: result?.responseCode
      };
    }
  } catch (error) {
    console.error('BBPOS Bluetooth Payment Error:', error.message);
    return {
      success: false,
      error: error.response?.data?.message || 
             error.response?.data?.messages?.[0]?.text || 
             error.message || 
             'Bluetooth reader payment processing failed'
    };
  }
};

/**
 * Validate opaqueData structure
 * @param {Object} opaqueData - Opaque data from reader
 * @returns {boolean} True if valid
 */
export const validateOpaqueData = (opaqueData) => {
  return opaqueData && 
         typeof opaqueData === 'object' &&
         opaqueData.descriptor && 
         typeof opaqueData.descriptor === 'string' &&
         opaqueData.value && 
         typeof opaqueData.value === 'string' &&
         opaqueData.descriptor.length > 0 &&
         opaqueData.value.length > 0;
};

