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
import bbposRoutes from './routes/bbposRoutes.js';
import { sequelize } from './config/db.js';
import { requestIdMiddleware } from './middleware/requestId.js';
import { errorHandler } from './middleware/errorHandler.js';
import { Customer } from './models/index.js';
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

// CORS configuration
const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, Postman, curl, etc.)
    if (!origin) return callback(null, true);
    
    // Build list of allowed origins
    const allowedOrigins = [
      'http://localhost:5000',
      'http://127.0.0.1:5000',
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'https://subzerodryice-pos.com'
    ];
    
    // Add custom FRONTEND_URL if set (supports comma-separated list)
    if (process.env.FRONTEND_URL) {
      const customOrigins = process.env.FRONTEND_URL.split(',').map(url => url.trim());
      allowedOrigins.push(...customOrigins);
    }
    
    // Check if origin is in allowed list
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    // Allow localhost and 127.0.0.1 on any port
    if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
      return callback(null, true);
    }
    
    // In production with FRONTEND_URL set, be strict
    if (process.env.NODE_ENV === 'production' && process.env.FRONTEND_URL) {
      console.warn(`⚠️  CORS blocked request from: ${origin}`);
      return callback(new Error('Not allowed by CORS'));
    }
    
    // In development, allow all origins (for VPS testing)
    if (process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }
    
    // Default: block
    console.warn(`⚠️  CORS blocked request from: ${origin}`);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id']
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

// Apply rate limiting to all routes (except health check)
app.use((req, res, next) => {
  if (req.path === '/health') {
    return next(); // Skip rate limiting for health check
  }
  limiter(req, res, next);
});

app.use('/auth/login', authLimiter);

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
app.use('/bbpos', bbposRoutes);

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

const startServer = async () => {
  await cleanupBackupTables();

  await disableSQLiteForeignKeys();
  try {
    await sequelize.sync(syncOptions);
  } finally {
    await enableSQLiteForeignKeys();
  }

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