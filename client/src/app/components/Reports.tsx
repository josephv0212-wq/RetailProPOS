import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Loader2, BarChart3, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';
import { salesAPI } from '../../services/api';
import { useToast } from '../contexts/ToastContext';

interface Transaction {
  id: string;
  saleId?: number;
  date: Date;
  paymentType: 'cash' | 'credit_card' | 'debit_card' | 'zelle' | 'ach';
  subtotal: number;
  tax: number;
  fee: number;
  total: number;
  locationId: string;
  syncedToZoho?: boolean;
  zohoSalesReceiptId?: string | null;
  cancelledInZoho?: boolean;
}

interface ReportsProps {
  transactions: Transaction[];
  isLoading?: boolean;
  userLocationId: string;
}

export function Reports({ transactions: initialTransactions, isLoading: initialLoading, userLocationId }: ReportsProps) {
  const { showToast } = useToast();
  // Calculate default dates (30 days ago to today)
  const defaultEndDate = new Date();
  const defaultStartDate = new Date();
  defaultStartDate.setDate(defaultStartDate.getDate() - 30);

  const [startDate, setStartDate] = useState(defaultStartDate.toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(defaultEndDate.toISOString().split('T')[0]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;
  const [cancellingSaleId, setCancellingSaleId] = useState<number | null>(null);
  const [syncStatus, setSyncStatus] = useState<any>(null);
  const [loadingSyncStatus, setLoadingSyncStatus] = useState(false);

  // Use logged-in user's location (no manual location filter)
  const locationId = userLocationId;

  const setQuickRangeDays = (days: number) => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);
    setStartDate(start.toISOString().split('T')[0]);
    setEndDate(end.toISOString().split('T')[0]);
  };

  // Load transactions from transactions table - extracted to a reusable function
  const loadSales = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    try {
      // Fetch from transactions table directly without date filters
      const response = await salesAPI.getTransactions();

      if (response.success && response.data?.transactions) {
        // Transactions are already in the correct format from the backend
        setTransactions(response.data.transactions);
      } else {
        // If no transactions returned, set empty array
        setTransactions([]);
      }
    } catch (err) {
      logger.error('Failed to load transactions', err);
      showToast('Failed to load transactions from database', 'error', 3000);
    } finally {
      if (showRefreshing) {
        setIsRefreshing(false);
      } else {
        setIsLoading(false);
      }
    }
  }, [showToast]);

  // Load sync status
  const loadSyncStatus = useCallback(async () => {
    setLoadingSyncStatus(true);
    try {
      const response = await salesAPI.getSyncStatus(20);
      if (response.success && response.data) {
        setSyncStatus(response.data);
      }
    } catch (err) {
      console.error('Failed to load sync status:', err);
    } finally {
      setLoadingSyncStatus(false);
    }
  }, []);

  // Load sales on mount and when filters change
  useEffect(() => {
    loadSales();
    loadSyncStatus();
  }, [loadSales, loadSyncStatus]);

  // Auto-refresh transactions every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      loadSales(true); // Silent refresh
      loadSyncStatus(); // Also refresh sync status
    }, 30000); // 30 seconds

    return () => clearInterval(interval);
  }, [loadSales, loadSyncStatus]);

  const handleCancelZohoTransaction = async (saleId: number) => {
    if (!window.confirm('Are you sure you want to cancel this transaction in Zoho? This action cannot be undone.')) {
      return;
    }

    setCancellingSaleId(saleId);
    try {
      const response = await salesAPI.cancelZohoTransaction(saleId);
      
      if (response.success) {
        showToast('Transaction cancelled successfully in Zoho', 'success', 4000);
        // Reload sales to update the UI using the loadSales function
        await loadSales(true);
      } else {
        showToast(response.message || 'Failed to cancel transaction in Zoho', 'error', 4000);
      }
    } catch (error: any) {
      logger.error('Failed to cancel Zoho transaction', error);
      showToast(error.message || 'Failed to cancel transaction in Zoho', 'error', 4000);
    } finally {
      setCancellingSaleId(null);
    }
  };

  const handleRefresh = () => {
    loadSales(false); // Show loading state
    loadSyncStatus(); // Also refresh sync status
  };

  // No filtering - show all transactions
  const filteredTransactions = useMemo(() => {
    return transactions;
  }, [transactions]);

  // Reset pagination when data changes
  useEffect(() => {
    setCurrentPage(1);
  }, [transactions.length]);

  const totalPages = Math.max(1, Math.ceil(filteredTransactions.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const pagedTransactions = filteredTransactions.slice(startIndex, startIndex + pageSize);

  // Calculate KPIs
  const kpis = useMemo(() => {
    const totalSales = filteredTransactions.reduce((sum, t) => sum + t.total, 0);
    const totalTax = filteredTransactions.reduce((sum, t) => sum + t.tax, 0);
    const totalFees = filteredTransactions.reduce((sum, t) => sum + t.fee, 0);
    const transactionCount = filteredTransactions.length;

    return { totalSales, totalTax, totalFees, transactionCount };
  }, [filteredTransactions]);



  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-8">
      <div className="px-4 md:px-8 mt-6 md:mt-8 space-y-6 md:space-y-8">
        {isLoading ? (
          // Loading State
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="w-12 h-12 text-blue-600 animate-spin mb-4" />
            <p className="text-gray-500 dark:text-gray-400">Loading...</p>
          </div>
        ) : (
          <>
            {/* KPI Cards Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {/* Total Sales */}
              <div className="bg-gradient-to-br from-purple-500 to-violet-600 rounded-xl p-6 shadow-lg">
                <p className="text-sm text-white/70 mb-2">Total Sales</p>
                <p className="text-3xl font-bold text-white">
                  ${kpis.totalSales.toFixed(2)}
                </p>
              </div>

              {/* Total Tax */}
              <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-6 shadow-lg">
                <p className="text-sm text-white/70 mb-2">Total Tax (7.5%)</p>
                <p className="text-3xl font-bold text-white">
                  ${kpis.totalTax.toFixed(2)}
                </p>
              </div>

              {/* Total Fees */}
              <div className="bg-gradient-to-br from-orange-400 to-amber-500 rounded-xl p-6 shadow-lg">
                <p className="text-sm text-white/70 mb-2">Total Fees (3%)</p>
                <p className="text-3xl font-bold text-white">
                  ${kpis.totalFees.toFixed(2)}
                </p>
              </div>

              {/* Transactions */}
              <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-6 shadow-lg">
                <p className="text-sm text-white/70 mb-2">Transactions</p>
                <p className="text-3xl font-bold text-white">
                  {kpis.transactionCount}
                </p>
              </div>
            </div>

            {/* Zoho Sync Status Summary */}
            {syncStatus && syncStatus.summary && (
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm p-6">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Zoho Sync Status</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                    <div className="text-2xl font-bold text-gray-900 dark:text-white">
                      {syncStatus.summary.total}
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">Total Sales</div>
                  </div>
                  <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                    <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                      {syncStatus.summary.synced}
                    </div>
                    <div className="text-sm text-green-700 dark:text-green-300">Synced</div>
                  </div>
                  <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
                    <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                      {syncStatus.summary.failed}
                    </div>
                    <div className="text-sm text-red-700 dark:text-red-300">Failed</div>
                  </div>
                  <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                    <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
                      {syncStatus.summary.noZohoId}
                    </div>
                    <div className="text-sm text-yellow-700 dark:text-yellow-300">No Zoho ID</div>
                  </div>
                </div>
              </div>
            )}

            {/* Transactions Section */}
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                <h2 className="font-semibold text-gray-900 dark:text-white">
                  Transactions
                </h2>
                <button
                  onClick={handleRefresh}
                  disabled={isLoading || isRefreshing || loadingSyncStatus}
                  className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  title="Refresh transactions"
                >
                  <RefreshCw className={`w-4 h-4 ${isRefreshing || loadingSyncStatus ? 'animate-spin' : ''}`} />
                  {isRefreshing || loadingSyncStatus ? 'Refreshing...' : 'Refresh'}
                </button>
              </div>

              {filteredTransactions.length === 0 ? (
                // Empty State
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <BarChart3 className="w-16 h-16 text-gray-300 dark:text-gray-600 mb-4" />
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
                    No transactions found
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Adjust your filters to see transactions
                  </p>
                </div>
              ) : (
                // Table
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
                        <th className="px-6 py-3 text-left font-semibold text-gray-900 dark:text-white">
                          No
                        </th>
                        <th className="px-6 py-3 text-left font-semibold text-gray-900 dark:text-white">
                          ID
                        </th>
                        <th className="px-6 py-3 text-left font-semibold text-gray-900 dark:text-white">
                          Date
                        </th>
                        <th className="px-6 py-3 text-left font-semibold text-gray-900 dark:text-white">
                          Payment
                        </th>
                        <th className="px-6 py-3 text-right font-semibold text-gray-900 dark:text-white">
                          Subtotal
                        </th>
                        <th className="px-6 py-3 text-right font-semibold text-gray-900 dark:text-white">
                          Tax
                        </th>
                        <th className="px-6 py-3 text-right font-semibold text-gray-900 dark:text-white">
                          Fee
                        </th>
                        <th className="px-6 py-3 text-right font-semibold text-gray-900 dark:text-white">
                          Total
                        </th>
                        <th className="px-6 py-3 text-center font-semibold text-gray-900 dark:text-white">
                          Zoho
                        </th>
                        <th className="px-6 py-3 text-center font-semibold text-gray-900 dark:text-white">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                      {pagedTransactions.map((transaction, idx) => (
                        <tr key={transaction.id} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                          <td className="px-6 py-4 whitespace-nowrap text-gray-600 dark:text-gray-400">
                            {startIndex + idx + 1}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap font-semibold text-gray-900 dark:text-white">
                            {transaction.id}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-gray-600 dark:text-gray-400">
                            {new Date(transaction.date).toLocaleString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {(() => {
                              const type = transaction.paymentType;
                              const label =
                                type === 'cash' ? 'CASH' :
                                type === 'credit_card' ? 'CC' :
                                type === 'debit_card' ? 'DC' :
                                type === 'zelle' ? 'ZELLE' :
                                'ACH';

                              const cls =
                                type === 'cash'
                                  ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-400'
                                  : type === 'credit_card'
                                    ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-400'
                                    : type === 'debit_card'
                                      ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400'
                                      : type === 'zelle'
                                        ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-400'
                                        : 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-400';

                              return (
                                <span className={`inline-flex px-3 py-1 rounded-full text-xs font-medium uppercase tracking-wide ${cls}`}>
                                  {label}
                                </span>
                              );
                            })()}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right font-semibold text-gray-900 dark:text-white">
                            ${transaction.subtotal.toFixed(2)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-gray-600 dark:text-gray-400">
                            ${transaction.tax.toFixed(2)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-orange-600 dark:text-orange-400 font-medium">
                            ${transaction.fee.toFixed(2)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right font-bold text-blue-600 dark:text-blue-400">
                            ${transaction.total.toFixed(2)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-center">
                            {transaction.syncedToZoho && !transaction.cancelledInZoho ? (
                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400">
                                <CheckCircle2 className="w-3 h-3" />
                                Synced
                              </span>
                            ) : transaction.cancelledInZoho ? (
                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400">
                                <XCircle className="w-3 h-3" />
                                Cancelled
                              </span>
                            ) : (
                              <span className="inline-flex px-2 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
                                Not Synced
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-center">
                            {transaction.syncedToZoho && !transaction.cancelledInZoho && transaction.saleId ? (
                              <button
                                onClick={() => handleCancelZohoTransaction(transaction.saleId!)}
                                disabled={cancellingSaleId === transaction.saleId}
                                className="px-3 py-1.5 text-xs font-medium text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                              >
                                {cancellingSaleId === transaction.saleId ? (
                                  <>
                                    <Loader2 className="w-3 h-3 inline animate-spin mr-1" />
                                    Cancelling...
                                  </>
                                ) : (
                                  'Cancel in Zoho'
                                )}
                              </button>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* Pagination */}
                  <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between gap-3">
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      Showing {filteredTransactions.length === 0 ? 0 : startIndex + 1}–
                      {Math.min(startIndex + pageSize, filteredTransactions.length)} of {filteredTransactions.length}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={safePage <= 1}
                        className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                      >
                        Prev
                      </button>
                      <span className="text-sm text-gray-700 dark:text-gray-300">
                        Page {safePage} / {totalPages}
                      </span>
                      <button
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={safePage >= totalPages}
                        className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}