import React, { useState, useEffect } from 'react';
import { zohoAPI, printerAPI } from '../services/api';
import TopNavigation from '../components/TopNavigation';
import { showToast } from '../components/ToastContainer';
import { useAuth } from '../context/AuthContext';
import DatabaseSettings from '../components/DatabaseSettings';
import ZohoSyncDiagnostic from '../components/ZohoSyncDiagnostic';

const Settings = () => {
  const { user } = useAuth();
  const [printerStatus, setPrinterStatus] = useState('checking');
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState(null);
  const [syncResult, setSyncResult] = useState(null);
  const [testingPrinter, setTestingPrinter] = useState(false);

  useEffect(() => {
    checkPrinterStatus();
    loadLastSync();
  }, []);

  const checkPrinterStatus = async () => {
    try {
      const response = await printerAPI.test();
      if (response.data.success) {
        setPrinterStatus('online');
      } else {
        setPrinterStatus('offline');
      }
    } catch (error) {
      setPrinterStatus('offline');
    }
  };

  const loadLastSync = () => {
    const lastSyncTime = localStorage.getItem('lastZohoSync');
    if (lastSyncTime) {
      setLastSync(new Date(lastSyncTime));
    }
  };

  const handleSyncNow = async () => {
    if (syncing) return;

    setSyncing(true);
    setSyncResult(null);

    try {
      const response = await zohoAPI.syncAll();
      const syncData = response.data.data || response.data;
      
      const itemsTotal = syncData.items?.total || syncData.items?.length || 0;
      const customersTotal = syncData.customers?.total || syncData.customers?.length || 0;
      
      setSyncResult({
        success: true,
        items: itemsTotal,
        customers: customersTotal
      });

      localStorage.setItem('lastZohoSync', new Date().toISOString());
      setLastSync(new Date());

      showToast(
        `Sync completed: ${itemsTotal} items, ${customersTotal} customers`,
        'success',
        5000
      );
    } catch (error) {
      const errorMsg = error.formattedMessage || error.response?.data?.message || 'Sync failed';
      setSyncResult({
        success: false,
        error: errorMsg
      });
      showToast(errorMsg, 'error', 5000);
    } finally {
      setSyncing(false);
    }
  };

  const handleTestPrint = async () => {
    setTestingPrinter(true);
    try {
      const response = await printerAPI.test();
      if (response.data.success) {
        showToast('Printer test successful. Check your printer.', 'success', 4000);
        setPrinterStatus('online');
      } else {
        showToast('Printer test failed. Check connection.', 'error', 4000);
        setPrinterStatus('offline');
      }
    } catch (error) {
      showToast('Printer test failed. Check connection.', 'error', 4000);
      setPrinterStatus('offline');
    } finally {
      setTestingPrinter(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--light-gray)' }}>
      <TopNavigation 
        printerStatus={printerStatus} 
        syncStatus={syncing ? 'syncing' : null}
        onSyncNow={handleSyncNow}
      />

      <div className="container">
        <div style={{ marginBottom: '24px' }}>
          <h1 style={{ 
            fontSize: '36px', 
            fontWeight: '800', 
            marginBottom: '8px',
            color: 'var(--dark)'
          }}>
            Settings
          </h1>
          <p style={{ fontSize: '16px', color: 'var(--gray-600)' }}>
            Configure printer, payment gateway, and sync settings
          </p>
        </div>

        {/* Printer Settings */}
        <div className="card mb-3">
          <h2 style={{ fontSize: '24px', fontWeight: '800', marginBottom: '20px', color: 'var(--dark)' }}>
            Printer Settings
          </h2>
          
          <div style={{ marginBottom: '20px' }}>
            <p style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px', color: 'var(--dark)' }}>
              Printer Status
            </p>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '12px',
              padding: '12px 20px',
              borderRadius: '12px',
              background: printerStatus === 'online' ? '#d1fae5' : '#fee2e2',
              border: `2px solid ${printerStatus === 'online' ? 'var(--success)' : 'var(--danger)'}`
            }}>
              <span style={{ fontSize: '24px' }}>
                {printerStatus === 'online' ? '🟢' : printerStatus === 'checking' ? '🟡' : '🔴'}
              </span>
              <span style={{ 
                fontSize: '16px', 
                fontWeight: '700',
                color: printerStatus === 'online' ? '#065f46' : 'var(--danger)'
              }}>
                Printer {printerStatus === 'online' ? 'Online' : printerStatus === 'checking' ? 'Checking...' : 'Offline'}
              </span>
            </div>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <p style={{ fontSize: '14px', color: 'var(--gray-600)', marginBottom: '12px' }}>
              Configure your WiFi receipt printer for this location. The printer should be on the same network
              and accessible via IP address (default port 9100).
            </p>
            <p style={{ fontSize: '14px', color: 'var(--gray-600)', fontWeight: '600' }}>
              Location: {user?.locationId || 'N/A'}
            </p>
          </div>

          <button
            onClick={handleTestPrint}
            disabled={testingPrinter}
            className="btn btn-secondary"
            style={{
              fontSize: '16px',
              fontWeight: '700',
              padding: '14px 24px'
            }}
          >
            {testingPrinter ? (
              <>
                <span className="spinner" style={{ width: '20px', height: '20px', borderWidth: '3px', borderTopColor: 'white' }}></span>
                Testing...
              </>
            ) : (
              <>
                🖨️ Test Print
              </>
            )}
          </button>
        </div>

        {/* Payment Gateway Settings */}
        <div className="card mb-3">
          <h2 style={{ fontSize: '24px', fontWeight: '800', marginBottom: '20px', color: 'var(--dark)' }}>
            Payment Gateway
          </h2>
          
          <div style={{ marginBottom: '20px' }}>
            <p style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px', color: 'var(--dark)' }}>
              Authorize.Net Configuration
            </p>
            <p style={{ fontSize: '14px', color: 'var(--gray-600)', marginBottom: '16px' }}>
              Payment gateway is configured on the backend. Card and mobile payments will be processed
              through Authorize.Net with a 3% processing fee.
            </p>
            <div style={{
              padding: '16px',
              background: 'var(--gray-50)',
              borderRadius: '12px',
              border: '1px solid var(--border)'
            }}>
              <p style={{ fontSize: '14px', fontWeight: '600', color: 'var(--dark)', marginBottom: '8px' }}>
                Payment Processing Fees:
              </p>
              <ul style={{ fontSize: '14px', color: 'var(--gray-600)', marginLeft: '20px' }}>
                <li>Credit Card: 3% fee</li>
              </ul>
            </div>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <p style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px', color: 'var(--dark)' }}>
              PAX Terminal Support
            </p>
            <p style={{ fontSize: '14px', color: 'var(--gray-600)', marginBottom: '16px' }}>
              PAX terminal integration is available. Configure terminal IP address during payment
              processing to use the physical terminal for card payments.
            </p>
          </div>
        </div>

        {/* Zoho Sync Settings */}
        <div className="card mb-3">
          <h2 style={{ fontSize: '24px', fontWeight: '800', marginBottom: '20px', color: 'var(--dark)' }}>
            Zoho Books Sync
          </h2>
          
          <div style={{ marginBottom: '20px' }}>
            <p style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px', color: 'var(--dark)' }}>
              Last Sync
            </p>
            {lastSync ? (
              <p style={{ fontSize: '14px', color: 'var(--gray-600)', marginBottom: '16px' }}>
                {lastSync.toLocaleString()}
              </p>
            ) : (
              <p style={{ fontSize: '14px', color: 'var(--gray-600)', marginBottom: '16px' }}>
                Never synced
              </p>
            )}

            {syncResult && (
              <div style={{
                padding: '16px',
                borderRadius: '12px',
                marginBottom: '16px',
                background: syncResult.success ? '#d1fae5' : '#fee2e2',
                border: `1px solid ${syncResult.success ? 'var(--success)' : 'var(--danger)'}`
              }}>
                {syncResult.success ? (
                  <div>
                    <p style={{ 
                      fontSize: '16px', 
                      fontWeight: '700', 
                      color: '#065f46',
                      marginBottom: '8px'
                    }}>
                      ✅ Sync Completed
                    </p>
                    <p style={{ fontSize: '14px', color: '#065f46' }}>
                      Items: {syncResult.items}, Customers: {syncResult.customers}
                    </p>
                  </div>
                ) : (
                  <div>
                    <p style={{ 
                      fontSize: '16px', 
                      fontWeight: '700', 
                      color: 'var(--danger)',
                      marginBottom: '8px'
                    }}>
                      ❌ Sync Failed
                    </p>
                    <p style={{ fontSize: '14px', color: 'var(--danger)' }}>
                      {syncResult.error}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          <div style={{ marginBottom: '20px' }}>
            <p style={{ fontSize: '14px', color: 'var(--gray-600)', marginBottom: '16px' }}>
              Sync items and customers from Zoho Books. This is a one-way sync (Zoho → POS).
              Sales are automatically pushed to Zoho Books as Sales Receipts.
            </p>
            <p style={{ fontSize: '14px', color: 'var(--gray-600)', fontWeight: '600' }}>
              Automatic background sync is disabled; use Sync Now when needed.
            </p>
          </div>

          <button
            onClick={handleSyncNow}
            disabled={syncing}
            className="btn btn-primary"
            style={{
              fontSize: '16px',
              fontWeight: '700',
              padding: '14px 24px'
            }}
          >
            {syncing ? (
              <>
                <span className="spinner" style={{ width: '20px', height: '20px', borderWidth: '3px', borderTopColor: 'white' }}></span>
                Syncing...
              </>
            ) : (
              <>
                🔄 Sync Now
              </>
            )}
          </button>
        </div>

        {/* Database Settings */}
        <div className="card mb-3">
          <h2 style={{ fontSize: '24px', fontWeight: '800', marginBottom: '20px', color: 'var(--dark)' }}>
            Database Configuration
          </h2>
          <DatabaseSettings />
        </div>

        {/* Zoho Sync Diagnostic */}
        <div className="mb-3">
          <ZohoSyncDiagnostic />
        </div>

        {/* System Information */}
        <div className="card">
          <h2 style={{ fontSize: '24px', fontWeight: '800', marginBottom: '20px', color: 'var(--dark)' }}>
            System Information
          </h2>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <p style={{ fontSize: '14px', color: 'var(--gray-600)', marginBottom: '4px', fontWeight: '600' }}>
                Location
              </p>
              <p style={{ fontSize: '16px', fontWeight: '700', color: 'var(--dark)' }}>
                {user?.locationId || 'N/A'} - {user?.locationName || 'N/A'}
              </p>
            </div>
            <div>
              <p style={{ fontSize: '14px', color: 'var(--gray-600)', marginBottom: '4px', fontWeight: '600' }}>
                User
              </p>
              <p style={{ fontSize: '16px', fontWeight: '700', color: 'var(--dark)' }}>
                {user?.username || 'N/A'} ({user?.role || 'N/A'})
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;

