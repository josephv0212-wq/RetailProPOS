import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

// Use sandbox endpoint in development, production endpoint in production
const AUTHORIZE_NET_ENDPOINT = process.env.NODE_ENV === 'production'
  ? 'https://api.authorize.net/xml/v1/request.api'  // Production endpoint
  : 'https://apitest.authorize.net/xml/v1/request.api';  // Sandbox endpoint (development)

// Log which endpoint is being used (only once at startup)
if (!global.AUTHORIZE_NET_ENDPOINT_LOGGED) {
  console.log(`💳 Authorize.Net endpoint: ${AUTHORIZE_NET_ENDPOINT} (${process.env.NODE_ENV || 'development'})`);
  global.AUTHORIZE_NET_ENDPOINT_LOGGED = true;
}

export const processPayment = async (paymentData) => {
  const { amount, cardNumber, expirationDate, cvv, description, invoiceNumber } = paymentData;

  const requestBody = {
    createTransactionRequest: {
      merchantAuthentication: {
        name: process.env.AUTHORIZE_NET_API_LOGIN_ID,
        transactionKey: process.env.AUTHORIZE_NET_TRANSACTION_KEY
      },
      transactionRequest: {
        transactionType: 'authCaptureTransaction',
        amount: amount.toFixed(2),
        payment: {
          creditCard: {
            cardNumber: cardNumber,
            expirationDate: expirationDate,
            cardCode: cvv
          }
        },
        order: {
          invoiceNumber: invoiceNumber || `INV-${Date.now()}`,
          description: description || 'POS Sale'
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
    
    if (result && result.responseCode === '1') {
      return {
        success: true,
        transactionId: result.transId,
        authCode: result.authCode,
        accountNumber: result.accountNumber,
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
    console.error('Authorize.Net API Error:', error.message);
    return {
      success: false,
      error: error.response?.data?.message || error.message
    };
  }
};

export const processAchPayment = async (paymentData) => {
  const { amount, routingNumber, accountNumber, accountType = 'checking', nameOnAccount, bankName, description, invoiceNumber } = paymentData;

  const requestBody = {
    createTransactionRequest: {
      merchantAuthentication: {
        name: process.env.AUTHORIZE_NET_API_LOGIN_ID,
        transactionKey: process.env.AUTHORIZE_NET_TRANSACTION_KEY
      },
      transactionRequest: {
        transactionType: 'authCaptureTransaction',
        amount: amount.toFixed(2),
        payment: {
          bankAccount: {
            accountType,
            routingNumber,
            accountNumber,
            nameOnAccount,
            echeckType: 'WEB',
            bankName
          }
        },
        order: {
          invoiceNumber: invoiceNumber || `INV-${Date.now()}`,
          description: description || 'POS Sale (ACH)'
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

    if (result && result.responseCode === '1') {
      return {
        success: true,
        transactionId: result.transId,
        authCode: result.authCode,
        accountNumber: result.accountNumber,
        message: result.messages?.[0]?.description || 'ACH transaction approved'
      };
    } else {
      const errorMessage = result?.errors?.[0]?.errorText || result?.messages?.[0]?.description || 'ACH transaction failed';
      return {
        success: false,
        error: errorMessage,
        errorCode: result?.errors?.[0]?.errorCode
      };
    }
  } catch (error) {
    console.error('Authorize.Net ACH API Error:', error.message);
    return {
      success: false,
      error: error.response?.data?.message || error.message
    };
  }
};

export const calculateCreditCardFee = (subtotal, taxAmount) => {
  const baseAmount = parseFloat(subtotal) + parseFloat(taxAmount);
  const feePercentage = 0.03;
  return parseFloat((baseAmount * feePercentage).toFixed(2));
};

export const voidTransaction = async (transactionId) => {
  const requestBody = {
    createTransactionRequest: {
      merchantAuthentication: {
        name: process.env.AUTHORIZE_NET_API_LOGIN_ID,
        transactionKey: process.env.AUTHORIZE_NET_TRANSACTION_KEY
      },
      transactionRequest: {
        transactionType: 'voidTransaction',
        refTransId: transactionId
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
    
    if (result && result.responseCode === '1') {
      return {
        success: true,
        transactionId: result.transId,
        message: result?.messages?.[0]?.description || 'Transaction voided successfully'
      };
    } else {
      const errorMessage = result?.errors?.[0]?.errorText || result?.messages?.[0]?.description || 'Void failed';
      return {
        success: false,
        error: errorMessage,
        errorCode: result?.errors?.[0]?.errorCode
      };
    }
  } catch (error) {
    console.error('Void Transaction Error:', error.message);
    return {
      success: false,
      error: error.response?.data?.message || error.message
    };
  }
};

/**
 * Refund a settled transaction
 * @param {string} transactionId - The original transaction ID to refund
 * @param {number} amount - Amount to refund (optional, defaults to full refund)
 * @param {string} cardNumber - Last 4 digits of card (optional, required for some processors)
 * @returns {Promise<Object>} Refund result
 */
export const refundTransaction = async (transactionId, amount = null, cardNumber = null) => {
  const requestBody = {
    createTransactionRequest: {
      merchantAuthentication: {
        name: process.env.AUTHORIZE_NET_API_LOGIN_ID,
        transactionKey: process.env.AUTHORIZE_NET_TRANSACTION_KEY
      },
      transactionRequest: {
        transactionType: 'refundTransaction',
        refTransId: transactionId,
        ...(amount && { amount: amount.toFixed(2) }),
        ...(cardNumber && {
          payment: {
            creditCard: {
              cardNumber: cardNumber // Last 4 digits only
            }
          }
        })
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
    
    if (result && result.responseCode === '1') {
      return {
        success: true,
        transactionId: result.transId,
        message: result?.messages?.[0]?.description || 'Refund processed successfully'
      };
    } else {
      const errorMessage = result?.errors?.[0]?.errorText || result?.messages?.[0]?.description || 'Refund failed';
      return {
        success: false,
        error: errorMessage,
        errorCode: result?.errors?.[0]?.errorCode
      };
    }
  } catch (error) {
    console.error('Refund Transaction Error:', error.message);
    return {
      success: false,
      error: error.response?.data?.message || error.message
    };
  }
};

/**
 * Get transaction details by transaction ID
 * Uses Authorize.net Reporting API
 * @param {string} transactionId - Transaction ID to look up
 * @returns {Promise<Object>} Transaction details
 */
export const getTransactionDetails = async (transactionId) => {
  // Authorize.net Reporting API endpoint
  const REPORTING_ENDPOINT = process.env.NODE_ENV === 'production'
    ? 'https://api.authorize.net/xml/v1/request.api'
    : 'https://apitest.authorize.net/xml/v1/request.api';

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
    const response = await axios.post(REPORTING_ENDPOINT, requestBody, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    const result = response.data.transaction;
    
    if (result) {
      return {
        success: true,
        transaction: {
          transactionId: result.transId,
          transactionType: result.transactionType,
          transactionStatus: result.transactionStatus,
          authCode: result.authCode,
          amount: parseFloat(result.settleAmount || result.authAmount || 0),
          invoiceNumber: result.order?.invoiceNumber,
          submittedAt: result.submitTimeUTC,
          settledAt: result.settleTimeUTC,
          paymentMethod: result.payment?.creditCard ? 'creditCard' : result.payment?.bankAccount ? 'bankAccount' : 'unknown',
          accountNumber: result.payment?.creditCard?.cardNumber || result.payment?.bankAccount?.accountNumber
        }
      };
    } else {
      return {
        success: false,
        error: 'Transaction not found'
      };
    }
  } catch (error) {
    console.error('Get Transaction Details Error:', error.message);
    return {
      success: false,
      error: error.response?.data?.message || error.message
    };
  }
};

/**
 * Get recent transactions for reconciliation
 * Fetches transactions from the last N minutes
 * Uses Authorize.net Reporting API with batch listing
 * @param {number} minutesBack - How many minutes back to look (default: 15)
 * @returns {Promise<Array>} Array of recent transactions
 */
export const getRecentTransactions = async (minutesBack = 15) => {
  // Authorize.net Reporting API endpoint
  const REPORTING_ENDPOINT = process.env.NODE_ENV === 'production'
    ? 'https://api.authorize.net/xml/v1/request.api'
    : 'https://apitest.authorize.net/xml/v1/request.api';

  const startDate = new Date();
  startDate.setMinutes(startDate.getMinutes() - minutesBack);
  
  // Format dates in ISO 8601 format (Authorize.net expects this)
  const startDateStr = startDate.toISOString();
  const endDateStr = new Date().toISOString();

  const requestBody = {
    getTransactionListRequest: {
      merchantAuthentication: {
        name: process.env.AUTHORIZE_NET_API_LOGIN_ID,
        transactionKey: process.env.AUTHORIZE_NET_TRANSACTION_KEY
      },
      batchInclude: {
        batchId: '0' // Get all batches
      },
      sorting: {
        orderBy: 'submitTimeUTC',
        orderDescending: 'true'
      },
      paging: {
        limit: '1000', // Max transactions to fetch
        offset: '1'
      },
      transactionType: 'authCaptureTransaction', // Only get auth+capture transactions
      firstSettlementDate: startDateStr,
      lastSettlementDate: endDateStr
    }
  };

  try {
    const response = await axios.post(REPORTING_ENDPOINT, requestBody, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    const transactions = response.data.transactions || [];
    
    // Transform to a more usable format
    return transactions.map(txn => ({
      transactionId: txn.transId,
      transactionType: txn.transactionType,
      transactionStatus: txn.transactionStatus,
      authCode: txn.authCode,
      amount: parseFloat(txn.settleAmount || txn.authAmount || 0),
      invoiceNumber: txn.order?.invoiceNumber || txn.invoiceNumber,
      submittedAt: txn.submitTimeUTC,
      settledAt: txn.settleTimeUTC,
      paymentMethod: txn.payment?.creditCard ? 'creditCard' : txn.payment?.bankAccount ? 'bankAccount' : 'unknown',
      accountNumber: txn.payment?.creditCard?.cardNumber || txn.payment?.bankAccount?.accountNumber,
      // Store minimal safe response data
      rawResponse: {
        transId: txn.transId,
        transactionType: txn.transactionType,
        transactionStatus: txn.transactionStatus,
        authCode: txn.authCode,
        submitTimeUTC: txn.submitTimeUTC,
        settleTimeUTC: txn.settleTimeUTC
      }
    }));
  } catch (error) {
    console.error('Get Recent Transactions Error:', error.message);
    // If the API call fails, return empty array (don't crash reconciliation)
    return [];
  }
};

/**
 * Alternative method: Get transactions by batch
 * Sometimes more reliable than date-based queries
 * @param {string} batchId - Batch ID to query (optional, if not provided gets most recent)
 * @returns {Promise<Array>} Array of transactions in the batch
 */
export const getTransactionsByBatch = async (batchId = null) => {
  const REPORTING_ENDPOINT = process.env.NODE_ENV === 'production'
    ? 'https://api.authorize.net/xml/v1/request.api'
    : 'https://apitest.authorize.net/xml/v1/request.api';

  // First, get recent batches if batchId not provided
  if (!batchId) {
    const batchListBody = {
      getSettledBatchListRequest: {
        merchantAuthentication: {
          name: process.env.AUTHORIZE_NET_API_LOGIN_ID,
          transactionKey: process.env.AUTHORIZE_NET_TRANSACTION_KEY
        },
        includeStatistics: 'true',
        firstSettlementDate: new Date(Date.now() - 15 * 60 * 1000).toISOString(), // Last 15 minutes
        lastSettlementDate: new Date().toISOString()
      }
    };

    try {
      const batchResponse = await axios.post(REPORTING_ENDPOINT, batchListBody, {
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const batches = batchResponse.data.batchList?.batch || [];
      if (batches.length === 0) {
        return [];
      }

      // Get the most recent batch
      batchId = batches[0].batchId;
    } catch (error) {
      console.error('Get Batch List Error:', error.message);
      return [];
    }
  }

  // Now get transactions for this batch
  const transactionListBody = {
    getTransactionListRequest: {
      merchantAuthentication: {
        name: process.env.AUTHORIZE_NET_API_LOGIN_ID,
        transactionKey: process.env.AUTHORIZE_NET_TRANSACTION_KEY
      },
      batchInclude: {
        batchId: batchId
      },
      sorting: {
        orderBy: 'submitTimeUTC',
        orderDescending: 'true'
      },
      paging: {
        limit: '1000',
        offset: '1'
      }
    }
  };

  try {
    const response = await axios.post(REPORTING_ENDPOINT, transactionListBody, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    const transactions = response.data.transactions || [];
    
    return transactions.map(txn => ({
      transactionId: txn.transId,
      transactionType: txn.transactionType,
      transactionStatus: txn.transactionStatus,
      authCode: txn.authCode,
      amount: parseFloat(txn.settleAmount || txn.authAmount || 0),
      invoiceNumber: txn.order?.invoiceNumber || txn.invoiceNumber,
      submittedAt: txn.submitTimeUTC,
      settledAt: txn.settleTimeUTC,
      paymentMethod: txn.payment?.creditCard ? 'creditCard' : txn.payment?.bankAccount ? 'bankAccount' : 'unknown',
      accountNumber: txn.payment?.creditCard?.cardNumber || txn.payment?.bankAccount?.accountNumber,
      rawResponse: {
        transId: txn.transId,
        transactionType: txn.transactionType,
        transactionStatus: txn.transactionStatus,
        authCode: txn.authCode,
        submitTimeUTC: txn.submitTimeUTC,
        settleTimeUTC: txn.settleTimeUTC
      }
    }));
  } catch (error) {
    console.error('Get Transactions By Batch Error:', error.message);
    return [];
  }
};
