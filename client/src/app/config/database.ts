/**
 * Database Configuration
 * Manages the database setting variable to determine database type
 * - 'local' = SQLite database
 * - 'cloud' = PostgreSQL database
 */

const STORAGE_KEYS = ['DatabaseSetting', 'Datasetting'] as const;

// Get database setting from environment variable or localStorage, default to 'cloud'
const getDatabaseSetting = (): string => {
  // Check environment variable first (for build-time configuration)
  if (import.meta.env.VITE_DATABASE_SETTING) {
    return import.meta.env.VITE_DATABASE_SETTING.toLowerCase();
  }
  
  // Check localStorage (for runtime configuration)
  for (const key of STORAGE_KEYS) {
    const stored = localStorage.getItem(key);
    if (stored) {
      return stored.toLowerCase();
    }
  }
  
  // Default to 'cloud' (PostgreSQL)
  return 'cloud';
};

// Set database setting in localStorage
export const setDatabaseSetting = (setting: string): boolean => {
  const normalized = setting.toLowerCase();
  if (normalized === 'local' || normalized === 'cloud') {
    // Prefer the correct key, but keep backward compatibility for existing installs.
    localStorage.setItem('DatabaseSetting', normalized);
    localStorage.setItem('Datasetting', normalized);
    return true;
  }
  return false;
};

// Get current database setting
export const getDatabaseSettingValue = (): string => {
  return getDatabaseSetting();
};

// Check if using local database
export const isLocalDatabase = (): boolean => {
  return getDatabaseSetting() === 'local';
};

// Check if using cloud database
export const isCloudDatabase = (): boolean => {
  return getDatabaseSetting() === 'cloud';
};

// Get database type display name
export const getDatabaseTypeName = (): string => {
  return getDatabaseSetting() === 'local' ? 'SQLite (Local)' : 'PostgreSQL (Cloud)';
};

export default {
  getDatabaseSetting: getDatabaseSettingValue,
  setDatabaseSetting,
  isLocalDatabase,
  isCloudDatabase,
  getDatabaseTypeName
};
