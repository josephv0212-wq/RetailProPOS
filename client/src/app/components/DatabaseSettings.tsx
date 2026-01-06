import React, { useState } from 'react';
import { getDatabaseSettingValue, setDatabaseSetting, getDatabaseTypeName } from '../config/database';
import { useToast } from '../contexts/ToastContext';

export function DatabaseSettings() {
  const [databaseSetting, setDatabaseSettingState] = useState(getDatabaseSettingValue());
  const { showToast } = useToast();

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newSetting = e.target.value;
    if (setDatabaseSetting(newSetting)) {
      setDatabaseSettingState(newSetting);
      showToast(
        `Database setting changed to ${newSetting === 'local' ? 'SQLite (Local)' : 'PostgreSQL (Cloud)'}. Backend must be restarted with DATABASE_SETTING=${newSetting} for the change to take effect.`,
        'info',
        6000
      );
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
      <div className="mb-5">
        <p className="text-base font-semibold mb-3 text-gray-900 dark:text-white">
          Current Database Type
        </p>
        <div className="inline-flex items-center gap-3 px-5 py-3 rounded-xl bg-gray-50 dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600">
          <span className="text-2xl">🗄️</span>
          <span className="text-base font-bold text-gray-900 dark:text-white">
            {getDatabaseTypeName()}
          </span>
        </div>
      </div>

      <div className="mb-5">
        <label className="block mb-2 font-semibold text-sm text-gray-700 dark:text-gray-300">
          Change Database Type
        </label>
        <select
          value={databaseSetting}
          onChange={handleChange}
          className="w-full px-4 py-3 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="cloud">PostgreSQL (Cloud)</option>
          <option value="local">SQLite (Local)</option>
        </select>
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          Note: Changing this setting requires restarting the backend server with the corresponding DATABASE_SETTING environment variable.
        </p>
      </div>
    </div>
  );
}
