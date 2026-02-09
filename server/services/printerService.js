import net from 'net';
import dotenv from 'dotenv';
dotenv.config();

// ESC/POS Commands
const ESC = '\x1b';
const GS = '\x1d';

// Text formatting commands
const CMD = {
  INIT: `${ESC}@`,
  ALIGN_CENTER: `${ESC}a\x01`,
  ALIGN_LEFT: `${ESC}a\x00`,
  ALIGN_RIGHT: `${ESC}a\x02`,
  BOLD_ON: `${ESC}E\x01`,
  BOLD_OFF: `${ESC}E\x00`,
  UNDERLINE_ON: `${ESC}-\x01`,
  UNDERLINE_OFF: `${ESC}-\x00`,
  SIZE_NORMAL: `${GS}!\x00`,
  SIZE_DOUBLE: `${GS}!\x11`,
  SIZE_TRIPLE: `${GS}!\x22`,
  LINE_FEED: '\n',
  CUT_PAPER: `${GS}V\x00`,
  OPEN_DRAWER: `${ESC}p\x00\x19\xfa`,
};

// Location-specific printer configuration
const PRINTER_CONFIG = {
  'LOC001': { // MIA
    ip: process.env.PRINTER_IP_LOC001 || null,
    port: parseInt(process.env.PRINTER_PORT_LOC001 || '9100'),
    name: 'MIA Dry Ice - Walk in Miami'
  },
  'LOC002': { // FLL
    ip: process.env.PRINTER_IP_LOC002 || null,
    port: parseInt(process.env.PRINTER_PORT_LOC002 || '9100'),
    name: 'FLL Dry Ice - Walk in FT Lauderdale'
  },
  'LOC003': { // WC
    ip: process.env.PRINTER_IP_LOC003 || null,
    port: parseInt(process.env.PRINTER_PORT_LOC003 || '9100'),
    name: 'WC Dry Ice - Walk in West Coast'
  },
  'LOC004': { // ORL
    ip: process.env.PRINTER_IP_LOC004 || null,
    port: parseInt(process.env.PRINTER_PORT_LOC004 || '9100'),
    name: 'ORL Dry Ice - Walk in Orlando'
  }
};

/**
 * Print a receipt to the WiFi printer for a specific location
 * @param {Object} saleData - Sale data including items, totals, customer, etc.
 * @param {string} locationId - Location ID (LOC001-LOC004)
 * @returns {Promise<Object>} - Result object with success status
 */
export const printReceipt = async (saleData, locationId) => {
  const config = PRINTER_CONFIG[locationId];
  
  if (!config || !config.ip) {
    return {
      success: false,
      error: 'Printer not configured for this location',
      skipped: true
    };
  }

  try {
    const receipt = buildReceipt(saleData, locationId);
    await sendToPrinter(receipt, config);
    
    return { success: true };
  } catch (error) {
    // Log error but don't throw - printer failures should not block sales
    console.warn(`⚠️ Printer error at ${locationId}: ${error.message} (Sale will still complete successfully)`);
    return {
      success: false,
      error: error.message,
      warning: true // Indicate this is a non-critical error
    };
  }
};

/**
 * Build the receipt content using ESC/POS commands
 * @param {Object} saleData - Sale data
 * @param {string} locationId - Location ID
 * @returns {string} - Receipt content with ESC/POS commands
 */
function buildReceipt(saleData, locationId) {
  const config = PRINTER_CONFIG[locationId];
  const { sale, items, customer } = saleData;
  
  let receipt = CMD.INIT;
  
  // Header
  receipt += CMD.ALIGN_CENTER;
  receipt += CMD.SIZE_DOUBLE;
  receipt += CMD.BOLD_ON;
  receipt += 'RetailPro POS\n';
  receipt += CMD.BOLD_OFF;
  receipt += CMD.SIZE_NORMAL;
  receipt += config.name + '\n';
  receipt += CMD.LINE_FEED;
  
  // Date and receipt number
  receipt += CMD.ALIGN_LEFT;
  receipt += `Date: ${new Date(sale.createdAt).toLocaleString()}\n`;
  receipt += `Receipt #: POS-${sale.id}\n`;
  receipt += `Location: ${sale.locationName}\n`;
  
  if (customer) {
    receipt += `Customer: ${customer.contactName}\n`;
  }
  
  receipt += CMD.LINE_FEED;
  receipt += '----------------------------------------\n';
  
  // Items
  receipt += CMD.BOLD_ON;
  receipt += 'ITEMS\n';
  receipt += CMD.BOLD_OFF;
  receipt += '----------------------------------------\n';
  
  items.forEach(item => {
    const itemName = item.itemName.length > 30 
      ? item.itemName.substring(0, 27) + '...' 
      : item.itemName;
    receipt += `${itemName}\n`;
    receipt += `  ${item.quantity} x $${parseFloat(item.price).toFixed(2)}`;
    receipt += ' '.repeat(Math.max(0, 25 - itemName.length));
    receipt += `$${parseFloat(item.lineTotal).toFixed(2)}\n`;
  });
  
  receipt += '----------------------------------------\n';
  
  // Totals
  receipt += CMD.ALIGN_RIGHT;
  receipt += `Subtotal: $${parseFloat(sale.subtotal).toFixed(2)}\n`;
  receipt += `Tax: $${parseFloat(sale.taxAmount).toFixed(2)}\n`;
  
  if (parseFloat(sale.ccFee) > 0) {
    receipt += `CC Fee (3%): $${parseFloat(sale.ccFee).toFixed(2)}\n`;
  }
  
  receipt += '----------------------------------------\n';
  receipt += CMD.SIZE_DOUBLE;
  receipt += CMD.BOLD_ON;
  receipt += `TOTAL: $${parseFloat(sale.total).toFixed(2)}\n`;
  receipt += CMD.BOLD_OFF;
  receipt += CMD.SIZE_NORMAL;
  receipt += CMD.LINE_FEED;
  
  // Payment method
  receipt += CMD.ALIGN_LEFT;
  // Format payment type: merge card, credit_card and debit_card to "Card", others to title case
  let paymentTypeDisplay;
  if (sale.paymentType === 'card' || sale.paymentType === 'credit_card' || sale.paymentType === 'debit_card') {
    paymentTypeDisplay = 'Card';
  } else {
    // Convert other methods to title case (e.g., 'cash' -> 'Cash', 'zelle' -> 'Zelle', 'ach' -> 'ACH')
    paymentTypeDisplay = sale.paymentType.split('_').map(word => {
      // Keep ACH uppercase, others title case
      if (word.toLowerCase() === 'ach') return 'ACH';
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    }).join(' ');
  }
  receipt += `Payment: ${paymentTypeDisplay}\n`;
  
  if (sale.transactionId) {
    receipt += `Transaction ID: ${sale.transactionId}\n`;
  }
  
  receipt += CMD.LINE_FEED;
  
  // Footer
  receipt += CMD.ALIGN_CENTER;
  receipt += 'Thank you for your business!\n';
  receipt += CMD.LINE_FEED;
  receipt += CMD.LINE_FEED;
  
  // Cut paper
  receipt += CMD.CUT_PAPER;
  
  return receipt;
}

/**
 * Send data to the WiFi printer
 * @param {string} data - Data to print
 * @param {Object} config - Printer configuration
 * @returns {Promise<void>}
 */
function sendToPrinter(data, config) {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    // Reduced timeout to fail faster and not block the sale
    const timeout = setTimeout(() => {
      client.destroy();
      reject(new Error('Printer connection timeout'));
    }, 3000); // 3 second timeout (reduced from 5)
    
    client.connect(config.port, config.ip, () => {
      clearTimeout(timeout);
      client.write(data, 'binary', (err) => {
        if (err) {
          client.destroy();
          reject(err);
        }
      });
    });
    
    client.on('data', (response) => {
      // Printer response received
    });
    
    client.on('close', () => {
      clearTimeout(timeout);
      resolve();
    });
    
    client.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
    
    // Close connection after sending
    setTimeout(() => {
      client.end();
    }, 1000);
  });
}

/**
 * Test printer connection for a location
 * @param {string} locationId - Location ID
 * @returns {Promise<Object>} - Test result
 */
export const testPrinter = async (locationId) => {
  const config = PRINTER_CONFIG[locationId];
  
  if (!config || !config.ip) {
    return {
      success: false,
      error: 'Printer not configured for this location'
    };
  }

  try {
    const testReceipt = CMD.INIT + 
                       CMD.ALIGN_CENTER + 
                       CMD.BOLD_ON + 
                       'PRINTER TEST\n' + 
                       CMD.BOLD_OFF + 
                       config.name + '\n' + 
                       new Date().toLocaleString() + '\n' + 
                       CMD.LINE_FEED + 
                       CMD.LINE_FEED + 
                       CMD.CUT_PAPER;
    
    await sendToPrinter(testReceipt, config);
    return { success: true, message: 'Test print successful' };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
};
