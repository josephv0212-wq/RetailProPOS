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

  // Validate payment type
  const validPaymentTypes = ['cash', 'credit_card', 'debit_card', 'zelle', 'ach'];
  if (!paymentType || !validPaymentTypes.includes(paymentType)) {
    errors.push(`Payment type must be one of: ${validPaymentTypes.join(', ')}`);
  }

  // Validate payment details based on payment type
  if (paymentType === 'credit_card' || paymentType === 'debit_card') {
    const useTerminal = req.body.useTerminal;
    
    if (useTerminal) {
      // PAX Terminal mode - validate terminal IP instead of card details
      if (!req.body.terminalIP) {
        errors.push('Terminal IP address is required for terminal payment');
      } else {
        // Basic IP validation
        const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
        if (!ipRegex.test(req.body.terminalIP)) {
          errors.push('Invalid terminal IP address format');
        }
      }
    } else {
      // Card-not-present mode - validate card details
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
  } else if (paymentType === 'zelle') {
    // Zelle payment - validate confirmation number
    if (!paymentDetails || !paymentDetails.zelleConfirmation || paymentDetails.zelleConfirmation.trim() === '') {
      errors.push('Zelle confirmation number is required');
    }
  } else if (paymentType === 'ach') {
    if (!paymentDetails) {
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
  // Cash payment requires no additional validation

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
  const { username, password } = req.body;
  const errors = [];

  if (!username || typeof username !== 'string' || username.trim().length === 0) {
    errors.push('Username is required');
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
  const { username, password, role, locationId } = req.body;
  const errors = [];

  if (!username || typeof username !== 'string' || username.trim().length < 3) {
    errors.push('Username must be at least 3 characters');
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
  const { username, password, locationId, registrationKey } = req.body;
  const errors = [];

  // Check registration key
  const requiredKey = process.env.REGISTRATION_KEY;
  if (requiredKey) {
    if (!registrationKey || registrationKey !== requiredKey) {
      return res.status(403).json({
        success: false,
        message: 'Invalid registration key. Registration is restricted.'
      });
    }
  }

  if (!username || typeof username !== 'string' || username.trim().length < 3) {
    errors.push('Username must be at least 3 characters');
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

