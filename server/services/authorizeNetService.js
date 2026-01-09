import axios from 'axios';
import dotenv from 'dotenv';
import { parseStringPromise } from 'xml2js';
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

/**
 * Get customer profile by customer profile ID
 * Note: Authorize.net CIM API uses XML format, but we'll try JSON first
 * @param {string} customerProfileId - The Authorize.net customer profile ID
 * @returns {Promise<Object>} Customer profile details
 */
export const getCustomerProfile = async (customerProfileId) => {
  // Authorize.net CIM API uses XML format
  const xmlBody = `<?xml version="1.0" encoding="utf-8"?>
<getCustomerProfileRequest xmlns="AnetApi/xml/v1/schema/AnetApiSchema.xsd">
  <merchantAuthentication>
    <name>${process.env.AUTHORIZE_NET_API_LOGIN_ID}</name>
    <transactionKey>${process.env.AUTHORIZE_NET_TRANSACTION_KEY}</transactionKey>
  </merchantAuthentication>
  <customerProfileId>${customerProfileId}</customerProfileId>
</getCustomerProfileRequest>`;

  try {
    const response = await axios.post(AUTHORIZE_NET_ENDPOINT, xmlBody, {
      headers: {
        'Content-Type': 'text/xml'
      }
    });

    // Parse XML response
    const result = await parseStringPromise(response.data);

    const messages = result.getCustomerProfileResponse?.messages?.[0];
    const resultCode = messages?.resultCode?.[0];

    if (resultCode === 'Ok') {
      const profile = result.getCustomerProfileResponse?.profile?.[0];
      return {
        success: true,
        profile: profile
      };
    } else {
      const errorText = messages?.message?.[0]?.text?.[0] || 'Failed to get customer profile';
      return {
        success: false,
        error: errorText
      };
    }
  } catch (error) {
    console.error('Get Customer Profile Error:', error.message);
    if (error.response?.data) {
      console.error('Response data:', error.response.data);
    }
    return {
      success: false,
      error: error.response?.data?.message || error.message
    };
  }
};

/**
 * Get all customer profile IDs
 * Note: Authorize.net CIM API uses XML format
 * @returns {Promise<Object>} List of customer profile IDs
 */
export const getCustomerProfileIds = async () => {
  // Authorize.net CIM API uses XML format
  const xmlBody = `<?xml version="1.0" encoding="utf-8"?>
<getCustomerProfileIdsRequest xmlns="AnetApi/xml/v1/schema/AnetApiSchema.xsd">
  <merchantAuthentication>
    <name>${process.env.AUTHORIZE_NET_API_LOGIN_ID}</name>
    <transactionKey>${process.env.AUTHORIZE_NET_TRANSACTION_KEY}</transactionKey>
  </merchantAuthentication>
</getCustomerProfileIdsRequest>`;

  try {
    const response = await axios.post(AUTHORIZE_NET_ENDPOINT, xmlBody, {
      headers: {
        'Content-Type': 'text/xml'
      }
    });

    // Parse XML response
    const result = await parseStringPromise(response.data);

    const messages = result.getCustomerProfileIdsResponse?.messages?.[0];
    const resultCode = messages?.resultCode?.[0];

    if (resultCode === 'Ok') {
      const ids = result.getCustomerProfileIdsResponse?.ids?.[0]?.numericString || [];
      const profileIds = Array.isArray(ids) ? ids : [ids].filter(Boolean);
      return {
        success: true,
        profileIds: profileIds
      };
    } else {
      const errorText = messages?.message?.[0]?.text?.[0] || 'Failed to get customer profile IDs';
      return {
        success: false,
        error: errorText,
        profileIds: []
      };
    }
  } catch (error) {
    console.error('Get Customer Profile IDs Error:', error.message);
    if (error.response?.data) {
      console.error('Response data:', error.response.data);
    }
    return {
      success: false,
      error: error.response?.data?.message || error.message,
      profileIds: []
    };
  }
};

/**
 * Attempt to find customer profile by email using duplicate create workaround
 * Authorize.net enforces uniqueness for Merchant Customer ID and Email.
 * If we try to create a duplicate, it returns an error with the existing customerProfileId.
 * Note: Authorize.net CIM API uses XML format
 * @param {string} email - Customer email
 * @param {string} merchantCustomerId - Optional merchant customer ID
 * @returns {Promise<Object>} Customer profile ID if found
 */
export const findCustomerProfileByEmail = async (email, merchantCustomerId = null) => {
  if (!email) {
    return {
      success: false,
      error: 'Email is required'
    };
  }

  // Use email as merchant customer ID if not provided
  const customerId = merchantCustomerId || email.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 20);

  // Authorize.net CIM API uses XML format
  const xmlBody = `<?xml version="1.0" encoding="utf-8"?>
<createCustomerProfileRequest xmlns="AnetApi/xml/v1/schema/AnetApiSchema.xsd">
  <merchantAuthentication>
    <name>${process.env.AUTHORIZE_NET_API_LOGIN_ID}</name>
    <transactionKey>${process.env.AUTHORIZE_NET_TRANSACTION_KEY}</transactionKey>
  </merchantAuthentication>
  <profile>
    <merchantCustomerId>${customerId}</merchantCustomerId>
    <email>${email}</email>
  </profile>
</createCustomerProfileRequest>`;

  try {
    const response = await axios.post(AUTHORIZE_NET_ENDPOINT, xmlBody, {
      headers: {
        'Content-Type': 'text/xml'
      }
    });

    // Parse XML response
    const result = await parseStringPromise(response.data);

    const messages = result.createCustomerProfileResponse?.messages?.[0];
    const resultCode = messages?.resultCode?.[0];

    // If successful, profile was created (new customer)
    if (resultCode === 'Ok') {
      const profileId = result.createCustomerProfileResponse?.customerProfileId?.[0];
      if (profileId) {
        return {
          success: true,
          customerProfileId: profileId,
          isNew: true
        };
      }
    }

    // Check for duplicate error
    const errorCode = messages?.message?.[0]?.code?.[0] || '';
    const errorText = messages?.message?.[0]?.text?.[0] || '';

    // Authorize.net error code E00039 indicates duplicate profile
    if (errorCode === 'E00039' || errorText.includes('duplicate') || errorText.includes('already exists')) {
      // Try to extract customer profile ID from error message
      // Error format: "A duplicate customer profile already exists with customer profile ID: 12345678"
      const profileIdMatch = errorText.match(/customer profile ID[:\s]+(\d+)/i) || 
                             errorText.match(/ID[:\s]+(\d+)/i);
      
      if (profileIdMatch && profileIdMatch[1]) {
        return {
          success: true,
          customerProfileId: profileIdMatch[1],
          isNew: false
        };
      }

      // If we can't extract ID from error, try iterative search
      return {
        success: false,
        error: 'Duplicate found but could not extract profile ID',
        shouldSearch: true
      };
    }

    return {
      success: false,
      error: errorText || 'Unexpected response'
    };
  } catch (error) {
    // Try to parse XML error response
    if (error.response?.data) {
      try {
        const result = await parseStringPromise(error.response.data);
        
        const messages = result.createCustomerProfileResponse?.messages?.[0];
        const errorCode = messages?.message?.[0]?.code?.[0] || '';
        const errorText = messages?.message?.[0]?.text?.[0] || '';

        // Authorize.net error code E00039 indicates duplicate profile
        if (errorCode === 'E00039' || errorText.includes('duplicate') || errorText.includes('already exists')) {
          const profileIdMatch = errorText.match(/customer profile ID[:\s]+(\d+)/i) || 
                                 errorText.match(/ID[:\s]+(\d+)/i);
          
          if (profileIdMatch && profileIdMatch[1]) {
            return {
              success: true,
              customerProfileId: profileIdMatch[1],
              isNew: false
            };
          }

          return {
            success: false,
            error: 'Duplicate found but could not extract profile ID',
            shouldSearch: true
          };
        }

        return {
          success: false,
          error: errorText || error.message
        };
      } catch (parseError) {
        // If XML parsing fails, return generic error
      }
    }

    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Search for customer profile by iterating through all profile IDs
 * This is only recommended for small datasets
 * Prioritizes name matching over email matching
 * @param {string} name - Customer name to search for (primary)
 * @param {string} email - Customer email to search for (fallback)
 * @returns {Promise<Object>} Customer profile if found
 */
export const searchCustomerProfileIteratively = async (name = null, email = null) => {
  try {
    // Get all customer profile IDs
    const idsResult = await getCustomerProfileIds();
    
    if (!idsResult.success || !idsResult.profileIds || idsResult.profileIds.length === 0) {
      return {
        success: false,
        error: 'No customer profiles found or failed to retrieve profile IDs'
      };
    }

    // Silently search through profiles

    // Search through each profile
    for (const profileId of idsResult.profileIds) {
      try {
        const profileResult = await getCustomerProfile(profileId);
        
        if (profileResult.success && profileResult.profile) {
          const profile = profileResult.profile;
          // XML parsing returns arrays, so we need to handle that
          const profileEmail = (Array.isArray(profile.email) ? profile.email[0] : profile.email) || '';
          const profileName = (Array.isArray(profile.description) ? profile.description[0] : profile.description) || 
                             (Array.isArray(profile.merchantCustomerId) ? profile.merchantCustomerId[0] : profile.merchantCustomerId) || '';
          
          // Prioritize name matching first
          if (name && profileName && profileName.toLowerCase().includes(name.toLowerCase())) {
            return {
              success: true,
              profile: profile,
              customerProfileId: profileId
            };
          }
          
          // Fallback to email matching if name doesn't match
          if (email && profileEmail && profileEmail.toLowerCase() === email.toLowerCase()) {
            return {
              success: true,
              profile: profile,
              customerProfileId: profileId
            };
          }
        }
      } catch (err) {
        // Continue searching if one profile fails
        continue;
      }
    }

    return {
      success: false,
      error: 'Customer profile not found'
    };
  } catch (error) {
    console.error('Iterative Search Error:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Extract bank account information from Authorize.net customer profile
 * Handles deeply nested XML array structure: paymentProfiles[].payment[].bankAccount[].accountNumber[]
 * @param {Object} profile - Authorize.net customer profile
 * @returns {Object} Bank account info { bankAccountLast4, hasBankAccount }
 */
export const extractBankAccountInfo = (profile) => {
  if (!profile) {
    return { bankAccountLast4: null, hasBankAccount: false };
  }

  try {
    // Authorize.net stores payment profiles in profile.paymentProfiles
    const paymentProfiles = profile.paymentProfiles || [];
    
    // Handle XML array format - paymentProfiles is an array
    const profiles = Array.isArray(paymentProfiles) ? paymentProfiles : [];
    
    // Search through payment profiles for bank account
    for (const paymentProfile of profiles) {
      // paymentProfile.payment is an array
      const payments = Array.isArray(paymentProfile.payment) ? paymentProfile.payment : [];
      
      for (const payment of payments) {
        // payment.bankAccount is an array
        const bankAccounts = Array.isArray(payment.bankAccount) ? payment.bankAccount : [];
        
        for (const bankAccount of bankAccounts) {
          // bankAccount.accountNumber is an array
          const accountNumbers = Array.isArray(bankAccount.accountNumber) 
            ? bankAccount.accountNumber 
            : (bankAccount.accountNumber ? [bankAccount.accountNumber] : []);
          
          for (const accountNumber of accountNumbers) {
            if (accountNumber && typeof accountNumber === 'string') {
              // Account number is already masked as "XXXX9500", extract last 4 digits
              // Remove any non-digit characters and get last 4 digits
              const digits = accountNumber.replace(/\D/g, '');
              if (digits.length >= 4) {
                const last4 = digits.slice(-4);
                return {
                  bankAccountLast4: last4,
                  hasBankAccount: true
                };
              }
            }
          }
        }
      }
    }
    
    return { bankAccountLast4: null, hasBankAccount: false };
  } catch (error) {
    // Silently fail - no bank account info found
    return { bankAccountLast4: null, hasBankAccount: false };
  }
};

/**
 * Get customer profile details by name, email, or customer ID
 * Prioritizes name-based search over email-based search
 * @param {Object} searchCriteria - Search criteria { name?, email?, customerProfileId?, merchantCustomerId? }
 * @returns {Promise<Object>} Customer profile details
 */
export const getCustomerProfileDetails = async (searchCriteria) => {
  const { name, email, customerProfileId, merchantCustomerId } = searchCriteria;

  // Method 1: If we have customerProfileId, use it directly
  if (customerProfileId) {
    const result = await getCustomerProfile(customerProfileId);
    if (result.success) {
      return result;
    }
  }

  // Method 2: Iterative search by name (prioritized) or email (fallback)
  if (name || email) {
    const result = await searchCustomerProfileIteratively(name || null, email || null);
    if (result.success) {
      return result;
    }
  }

  // Method 3: Try duplicate create workaround with email (fallback if iterative search fails)
  if (email && !name) {
    const result = await findCustomerProfileByEmail(email, merchantCustomerId);
    if (result.success && result.customerProfileId) {
      // Now get the full profile
      const profileResult = await getCustomerProfile(result.customerProfileId);
      if (profileResult.success) {
        return profileResult;
      }
    }
  }

  return {
    success: false,
    error: 'Customer profile not found using any available method'
  };
};

/**
 * Charge a customer for an invoice or sales order using Authorize.net CIM
 * This function uses stored customer payment profiles to process payments
 * @param {Object} paymentData - Payment data { customerProfileId, customerPaymentProfileId, amount, invoiceNumber, description }
 * @returns {Promise<Object>} Transaction result
 */
export const chargeCustomerProfile = async (paymentData) => {
  const { customerProfileId, customerPaymentProfileId, amount, invoiceNumber, description } = paymentData;

  if (!customerProfileId || !customerPaymentProfileId) {
    return {
      success: false,
      error: 'Customer profile ID and payment profile ID are required'
    };
  }

  if (!amount || amount <= 0) {
    return {
      success: false,
      error: 'Valid amount is required'
    };
  }

  // Authorize.net transaction API uses JSON format
  const requestBody = {
    createTransactionRequest: {
      merchantAuthentication: {
        name: process.env.AUTHORIZE_NET_API_LOGIN_ID,
        transactionKey: process.env.AUTHORIZE_NET_TRANSACTION_KEY
      },
      transactionRequest: {
        transactionType: 'authCaptureTransaction',
        amount: parseFloat(amount).toFixed(2),
        profile: {
          customerProfileId: customerProfileId.toString(),
          paymentProfile: {
            paymentProfileId: customerPaymentProfileId.toString()
          }
        },
        order: {
          invoiceNumber: invoiceNumber || `INV-${Date.now()}`,
          description: description || 'Invoice Payment'
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
    console.error('Authorize.Net CIM Charge Error:', error.message);
    if (error.response?.data) {
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
    }
    return {
      success: false,
      error: error.response?.data?.message || error.message
    };
  }
};

/**
 * Get payment profile IDs from a customer profile
 * Extracts all payment profile IDs (both credit card and bank account) from a customer profile
 * @param {Object} profile - Authorize.net customer profile (from getCustomerProfile)
 * @returns {Array<Object>} Array of payment profiles with IDs and types
 */
export const extractPaymentProfiles = (profile) => {
  if (!profile) {
    return [];
  }

  try {
    const paymentProfiles = profile.paymentProfiles || [];
    const profiles = Array.isArray(paymentProfiles) ? paymentProfiles : [];
    const result = [];

    for (const paymentProfile of profiles) {
      // Extract payment profile ID
      const paymentProfileId = Array.isArray(paymentProfile.customerPaymentProfileId)
        ? paymentProfile.customerPaymentProfileId[0]
        : paymentProfile.customerPaymentProfileId;

      if (!paymentProfileId) continue;

      // Check for credit card
      const payments = Array.isArray(paymentProfile.payment) ? paymentProfile.payment : [];
      for (const payment of payments) {
        if (payment.creditCard && Array.isArray(payment.creditCard)) {
          const card = payment.creditCard[0];
          const cardNumber = Array.isArray(card.cardNumber) ? card.cardNumber[0] : card.cardNumber;
          const expirationDate = Array.isArray(card.expirationDate) ? card.expirationDate[0] : card.expirationDate;
          
          result.push({
            paymentProfileId: paymentProfileId.toString(),
            type: 'credit_card',
            cardNumber: cardNumber || 'XXXX',
            expirationDate: expirationDate || '',
            isDefault: paymentProfile.billTo && Array.isArray(paymentProfile.billTo) && paymentProfile.billTo[0]?.defaultPaymentProfile === 'true'
          });
        } else if (payment.bankAccount && Array.isArray(payment.bankAccount)) {
          const bankAccount = payment.bankAccount[0];
          const accountNumber = Array.isArray(bankAccount.accountNumber) ? bankAccount.accountNumber[0] : bankAccount.accountNumber;
          
          result.push({
            paymentProfileId: paymentProfileId.toString(),
            type: 'ach',
            accountNumber: accountNumber || 'XXXX',
            isDefault: paymentProfile.billTo && Array.isArray(paymentProfile.billTo) && paymentProfile.billTo[0]?.defaultPaymentProfile === 'true'
          });
        }
      }
    }

    return result;
  } catch (error) {
    console.error('Error extracting payment profiles:', error);
    return [];
  }
};
