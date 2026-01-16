import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import authRoutes from './routes/authRoutes.js';
import salesRoutes from './routes/salesRoutes.js';
import zohoRoutes from './routes/zohoRoutes.js';
import itemRoutes from './routes/itemRoutes.js';
import customerRoutes from './routes/customerRoutes.js';
import printerRoutes from './routes/printerRoutes.js';
import valorApiRoutes from './routes/valorApiRoutes.js';
import { sequelize } from './config/db.js';
import { requestIdMiddleware } from './middleware/requestId.js';
import { errorHandler } from './middleware/errorHandler.js';
import { Customer, User } from './models/index.js';
import bcrypt from 'bcryptjs';
import { syncCustomersToDatabase } from './controllers/zohoController.js';
import { logServerStart, logDatabase, logSuccess, logWarning, logError, logInfo, log } from './utils/logger.js';

dotenv.config();

// Get database setting
const DATABASE_SETTING = (process.env.DATABASE_SETTING || 'cloud').toLowerCase();

// Validate required environment variables
const requiredEnvVars = [
  'JWT_SECRET'
];

// DATABASE_URL is only required for cloud mode
if (DATABASE_SETTING === 'cloud') {
  requiredEnvVars.push('DATABASE_URL');
}

const optionalButRecommended = [
  'DATABASE_SETTING', // 'local' for SQLite, 'cloud' for PostgreSQL (default: 'cloud')
  'ZOHO_CLIENT_ID',
  'ZOHO_CLIENT_SECRET',
  'ZOHO_REFRESH_TOKEN',
  'ZOHO_ORGANIZATION_ID',
  'AUTHORIZE_NET_API_LOGIN_ID',
  'AUTHORIZE_NET_TRANSACTION_KEY',
  'PAX_TERMINAL_IP',
  'PAX_TERMINAL_PORT',
  'PAX_TERMINAL_TIMEOUT',
  'EBIZCHARGE_TERMINAL_IP',
  'EBIZCHARGE_TERMINAL_PORT',
  'EBIZCHARGE_TERMINAL_TIMEOUT',
  'EBIZCHARGE_USER_ID',
  'EBIZCHARGE_PASSWORD',
  'EBIZCHARGE_SECURITY_ID',
  'EBIZCHARGE_API_URL',
  'VALOR_API_BASE_URL',
  'VALOR_API_MERCHANT_ID',
  'VALOR_API_API_KEY',
  'VALOR_API_SECRET_KEY',
  'PRINTER_IP_LOC001',
  'PRINTER_IP_LOC002',
  'PRINTER_IP_LOC003',
  'PRINTER_IP_LOC004',
  'FRONTEND_URL',
  'NODE_ENV' // Used to determine Authorize.Net endpoint (development = sandbox, production = live)
];

const missing = requiredEnvVars.filter(key => !process.env[key]);
if (missing.length > 0) {
  logError(`Missing required environment variables: ${missing.join(', ')}`);
  logError('Please set these variables before starting the server.');
  process.exit(1);
}

const missingOptional = optionalButRecommended.filter(key => !process.env[key]);
if (missingOptional.length > 0) {
  logWarning(`Missing optional environment variables: ${missingOptional.join(', ')}`);
  logWarning('Some features may not work correctly without these.');
}

const app = express();
app.set('trust proxy', 1);

// Request ID middleware (must be first)
app.use(requestIdMiddleware);

// CORS configuration - Allow all origins
const corsOptions = {
  origin: true, // Allow all origins (when credentials: true, use true instead of '*')
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'X-Requested-With', 'Accept'],
  exposedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id']
};
app.use(cors(corsOptions));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Stricter rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 login attempts per windowMs
  message: {
    success: false,
    message: 'Too many authentication attempts, please try again later.'
  },
  skipSuccessfulRequests: true
});

// Apply rate limiting to all routes (except health check and OPTIONS preflight requests)
app.use((req, res, next) => {
  if (req.path === '/health' || req.method === 'OPTIONS') {
    return next(); // Skip rate limiting for health check and preflight requests
  }
  limiter(req, res, next);
});

// Apply auth rate limiting, but skip OPTIONS requests
app.use('/auth/login', (req, res, next) => {
  if (req.method === 'OPTIONS') {
    return next(); // Skip rate limiting for preflight requests
  }
  authLimiter(req, res, next);
});

app.use(express.json({ limit: '10mb' }));

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    await sequelize.authenticate();
    res.json({ 
      success: true,
      status: 'healthy', 
      database: 'connected',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({ 
      success: false,
      status: 'unhealthy', 
      database: 'disconnected',
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/', (req, res) => {
  res.json({ 
    success: true,
    message: 'RetailPro POS Backend API',
    version: '1.0.0',
      endpoints: {
        auth: '/auth',
        sales: '/sales',
        items: '/items',
        customers: '/customers',
        zoho: '/zoho',
        printer: '/printer',
        health: '/health'
      }
  });
});

app.use('/auth', authRoutes);
app.use('/sales', salesRoutes);
app.use('/items', itemRoutes);
app.use('/customers', customerRoutes);
app.use('/zoho', zohoRoutes);
app.use('/printer', printerRoutes);
app.use('/valor', valorApiRoutes);

// Error handler (must be last)
app.use(errorHandler);

const PORT = process.env.PORT || 3000;

// Clean up any leftover backup tables from failed SQLite migrations
const cleanupBackupTables = async () => {
  if (DATABASE_SETTING === 'local') {
    try {
      // Ensure connection is established
      await sequelize.authenticate();
      
      const [results] = await sequelize.query(
        "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%_backup'"
      );
      
      if (results && results.length > 0) {
        for (const table of results) {
          await sequelize.query(`DROP TABLE IF EXISTS \`${table.name}\``);
        }
      }
    } catch (error) {
      logWarning(`Could not clean up backup tables: ${error.message}`);
      // Don't fail if cleanup fails, continue with sync
    }
  }
};

// Database sync - use alter only in development, force: false in production
const syncOptions = process.env.NODE_ENV === 'production' 
  ? { alter: false } // In production, disable auto-sync (use migrations instead)
  : { alter: true }; // In development, allow schema alterations

// Check if customers exist and sync from Zoho if needed
const checkAndSyncCustomers = async () => {
  try {
    const customerCount = await Customer.count();
    
    if (customerCount === 0) {
      logInfo('No customers found in database. Syncing from Zoho...');
      
      // Check if Zoho credentials are available
      const hasZohoCredentials = 
        process.env.ZOHO_REFRESH_TOKEN && 
        process.env.ZOHO_CLIENT_ID && 
        process.env.ZOHO_CLIENT_SECRET && 
        process.env.ZOHO_ORGANIZATION_ID;
      
      if (!hasZohoCredentials) {
        logWarning('Zoho credentials not configured. Skipping customer sync.');
        log('Set ZOHO_REFRESH_TOKEN, ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, and ZOHO_ORGANIZATION_ID to enable sync.');
        return;
      }
      
      try {
        const result = await syncCustomersToDatabase();
        logSuccess(`Customer sync completed: ${result.stats.created} created, ${result.stats.updated} updated (${result.stats.total} total)`);
      } catch (syncError) {
        logError('Failed to sync customers from Zoho', syncError);
        log('The server will continue to run, but customers may not be available.');
      }
    } else {
      logSuccess(`Found ${customerCount} customer(s) in database. Skipping sync.`);
    }
  } catch (error) {
    logError('Error checking customers', error);
    // Don't fail server startup if customer check fails
  }
};

const disableSQLiteForeignKeys = async () => {
  if (DATABASE_SETTING === 'local') {
    try {
      await sequelize.query('PRAGMA foreign_keys = OFF');
      logDatabase('SQLite foreign key checks disabled for schema sync');
    } catch (err) {
      logWarning(`Failed to disable SQLite foreign keys: ${err.message}`);
    }
  }
};

const enableSQLiteForeignKeys = async () => {
  if (DATABASE_SETTING === 'local') {
    try {
      await sequelize.query('PRAGMA foreign_keys = ON');
      logDatabase('SQLite foreign key checks re-enabled');
    } catch (err) {
      logWarning(`Failed to re-enable SQLite foreign keys: ${err.message}`);
    }
  }
};

const isSQLite = DATABASE_SETTING === 'local';

const ensureColumn = async ({
  table,
  column,
  sqliteType,
  pgType,
  successMessage,
  existsMessage,
  warnMessage
}) => {
  const msg = {
    success: successMessage || `Added ${column} column to ${table} table`,
    exists: existsMessage || `${column} column already exists on ${table} table`,
    warn: warnMessage || `Could not ensure ${column} column on ${table} table`
  };

  try {
    if (isSQLite) {
      try {
        await sequelize.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${sqliteType}`);
        logSuccess(msg.success);
      } catch (err) {
        const e = err?.message || '';
        if (e.includes('duplicate column name') || e.includes('duplicate column')) {
          logInfo(msg.exists);
          return;
        }
        throw err;
      }
    } else {
      try {
        await sequelize.query(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "${column}" ${pgType}`);
        logSuccess(msg.success);
      } catch (err) {
        logWarning(`${msg.warn}: ${err.message}`);
      }
    }
  } catch (err) {
    logWarning(`${msg.warn}: ${err.message}`);
  }
};

// Ensure new imageData column exists on Items table (for SQLite / auto-sync disabled)
const ensureItemImageColumn = async () =>
  ensureColumn({
    table: 'Items',
    column: 'imageData',
    sqliteType: 'TEXT',
    pgType: 'TEXT',
    successMessage: 'Added imageData column to Items table',
    existsMessage: 'imageData column already exists on Items table',
    warnMessage: 'Could not ensure imageData column on Items table'
  });

// Ensure bankAccountLast4 column exists on Customers table (for SQLite / auto-sync disabled)
const ensureBankAccountColumn = async () =>
  ensureColumn({
    table: 'Customers',
    column: 'bankAccountLast4',
    sqliteType: 'VARCHAR(255) NULL',
    pgType: 'VARCHAR(255) NULL',
    successMessage: 'Added bankAccountLast4 column to Customers table',
    existsMessage: 'bankAccountLast4 column already exists on Customers table',
    warnMessage: 'Could not ensure bankAccountLast4 column on Customers table'
  });

// Ensure customerProfileId and customerPaymentProfileId columns exist on Customers table
const ensureCustomerProfileColumns = async () => {
  await ensureColumn({
    table: 'Customers',
    column: 'customerProfileId',
    sqliteType: 'VARCHAR(255) NULL',
    pgType: 'VARCHAR(255) NULL',
    successMessage: 'Added customerProfileId column to Customers table',
    existsMessage: 'customerProfileId column already exists on Customers table',
    warnMessage: 'Could not ensure customerProfileId column on Customers table'
  });
  await ensureColumn({
    table: 'Customers',
    column: 'customerPaymentProfileId',
    sqliteType: 'VARCHAR(255) NULL',
    pgType: 'VARCHAR(255) NULL',
    successMessage: 'Added customerPaymentProfileId column to Customers table',
    existsMessage: 'customerPaymentProfileId column already exists on Customers table',
    warnMessage: 'Could not ensure customerPaymentProfileId column on Customers table'
  });
};

// Ensure status column exists on Customers table
const ensureCustomerStatusColumn = async () =>
  ensureColumn({
    table: 'Customers',
    column: 'status',
    sqliteType: 'VARCHAR(255) NULL',
    pgType: 'VARCHAR(255) NULL',
    successMessage: 'Added status column to Customers table',
    existsMessage: 'status column already exists on Customers table',
    warnMessage: 'Could not ensure status column on Customers table'
  });

// Ensure terminalIP, terminalPort, and terminalNumber columns exist on Users table
const ensureTerminalColumns = async () => {
  await ensureColumn({
    table: 'Users',
    column: 'terminalIP',
    sqliteType: 'VARCHAR(255) NULL',
    pgType: 'VARCHAR(255) NULL',
    successMessage: 'Added terminalIP column to Users table',
    existsMessage: 'terminalIP column already exists on Users table',
    warnMessage: 'Could not ensure terminalIP column on Users table'
  });
  await ensureColumn({
    table: 'Users',
    column: 'terminalPort',
    sqliteType: 'INTEGER NULL',
    pgType: 'INTEGER NULL',
    successMessage: 'Added terminalPort column to Users table',
    existsMessage: 'terminalPort column already exists on Users table',
    warnMessage: 'Could not ensure terminalPort column on Users table'
  });
  await ensureColumn({
    table: 'Users',
    column: 'terminalNumber',
    sqliteType: 'VARCHAR(255) NULL',
    pgType: 'VARCHAR(255) NULL',
    successMessage: 'Added terminalNumber column to Users table',
    existsMessage: 'terminalNumber column already exists on Users table',
    warnMessage: 'Could not ensure terminalNumber column on Users table'
  });
};

// Ensure zohoTaxId column exists on Users table
const ensureZohoTaxIdColumn = async () =>
  ensureColumn({
    table: 'Users',
    column: 'zohoTaxId',
    sqliteType: 'VARCHAR(255) NULL',
    pgType: 'VARCHAR(255) NULL',
    successMessage: 'Added zohoTaxId column to Users table',
    existsMessage: 'zohoTaxId column already exists on Users table',
    warnMessage: 'Could not ensure zohoTaxId column on Users table'
  });

// Ensure taxId column exists on SaleItems table
// This persists the Zoho Books tax_id used on each line item (needed for retry sync and historical data).
const ensureSaleItemTaxIdColumn = async () =>
  ensureColumn({
    table: 'SaleItems',
    column: 'taxId',
    sqliteType: 'VARCHAR(255) NULL',
    pgType: 'VARCHAR(255) NULL',
    successMessage: 'Added taxId column to SaleItems table',
    existsMessage: 'taxId column already exists on SaleItems table',
    warnMessage: 'Could not ensure taxId column on SaleItems table'
  });

// Admin user creation is handled by bootstrap login mechanism in authController.js
// Bootstrap credentials: accounting@subzeroiceservices.com / dryice000
// This only works when database is empty (first-time setup)

const startServer = async () => {
  await cleanupBackupTables();

  await disableSQLiteForeignKeys();
  try {
    await sequelize.sync(syncOptions);
  } finally {
    await enableSQLiteForeignKeys();
  }

  // Make sure new columns needed for features exist in older SQLite DBs
  if (DATABASE_SETTING === 'local') {
    await ensureItemImageColumn();
    await ensureTerminalColumns();
    await ensureZohoTaxIdColumn();
    await ensureSaleItemTaxIdColumn();
    await ensureBankAccountColumn();
    await ensureCustomerProfileColumns();
    await ensureCustomerStatusColumn();
  } else {
    // For PostgreSQL, also ensure columns exist
    await ensureTerminalColumns();
    await ensureZohoTaxIdColumn();
    await ensureSaleItemTaxIdColumn();
    await ensureBankAccountColumn();
    await ensureCustomerProfileColumns();
    await ensureCustomerStatusColumn();
  }

  // Admin user creation handled by bootstrap login (see authController.js)

  await checkAndSyncCustomers();

  app.listen(PORT, '0.0.0.0', () => {
    logServerStart(PORT, process.env.NODE_ENV || 'development');
    logDatabase(`Database: ${DATABASE_SETTING} (${DATABASE_SETTING === 'local' ? 'SQLite' : 'PostgreSQL'})`);
    log('');
    log('Available Endpoints:');
    log('  GET  /health (health check)');
    log('  POST /auth/login');
    log('  POST /auth/users');
    log('  GET  /auth/me');
    log('  POST /sales');
    log('  GET  /sales');
    log('  GET  /items');
    log('  GET  /customers');
    log('  POST /zoho/sync/all');
    if (process.env.NODE_ENV === 'production') {
      logWarning('Database auto-sync is disabled. Use migrations for schema changes.');
    }
    console.log('');
  });
};

startServer().catch(err => {
  logError('DB connection failed', err);
  process.exit(1);
});