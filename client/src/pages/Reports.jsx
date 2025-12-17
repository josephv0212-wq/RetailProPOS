import React, { useState, useEffect } from 'react';
import { salesAPI } from '../services/api';
import TopNavigation from '../components/TopNavigation';
import { showToast } from '../components/ToastContainer';
import { useAuth } from '../context/AuthContext';

const Reports = () => {
  const { user } = useAuth();
  const [sales, setSales] = useState([]);
  const [filteredSales, setFilteredSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    locationId: user?.locationId || '',
    paymentType: ''
  });
  const [printerStatus, setPrinterStatus] = useState('unknown');

  useEffect(() => {
    loadSales();
  }, [filters, user?.locationId]);

  const loadSales = async () => {
    try {
      setLoading(true);
      const params = {
        locationId: filters.locationId || user?.locationId,
        startDate: filters.startDate,
        endDate: filters.endDate
      };
      if (filters.paymentType) {
        params.paymentType = filters.paymentType;
      }

      const response = await salesAPI.getAll(params);
      const salesList = response.data.data?.sales || response.data.sales || [];
      setSales(salesList);
      setFilteredSales(salesList);
    } catch (error) {
      showToast('Failed to load sales data', 'error', 3000);
    } finally {
      setLoading(false);
    }
  };

  const handleSyncNow = async () => {
    showToast('Sync initiated', 'info', 2000);
  };

  // Calculate KPIs
  const totalSales = filteredSales.reduce((sum, sale) => sum + parseFloat(sale.total || 0), 0);
  const totalTax = filteredSales.reduce((sum, sale) => sum + parseFloat(sale.taxAmount || 0), 0);
  const totalFees = filteredSales.reduce((sum, sale) => sum + parseFloat(sale.ccFee || 0), 0);
  const transactionCount = filteredSales.length;

  // Sales by hour (simple chart data) - only show 0:00 to 11:00
  const salesByHour = Array.from({ length: 13 }, (_, i) => ({
    hour: i,
    amount: filteredSales
      .filter(sale => {
        const hour = new Date(sale.createdAt).getHours();
        return hour === i;
      })
      .reduce((sum, sale) => sum + parseFloat(sale.total || 0), 0)
  }));

  const maxHourAmount = Math.max(...salesByHour.map(h => h.amount), 1);

  // Payment type breakdown
  const paymentTypes = {
    credit_card: filteredSales.filter(s => s.paymentType === 'credit_card').length,
    debit_card: filteredSales.filter(s => s.paymentType === 'debit_card').length
  };

  const totalPaymentTransactions = Object.values(paymentTypes).reduce((sum, val) => sum + val, 0);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--light-gray)' }}>
      <TopNavigation 
        printerStatus={printerStatus} 
        syncStatus={null}
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
            Reports
          </h1>
          <p style={{ fontSize: '16px', color: 'var(--gray-600)' }}>
            Sales analytics and transaction history
          </p>
        </div>

        {/* Filters */}
        <div className="card mb-3">
          <h3 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '16px', color: 'var(--dark)' }}>
            Filters
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
            <div>
              <label style={{ 
                display: 'block', 
                marginBottom: '8px', 
                fontWeight: '600',
                fontSize: '14px',
                color: 'var(--dark)'
              }}>
                Start Date
              </label>
              <input
                type="date"
                className="input"
                value={filters.startDate}
                onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
              />
            </div>
            <div>
              <label style={{ 
                display: 'block', 
                marginBottom: '8px', 
                fontWeight: '600',
                fontSize: '14px',
                color: 'var(--dark)'
              }}>
                End Date
              </label>
              <input
                type="date"
                className="input"
                value={filters.endDate}
                onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
              />
            </div>
            <div>
              <label style={{ 
                display: 'block', 
                marginBottom: '8px', 
                fontWeight: '600',
                fontSize: '14px',
                color: 'var(--dark)'
              }}>
                Payment Type
              </label>
              <select
                className="input"
                value={filters.paymentType}
                onChange={(e) => setFilters({ ...filters, paymentType: e.target.value })}
              >
                <option value="">All</option>
                <option value="credit_card">Credit Card</option>
                <option value="debit_card">Debit Card</option>
              </select>
            </div>
            <div>
              <label style={{ 
                display: 'block', 
                marginBottom: '8px', 
                fontWeight: '600',
                fontSize: '14px',
                color: 'var(--dark)'
              }}>
                Location
              </label>
              <input
                type="text"
                className="input"
                value={filters.locationId || user?.locationId || ''}
                onChange={(e) => setFilters({ ...filters, locationId: e.target.value })}
                placeholder="Location ID"
              />
            </div>
          </div>
        </div>

        {loading ? (
          <div className="loading">
            <div className="spinner"></div>
          </div>
        ) : (
          <>
            {/* KPI Cards */}
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', 
              gap: '20px',
              marginBottom: '32px'
            }}>
              <div className="card" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white' }}>
                <p style={{ fontSize: '14px', opacity: 0.9, marginBottom: '8px', fontWeight: '600' }}>
                  Total Sales
                </p>
                <p style={{ fontSize: '32px', fontWeight: '800' }}>
                  ${totalSales.toFixed(2)}
                </p>
              </div>
              <div className="card" style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', color: 'white' }}>
                <p style={{ fontSize: '14px', opacity: 0.9, marginBottom: '8px', fontWeight: '600' }}>
                  Total Tax (7.5%)
                </p>
                <p style={{ fontSize: '32px', fontWeight: '800' }}>
                  ${totalTax.toFixed(2)}
                </p>
              </div>
              <div className="card" style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', color: 'white' }}>
                <p style={{ fontSize: '14px', opacity: 0.9, marginBottom: '8px', fontWeight: '600' }}>
                  Total Fees (3%)
                </p>
                <p style={{ fontSize: '32px', fontWeight: '800' }}>
                  ${totalFees.toFixed(2)}
                </p>
              </div>
              <div className="card" style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)', color: 'white' }}>
                <p style={{ fontSize: '14px', opacity: 0.9, marginBottom: '8px', fontWeight: '600' }}>
                  Transactions
                </p>
                <p style={{ fontSize: '32px', fontWeight: '800' }}>
                  {transactionCount}
                </p>
              </div>
            </div>

            {/* Charts */}
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', 
              gap: '24px',
              marginBottom: '32px'
            }}>
              {/* Sales by Hour - Bar Chart */}
              <div className="card">
                <h3 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '20px', color: 'var(--dark)' }}>
                  Sales by Hour
                </h3>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', height: '250px', paddingBottom: '20px' }}>
                  {salesByHour.map((hourData, index) => (
                    <div
                      key={index}
                      style={{
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '8px'
                      }}
                    >
                      <div
                        style={{
                          width: '100%',
                          height: `${(hourData.amount / maxHourAmount) * 200}px`,
                          background: 'linear-gradient(to top, #667eea, #764ba2)',
                          borderRadius: '8px 8px 0 0',
                          minHeight: '4px',
                          transition: 'all 0.3s'
                        }}
                        title={`${hourData.hour}:00 - $${hourData.amount.toFixed(2)}`}
                      />
                      <span style={{ fontSize: '12px', color: 'var(--gray-600)', fontWeight: '600' }}>
                        {hourData.hour}:00
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Payment Type Split - Donut Chart */}
              <div className="card">
                <h3 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '20px', color: 'var(--dark)' }}>
                  Payment Type Split
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {Object.entries(paymentTypes).map(([type, count]) => {
                    const percentage = totalPaymentTransactions > 0 
                      ? ((count / totalPaymentTransactions) * 100).toFixed(1) 
                      : 0;
                    const displayName = type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
                    const colors = {
                      credit_card: '#667eea',
                      debit_card: '#3b82f6'
                    };

                    return (
                      <div key={type} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div
                          style={{
                            width: '60px',
                            height: '60px',
                            borderRadius: '50%',
                            background: `conic-gradient(${colors[type] || '#6b7280'} ${percentage * 3.6}deg, var(--gray-200) ${percentage * 3.6}deg)`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '12px',
                            fontWeight: '700',
                            color: 'white'
                          }}
                        >
                          {percentage}%
                        </div>
                        <div style={{ flex: 1 }}>
                          <p style={{ fontSize: '16px', fontWeight: '700', color: 'var(--dark)', marginBottom: '4px' }}>
                            {displayName}
                          </p>
                          <p style={{ fontSize: '14px', color: 'var(--gray-600)' }}>
                            {count} transactions
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Transactions Table */}
            <div className="card">
              <h3 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '20px', color: 'var(--dark)' }}>
                Transactions
              </h3>
              {filteredSales.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--gray-600)' }}>
                  <div style={{ fontSize: '64px', marginBottom: '20px' }}>📊</div>
                  <p style={{ fontSize: '20px', fontWeight: '700', marginBottom: '8px', color: 'var(--dark)' }}>
                    No transactions found
                  </p>
                  <p style={{ fontSize: '15px', color: 'var(--gray-500)' }}>
                    Adjust your filters to see transactions
                  </p>
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid var(--border)' }}>
                        <th style={{ padding: '12px', textAlign: 'left', fontWeight: '700', color: 'var(--dark)' }}>ID</th>
                        <th style={{ padding: '12px', textAlign: 'left', fontWeight: '700', color: 'var(--dark)' }}>Date</th>
                        <th style={{ padding: '12px', textAlign: 'left', fontWeight: '700', color: 'var(--dark)' }}>Payment</th>
                        <th style={{ padding: '12px', textAlign: 'right', fontWeight: '700', color: 'var(--dark)' }}>Subtotal</th>
                        <th style={{ padding: '12px', textAlign: 'right', fontWeight: '700', color: 'var(--dark)' }}>Tax</th>
                        <th style={{ padding: '12px', textAlign: 'right', fontWeight: '700', color: 'var(--dark)' }}>Fee</th>
                        <th style={{ padding: '12px', textAlign: 'right', fontWeight: '700', color: 'var(--dark)' }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredSales.map((sale) => (
                        <tr key={sale.id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '12px', fontWeight: '600', color: 'var(--dark)' }}>
                            POS-{sale.id}
                          </td>
                          <td style={{ padding: '12px', color: 'var(--gray-600)' }}>
                            {new Date(sale.createdAt).toLocaleString()}
                          </td>
                          <td style={{ padding: '12px' }}>
                            <span className="badge badge-info">
                              {sale.paymentType.replace('_', ' ').toUpperCase()}
                            </span>
                          </td>
                          <td style={{ padding: '12px', textAlign: 'right', fontWeight: '600', color: 'var(--dark)' }}>
                            ${parseFloat(sale.subtotal || 0).toFixed(2)}
                          </td>
                          <td style={{ padding: '12px', textAlign: 'right', color: 'var(--gray-600)' }}>
                            ${parseFloat(sale.taxAmount || 0).toFixed(2)}
                          </td>
                          <td style={{ padding: '12px', textAlign: 'right', color: 'var(--warning)' }}>
                            ${parseFloat(sale.ccFee || 0).toFixed(2)}
                          </td>
                          <td style={{ padding: '12px', textAlign: 'right', fontWeight: '800', color: 'var(--primary)' }}>
                            ${parseFloat(sale.total || 0).toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Reports;

