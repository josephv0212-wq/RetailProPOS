import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import authRoutes from './routes/authRoutes.js';
import salesRoutes from './routes/salesRoutes.js';
import zohoRoutes from './routes/zohoRoutes.js';
import itemRoutes from './routes/itemRoutes.js';
import customerRoutes from './routes/customerRoutes.js';
import printerRoutes from './routes/printerRoutes.js';
import valorApiRoutes from './routes/valorApiRoutes.js';
import unitOfMeasureRoutes from './routes/unitOfMeasureRoutes.js';
import itemUnitOfMeasureRoutes from './routes/itemUnitOfMeasureRoutes.js';
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
app.use('/items', itemUnitOfMeasureRoutes);
app.use('/customers', customerRoutes);
app.use('/zoho', zohoRoutes);
app.use('/printer', printerRoutes);
app.use('/valor', valorApiRoutes);
app.use('/units', unitOfMeasureRoutes);

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

// Check if admin user exists and create default admin if needed
const checkAndCreateAdminUser = async () => {
  try {
    const adminCount = await User.count({ where: { role: 'admin' } });
    
    if (adminCount === 0) {
      logInfo('No admin user found in database. Creating default admin user...');
      
      const defaultAdmin = {
        useremail: 'accounting@subzeroiceservices.com',
        password: 'dryice000',
        role: 'admin',
        locationId: 'LOC001',
        locationName: 'Default Location',
        taxPercentage: 7.5,
        isActive: true
      };
      
      try {
        // Check if user with this useremail already exists (but not as admin)
        const existingUser = await User.findOne({ 
          where: { useremail: defaultAdmin.useremail } 
        });
        
        if (existingUser) {
          // Update existing user to admin
          existingUser.role = 'admin';
          existingUser.isActive = true;
          if (!existingUser.locationId) existingUser.locationId = defaultAdmin.locationId;
          if (!existingUser.locationName) existingUser.locationName = defaultAdmin.locationName;
          if (!existingUser.taxPercentage) existingUser.taxPercentage = defaultAdmin.taxPercentage;
          await existingUser.save();
          logSuccess(`Updated existing user "${defaultAdmin.useremail}" to admin role`);
        } else {
          // Create new admin user
          const hashedPassword = await bcrypt.hash(defaultAdmin.password, 10);
          const adminUser = await User.create({
            useremail: defaultAdmin.useremail,
            password: hashedPassword,
            role: defaultAdmin.role,
            locationId: defaultAdmin.locationId,
            locationName: defaultAdmin.locationName,
            taxPercentage: defaultAdmin.taxPercentage,
            isActive: defaultAdmin.isActive
          });
          logSuccess(`Admin user created: ${adminUser.useremail} (ID: ${adminUser.id})`);
        }
      } catch (createError) {
        logError('Failed to create admin user', createError);
        log('The server will continue to run, but you may need to create an admin user manually.');
      }
    } else {
      logSuccess(`Found ${adminCount} admin user(s) in database.`);
    }
  } catch (error) {
    logError('Error checking admin user', error);
    // Don't fail server startup if admin check fails
  }
};

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
  await ensureColumn({
    table: 'Users',
    column: 'cardReaderMode',
    sqliteType: 'VARCHAR(50) NULL DEFAULT "integrated"',
    pgType: 'VARCHAR(50) NULL DEFAULT \'integrated\'',
    successMessage: 'Added cardReaderMode column to Users table',
    existsMessage: 'cardReaderMode column already exists on Users table',
    warnMessage: 'Could not ensure cardReaderMode column on Users table'
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

// Ensure name column exists on Users table
const ensureUserNameColumn = async () =>
  ensureColumn({
    table: 'Users',
    column: 'name',
    sqliteType: 'VARCHAR(255) NULL',
    pgType: 'VARCHAR(255) NULL',
    successMessage: 'Added name column to Users table',
    existsMessage: 'name column already exists on Users table',
    warnMessage: 'Could not ensure name column on Users table'
  });

// Rename username column to useremail in Users table
const renameUsernameToUseremail = async () => {
  try {
    if (isSQLite) {
      // For SQLite, check if username exists and useremail doesn't
      try {
        const [results] = await sequelize.query(`
          SELECT name FROM sqlite_master 
          WHERE type='table' AND name='Users'
        `);
        if (results.length > 0) {
          const [columns] = await sequelize.query(`PRAGMA table_info(Users)`);
          const hasUsername = columns.some((col) => col.name === 'username');
          const hasUseremail = columns.some((col) => col.name === 'useremail');
          
          if (hasUsername && !hasUseremail) {
            // SQLite doesn't support ALTER TABLE RENAME COLUMN directly
            // We'll use a workaround: create new table, copy data, drop old, rename
            await sequelize.query(`
              CREATE TABLE Users_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                useremail VARCHAR(255) NOT NULL UNIQUE,
                name VARCHAR(255),
                password VARCHAR(255) NOT NULL,
                role VARCHAR(255) DEFAULT 'cashier',
                locationId VARCHAR(255) NOT NULL,
                locationName VARCHAR(255),
                taxPercentage DECIMAL(5,2) DEFAULT 7.5,
                zohoTaxId VARCHAR(255),
                isActive BOOLEAN DEFAULT 1,
                terminalIP VARCHAR(255),
                terminalPort INTEGER,
                terminalNumber VARCHAR(255),
                cardReaderMode VARCHAR(50) DEFAULT 'integrated',
                createdAt DATETIME,
                updatedAt DATETIME
              )
            `);
            await sequelize.query(`
              INSERT INTO Users_new (id, useremail, name, password, role, locationId, locationName, taxPercentage, zohoTaxId, isActive, terminalIP, terminalPort, terminalNumber, cardReaderMode, createdAt, updatedAt)
              SELECT id, username, name, password, role, locationId, locationName, taxPercentage, zohoTaxId, isActive, terminalIP, terminalPort, terminalNumber, cardReaderMode, createdAt, updatedAt
              FROM Users
            `);
            await sequelize.query(`DROP TABLE Users`);
            await sequelize.query(`ALTER TABLE Users_new RENAME TO Users`);
            logSuccess('Renamed username column to useremail in Users table (SQLite)');
          } else if (hasUseremail) {
            logInfo('useremail column already exists on Users table');
          } else {
            logInfo('username column does not exist, skipping rename');
          }
        } else {
          logInfo('Users table does not exist yet, will be created with correct schema by sequelize.sync');
        }
      } catch (err) {
        const e = err?.message || '';
        if (e.includes('no such table')) {
          logInfo('Users table does not exist yet, will be created with correct schema');
        } else if (e.includes('duplicate column')) {
          logInfo('Users table structure already updated');
        } else {
          logError(`Could not rename username to useremail: ${err.message}`);
          logError('Migration failed - please check database state');
          throw err; // Re-throw to prevent continuing with incorrect schema
        }
      }
    } else {
      // For PostgreSQL, use ALTER TABLE RENAME COLUMN
      try {
        // Check if username column exists
        const [results] = await sequelize.query(`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_name = 'Users' AND column_name = 'username'
        `);
        
        if (results.length > 0) {
          // Check if useremail already exists
          const [emailResults] = await sequelize.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'Users' AND column_name = 'useremail'
          `);
          
          if (emailResults.length === 0) {
            await sequelize.query(`ALTER TABLE "Users" RENAME COLUMN "username" TO "useremail"`);
            logSuccess('Renamed username column to useremail in Users table (PostgreSQL)');
          } else {
            logInfo('useremail column already exists on Users table');
          }
        } else {
          logInfo('username column does not exist, skipping rename');
        }
      } catch (err) {
        const e = err?.message || '';
        if (e.includes('does not exist') || e.includes('duplicate')) {
          logInfo('Users table structure already updated');
        } else {
          logWarning(`Could not rename username to useremail: ${err.message}`);
        }
      }
    }
  } catch (error) {
    logWarning(`Error renaming username to useremail: ${error}`);
  }
};

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

// Ensure cancelledInZoho column exists on Sales table
const ensureSaleCancelledColumn = async () =>
  ensureColumn({
    table: 'Sales',
    column: 'cancelledInZoho',
    sqliteType: 'BOOLEAN DEFAULT 0',
    pgType: 'BOOLEAN DEFAULT false',
    successMessage: 'Added cancelledInZoho column to Sales table',
    existsMessage: 'cancelledInZoho column already exists on Sales table',
    warnMessage: 'Could not ensure cancelledInZoho column on Sales table'
  });

// Ensure basicUM column exists on unit_of_measures table
const ensureBasicUMColumn = async () =>
  ensureColumn({
    table: 'unit_of_measures',
    column: 'basicUM',
    sqliteType: 'VARCHAR(255) NULL',
    pgType: 'VARCHAR(255) NULL',
    successMessage: 'Added basicUM column to unit_of_measures table',
    existsMessage: 'basicUM column already exists on unit_of_measures table',
    warnMessage: 'Could not ensure basicUM column on unit_of_measures table'
  });

// Ensure transactions table exists (legacy table for backward compatibility)
const ensureTransactionsTable = async () => {
  try {
    if (DATABASE_SETTING === 'local') {
      // Check if transactions table exists
      const [tables] = await sequelize.query(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='transactions'"
      );
      
      if (tables && tables.length > 0) {
        logInfo('transactions table already exists');
        return;
      }
      
      // Create transactions table with schema matching Sale model
      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS transactions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          transactionId VARCHAR(255),
          createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
          updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
          subtotal DECIMAL(10, 2) NOT NULL,
          taxAmount DECIMAL(10, 2) DEFAULT 0,
          taxPercentage DECIMAL(5, 2) DEFAULT 0,
          ccFee DECIMAL(10, 2) DEFAULT 0,
          total DECIMAL(10, 2) NOT NULL,
          paymentType VARCHAR(255) NOT NULL,
          locationId VARCHAR(255) NOT NULL,
          locationName VARCHAR(255),
          customerId INTEGER,
          zohoCustomerId VARCHAR(255),
          userId INTEGER,
          zohoSalesReceiptId VARCHAR(255),
          syncedToZoho BOOLEAN DEFAULT 0,
          syncError TEXT,
          notes TEXT,
          cancelledInZoho BOOLEAN DEFAULT 0
        )
      `);
      logSuccess('Created transactions table');
    } else {
      // For PostgreSQL, check if table exists
      const [tables] = await sequelize.query(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'transactions'"
      );
      
      if (tables && tables.length > 0) {
        logInfo('transactions table already exists');
        return;
      }
      
      // Create transactions table with schema matching Sale model
      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS transactions (
          id SERIAL PRIMARY KEY,
          "transactionId" VARCHAR(255),
          "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          subtotal DECIMAL(10, 2) NOT NULL,
          "taxAmount" DECIMAL(10, 2) DEFAULT 0,
          "taxPercentage" DECIMAL(5, 2) DEFAULT 0,
          "ccFee" DECIMAL(10, 2) DEFAULT 0,
          total DECIMAL(10, 2) NOT NULL,
          "paymentType" VARCHAR(255) NOT NULL,
          "locationId" VARCHAR(255) NOT NULL,
          "locationName" VARCHAR(255),
          "customerId" INTEGER,
          "zohoCustomerId" VARCHAR(255),
          "userId" INTEGER,
          "zohoSalesReceiptId" VARCHAR(255),
          "syncedToZoho" BOOLEAN DEFAULT false,
          "syncError" TEXT,
          notes TEXT,
          "cancelledInZoho" BOOLEAN DEFAULT false
        )
      `);
      logSuccess('Created transactions table');
    }
  } catch (err) {
    logWarning(`Could not ensure transactions table: ${err.message}`);
  }
};

// Migrate dry ice UMs to database
const migrateDryIceUMs = async () => {
  try {
    const { UnitOfMeasure } = await import('./models/index.js');
    
    // Dry Ice UM Configuration - migrated from frontend
    const DRY_ICE_UM_OPTIONS = [
      { unitName: 'Bin 1950', symbol: 'Bin 1950', unitPrecision: 1950, basicUM: 'lb' },
      { unitName: 'Bin 700', symbol: 'Bin 700', unitPrecision: 700, basicUM: 'lb' },
      { unitName: 'Bin 500 lb', symbol: 'Bin 500 lb', unitPrecision: 500, basicUM: 'lb' },
      { unitName: 'Kg', symbol: 'Kg', unitPrecision: 2.2, basicUM: 'lb' },
      { unitName: 'ea 10 lb', symbol: 'ea 10 lb', unitPrecision: 10, basicUM: 'lb' },
      { unitName: 'ea 5 lb', symbol: 'ea 5 lb', unitPrecision: 5, basicUM: 'lb' },
      { unitName: 'Bag 50 lb', symbol: 'Bag 50 lb', unitPrecision: 50, basicUM: 'lb' },
    ];

    logInfo('Migrating dry ice UMs to database...');
    
    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const umData of DRY_ICE_UM_OPTIONS) {
      try {
        // Check if unit already exists
        const existingUnit = await UnitOfMeasure.findOne({
          where: { unitName: umData.unitName }
        });

        if (existingUnit) {
          // Update existing unit if values differ
          const needsUpdate = 
            existingUnit.symbol !== umData.symbol ||
            parseFloat(existingUnit.unitPrecision) !== umData.unitPrecision ||
            existingUnit.basicUM !== umData.basicUM;
          
          if (needsUpdate) {
            await existingUnit.update({
              symbol: umData.symbol,
              unitPrecision: umData.unitPrecision,
              basicUM: umData.basicUM
            });
            updated++;
            logSuccess(`Updated dry ice unit: ${umData.unitName}`);
          } else {
            skipped++;
          }
        } else {
          // Create new unit
          await UnitOfMeasure.create({
            unitName: umData.unitName,
            symbol: umData.symbol,
            unitPrecision: umData.unitPrecision,
            basicUM: umData.basicUM
          });
          created++;
          logSuccess(`Created dry ice unit: ${umData.unitName}`);
        }
      } catch (err) {
        if (err.name === 'SequelizeUniqueConstraintError') {
          skipped++;
          logInfo(`Skipped dry ice unit (already exists): ${umData.unitName}`);
        } else {
          logError(`Error processing dry ice unit ${umData.unitName}`, err);
        }
      }
    }

    if (created > 0 || updated > 0) {
      logSuccess(`Dry ice UM migration completed: ${created} created, ${updated} updated, ${skipped} skipped`);
    } else if (skipped === DRY_ICE_UM_OPTIONS.length) {
      logInfo('All dry ice UMs already exist in database');
    }
  } catch (error) {
    logWarning(`Could not migrate dry ice UMs: ${error.message}`);
    // Don't fail server startup if migration fails
  }
};

// Admin user creation is handled by bootstrap login mechanism in authController.js
// Bootstrap credentials: accounting@subzeroiceservices.com / dryice000
// This only works when database is empty (first-time setup)

const startServer = async () => {
  await cleanupBackupTables();

  // Rename username to useremail if needed (must be done BEFORE sequelize.sync)
  await renameUsernameToUseremail();

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
          await ensureUserNameColumn();
          await ensureSaleItemTaxIdColumn();
          await ensureSaleCancelledColumn();
          await ensureBankAccountColumn();
          await ensureCustomerProfileColumns();
          await ensureCustomerStatusColumn();
          await ensureBasicUMColumn();
          await ensureTransactionsTable();
        } else {
          // For PostgreSQL, also ensure columns exist
          await ensureTerminalColumns();
          await ensureZohoTaxIdColumn();
          await ensureUserNameColumn();
          await ensureSaleItemTaxIdColumn();
          await ensureSaleCancelledColumn();
          await ensureBankAccountColumn();
          await ensureCustomerProfileColumns();
          await ensureCustomerStatusColumn();
  await ensureBasicUMColumn();
  await ensureTransactionsTable();
        }

  // Migrate dry ice UMs to database
  await migrateDryIceUMs();

  // Check and create admin user if none exists
  await checkAndCreateAdminUser();

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