import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';
import path from 'path';
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
  
  sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: dbPath,
    logging: false,
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    }
  });
  
  logDatabase(`Using SQLite database (local mode) - ${dbPath}`);
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
