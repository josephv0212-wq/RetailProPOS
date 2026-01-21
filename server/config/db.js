import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { logDatabase } from '../utils/logger.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({path:path.join(__dirname, '.env')});

// Get database setting from environment variable (default to 'cloud' for PostgreSQL)
const DATABASE_SETTING = (process.env.DATABASE_SETTING || 'cloud').toLowerCase();

let sequelize;

if (DATABASE_SETTING === 'local') {
  // SQLite configuration for local database
  const dbPath = path.join(__dirname, '..', 'database.sqlite');

  // Backward compatibility: if an older SQLite file exists (e.g. "transactionsdb"),
  // migrate/rename it to "database.sqlite" so the app uses a single consistent DB.
  const legacyDbCandidates = [
    path.join(__dirname, '..', 'transactionsdb.sqlite'),
    path.join(__dirname, '..', 'transactionsdb.db'),
    path.join(__dirname, '..', 'transactions.db'),
    path.join(__dirname, '..', 'transactions.sqlite')
  ];

  try {
    if (!fs.existsSync(dbPath)) {
      const legacyPath = legacyDbCandidates.find(p => fs.existsSync(p));
      if (legacyPath) {
        try {
          fs.renameSync(legacyPath, dbPath);
          logDatabase(`Migrated legacy SQLite DB "${path.basename(legacyPath)}" -> "${path.basename(dbPath)}"`);
        } catch (renameErr) {
          // If rename fails (locked file, permissions, etc.), fall back to using legacy path.
          logDatabase(`Using legacy SQLite DB "${legacyPath}" (could not rename to "${dbPath}": ${renameErr.message})`);
        }
      }
    }
  } catch (e) {
    // If filesystem checks fail for any reason, proceed with default dbPath.
    logDatabase(`SQLite legacy DB check skipped: ${e.message}`);
  }
  
  sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: fs.existsSync(dbPath) ? dbPath : (legacyDbCandidates.find(p => fs.existsSync(p)) || dbPath),
    logging: false,
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    }
  });
  
  logDatabase(`Using SQLite database (local mode) - ${sequelize.options.storage}`);
} else {
  // PostgreSQL configuration for cloud database
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required when DATABASE_SETTING is "cloud"');
  }
  
  sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    logging: false,
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    }
  });
  
  logDatabase('Using PostgreSQL database (cloud mode)');
}

export { sequelize };
