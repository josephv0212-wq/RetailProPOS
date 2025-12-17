import React, { useState } from 'react';
import { getDatabaseSettingValue, setDatabaseSetting, getDatabaseTypeName } from '../config/database';
import { showToast } from './ToastContainer';

const DatabaseSettings = () => {
  const [databaseSetting, setDatabaseSettingState] = useState(getDatabaseSettingValue());

  const handleChange = (e) => {
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
    <div>
      <div style={{ marginBottom: '20px' }}>
        <p style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px', color: 'var(--dark)' }}>
          Current Database Type
        </p>
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '12px',
          padding: '12px 20px',
          borderRadius: '12px',
          background: 'var(--gray-50)',
          border: '2px solid var(--border)'
        }}>
          <span style={{ fontSize: '24px' }}>🗄️</span>
          <span style={{ 
            fontSize: '16px', 
            fontWeight: '700',
            color: 'var(--dark)'
          }}>
            {getDatabaseTypeName()}
          </span>
        </div>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <label style={{ 
          display: 'block', 
          marginBottom: '10px', 
          fontWeight: '600',
          fontSize: '15px',
          color: 'var(--dark)'
        }}>
          Change Database Type
        </label>
        <select
          value={databaseSetting}
          onChange={handleChange}
          className="input"
          style={{ maxWidth: '300px' }}
        >
          <option value="local">SQLite (Local)</option>
          <option value="cloud">PostgreSQL (Cloud)</option>
        </select>
      </div>

      <div style={{
        padding: '16px',
        background: '#fef3c7',
        borderRadius: '12px',
        border: '1px solid var(--warning)',
        fontSize: '14px',
        color: 'var(--warning-dark)'
      }}>
        <p style={{ marginBottom: '8px', fontWeight: '700' }}>⚠️ Important:</p>
        <p style={{ marginBottom: '8px' }}>
          This setting is stored in localStorage for frontend reference only.
        </p>
        <p>
          To actually change the database, set the <code style={{ background: 'white', padding: '2px 6px', borderRadius: '4px', fontFamily: 'monospace' }}>DATABASE_SETTING</code> environment variable on the backend server and restart it.
        </p>
      </div>
    </div>
  );
};

export default DatabaseSettings;

