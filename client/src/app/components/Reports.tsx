import React, { useState, useMemo, useEffect } from 'react';
import { Loader2, BarChart3 } from 'lucide-react';
import { salesAPI } from '../../services/api';
import { ZohoSyncDiagnostic } from './ZohoSyncDiagnostic';

interface Transaction {
  id: string;
  date: Date;
  paymentType: 'cash' | 'credit_card' | 'debit_card' | 'zelle' | 'ach';
  subtotal: number;
  tax: number;
  fee: number;
  total: number;
  locationId: string;
}

interface ReportsProps {
  transactions: Transaction[];
  isLoading?: boolean;
  userLocationId: string;
}

export function Reports({ transactions: initialTransactions, isLoading: initialLoading, userLocationId }: ReportsProps) {
  // Calculate default dates (30 days ago to today)
  const defaultEndDate = new Date();
  const defaultStartDate = new Date();
  defaultStartDate.setDate(defaultStartDate.getDate() - 30);

  const [startDate, setStartDate] = useState(defaultStartDate.toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(defaultEndDate.toISOString().split('T')[0]);
  const [transactions, setTransactions] = useState<Transaction[]>(initialTransactions);
  const [isLoading, setIsLoading] = useState(initialLoading);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;
  const [activeTab, setActiveTab] = useState<'salesByHour' | 'transactions' | 'zoho'>('transactions');

  // Use logged-in user's location (no manual location filter)
  const locationId = userLocationId;

  const setQuickRangeDays = (days: number) => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);
    setStartDate(start.toISOString().split('T')[0]);
    setEndDate(end.toISOString().split('T')[0]);
  };

  // Load sales from API
  useEffect(() => {
    const loadSales = async () => {
      setIsLoading(true);
      try {
        const start = new Date(startDate);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);

        const response = await salesAPI.getAll({
          locationId: locationId || undefined,
          startDate: start.toISOString(),
          endDate: end.toISOString(),
        }, true);

        if (response.success && response.data?.sales) {
          // Transform API sales to Transaction format
          const transformedTransactions: Transaction[] = response.data.sales.map((sale: any) => ({
            id: String(sale.transactionId || sale.id),
            date: new Date(sale.createdAt),
            paymentType: sale.paymentType,
            subtotal: parseFloat(sale.subtotal),
            tax: parseFloat(sale.taxAmount),
            fee: parseFloat(sale.ccFee || '0'),
            total: parseFloat(sale.total),
            locationId: sale.locationId,
          }));
          setTransactions(transformedTransactions);
        }
      } catch (err) {
        console.error('Failed to load sales:', err);
      } finally {
        setIsLoading(false);
      }
    };

    if (userLocationId) {
      loadSales();
    }
  }, [startDate, endDate, userLocationId]);

  // Filter transactions based on filters
  const filteredTransactions = useMemo(() => {
    return transactions.filter(transaction => {
      const transactionDate = new Date(transaction.date);
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999); // Include full end date

      const dateMatch = transactionDate >= start && transactionDate <= end;
      return dateMatch;
    });
  }, [transactions, startDate, endDate]);

  // Reset pagination when filters/data change
  useEffect(() => {
    setCurrentPage(1);
  }, [startDate, endDate, locationId, transactions.length]);

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

  // Calculate sales by hour
  const salesByHour = useMemo(() => {
    const hourlyData = Array(13).fill(0).map((_, i) => ({ hour: i, amount: 0 }));

    filteredTransactions.forEach(transaction => {
      const hour = new Date(transaction.date).getHours();
      if (hour >= 0 && hour <= 12) {
        hourlyData[hour].amount += transaction.total;
      }
    });

    return hourlyData;
  }, [filteredTransactions]);

  const maxHourlySales = Math.max(...salesByHour.map(h => h.amount), 1);


  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-8">
      {/* Page Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 md:px-8 py-6 md:py-8">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white mb-2">
          Reports
        </h1>
        <p className="text-sm md:text-base text-gray-600 dark:text-gray-400">
          Sales analytics and transaction history
        </p>
      </div>

      <div className="px-4 md:px-8 mt-6 md:mt-8 space-y-6 md:space-y-8">
        {/* Filters Section */}
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 md:p-6 shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-end gap-4">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setQuickRangeDays(0)}
                className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm font-medium"
              >
                Today
              </button>
              <button
                onClick={() => setQuickRangeDays(7)}
                className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm font-medium"
              >
                Last 7 days
              </button>
              <button
                onClick={() => setQuickRangeDays(30)}
                className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm font-medium"
              >
                Last 30 days
              </button>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <div>
                <label htmlFor="startDate" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  From
                </label>
                <input
                  type="date"
                  id="startDate"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 dark:text-white"
                />
              </div>

              <div>
                <label htmlFor="endDate" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  To
                </label>
                <input
                  type="date"
                  id="endDate"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 dark:text-white"
                />
              </div>
            </div>
          </div>
        </div>

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

            {/* Tabs */}
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-2 shadow-sm flex gap-2">
              <button
                onClick={() => setActiveTab('salesByHour')}
                className={`flex-1 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                  activeTab === 'salesByHour'
                    ? 'bg-blue-600 text-white'
                    : 'bg-transparent text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                Sales by Hour
              </button>
              <button
                onClick={() => setActiveTab('transactions')}
                className={`flex-1 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                  activeTab === 'transactions'
                    ? 'bg-blue-600 text-white'
                    : 'bg-transparent text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                Transactions
              </button>
              <button
                onClick={() => setActiveTab('zoho')}
                className={`flex-1 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                  activeTab === 'zoho'
                    ? 'bg-blue-600 text-white'
                    : 'bg-transparent text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                Zoho Sync Status
              </button>
            </div>

            {/* Sales by Hour Tab */}
            {activeTab === 'salesByHour' && (
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 shadow-sm">
                <h2 className="font-semibold text-gray-900 dark:text-white mb-6">
                  Sales by Hour
                </h2>
                <div className="h-[250px] flex items-end justify-between gap-2">
                  {salesByHour.map(({ hour, amount }) => {
                    const heightPercentage = Math.max((amount / maxHourlySales) * 100, 2);
                    return (
                      <div
                        key={hour}
                        className="flex-1 flex flex-col items-center gap-2 group"
                      >
                        <div className="relative flex-1 flex items-end w-full">
                          <div
                            className="w-full bg-gradient-to-t from-purple-500 to-violet-400 rounded-t-md transition-all duration-200 group-hover:from-purple-600 group-hover:to-violet-500 relative"
                            style={{ height: `${heightPercentage}%` }}
                            title={`${hour}:00 - $${amount.toFixed(2)}`}
                          >
                            {/* Tooltip on hover */}
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                              {hour}:00 - ${amount.toFixed(2)}
                            </div>
                          </div>
                        </div>
                        <span className="text-xs text-gray-500 font-medium">
                          {hour}:00
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Transactions Tab */}
            {activeTab === 'transactions' && (
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <h2 className="font-semibold text-gray-900 dark:text-white">
                  Transactions
                </h2>
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
            )}

            {/* Zoho Sync Status Tab */}
            {activeTab === 'zoho' && (
              // <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-8 shadow-sm">
              //   <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
              //     Zoho Sync Status
              //   </h2>
              // </div>
              
              <ZohoSyncDiagnostic />
            )}
          </>
        )}
      </div>
    </div>
  );
}