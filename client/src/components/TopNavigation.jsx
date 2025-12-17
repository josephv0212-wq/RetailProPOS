import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { showToast } from './ToastContainer';

const TopNavigation = ({ printerStatus, syncStatus, onSyncNow }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [showUserMenu, setShowUserMenu] = useState(false);

  const isActive = (path) => location.pathname === path;

  const handleLogout = () => {
    logout();
    navigate('/login');
    showToast('Logged out successfully', 'success', 3000);
  };

  return (
    <header style={{
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      padding: '16px 24px',
      boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
      marginBottom: '24px',
      position: 'sticky',
      top: 0,
      zIndex: 100
    }}>
      <div className="flex-between">
        <div style={{ display: 'flex', alignItems: 'center', gap: '32px' }}>
          <h1 style={{
            fontSize: '28px',
            fontWeight: '800',
            color: 'white',
            margin: 0,
            cursor: 'pointer'
          }} onClick={() => navigate('/sales')}>
            RetailPro POS
          </h1>

          <nav style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => navigate('/sales')}
              className="btn"
              style={{
                background: isActive('/sales') ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.1)',
                border: 'none',
                color: 'white',
                fontSize: '15px',
                fontWeight: '600',
                padding: '10px 20px',
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                if (!isActive('/sales')) {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.15)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive('/sales')) {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
                }
              }}
            >
              Sales
            </button>
            <button
              onClick={() => navigate('/customers')}
              className="btn"
              style={{
                background: isActive('/customers') ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.1)',
                border: 'none',
                color: 'white',
                fontSize: '15px',
                fontWeight: '600',
                padding: '10px 20px',
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                if (!isActive('/customers')) {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.15)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive('/customers')) {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
                }
              }}
            >
              Customers
            </button>
            <button
              onClick={() => navigate('/reports')}
              className="btn"
              style={{
                background: isActive('/reports') ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.1)',
                border: 'none',
                color: 'white',
                fontSize: '15px',
                fontWeight: '600',
                padding: '10px 20px',
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                if (!isActive('/reports')) {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.15)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive('/reports')) {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
                }
              }}
            >
              Reports
            </button>
            <button
              onClick={() => navigate('/settings')}
              className="btn"
              style={{
                background: isActive('/settings') ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.1)',
                border: 'none',
                color: 'white',
                fontSize: '15px',
                fontWeight: '600',
                padding: '10px 20px',
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                if (!isActive('/settings')) {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.15)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive('/settings')) {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
                }
              }}
            >
              Settings
            </button>
          </nav>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {/* Location Badge */}
          <div style={{
            background: 'rgba(255,255,255,0.2)',
            padding: '8px 16px',
            borderRadius: '20px',
            fontSize: '14px',
            fontWeight: '600',
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <span>📍</span>
            {user?.locationName || user?.locationId || 'Location'}
          </div>

          {/* Printer Status */}
          <div
            title={`Printer ${printerStatus || 'unknown'}`}
            aria-label={`Printer ${printerStatus || 'unknown'}`}
            style={{
              background: printerStatus === 'online' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
              padding: '8px 12px',
              borderRadius: '20px',
              fontSize: '18px',
              fontWeight: '600',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative'
            }}>
            🖨️
            <span
              style={{
                position: 'absolute',
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                background: printerStatus === 'online' ? 'var(--success)' : 'var(--danger)',
                border: '2px solid rgba(255,255,255,0.8)',
                top: '6px',
                right: '6px'
              }}
            />
          </div>

          {/* Sync Status */}
          {syncStatus && (
            <button
              onClick={onSyncNow}
              disabled={syncStatus === 'syncing'}
              className="btn"
              style={{
                background: 'rgba(255,255,255,0.2)',
                border: 'none',
                color: 'white',
                fontSize: '12px',
                fontWeight: '600',
                padding: '8px 12px',
                borderRadius: '20px',
                cursor: syncStatus === 'syncing' ? 'not-allowed' : 'pointer',
                opacity: syncStatus === 'syncing' ? 0.7 : 1
              }}
            >
              {syncStatus === 'syncing' ? (
                <>
                  <span className="spinner" style={{ width: '12px', height: '12px', borderWidth: '2px', borderTopColor: 'white' }}></span>
                  Syncing...
                </>
              ) : (
                <>
                  <span>🔄</span>
                  Sync
                </>
              )}
            </button>
          )}

          {/* User Menu */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="btn"
              style={{
                background: 'rgba(255,255,255,0.2)',
                border: 'none',
                color: 'white',
                fontSize: '14px',
                fontWeight: '600',
                padding: '8px 16px',
                borderRadius: '20px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <span>👤</span>
              {user?.username || 'User'}
              <span style={{ fontSize: '12px' }}>▼</span>
            </button>

            {showUserMenu && (
              <>
                <div
                  style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    zIndex: 99
                  }}
                  onClick={() => setShowUserMenu(false)}
                />
                <div style={{
                  position: 'absolute',
                  top: 'calc(100% + 8px)',
                  right: 0,
                  background: 'white',
                  borderRadius: '12px',
                  boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
                  padding: '8px',
                  minWidth: '200px',
                  zIndex: 100
                }}>
                  <div style={{
                    padding: '12px 16px',
                    borderBottom: '1px solid var(--border)',
                    fontSize: '14px',
                    fontWeight: '600',
                    color: 'var(--dark)'
                  }}>
                    {user?.username}
                  </div>
                  <div style={{
                    padding: '12px 16px',
                    fontSize: '13px',
                    color: 'var(--gray-600)',
                    borderBottom: '1px solid var(--border)'
                  }}>
                    {user?.role || 'User'}
                  </div>
                  <button
                    onClick={handleLogout}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      border: 'none',
                      background: 'transparent',
                      textAlign: 'left',
                      fontSize: '14px',
                      fontWeight: '600',
                      color: 'var(--danger)',
                      cursor: 'pointer',
                      borderRadius: '8px',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#fee2e2';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    Logout
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default TopNavigation;

