/**
 * Migration script to add terminalIP column to Users table
 * Run this script once to update your database schema
 */

import { sequelize } from '../config/db.js';
import { User } from '../models/index.js';
import dotenv from 'dotenv';

dotenv.config();

const addTerminalIPColumn = async () => {
  try {
    console.log('🔄 Adding terminalIP column to Users table...');
    
    // Check if column already exists
    const [results] = await sequelize.query(`
      SELECT name FROM pragma_table_info('Users') WHERE name = 'terminalIP'
    `);
    
    if (results && results.length > 0) {
      console.log('✅ Column terminalIP already exists. No changes needed.');
      return;
    }
    
    // Add the column
    await sequelize.query(`
      ALTER TABLE Users ADD COLUMN terminalIP VARCHAR(255) NULL
    `);
    
    console.log('✅ Successfully added terminalIP column to Users table');
    
    // Verify the column was added
    const [verify] = await sequelize.query(`
      SELECT name FROM pragma_table_info('Users') WHERE name = 'terminalIP'
    `);
    
    if (verify && verify.length > 0) {
      console.log('✅ Verification: terminalIP column exists');
    } else {
      console.error('❌ Verification failed: terminalIP column not found');
    }
    
  } catch (error) {
    console.error('❌ Error adding terminalIP column:', error.message);
    
    // If it's a PostgreSQL database, use different syntax
    if (error.message.includes('PRAGMA') || error.original?.code === '42883') {
      try {
        console.log('🔄 Trying PostgreSQL syntax...');
        await sequelize.query(`
          ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS "terminalIP" VARCHAR(255) NULL
        `);
        console.log('✅ Successfully added terminalIP column (PostgreSQL)');
      } catch (pgError) {
        console.error('❌ PostgreSQL migration failed:', pgError.message);
        throw pgError;
      }
    } else {
      throw error;
    }
  }
};

// Run the migration
const runMigration = async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ Database connection established');
    
    await addTerminalIPColumn();
    
    console.log('✅ Migration completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
};

runMigration();
