/**
 * Input validation middleware for common validations
 */

export const validateSale = (req, res, next) => {
  const { items, paymentType, paymentDetails } = req.body;
  const errors = [];

  // Validate items
  if (!items || !Array.isArray(items) || items.length === 0) {
    errors.push('Sale must include at least one item');
  } else {
    items.forEach((item, index) => {
      if (!item.itemId || !Number.isInteger(Number(item.itemId)) || Number(item.itemId) <= 0) {
        errors.push(`Item ${index + 1}: Invalid itemId`);
      }
      if (!item.quantity || Number(item.quantity) <= 0) {
        errors.push(`Item ${index + 1}: Quantity must be greater than 0`);
      }
      if (Number(item.quantity) > 10000) {
        errors.push(`Item ${index + 1}: Quantity exceeds maximum allowed (10000)`);
      }
    });
  }

  // Validate payment type (accept both 'card' and legacy 'credit_card'/'debit_card' for backward compatibility)
  const validPaymentTypes = ['cash', 'card', 'credit_card', 'debit_card', 'zelle', 'ach'];
  if (!paymentType || !validPaymentTypes.includes(paymentType)) {
    errors.push(`Payment type must be one of: ${validPaymentTypes.join(', ')}`);
  }

  // Normalize payment type: merge credit_card/debit_card to card
  const normalizedPaymentType = (paymentType === 'credit_card' || paymentType === 'debit_card') ? 'card' : paymentType;

  // Validate payment details based on payment type
  if (normalizedPaymentType === 'card') {
    // Support useStandaloneMode from root level OR from paymentDetails (for backward compatibility)
    const useStandaloneMode = req.body.useStandaloneMode || req.body.paymentDetails?.useStandaloneMode;
    const useStoredPayment = req.body.useStoredPayment === true;
    const useValorApi = req.body.useValorApi;
    const useOpaqueData = req.body.useOpaqueData;
    const useBluetoothReader = req.body.useBluetoothReader;
    // #region agent log
    fetch('http://127.0.0.1:1024/ingest/d43f1d4c-4d33-4f77-a4e3-9e9d56debc45',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'validation.js:card branch',message:'card validation branch',data:{normalizedPaymentType,useStandaloneMode,useStoredPayment,useValorApi,useOpaqueData,useBluetoothReader},timestamp:Date.now(),hypothesisId:'H1'})}).catch(()=>{});
    // #endregion
    
    // Standalone mode: Skip payment processing validation - cashier will process manually
    if (useStandaloneMode) {
      // No payment processing required - just record the sale
      // Validation passes, continue to next middleware
    } else {
      const useValorApi = req.body.useValorApi;
      const useOpaqueData = req.body.useOpaqueData;
      // Backward compatibility: older clients used "useBluetoothReader" + "bluetoothPayload" for Accept.js opaqueData
      const useBluetoothReader = req.body.useBluetoothReader;
      
      if (useValorApi) {
      // Valor API mode - validate terminalNumber and valorTransactionId
      if (!req.body.terminalNumber || req.body.terminalNumber.trim() === '') {
        errors.push('Terminal serial number is required for Valor API payment. Please configure your VP100 serial number in Settings.');
      } else {
        // Basic Terminal serial number validation (alphanumeric, dashes, underscores)
        const terminalNumberTrimmed = req.body.terminalNumber.trim();
        if (!/^[A-Za-z0-9\-_]+$/.test(terminalNumberTrimmed)) {
          errors.push('Invalid Terminal serial number format. Use alphanumeric characters, dashes, or underscores only.');
        }
      }
      // valorTransactionId is required - payment must be processed in frontend first
      if (!req.body.valorTransactionId || req.body.valorTransactionId.trim() === '') {
        errors.push('Valor API transaction ID is required. Payment must be processed via Valor API in the frontend first.');
      }
    } else if (useOpaqueData || useBluetoothReader) {
      const payload = req.body.opaqueDataPayload || req.body.bluetoothPayload;
      if (!payload || !payload.descriptor || !payload.value) {
        errors.push('Encrypted card payload (opaqueData) is required.');
      }
    } else if (useStoredPayment) {
      // Stored payment - no card details required
      // Validation passes
    } else {
      // Manual Entry mode - validate card details
      // #region agent log
      fetch('http://127.0.0.1:1024/ingest/d43f1d4c-4d33-4f77-a4e3-9e9d56debc45',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'validation.js:manual entry branch',message:'requiring card details',data:{hasPaymentDetails:!!paymentDetails,hasCardNumber:!!(paymentDetails&&paymentDetails.cardNumber)},timestamp:Date.now(),hypothesisId:'H1'})}).catch(()=>{});
      // #endregion
      if (!paymentDetails || !paymentDetails.cardNumber) {
        errors.push('Payment details required for card transactions');
      } else {
        // Basic card number validation (remove spaces and dashes)
        const cardNumber = paymentDetails.cardNumber.replace(/[\s-]/g, '');
        if (cardNumber.length < 13 || cardNumber.length > 19 || !/^\d+$/.test(cardNumber)) {
          errors.push('Invalid card number format');
        }
        if (!paymentDetails.expirationDate || !/^\d{2}\/\d{2}$/.test(paymentDetails.expirationDate)) {
          errors.push('Invalid expiration date format (use MM/YY)');
        }
        if (!paymentDetails.cvv || !/^\d{3,4}$/.test(paymentDetails.cvv)) {
          errors.push('Invalid CVV format');
        }
      }
    }
    }
  } else if (normalizedPaymentType === 'ach') {
    const useStoredPaymentAch = req.body.useStoredPayment === true;
    if (useStoredPaymentAch) {
      // Stored ACH - no payment details required
    } else if (!paymentDetails) {
      errors.push('Payment details required for ACH transactions');
    } else {
      if (!paymentDetails.nameOnAccount || paymentDetails.nameOnAccount.trim() === '') {
        errors.push('Account holder name is required for ACH');
      }
      if (!paymentDetails.routingNumber || !/^\d{9}$/.test(paymentDetails.routingNumber)) {
        errors.push('Routing number must be 9 digits');
      }
      if (!paymentDetails.accountNumber || !/^\d{4,17}$/.test(paymentDetails.accountNumber)) {
        errors.push('Account number must be 4-17 digits');
      }
      if (paymentDetails.accountType && !['checking', 'savings'].includes(paymentDetails.accountType)) {
        errors.push('Account type must be checking or savings for ACH');
      }
    }
  }
  // Cash and Zelle payments require no additional validation

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors
    });
  }

  next();
};

export const validateLogin = (req, res, next) => {
  const { username, useremail, password } = req.body;
  // Support both username and useremail for backward compatibility
  const email = useremail || username;
  const errors = [];

  if (!email || typeof email !== 'string' || email.trim().length === 0) {
    errors.push('User email is required');
  }
  if (!password || typeof password !== 'string' || password.length === 0) {
    errors.push('Password is required');
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors
    });
  }

  next();
};

export const validateCreateUser = (req, res, next) => {
  const { username, useremail, password, role, locationId } = req.body;
  // Support both username and useremail for backward compatibility
  const email = useremail || username;
  const errors = [];

  if (!email || typeof email !== 'string' || email.trim().length < 3) {
    errors.push('User email must be at least 3 characters');
  }
  if (!password || typeof password !== 'string' || password.length < 6) {
    errors.push('Password must be at least 6 characters');
  }
  if (role && !['cashier', 'admin'].includes(role)) {
    errors.push('Role must be either "cashier" or "admin"');
  }
  if (!locationId || typeof locationId !== 'string') {
    errors.push('Location ID is required');
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors
    });
  }

  next();
};

export const validateRegistration = (req, res, next) => {
  const { username, useremail, password, locationId } = req.body;
  // Support both username and useremail for backward compatibility
  const email = useremail || username;
  const errors = [];

  if (!email || typeof email !== 'string' || email.trim().length < 3) {
    errors.push('User email must be at least 3 characters');
  }
  if (!password || typeof password !== 'string' || password.length < 6) {
    errors.push('Password must be at least 6 characters');
  }
  if (!locationId || typeof locationId !== 'string') {
    errors.push('Location ID is required');
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors
    });
  }

  next();
};

