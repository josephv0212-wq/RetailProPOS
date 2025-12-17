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
    return {
      success: result && result.responseCode === '1',
      message: result?.messages?.[0]?.description || 'Void request processed'
    };
  } catch (error) {
    console.error('Void Transaction Error:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
};
