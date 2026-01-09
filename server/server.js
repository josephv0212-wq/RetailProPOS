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
import paxRoutes from './routes/paxRoutes.js';
import paymentRoutes from './routes/paymentRoutes.js';
import bbposRoutes from './routes/bbposRoutes.js';
import ebizchargeRoutes from './routes/ebizchargeRoutes.js';
import { sequelize } from './config/db.js';
import { requestIdMiddleware } from './middleware/requestId.js';
import { errorHandler } from './middleware/errorHandler.js';
import { Customer, User } from './models/index.js';
import bcrypt from 'bcryptjs';
import { syncCustomersToDatabase } from './controllers/zohoController.js';

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
  'REGISTRATION_KEY', // Secret key required for user registration (if not set, registration is open)
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
  'PRINTER_IP_LOC001',
  'PRINTER_IP_LOC002',
  'PRINTER_IP_LOC003',
  'PRINTER_IP_LOC004',
  'FRONTEND_URL',
  'NODE_ENV' // Used to determine Authorize.Net endpoint (development = sandbox, production = live)
];

const missing = requiredEnvVars.filter(key => !process.env[key]);
if (missing.length > 0) {
  console.error('❌ Missing required environment variables:', missing.join(', '));
  console.error('Please set these variables before starting the server.');
  process.exit(1);
}

const missingOptional = optionalButRecommended.filter(key => !process.env[key]);
if (missingOptional.length > 0) {
  console.warn('⚠️  Missing optional environment variables:', missingOptional.join(', '));
  console.warn('Some features may not work correctly without these.');
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
        pax: '/pax',
        bbpos: '/bbpos',
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
app.use('/pax', paxRoutes);
app.use('/payment', paymentRoutes);
app.use('/bbpos', bbposRoutes);
app.use('/ebizcharge', ebizchargeRoutes);

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
      console.warn('⚠️  Warning: Could not clean up backup tables:', error.message);
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
      console.log('📋 No customers found in database. Syncing from Zoho...');
      
      // Check if Zoho credentials are available
      const hasZohoCredentials = 
        process.env.ZOHO_REFRESH_TOKEN && 
        process.env.ZOHO_CLIENT_ID && 
        process.env.ZOHO_CLIENT_SECRET && 
        process.env.ZOHO_ORGANIZATION_ID;
      
      if (!hasZohoCredentials) {
        console.warn('⚠️  Zoho credentials not configured. Skipping customer sync.');
        console.warn('   Set ZOHO_REFRESH_TOKEN, ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, and ZOHO_ORGANIZATION_ID to enable sync.');
        return;
      }
      
      try {
        const result = await syncCustomersToDatabase();
        console.log(`✅ Customer sync completed: ${result.stats.created} created, ${result.stats.updated} updated (${result.stats.total} total)`);
      } catch (syncError) {
        console.error('❌ Failed to sync customers from Zoho:', syncError.message);
        console.error('   The server will continue to run, but customers may not be available.');
      }
    } else {
      console.log(`✅ Found ${customerCount} customer(s) in database. Skipping sync.`);
    }
  } catch (error) {
    console.error('❌ Error checking customers:', error.message);
    // Don't fail server startup if customer check fails
  }
};

const disableSQLiteForeignKeys = async () => {
  if (DATABASE_SETTING === 'local') {
    try {
      await sequelize.query('PRAGMA foreign_keys = OFF');
      console.log('🔐 SQLite foreign key checks disabled for schema sync');
    } catch (err) {
      console.warn('⚠️ Failed to disable SQLite foreign keys:', err.message);
    }
  }
};

const enableSQLiteForeignKeys = async () => {
  if (DATABASE_SETTING === 'local') {
    try {
      await sequelize.query('PRAGMA foreign_keys = ON');
      console.log('🔐 SQLite foreign key checks re-enabled');
    } catch (err) {
      console.warn('⚠️ Failed to re-enable SQLite foreign keys:', err.message);
    }
  }
};

// Ensure new imageData column exists on Items table (for SQLite / auto-sync disabled)
const ensureItemImageColumn = async () => {
  try {
    // This ALTER is safe to run repeatedly; on second run it will throw
    // "duplicate column name", which we catch and ignore.
    await sequelize.query('ALTER TABLE `Items` ADD COLUMN `imageData` TEXT');
    console.log('✅ Added imageData column to Items table');
  } catch (err) {
    const msg = err?.message || '';
    if (msg.includes('duplicate column name') || msg.includes('duplicate column')) {
      console.log('ℹ️  imageData column already exists on Items table');
      return;
    }
    // If the table doesn't exist or other error, log but don't crash server
    console.warn('⚠️  Could not ensure imageData column on Items table:', msg);
  }
};

// Ensure terminalIP, terminalPort, and terminalId columns exist on Users table (for SQLite / auto-sync disabled)
const ensureTerminalColumns = async () => {
  try {
    if (DATABASE_SETTING === 'local') {
      // SQLite syntax - Add terminalIP column
      try {
        await sequelize.query('ALTER TABLE `Users` ADD COLUMN `terminalIP` VARCHAR(255) NULL');
        console.log('✅ Added terminalIP column to Users table');
      } catch (err) {
        if (!err.message?.includes('duplicate column name') && !err.message?.includes('duplicate column')) {
          throw err;
        }
        console.log('ℹ️  terminalIP column already exists on Users table');
      }
      
      // SQLite syntax - Add terminalPort column
      try {
        await sequelize.query('ALTER TABLE `Users` ADD COLUMN `terminalPort` INTEGER NULL');
        console.log('✅ Added terminalPort column to Users table');
      } catch (err) {
        if (!err.message?.includes('duplicate column name') && !err.message?.includes('duplicate column')) {
          throw err;
        }
        console.log('ℹ️  terminalPort column already exists on Users table');
      }
      
      // SQLite syntax - Add terminalId column
      try {
        await sequelize.query('ALTER TABLE `Users` ADD COLUMN `terminalId` VARCHAR(255) NULL');
        console.log('✅ Added terminalId column to Users table');
      } catch (err) {
        if (!err.message?.includes('duplicate column name') && !err.message?.includes('duplicate column')) {
          throw err;
        }
        console.log('ℹ️  terminalId column already exists on Users table');
      }
    } else {
      // PostgreSQL syntax - Add terminalIP column
      try {
        await sequelize.query('ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS "terminalIP" VARCHAR(255) NULL');
        console.log('✅ Added terminalIP column to Users table');
      } catch (err) {
        console.warn('⚠️  Could not ensure terminalIP column:', err.message);
      }
      
      // PostgreSQL syntax - Add terminalPort column
      try {
        await sequelize.query('ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS "terminalPort" INTEGER NULL');
        console.log('✅ Added terminalPort column to Users table');
      } catch (err) {
        console.warn('⚠️  Could not ensure terminalPort column:', err.message);
      }
      
      // PostgreSQL syntax - Add terminalId column
      try {
        await sequelize.query('ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS "terminalId" VARCHAR(255) NULL');
        console.log('✅ Added terminalId column to Users table');
      } catch (err) {
        console.warn('⚠️  Could not ensure terminalId column:', err.message);
      }
    }
  } catch (err) {
    console.warn('⚠️  Could not ensure terminal columns on Users table:', err.message);
  }
};

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
  } else {
    // For PostgreSQL, also ensure columns exist
    await ensureTerminalColumns();
  }

  // Admin user creation handled by bootstrap login (see authController.js)

  await checkAndSyncCustomers();

  app.listen(PORT, '0.0.0.0', () => {
    console.log('✅ RetailPro POS Backend running on port', PORT);
    console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`📍 Database Setting: ${DATABASE_SETTING} (${DATABASE_SETTING === 'local' ? 'SQLite' : 'PostgreSQL'})`);
    console.log('📍 Endpoints available:');
    console.log('   - GET  /health (health check)');
    console.log('   - POST /auth/login');
    console.log('   - POST /auth/users');
    console.log('   - GET  /auth/me');
    console.log('   - POST /sales');
    console.log('   - GET  /sales');
    console.log('   - GET  /items');
    console.log('   - GET  /customers');
    console.log('   - POST /zoho/sync/all');
    if (process.env.NODE_ENV === 'production') {
      console.log('⚠️  Database auto-sync is disabled. Use migrations for schema changes.');
    }
  });
};

startServer().catch(err => {
  console.error('❌ DB connection failed:', err);
  process.exit(1);
});