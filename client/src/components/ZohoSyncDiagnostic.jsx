import React, { useState, useEffect } from 'react';
import { salesAPI } from '../services/api';
import { showToast } from './ToastContainer';

const ZohoSyncDiagnostic = () => {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [retrying, setRetrying] = useState(null);

  const loadStatus = async () => {
    setLoading(true);
    try {
      const response = await salesAPI.getSyncStatus(20);
      setStatus(response.data.data);
    } catch (err) {
      showToast('Failed to load sync status', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const handleRetry = async (saleId) => {
    setRetrying(saleId);
    try {
      const response = await salesAPI.retryZohoSync(saleId);
      showToast(`✅ Synced to Zoho: ${response.data.data.salesReceiptNumber}`, 'success');
      await loadStatus();
    } catch (err) {
      const errorMsg = err.response?.data?.message || err.message || 'Sync failed';
      showToast(`❌ ${errorMsg}`, 'error');
    } finally {
      setRetrying(null);
    }
  };

  if (loading && !status) {
    return <div className="card">Loading sync status...</div>;
  }

  if (!status) {
    return <div className="card">No sync data available</div>;
  }

  return (
    <div className="card">
      <div className="flex-between mb-3">
        <h2 style={{ fontSize: '20px', fontWeight: 'bold' }}>Zoho Sync Status</h2>
        <button onClick={loadStatus} className="btn btn-secondary" disabled={loading}>
          {loading ? 'Loading...' : '🔄 Refresh'}
        </button>
      </div>

      {status.summary && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: '12px',
          marginBottom: '24px'
        }}>
          <div style={{ padding: '16px', background: '#f3f4f6', borderRadius: '8px' }}>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#1f2937' }}>
              {status.summary.total}
            </div>
            <div style={{ fontSize: '14px', color: '#6b7280' }}>Total Sales</div>
          </div>
          <div style={{ padding: '16px', background: '#d1fae5', borderRadius: '8px' }}>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#059669' }}>
              {status.summary.synced}
            </div>
            <div style={{ fontSize: '14px', color: '#059669' }}>Synced</div>
          </div>
          <div style={{ padding: '16px', background: '#fee2e2', borderRadius: '8px' }}>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#dc2626' }}>
              {status.summary.failed}
            </div>
            <div style={{ fontSize: '14px', color: '#dc2626' }}>Failed</div>
          </div>
          <div style={{ padding: '16px', background: '#fef3c7', borderRadius: '8px' }}>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#d97706' }}>
              {status.summary.noZohoId}
            </div>
            <div style={{ fontSize: '14px', color: '#d97706' }}>No Zoho ID</div>
          </div>
        </div>
      )}

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f3f4f6', borderBottom: '2px solid #e5e7eb' }}>
              <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px', fontWeight: '600' }}>Sale ID</th>
              <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px', fontWeight: '600' }}>Customer</th>
              <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px', fontWeight: '600' }}>Total</th>
              <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px', fontWeight: '600' }}>Status</th>
              <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px', fontWeight: '600' }}>Error</th>
              <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px', fontWeight: '600' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {status.sales.map((sale) => (
              <tr key={sale.saleId} style={{ borderBottom: '1px solid #e5e7eb' }}>
                <td style={{ padding: '12px', fontSize: '14px' }}>#{sale.saleId}</td>
                <td style={{ padding: '12px', fontSize: '14px' }}>
                  {sale.customer ? (
                    <div>
                      <div>{sale.customer.name}</div>
                      <div style={{ fontSize: '12px', color: '#6b7280' }}>
                        {sale.customer.hasZohoId ? '✅ Has Zoho ID' : '❌ No Zoho ID'}
                      </div>
                    </div>
                  ) : (
                    <span style={{ color: '#9ca3af' }}>No customer</span>
                  )}
                </td>
                <td style={{ padding: '12px', fontSize: '14px' }}>${sale.total}</td>
                <td style={{ padding: '12px', fontSize: '14px' }}>
                  {sale.syncedToZoho ? (
                    <span style={{ color: '#059669', fontWeight: '600' }}>✅ Synced</span>
                  ) : (
                    <span style={{ color: '#dc2626', fontWeight: '600' }}>❌ Not Synced</span>
                  )}
                </td>
                <td style={{ padding: '12px', fontSize: '12px', color: '#dc2626', maxWidth: '200px' }}>
                  {sale.syncError ? (
                    <div style={{ wordBreak: 'break-word' }}>{sale.syncError}</div>
                  ) : sale.syncedToZoho ? (
                    <span style={{ color: '#059669' }}>POS-{sale.saleId}</span>
                  ) : (
                    <span style={{ color: '#9ca3af' }}>-</span>
                  )}
                </td>
                <td style={{ padding: '12px' }}>
                  {!sale.syncedToZoho && sale.customer && sale.customer.hasZohoId && (
                    <button
                      onClick={() => handleRetry(sale.saleId)}
                      disabled={retrying === sale.saleId}
                      className="btn btn-secondary"
                      style={{ padding: '6px 12px', fontSize: '12px' }}
                    >
                      {retrying === sale.saleId ? 'Syncing...' : '🔄 Retry'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {status.sales.length === 0 && (
        <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>
          No sales found
        </div>
      )}
    </div>
  );
};

export default ZohoSyncDiagnostic;

