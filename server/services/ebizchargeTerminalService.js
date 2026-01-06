/**
 * EBizCharge Terminal Service
 * Handles communication with EBizCharge WiFi payment terminals (VP100, etc.)
 * 
 * EBizCharge Terminal Integration
 * Supports network-based communication via TCP/IP
 */

import net from 'net';
import dgram from 'dgram';
import dotenv from 'dotenv';
dotenv.config();

// EBizCharge Terminal Configuration
const EBIZCHARGE_TERMINAL_IP = process.env.EBIZCHARGE_TERMINAL_IP || '192.168.1.100';
const EBIZCHARGE_TERMINAL_PORT = parseInt(process.env.EBIZCHARGE_TERMINAL_PORT || '10009');
const EBIZCHARGE_TERMINAL_TIMEOUT = parseInt(process.env.EBIZCHARGE_TERMINAL_TIMEOUT || '120000'); // 2 minutes for payments

// EBizCharge API Credentials (required for payment processing)
const EBIZCHARGE_USER_ID = process.env.EBIZCHARGE_USER_ID;
const EBIZCHARGE_PASSWORD = process.env.EBIZCHARGE_PASSWORD;
const EBIZCHARGE_SECURITY_ID = process.env.EBIZCHARGE_SECURITY_ID;
const EBIZCHARGE_API_URL = process.env.EBIZCHARGE_API_URL || 'https://secure.ebizcharge.com/ws/v1/';

// EBizCharge Message Types
const MESSAGE_TYPES = {
  DO_SALE: 'DO_SALE',
  DO_VOID: 'DO_VOID',
  DO_REFUND: 'DO_REFUND',
  GET_LAST_TRANSACTION: 'GET_LAST_TRANSACTION',
  GET_BATCH_REPORT: 'GET_BATCH_REPORT',
  GET_TERMINAL_STATUS: 'GET_TERMINAL_STATUS'
};

/**
 * Discover EBizCharge terminals on the network
 * @returns {Promise<Array>} List of discovered terminals
 */
export const discoverTerminals = async () => {
  return new Promise((resolve) => {
    const terminals = [];
    const client = dgram.createSocket('udp4');
    const broadcastAddress = '255.255.255.255';
    const port = EBIZCHARGE_TERMINAL_PORT;
    
    // Broadcast discovery message for EBizCharge terminals
    const discoveryMessage = Buffer.from('EBIZCHARGE_DISCOVERY');
    
    client.on('message', (msg, rinfo) => {
      try {
        const response = JSON.parse(msg.toString());
        if (response.type === 'EBIZCHARGE_TERMINAL' || response.manufacturer === 'EBizCharge' || response.model?.includes('VP100')) {
          terminals.push({
            ip: rinfo.address,
            port: rinfo.port,
            model: response.model || 'VP100',
            serialNumber: response.serialNumber || response.sn,
            firmware: response.firmware || response.version,
            manufacturer: 'EBizCharge'
          });
        }
      } catch (error) {
        // Try to parse as plain text response
        const msgStr = msg.toString();
        if (msgStr.includes('EBizCharge') || msgStr.includes('VP100')) {
          terminals.push({
            ip: rinfo.address,
            port: rinfo.port,
            model: 'VP100',
            serialNumber: 'Unknown',
            firmware: 'Unknown',
            manufacturer: 'EBizCharge'
          });
        }
      }
    });
    
    client.bind(() => {
      client.setBroadcast(true);
      client.send(discoveryMessage, port, broadcastAddress, (err) => {
        if (err) {
          console.error('EBizCharge discovery broadcast error:', err);
          client.close();
          resolve([]);
        }
      });
    });
    
    // Wait 3 seconds for responses
    setTimeout(() => {
      client.close();
      resolve(terminals);
    }, 3000);
  });
};

/**
 * Validate IP address format
 * @param {string} ip - IP address to validate
 * @returns {boolean} True if valid IP format
 */
const isValidIP = (ip) => {
  const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (!ipRegex.test(ip)) return false;
  const parts = ip.split('.');
  return parts.every(part => {
    const num = parseInt(part, 10);
    return num >= 0 && num <= 255;
  });
};

/**
 * Connect to an EBizCharge terminal
 * @param {string} ip - Terminal IP address
 * @param {number} port - Terminal port (default 10009)
 * @returns {Promise<Object>} Connection object
 */
export const connectToTerminal = async (ip = EBIZCHARGE_TERMINAL_IP, port = EBIZCHARGE_TERMINAL_PORT) => {
  // Validate IP address
  if (!ip || !isValidIP(ip)) {
    throw new Error(`Invalid IP address format: ${ip || 'undefined'}. Please provide a valid IP address (e.g., 192.168.1.100)`);
  }
  
  // Validate port range
  if (port < 1 || port > 65535) {
    throw new Error(`Invalid port number: ${port}. Must be between 1 and 65535.`);
  }
  
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    const connectionTimeout = 10000; // 10 seconds for connection
    
    const timeout = setTimeout(() => {
      if (!socket.destroyed) {
        socket.destroy();
      }
      reject(new Error(`Connection timeout: Could not connect to EBizCharge terminal at ${ip}:${port}. Please verify the terminal is powered on and on the same network.`));
    }, connectionTimeout);
    
    socket.setTimeout(connectionTimeout);
    
    socket.connect(port, ip, () => {
      clearTimeout(timeout);
      socket.setTimeout(0); // Disable timeout after connection
      resolve({
        socket,
        ip,
        port,
        connected: true
      });
    });
    
    socket.on('error', (error) => {
      clearTimeout(timeout);
      let errorMessage = `Failed to connect to EBizCharge terminal at ${ip}:${port}. `;
      
      if (error.code === 'ECONNREFUSED') {
        errorMessage += 'Connection refused. Please verify the terminal is powered on and the IP address is correct.';
      } else if (error.code === 'ETIMEDOUT') {
        errorMessage += 'Connection timed out. Please check network connectivity and firewall settings.';
      } else if (error.code === 'EHOSTUNREACH' || error.code === 'ENETUNREACH') {
        errorMessage += 'Host unreachable. Please verify the terminal is on the same network.';
      } else {
        errorMessage += `Error: ${error.message}`;
      }
      
      reject(new Error(errorMessage));
    });
    
    socket.on('timeout', () => {
      socket.destroy();
      clearTimeout(timeout);
      reject(new Error(`Connection timeout: Could not connect to EBizCharge terminal at ${ip}:${port} within ${connectionTimeout}ms`));
    });
  });
};

/**
 * Send message to EBizCharge terminal
 * @param {Object} connection - Terminal connection object
 * @param {string} messageType - Type of message
 * @param {Object} data - Transaction data
 * @returns {Promise<Object>} Terminal response
 */
export const sendTerminalMessage = async (connection, messageType, data) => {
  return new Promise((resolve, reject) => {
    const { socket, ip, port } = connection;
    
    if (!socket || socket.destroyed) {
      return reject(new Error('Socket connection is not available or has been closed'));
    }
    
    let responseData = Buffer.alloc(0);
    let responseTimeout;
    let dataHandler;
    let errorHandler;
    let closeHandler;
    
    // Cleanup function
    const cleanup = () => {
      if (responseTimeout) clearTimeout(responseTimeout);
      if (dataHandler) socket.removeListener('data', dataHandler);
      if (errorHandler) socket.removeListener('error', errorHandler);
      if (closeHandler) socket.removeListener('close', closeHandler);
    };
    
    // Set response timeout (longer for payment operations)
    const timeoutDuration = messageType === MESSAGE_TYPES.DO_SALE ? 
      Math.max(EBIZCHARGE_TERMINAL_TIMEOUT, 120000) : // 2 minutes for payments
      EBIZCHARGE_TERMINAL_TIMEOUT;
    
    responseTimeout = setTimeout(() => {
      cleanup();
      reject(new Error(`EBizCharge terminal response timeout after ${timeoutDuration}ms. The terminal may be busy or unresponsive.`));
    }, timeoutDuration);
    
    // Handle response data (may come in multiple chunks)
    dataHandler = (chunk) => {
      responseData = Buffer.concat([responseData, chunk]);
      
      // Check if we have a complete message
      const dataString = responseData.toString();
      if (dataString.includes('\n') || dataString.trim().endsWith('}') || dataString.trim().endsWith(']')) {
        clearTimeout(responseTimeout);
        cleanup();
        
        try {
          const response = JSON.parse(dataString.trim());
          resolve(response);
        } catch (error) {
          // Try parsing as EBizCharge protocol format
          const response = parseEBizChargeResponse(dataString);
          resolve(response);
        }
      }
    };
    
    // Handle socket errors
    errorHandler = (error) => {
      cleanup();
      reject(new Error(`Socket error while communicating with EBizCharge terminal at ${ip}:${port}: ${error.message}`));
    };
    
    // Handle socket close
    closeHandler = () => {
      cleanup();
      if (responseData.length === 0) {
        reject(new Error(`Socket closed unexpectedly before receiving response from EBizCharge terminal at ${ip}:${port}`));
      }
    };
    
    socket.on('data', dataHandler);
    socket.once('error', errorHandler);
    socket.once('close', closeHandler);
    
    // Send message
    try {
      const message = buildEBizChargeMessage(messageType, data);
      socket.write(message, (err) => {
        if (err) {
          cleanup();
          reject(new Error(`Failed to send message to EBizCharge terminal: ${err.message}`));
        }
      });
    } catch (error) {
      cleanup();
      reject(new Error(`Failed to build message: ${error.message}`));
    }
  });
};

/**
 * Build message for EBizCharge terminal
 * @param {string} messageType - Message type
 * @param {Object} data - Transaction data
 * @returns {string} Formatted message
 */
const buildEBizChargeMessage = (messageType, data) => {
  const message = {
    type: messageType,
    timestamp: new Date().toISOString(),
    ...data
  };
  return JSON.stringify(message) + '\n';
};

/**
 * Parse response from EBizCharge terminal
 * @param {string} response - Raw response string
 * @returns {Object} Parsed response
 */
const parseEBizChargeResponse = (response) => {
  try {
    // Try JSON first
    return JSON.parse(response);
  } catch (error) {
    // Parse EBizCharge format if needed
    const lines = response.split('\n');
    const result = {
      success: false,
      raw: response
    };
    
    // Parse common response format
    for (const line of lines) {
      if (line.includes('ResponseCode=') || line.includes('responseCode=')) {
        const code = line.split('=')[1]?.trim();
        result.success = code === '000000' || code === 'A0000' || code === '00' || code === 'APPROVED';
        result.responseCode = code;
      }
      if (line.includes('TransactionID=') || line.includes('transactionId=')) {
        result.transactionId = line.split('=')[1]?.trim();
      }
      if (line.includes('AuthCode=') || line.includes('authCode=')) {
        result.authCode = line.split('=')[1]?.trim();
      }
      if (line.includes('Message=') || line.includes('message=')) {
        result.message = line.split('=')[1]?.trim();
      }
      if (line.includes('Status=') || line.includes('status=')) {
        result.status = line.split('=')[1]?.trim();
      }
    }
    
    return result;
  }
};

/**
 * Process payment through EBizCharge terminal
 * @param {Object} paymentData - Payment information
 * @param {string} terminalIP - Terminal IP address
 * @returns {Promise<Object>} Payment result
 */
export const processTerminalPayment = async (paymentData, terminalIP = EBIZCHARGE_TERMINAL_IP) => {
  const { amount, invoiceNumber, description } = paymentData;
  let connection = null;
  
  try {
    // Validate amount
    const paymentAmount = parseFloat(amount);
    if (isNaN(paymentAmount) || paymentAmount <= 0) {
      return {
        success: false,
        error: `Invalid payment amount: ${amount}. Amount must be a positive number.`
      };
    }
    
    // Validate terminal IP
    if (!terminalIP || !isValidIP(terminalIP)) {
      return {
        success: false,
        error: `Invalid terminal IP address: ${terminalIP || 'undefined'}. Please provide a valid IP address.`
      };
    }
    
    // Connect to terminal
    connection = await connectToTerminal(terminalIP);
    
    // Build transaction request
    const transactionData = {
      amount: paymentAmount.toFixed(2),
      invoiceNumber: invoiceNumber || `POS-${Date.now()}`,
      description: description || 'POS Sale',
      // EBizCharge API credentials (if using API-based processing)
      userId: EBIZCHARGE_USER_ID,
      password: EBIZCHARGE_PASSWORD,
      securityId: EBIZCHARGE_SECURITY_ID,
      // Transaction type
      transactionType: 'SALE',
      // Additional options
      allowDuplicates: false,
      timeout: 120 // 2 minutes for customer to complete on terminal
    };
    
    // Send sale request to terminal
    const response = await sendTerminalMessage(connection, MESSAGE_TYPES.DO_SALE, transactionData);
    
    // Close connection gracefully
    if (connection.socket && !connection.socket.destroyed) {
      connection.socket.end();
    }
    
    // Process response
    const successCodes = ['000000', 'A0000', '00', 'APPROVED'];
    const isSuccess = response.success || 
                     (response.responseCode && successCodes.includes(response.responseCode.toString())) ||
                     (response.status && response.status.toUpperCase() === 'APPROVED');
    
    if (isSuccess) {
      return {
        success: true,
        transactionId: response.transactionId || response.transId || `TXN-${Date.now()}`,
        authCode: response.authCode || response.auth_code || 'N/A',
        message: response.message || 'Transaction approved',
        terminalResponse: response,
        paymentMethod: 'ebizcharge_terminal'
      };
    } else {
      const errorMsg = response.message || response.error || 'Transaction declined';
      console.error(`❌ EBizCharge payment declined: ${errorMsg}`);
      return {
        success: false,
        error: errorMsg,
        responseCode: response.responseCode || response.code,
        terminalResponse: response
      };
    }
  } catch (error) {
    console.error('EBizCharge Terminal Payment Error:', error);
    
    // Ensure connection is closed on error
    if (connection && connection.socket && !connection.socket.destroyed) {
      try {
        connection.socket.destroy();
      } catch (closeError) {
        console.error('Error closing socket:', closeError);
      }
    }
    
    // Provide more helpful error messages
    let errorMessage = error.message || 'Terminal communication failed';
    if (error.code === 'ECONNREFUSED') {
      errorMessage = `Cannot connect to EBizCharge terminal at ${terminalIP}. Please verify the terminal is powered on and the IP address is correct.`;
    } else if (error.code === 'ETIMEDOUT') {
      errorMessage = `Connection to EBizCharge terminal at ${terminalIP} timed out. Please check network connectivity.`;
    } else if (error.message && error.message.includes('timeout')) {
      errorMessage = `EBizCharge terminal at ${terminalIP} did not respond in time. The terminal may be busy processing another transaction.`;
    }
    
    return {
      success: false,
      error: errorMessage,
      details: error.toString(),
      code: error.code
    };
  }
};

/**
 * Get terminal status
 * @param {string} terminalIP - Terminal IP address
 * @returns {Promise<Object>} Terminal status
 */
export const getTerminalStatus = async (terminalIP = EBIZCHARGE_TERMINAL_IP) => {
  let connection = null;
  
  try {
    if (!terminalIP || !isValidIP(terminalIP)) {
      return {
        success: false,
        error: `Invalid IP address format: ${terminalIP || 'undefined'}`
      };
    }
    
    connection = await connectToTerminal(terminalIP);
    const response = await sendTerminalMessage(connection, MESSAGE_TYPES.GET_TERMINAL_STATUS, {});
    
    if (connection.socket && !connection.socket.destroyed) {
      connection.socket.end();
    }
    
    return {
      success: true,
      status: response.status || 'connected',
      model: response.model || 'VP100',
      firmware: response.firmware || response.version,
      battery: response.battery,
      signal: response.signal || response.wifiSignal,
      raw: response
    };
  } catch (error) {
    if (connection && connection.socket && !connection.socket.destroyed) {
      try {
        connection.socket.destroy();
      } catch (closeError) {
        // Ignore close errors
      }
    }
    
    return {
      success: false,
      error: error.message || 'Failed to get terminal status',
      code: error.code
    };
  }
};

/**
 * Void a transaction on the terminal
 * @param {string} transactionId - Transaction ID to void
 * @param {string} terminalIP - Terminal IP address
 * @returns {Promise<Object>} Void result
 */
export const voidTerminalTransaction = async (transactionId, terminalIP = EBIZCHARGE_TERMINAL_IP) => {
  let connection = null;
  
  try {
    if (!transactionId) {
      return {
        success: false,
        error: 'Transaction ID is required to void a transaction'
      };
    }
    
    if (!terminalIP || !isValidIP(terminalIP)) {
      return {
        success: false,
        error: `Invalid IP address format: ${terminalIP || 'undefined'}`
      };
    }
    
    connection = await connectToTerminal(terminalIP);
    const response = await sendTerminalMessage(connection, MESSAGE_TYPES.DO_VOID, {
      transactionId
    });
    
    if (connection.socket && !connection.socket.destroyed) {
      connection.socket.end();
    }
    
    const successCodes = ['000000', 'A0000', '00'];
    const isSuccess = response.success || 
                     (response.responseCode && successCodes.includes(response.responseCode.toString()));
    
    return {
      success: isSuccess,
      message: response.message || (isSuccess ? 'Transaction voided successfully' : 'Failed to void transaction'),
      responseCode: response.responseCode,
      terminalResponse: response
    };
  } catch (error) {
    if (connection && connection.socket && !connection.socket.destroyed) {
      try {
        connection.socket.destroy();
      } catch (closeError) {
        // Ignore close errors
      }
    }
    
    return {
      success: false,
      error: error.message || 'Failed to void transaction',
      code: error.code
    };
  }
};

/**
 * Test terminal connection
 * @param {string} terminalIP - Terminal IP address
 * @returns {Promise<Object>} Test result
 */
export const testTerminalConnection = async (terminalIP = EBIZCHARGE_TERMINAL_IP) => {
  let connection = null;
  
  try {
    // Validate IP
    if (!terminalIP || !isValidIP(terminalIP)) {
      return {
        success: false,
        error: `Invalid IP address format: ${terminalIP || 'undefined'}. Please provide a valid IP address (e.g., 192.168.1.100).`,
        ip: terminalIP
      };
    }
    
    // Try to connect
    connection = await connectToTerminal(terminalIP);
    
    // Try to get status to verify terminal is responsive
    try {
      const statusResponse = await sendTerminalMessage(connection, MESSAGE_TYPES.GET_TERMINAL_STATUS, {});
      
      // Close connection
      if (connection.socket && !connection.socket.destroyed) {
        connection.socket.end();
      }
      
      return {
        success: true,
        message: 'EBizCharge terminal connection successful and responsive',
        ip: terminalIP,
        status: statusResponse
      };
    } catch (statusError) {
      // Connection works but status query failed - still consider it a success
      if (connection.socket && !connection.socket.destroyed) {
        connection.socket.end();
      }
      
      return {
        success: true,
        message: 'EBizCharge terminal connection successful (status query unavailable)',
        ip: terminalIP,
        warning: statusError.message
      };
    }
  } catch (error) {
    console.error(`❌ EBizCharge terminal connection test failed for ${terminalIP}:`, error.message);
    
    // Ensure connection is closed on error
    if (connection && connection.socket && !connection.socket.destroyed) {
      try {
        connection.socket.destroy();
      } catch (closeError) {
        // Ignore close errors
      }
    }
    
    // Provide helpful error message
    let errorMessage = error.message || 'Terminal connection failed';
    if (error.code === 'ECONNREFUSED') {
      errorMessage = `Connection refused. Please verify:\n- Terminal is powered on\n- IP address ${terminalIP} is correct\n- Terminal is on the same network`;
    } else if (error.code === 'ETIMEDOUT' || error.code === 'EHOSTUNREACH') {
      errorMessage = `Cannot reach EBizCharge terminal at ${terminalIP}. Please check:\n- Network connectivity\n- Firewall settings (port ${EBIZCHARGE_TERMINAL_PORT} should be open)\n- Terminal is on the same network`;
    }
    
    return {
      success: false,
      error: errorMessage,
      ip: terminalIP,
      code: error.code
    };
  }
};
