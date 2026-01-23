import { sequelize } from '../config/db.js';
import { logSuccess, logInfo, logError } from '../utils/logger.js';

const addBasicUMColumn = async () => {
  try {
    // Check if column already exists
    try {
      await sequelize.query('ALTER TABLE unit_of_measures ADD COLUMN basicUM VARCHAR(255) NULL');
      logSuccess('✅ Added basicUM column to unit_of_measures table');
    } catch (err) {
      const errorMsg = err?.message || '';
      if (errorMsg.includes('duplicate column name') || errorMsg.includes('duplicate column') || errorMsg.includes('already exists')) {
        logInfo('ℹ️ basicUM column already exists on unit_of_measures table');
      } else {
        throw err;
      }
    }
  } catch (err) {
    logError('❌ Failed to add basicUM column:', err.message);
    process.exit(1);
  } finally {
    await sequelize.close();
    process.exit(0);
  }
};

addBasicUMColumn();
