/**
 * Database Configuration
 * Manages the Datasetting variable to determine database type
 * - 'local' = SQLite database
 * - 'cloud' = PostgreSQL database
 */

// Get Datasetting from environment variable or localStorage, default to 'cloud'
const getDatabaseSetting = () => {
  // Check environment variable first (for build-time configuration)
  if (import.meta.env.VITE_DATABASE_SETTING) {
    return import.meta.env.VITE_DATABASE_SETTING.toLowerCase();
  }
  
  // Check localStorage (for runtime configuration)
  const stored = localStorage.getItem('Datasetting');
  if (stored) {
    return stored.toLowerCase();
  }
  
  // Default to 'cloud' (PostgreSQL)
  return 'cloud';
};

// Set Datasetting in localStorage
export const setDatabaseSetting = (setting) => {
  const normalized = setting.toLowerCase();
  if (normalized === 'local' || normalized === 'cloud') {
    localStorage.setItem('Datasetting', normalized);
    return true;
  }
  return false;
};

// Get current Datasetting
export const getDatabaseSettingValue = () => {
  return getDatabaseSetting();
};

// Check if using local database
export const isLocalDatabase = () => {
  return getDatabaseSetting() === 'local';
};

// Check if using cloud database
export const isCloudDatabase = () => {
  return getDatabaseSetting() === 'cloud';
};

// Get database type display name
export const getDatabaseTypeName = () => {
  return getDatabaseSetting() === 'local' ? 'SQLite (Local)' : 'PostgreSQL (Cloud)';
};

export default {
  getDatabaseSetting: getDatabaseSettingValue,
  setDatabaseSetting,
  isLocalDatabase,
  isCloudDatabase,
  getDatabaseTypeName
};

