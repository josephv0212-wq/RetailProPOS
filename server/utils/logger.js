/**
 * Clean Console Logger Utility
 * Provides organized, readable console output with consistent formatting.
 * Also appends a timestamped line to a log file when LOG_FILE is set or default ./logs/server.log
 */

import fs from 'fs';
import path from 'path';

const isDevelopment = process.env.NODE_ENV === 'development';

const LOG_FILE = process.env.LOG_FILE || path.join(process.cwd(), 'logs', 'server.log');
let logStream = null;

function ensureLogDir() {
  const dir = path.dirname(LOG_FILE);
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (err) {
      console.error('Logger: could not create log directory', dir, err.message);
    }
  }
}

function getStream() {
  if (logStream) return logStream;
  ensureLogDir();
  try {
    logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });
    logStream.on('error', (err) => {
      console.error('Logger: file write error', err.message);
    });
  } catch (err) {
    console.error('Logger: could not open log file', LOG_FILE, err.message);
  }
  return logStream;
}

function writeToFile(level, message, data = null) {
  const stream = getStream();
  if (!stream) return;
  const ts = new Date().toISOString();
  let dataStr = '';
  if (data != null) {
    const raw = typeof data === 'string' ? data : JSON.stringify(data);
    dataStr = ' ' + (raw.length > 500 ? raw.slice(0, 500) + '...' : raw);
  }
  const line = `${ts} [${level}] ${message}${dataStr}\n`;
  try {
    stream.write(line);
  } catch (_) {}
}

/**
 * Format customer information for console display
 */
export const formatCustomerInfo = (customer, zohoCustomer = null) => {
  const sections = [];
  
  sections.push('═══════════════════════════════════════════════════════════');
  sections.push('👤 CUSTOMER INFORMATION');
  sections.push('═══════════════════════════════════════════════════════════');
  
  if (customer) {
    sections.push(`  ID: ${customer.id || 'N/A'}`);
    sections.push(`  Zoho ID: ${customer.zohoId || 'N/A'}`);
    sections.push(`  Name: ${customer.contactName || 'N/A'}`);
    sections.push(`  Company: ${customer.companyName || 'N/A'}`);
    sections.push(`  Email: ${customer.email || 'N/A'}`);
    sections.push(`  Phone: ${customer.phone || 'N/A'}`);
    sections.push(`  Status: ${customer.isActive ? '✅ Active' : '❌ Inactive'}`);
    sections.push(`  Location: ${customer.locationName || customer.locationId || 'N/A'}`);
  }
  
  if (zohoCustomer) {
    sections.push('');
    sections.push('📋 ZOHO CUSTOMER DETAILS');
    sections.push('───────────────────────────────────────────────────────────');
    
    sections.push('  Contact Information:');
    sections.push(`    Contact ID: ${zohoCustomer.contact_id || 'N/A'}`);
    sections.push(`    Contact Name: ${zohoCustomer.contact_name || 'N/A'}`);
    sections.push(`    Company Name: ${zohoCustomer.company_name || 'N/A'}`);
    sections.push(`    Email: ${zohoCustomer.email || 'N/A'}`);
    sections.push(`    Phone: ${zohoCustomer.phone || 'N/A'}`);
    sections.push(`    Mobile: ${zohoCustomer.mobile || 'N/A'}`);
    sections.push(`    Status: ${zohoCustomer.status || 'N/A'}`);
    sections.push(`    Contact Type: ${zohoCustomer.contact_type || 'N/A'}`);
    
    if (zohoCustomer.billing_address || zohoCustomer.shipping_address) {
      sections.push('');
      sections.push('  Address Information:');
      if (zohoCustomer.billing_address) {
        const addr = zohoCustomer.billing_address;
        sections.push(`    Billing: ${[addr.address, addr.street2, addr.city, addr.state, addr.zip, addr.country].filter(Boolean).join(', ') || 'N/A'}`);
      }
      if (zohoCustomer.shipping_address) {
        const addr = zohoCustomer.shipping_address;
        sections.push(`    Shipping: ${[addr.address, addr.street2, addr.city, addr.state, addr.zip, addr.country].filter(Boolean).join(', ') || 'N/A'}`);
      }
    }
    
    sections.push('');
    sections.push('  Location & Tax:');
    sections.push(`    Place of Contact: ${zohoCustomer.place_of_contact || 'N/A'}`);
    sections.push(`    Pricebook: ${zohoCustomer.pricebook_name || zohoCustomer.price_list_name || 'N/A'}`);
    sections.push(`    Tax Preference: ${zohoCustomer.tax_preference || zohoCustomer.tax_exemption_code || 'N/A'}`);
    sections.push(`    Tax Treatment: ${zohoCustomer.tax_treatment || 'N/A'}`);
    
    if (zohoCustomer.cards && Array.isArray(zohoCustomer.cards) && zohoCustomer.cards.length > 0) {
      sections.push('');
      sections.push('  Payment Methods:');
      zohoCustomer.cards.forEach((card, index) => {
        sections.push(`    Card ${index + 1}:`);
        sections.push(`      Type: ${card.card_type || 'N/A'}`);
        sections.push(`      Last 4: ${card.last_four_digits || 'N/A'}`);
        sections.push(`      Status: ${card.status || 'N/A'}`);
        sections.push(`      Expired: ${card.is_expired ? 'Yes' : 'No'}`);
      });
    }
    
    if (zohoCustomer.custom_fields && Array.isArray(zohoCustomer.custom_fields) && zohoCustomer.custom_fields.length > 0) {
      sections.push('');
      sections.push('  Custom Fields:');
      zohoCustomer.custom_fields.forEach(field => {
        if (field.value) {
          sections.push(`    ${field.label || 'Unnamed'}: ${field.value}`);
        }
      });
    }
    
    sections.push('');
    sections.push('  Additional Information:');
    sections.push(`    Payment Terms: ${zohoCustomer.payment_terms_label || 'N/A'}`);
    sections.push(`    Credit Limit: ${zohoCustomer.credit_limit || 'N/A'}`);
    sections.push(`    Outstanding Receivable: ${zohoCustomer.outstanding_receivable_amount || 'N/A'}`);
    sections.push(`    Currency Code: ${zohoCustomer.currency_code || 'N/A'}`);
  }
  
  sections.push('═══════════════════════════════════════════════════════════');
  
  return sections.join('\n');
};

/**
 * Log customer information in organized format
 */
export const logCustomerInfo = (customer, zohoCustomer = null) => {
  const text = formatCustomerInfo(customer, zohoCustomer);
  console.log('\n' + text + '\n');
  writeToFile('INFO', 'Customer info', customer?.id ?? '');
};

/**
 * Section logger - creates visual separators for different log sections
 */
export const logSection = (title, emoji = '📌') => {
  console.log('');
  console.log('═'.repeat(60));
  console.log(`${emoji} ${title}`);
  console.log('═'.repeat(60));
  writeToFile('SECTION', title);
};

/**
 * Subsection logger
 */
export const logSubsection = (title) => {
  console.log('');
  console.log(`  ${title}`);
  console.log('  ' + '─'.repeat(56));
  writeToFile('SUBSECTION', title);
};

/**
 * Clean log - simple message without extra formatting
 */
export const log = (message, data = null) => {
  if (data) {
    console.log(`  ${message}`, data);
  } else {
    console.log(`  ${message}`);
  }
  writeToFile('LOG', message, data);
};

/**
 * Success log
 */
export const logSuccess = (message, data = null) => {
  if (data) {
    console.log(`  ✅ ${message}`, data);
  } else {
    console.log(`  ✅ ${message}`);
  }
  writeToFile('SUCCESS', message, data);
};

/**
 * Warning log
 */
export const logWarning = (message, data = null) => {
  if (data) {
    console.warn(`  ⚠️  ${message}`, data);
  } else {
    console.warn(`  ⚠️  ${message}`);
  }
  writeToFile('WARN', message, data);
};

/**
 * Error log
 */
export const logError = (message, error = null) => {
  if (error) {
    console.error(`  ❌ ${message}`);
    if (isDevelopment && error.stack) {
      console.error('  Stack:', error.stack);
    } else {
      console.error('  Error:', error.message || error);
    }
    writeToFile('ERROR', message, error?.message ?? String(error));
  } else {
    console.error(`  ❌ ${message}`);
    writeToFile('ERROR', message);
  }
};

/**
 * Info log
 */
export const logInfo = (message, data = null) => {
  if (data) {
    console.log(`  ℹ️  ${message}`, data);
  } else {
    console.log(`  ℹ️  ${message}`);
  }
  writeToFile('INFO', message, data);
};

/**
 * Server startup banner
 */
export const logServerStart = (port, env) => {
  console.log('');
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║                                                           ║');
  console.log('║              🛒 RetailPro POS Backend Server              ║');
  console.log('║                                                           ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`  🌐 Server running on port: ${port}`);
  console.log(`  🔧 Environment: ${env || 'development'}`);
  console.log(`  📅 Started at: ${new Date().toLocaleString()}`);
  console.log('');
  writeToFile('SERVER_START', `port=${port} env=${env || 'development'}`);
};

/**
 * Database connection log
 */
export const logDatabase = (message, type = 'info') => {
  const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : 'ℹ️';
  console.log(`  ${prefix} Database: ${message}`);
  writeToFile('DATABASE', message);
};

/**
 * API request log (clean format)
 */
export const logApiRequest = (method, path, status = null) => {
  const statusEmoji = status >= 200 && status < 300 ? '✅' : status >= 400 ? '❌' : '📡';
  if (status) {
    console.log(`  ${statusEmoji} ${method} ${path} ${status ? `[${status}]` : ''}`);
  } else {
    console.log(`  📡 ${method} ${path}`);
  }
  writeToFile('API', `${method} ${path}`, status != null ? String(status) : null);
};
