import React, { useState, useEffect } from 'react';
import { salesAPI } from '../../services/api';
import { useToast } from '../contexts/ToastContext';
import { logger } from '../../utils/logger';
import { RefreshCw, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';

interface SyncStatus {
  summary: {
    total: number;
    synced: number;
    failed: number;
    noZohoId: number;
  };
  sales: Array<{
    saleId: number;
    total: number;
    syncedToZoho: boolean;
    syncError?: string;
    customer?: {
      name: string;
      hasZohoId: boolean;
    };
    salesReceiptNumber?: string;
  }>;
}

export function ZohoSyncDiagnostic() {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [retrying, setRetrying] = useState<number | null>(null);
  const { showToast } = useToast();

  const loadStatus = async () => {
    setLoading(true);
    try {
      const response = await salesAPI.getSyncStatus(20);
      if (response.success && response.data) {
        setStatus(response.data);
      } else {
        showToast('Failed to load sync status', 'error');
      }
    } catch (err: any) {
      showToast('Failed to load sync status', 'error');
      logger.error('Sync status error', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const handleRetry = async (saleId: number) => {
    setRetrying(saleId);
    try {
      const response = await salesAPI.retryZohoSync(saleId);
      if (response.success && response.data) {
        showToast(`✅ Synced to Zoho: ${response.data.salesReceiptNumber || saleId}`, 'success');
        await loadStatus();
      } else {
        showToast('Sync retry failed', 'error');
      }
    } catch (err: any) {
      const errorMsg = err.response?.data?.message || err.message || 'Sync failed';
      showToast(`❌ ${errorMsg}`, 'error');
    } finally {
      setRetrying(null);
    }
  };

  if (loading && !status) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <div className="text-center text-gray-500 dark:text-gray-400">Loading sync status...</div>
      </div>
    );
  }

  if (!status) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <div className="text-center text-gray-500 dark:text-gray-400">No sync data available</div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Zoho Sync Status</h2>
        <button
          onClick={loadStatus}
          disabled={loading}
          className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {status.summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {status.summary.total}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Total Sales</div>
          </div>
          <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">
              {status.summary.synced}
            </div>
            <div className="text-sm text-green-700 dark:text-green-300">Synced</div>
          </div>
          <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
            <div className="text-2xl font-bold text-red-600 dark:text-red-400">
              {status.summary.failed}
            </div>
            <div className="text-sm text-red-700 dark:text-red-300">Failed</div>
          </div>
          <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
            <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
              {status.summary.noZohoId}
            </div>
            <div className="text-sm text-yellow-700 dark:text-yellow-300">No Zoho ID</div>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-700 border-b-2 border-gray-200 dark:border-gray-600">
              <th className="p-3 text-left text-sm font-semibold text-gray-900 dark:text-white">Sale ID</th>
              <th className="p-3 text-left text-sm font-semibold text-gray-900 dark:text-white">Customer</th>
              <th className="p-3 text-left text-sm font-semibold text-gray-900 dark:text-white">Total</th>
              <th className="p-3 text-left text-sm font-semibold text-gray-900 dark:text-white">Status</th>
              <th className="p-3 text-left text-sm font-semibold text-gray-900 dark:text-white">Error</th>
              <th className="p-3 text-left text-sm font-semibold text-gray-900 dark:text-white">Action</th>
            </tr>
          </thead>
          <tbody>
            {status.sales.map((sale) => (
              <tr key={sale.saleId} className="border-b border-gray-200 dark:border-gray-700">
                <td className="p-3 text-sm text-gray-900 dark:text-white">#{sale.saleId}</td>
                <td className="p-3 text-sm">
                  {sale.customer ? (
                    <div>
                      <div className="text-gray-900 dark:text-white">{sale.customer.name}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1 mt-1">
                        {sale.customer.hasZohoId ? (
                          <>
                            <CheckCircle2 className="w-3 h-3 text-green-500" />
                            Has Zoho ID
                          </>
                        ) : (
                          <>
                            <XCircle className="w-3 h-3 text-red-500" />
                            No Zoho ID
                          </>
                        )}
                      </div>
                    </div>
                  ) : (
                    <span className="text-gray-400 dark:text-gray-500">No customer</span>
                  )}
                </td>
                <td className="p-3 text-sm text-gray-900 dark:text-white">${sale.total.toFixed(2)}</td>
                <td className="p-3 text-sm">
                  {sale.syncedToZoho ? (
                    <span className="text-green-600 dark:text-green-400 font-semibold flex items-center gap-1">
                      <CheckCircle2 className="w-4 h-4" />
                      Synced
                    </span>
                  ) : (
                    <span className="text-red-600 dark:text-red-400 font-semibold flex items-center gap-1">
                      <XCircle className="w-4 h-4" />
                      Not Synced
                    </span>
                  )}
                </td>
                <td className="p-3 text-xs text-red-600 dark:text-red-400 max-w-xs break-words">
                  {sale.syncError ? (
                    <div>{sale.syncError}</div>
                  ) : sale.syncedToZoho ? (
                    <span className="text-green-600 dark:text-green-400">POS-{sale.saleId}</span>
                  ) : (
                    <span className="text-gray-400 dark:text-gray-500">-</span>
                  )}
                </td>
                <td className="p-3">
                  {!sale.syncedToZoho && sale.customer && sale.customer.hasZohoId && (
                    <button
                      onClick={() => handleRetry(sale.saleId)}
                      disabled={retrying === sale.saleId}
                      className="px-3 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors disabled:opacity-50 text-xs flex items-center gap-1"
                    >
                      <RefreshCw className={`w-3 h-3 ${retrying === sale.saleId ? 'animate-spin' : ''}`} />
                      {retrying === sale.saleId ? 'Syncing...' : 'Retry'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {status.sales.length === 0 && (
        <div className="p-10 text-center text-gray-500 dark:text-gray-400">
          No sales found
        </div>
      )}
    </div>
  );
}
