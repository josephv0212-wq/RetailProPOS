import axios from 'axios';
import dotenv from 'dotenv';
import { parseStringPromise } from 'xml2js';
dotenv.config();

// Use sandbox endpoint in development, production endpoint in production
const AUTHORIZE_NET_ENDPOINT = process.env.NODE_ENV === 'production'
  ? 'https://api.authorize.net/xml/v1/request.api'  // Production endpoint
  : 'https://apitest.authorize.net/xml/v1/request.api';  // Sandbox endpoint (development)

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

/**
 * Process a card payment using Accept.js / Accept Mobile opaqueData.
 * This is the preferred PCI-friendly approach (no raw PAN stored/handled long-term).
 */
export const processOpaqueDataPayment = async (paymentData) => {
  const { amount, opaqueData, deviceSessionId, invoiceNumber, description } = paymentData;

  const paymentAmount = parseFloat(amount);
  if (isNaN(paymentAmount) || paymentAmount <= 0) {
    return { success: false, error: `Invalid payment amount: ${amount}. Amount must be a positive number.` };
  }

  if (!opaqueData || !opaqueData.descriptor || !opaqueData.value) {
    return {
      success: false,
      error: 'Invalid opaqueData. Both descriptor and value are required.'
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
        amount: paymentAmount.toFixed(2),
        payment: {
          opaqueData: {
            dataDescriptor: opaqueData.descriptor,
            dataValue: opaqueData.value
          }
        },
        order: {
          invoiceNumber: invoiceNumber || `POS-${Date.now()}`,
          description: description || 'POS Sale'
        }
      }
    }
  };

  if (deviceSessionId) {
    requestBody.createTransactionRequest.transactionRequest.deviceSessionId = deviceSessionId;
  }

  try {
    const response = await axios.post(AUTHORIZE_NET_ENDPOINT, requestBody, {
      headers: { 'Content-Type': 'application/json' }
    });

    const result = response.data.transactionResponse;

    if (result && result.responseCode === '1') {
      return {
        success: true,
        transactionId: result.transId,
        authCode: result.authCode,
        accountNumber: result.accountNumber,
        message: result.messages?.[0]?.description || 'Transaction approved',
        paymentMethod: 'opaque_data'
      };
    }

    const errorMessage =
      result?.errors?.[0]?.errorText ||
      result?.messages?.[0]?.description ||
      'Transaction failed';

    return {
      success: false,
      error: errorMessage,
      errorCode: result?.errors?.[0]?.errorCode,
      responseCode: result?.responseCode
    };
  } catch (error) {
    return {
      success: false,
      error:
        error.response?.data?.message ||
        error.response?.data?.messages?.[0]?.text ||
        error.message ||
        'Card payment processing failed'
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
 * Create an Authorize.Net CIM customer + payment profile from an existing transaction.
 * This avoids handling raw card/bank data again by reusing the approved transaction.
 * @param {Object} options
 * @param {string} options.transactionId - Authorize.Net transaction ID (transId)
 * @param {string} [options.email] - Customer email
 * @param {string} [options.description] - Customer description (e.g., customer name)
 * @param {string} [options.merchantCustomerId] - Merchant customer ID (we typically use Zoho customer id)
 * @returns {Promise<{success: boolean, customerProfileId?: string, customerPaymentProfileId?: string, error?: string}>}
 */
export const createCustomerProfileFromTransaction = async (options) => {
  const { transactionId, email, description, merchantCustomerId } = options || {};

  if (!transactionId) {
    return {
      success: false,
      error: 'transactionId is required to create customer profile from transaction'
    };
  }

  // Authorize.Net CIM API uses XML format for this request
  const xmlBody = `<?xml version="1.0" encoding="utf-8"?>
<createCustomerProfileFromTransactionRequest xmlns="AnetApi/xml/v1/schema/AnetApiSchema.xsd">
  <merchantAuthentication>
    <name>${process.env.AUTHORIZE_NET_API_LOGIN_ID}</name>
    <transactionKey>${process.env.AUTHORIZE_NET_TRANSACTION_KEY}</transactionKey>
  </merchantAuthentication>
  <transId>${transactionId}</transId>
  <customer>
    ${email ? `<email>${email}</email>` : ''}
    ${description ? `<description>${description}</description>` : ''}
    ${merchantCustomerId ? `<merchantCustomerId>${merchantCustomerId}</merchantCustomerId>` : ''}
  </customer>
</createCustomerProfileFromTransactionRequest>`;

  try {
    const response = await axios.post(AUTHORIZE_NET_ENDPOINT, xmlBody, {
      headers: {
        'Content-Type': 'text/xml'
      }
    });

    const result = await parseStringPromise(response.data);
    const root = result.createCustomerProfileFromTransactionResponse;
    const messages = root?.messages?.[0];
    const resultCode = messages?.resultCode?.[0];

    if (resultCode === 'Ok') {
      const customerProfileId = root?.customerProfileId?.[0] || null;
      const numericStrings = root?.customerPaymentProfileIdList?.[0]?.numericString || [];
      const paymentProfileId = Array.isArray(numericStrings) ? numericStrings[0] : numericStrings || null;

      return {
        success: true,
        customerProfileId: customerProfileId || undefined,
        customerPaymentProfileId: paymentProfileId || undefined
      };
    }

    const errorText = messages?.message?.[0]?.text?.[0] || 'Failed to create customer profile from transaction';
    return {
      success: false,
      error: errorText
    };
  } catch (error) {
    console.error('Create Customer Profile From Transaction Error:', error.message);
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

  // #region agent log
  fetch('http://127.0.0.1:1024/ingest/d43f1d4c-4d33-4f77-a4e3-9e9d56debc45',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'authorizeNetService.js:chargeCustomerProfile:entry',message:'chargeCustomerProfile entry',data:{customerProfileId:String(customerProfileId),customerPaymentProfileId:String(customerPaymentProfileId),amount,amountType:typeof amount,invoiceNumber},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H6'})}).catch(()=>{});
  // #endregion

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

  const orderInvoiceNumber = invoiceNumber || `INV-${Date.now()}`;
  // #region agent log
  fetch('http://127.0.0.1:1024/ingest/d43f1d4c-4d33-4f77-a4e3-9e9d56debc45',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'authorizeNetService.js:chargeCustomerProfile',message:'request order',data:{invoiceNumber:orderInvoiceNumber,invoiceNumberLength:orderInvoiceNumber.length,amount:parseFloat(amount).toFixed(2)},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H1'})}).catch(()=>{});
  // #endregion

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
          invoiceNumber: orderInvoiceNumber,
          description: description || 'Invoice Payment'
        }
      }
    }
  };

  // #region agent log
  fetch('http://127.0.0.1:1024/ingest/d43f1d4c-4d33-4f77-a4e3-9e9d56debc45',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'authorizeNetService.js:chargeCustomerProfile:requestBody',message:'full request body',data:{invoiceNumber:orderInvoiceNumber,amount:parseFloat(amount).toFixed(2),description,customerProfileId:String(customerProfileId),customerPaymentProfileId:String(customerPaymentProfileId),requestBody:JSON.stringify(requestBody).substring(0,1000)},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H13'})}).catch(()=>{});
  // #endregion

  try {
    const response = await axios.post(AUTHORIZE_NET_ENDPOINT, requestBody, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    const raw = response.data;
    const result = raw.transactionResponse;
    
    // #region agent log
    fetch('http://127.0.0.1:1024/ingest/d43f1d4c-4d33-4f77-a4e3-9e9d56debc45',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'authorizeNetService.js:chargeCustomerProfile:response',message:'full API response',data:{hasTransactionResponse:!!raw?.transactionResponse,responseCode:result?.responseCode,hasErrors:!!result?.errors,errorsCount:result?.errors?.length,errors:result?.errors,hasMessages:!!result?.messages,messages:result?.messages,rawTopLevel:JSON.stringify(raw).substring(0,800)},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H7'})}).catch(()=>{});
    // #endregion
    
    // Response codes: '1' = Approved, '2' = Declined, '3' = Error, '4' = Held for Review
    if (result && result.responseCode === '1') {
      return {
        success: true,
        transactionId: result.transId,
        authCode: result.authCode,
        accountNumber: result.accountNumber,
        message: result.messages?.[0]?.description || 'Transaction approved'
      };
    } else if (result && result.responseCode === '4') {
      // Transaction is held for review - this is not a failure, but requires attention
      // The transaction was submitted successfully but needs manual review in Authorize.net
      return {
        success: true, // Treat as success since transaction was submitted
        transactionId: result.transId,
        authCode: result.authCode,
        accountNumber: result.accountNumber,
        message: result.messages?.[0]?.description || 'Transaction is under review',
        underReview: true,
        reviewStatus: 'pending'
      };
    } else {
      const errorMessage = result?.errors?.[0]?.errorText || result?.messages?.[0]?.description || 'Transaction failed';
      const errorCode = result?.errors?.[0]?.errorCode;
      // #region agent log
      fetch('http://127.0.0.1:1024/ingest/d43f1d4c-4d33-4f77-a4e3-9e9d56debc45',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'authorizeNetService.js:chargeCustomerProfile:declined',message:'API declined',data:{responseCode:result?.responseCode,errorCode,errorText:result?.errors?.[0]?.errorText,allErrors:result?.errors,messages:result?.messages,avsResultCode:result?.avsResultCode,cvvResultCode:result?.cvvResultCode,accountType:result?.accountType,accountNumber:result?.accountNumber},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H14'})}).catch(()=>{});
      // #endregion
      
      // Provide more detailed error message for common decline reasons
      let detailedError = errorMessage;
      if (errorCode === '2') {
        detailedError = `Transaction declined by card issuer. ${errorMessage}${result?.avsResultCode ? ` AVS: ${result.avsResultCode}` : ''}${result?.accountType ? ` Card type: ${result.accountType}` : ''}`;
      }
      
      return {
        success: false,
        error: detailedError,
        errorCode: errorCode,
        responseCode: result?.responseCode,
        avsResultCode: result?.avsResultCode,
        accountType: result?.accountType
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
