import React, { useState, useEffect } from 'react';
import { customersAPI } from '../services/api';
import TopNavigation from '../components/TopNavigation';
import { showToast } from '../components/ToastContainer';

const Customers = () => {
  const [customers, setCustomers] = useState([]);
  const [filteredCustomers, setFilteredCustomers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [printerStatus, setPrinterStatus] = useState('unknown');
  const headerCellStyle = {
    padding: '12px 16px',
    fontSize: '12px',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'var(--gray-500)'
  };
  const bodyCellStyle = {
    padding: '16px',
    fontSize: '14px',
    color: 'var(--gray-700)'
  };

  useEffect(() => {
    loadCustomers();
  }, []);

  useEffect(() => {
    if (searchTerm) {
      const filtered = customers.filter(customer =>
        customer.contactName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        customer.companyName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        customer.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        customer.phone?.includes(searchTerm)
      );
      setFilteredCustomers(filtered);
    } else {
      setFilteredCustomers(customers);
    }
  }, [searchTerm, customers]);

  const loadCustomers = async () => {
    try {
      setLoading(true);
      const response = await customersAPI.getAll({ isActive: true });
      const customersList = response.data.data?.customers || response.data.customers || [];
      setCustomers(customersList);
      setFilteredCustomers(customersList);
    } catch (error) {
      showToast('Failed to load customers', 'error', 3000);
    } finally {
      setLoading(false);
    }
  };

  const handleSyncNow = async () => {
    // Sync is handled by the top navigation or settings page
    showToast('Sync initiated', 'info', 2000);
  };

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
            Customers
          </h1>
          <p style={{ fontSize: '16px', color: 'var(--gray-600)' }}>
            View and search customers from Zoho Books (View Only)
          </p>
        </div>

        {/* Search Bar */}
        <div className="card mb-3">
          <div style={{ position: 'relative' }}>
            <span style={{
              position: 'absolute',
              left: '16px',
              top: '50%',
              transform: 'translateY(-50%)',
              fontSize: '20px',
              color: 'var(--gray-400)'
            }}>🔍</span>
            <input
              type="text"
              className="input"
              placeholder="Search customers by name, company, email, or phone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                fontSize: '16px',
                padding: '16px 16px 16px 48px',
                borderRadius: '12px'
              }}
            />
          </div>
        </div>

        {loading ? (
          <div className="loading">
            <div className="spinner"></div>
          </div>
        ) : (
          <div className="card">
            {filteredCustomers.length === 0 ? (
              <div style={{ 
                textAlign: 'center', 
                padding: '60px 20px', 
                color: 'var(--gray-600)'
              }}>
                <div style={{ fontSize: '64px', marginBottom: '20px' }}>👥</div>
                <p style={{ fontSize: '20px', fontWeight: '700', marginBottom: '8px', color: 'var(--dark)' }}>
                  {searchTerm ? 'No customers found' : 'No customers available'}
                </p>
                <p style={{ fontSize: '15px', color: 'var(--gray-500)' }}>
                  {searchTerm 
                    ? 'Try a different search term' 
                    : 'Sync customers from Zoho Books in Settings'}
                </p>
              </div>
            ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ 
                width: '100%', 
                borderCollapse: 'collapse', 
                background: 'white',
                minWidth: '720px'
              }}>
                <thead>
                  <tr style={{ 
                    borderBottom: '2px solid var(--border)', 
                    textAlign: 'left' 
                  }}>
                    <th style={headerCellStyle}>Contact</th>
                    <th style={headerCellStyle}>Company</th>
                    <th style={headerCellStyle}>Email</th>
                    <th style={headerCellStyle}>Phone</th>
                    <th style={headerCellStyle}>Payment Info</th>
                    <th style={headerCellStyle}>Location</th>
                    <th style={headerCellStyle}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCustomers.map(customer => {
                    const paymentInfoText = customer.last_four_digits
                      ? `${customer.cardBrand || 'Card'} •••• ${customer.last_four_digits}`
                      : customer.has_card_info
                        ? 'Card info saved'
                        : 'None';
                    return (
                      <tr
                        key={customer.id}
                        onClick={() => setSelectedCustomer(customer)}
                        style={{
                          cursor: 'pointer',
                          transition: 'background 0.2s',
                          borderBottom: '1px solid var(--border)'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'rgba(102, 126, 234, 0.08)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        <td style={bodyCellStyle}>{customer.contactName || 'N/A'}</td>
                        <td style={bodyCellStyle}>{customer.companyName || '-'}</td>
                        <td style={bodyCellStyle}>{customer.email || '-'}</td>
                        <td style={bodyCellStyle}>{customer.phone || '-'}</td>
                        <td style={bodyCellStyle}>{paymentInfoText}</td>
                        <td style={bodyCellStyle}>{customer.locationId || '-'}</td>
                        <td style={bodyCellStyle}>
                          <span className={`badge ${customer.isActive ? 'badge-success' : 'badge-danger'}`}>
                            {customer.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            )}
          </div>
        )}
      </div>

      {/* Customer Detail Drawer */}
      {selectedCustomer && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            zIndex: 1000,
            padding: '20px'
          }}
          onClick={() => setSelectedCustomer(null)}
        >
          <div
            className="card"
            style={{
              width: '100%',
              maxWidth: '500px',
              maxHeight: '90vh',
              overflowY: 'auto',
              marginLeft: 'auto'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex-between mb-3">
              <h2 style={{ fontSize: '28px', fontWeight: '800', margin: 0 }}>
                Customer Details
              </h2>
              <button
                onClick={() => setSelectedCustomer(null)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  fontSize: '32px',
                  cursor: 'pointer',
                  color: 'var(--gray)',
                  padding: '0',
                  width: '40px',
                  height: '40px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '8px',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--gray-100)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                ×
              </button>
            </div>

            <div style={{ marginBottom: '24px' }}>
              <h3 style={{ fontSize: '24px', fontWeight: '800', marginBottom: '8px', color: 'var(--dark)' }}>
                {selectedCustomer.contactName || 'N/A'}
              </h3>
              {selectedCustomer.companyName && (
                <p style={{ fontSize: '18px', color: 'var(--gray-600)', fontWeight: '600' }}>
                  {selectedCustomer.companyName}
                </p>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {selectedCustomer.email && (
                <div>
                  <p style={{ fontSize: '14px', color: 'var(--gray-600)', marginBottom: '4px', fontWeight: '600' }}>
                    Email
                  </p>
                  <p style={{ fontSize: '16px', fontWeight: '600', color: 'var(--dark)' }}>
                    {selectedCustomer.email}
                  </p>
                </div>
              )}

              {selectedCustomer.phone && (
                <div>
                  <p style={{ fontSize: '14px', color: 'var(--gray-600)', marginBottom: '4px', fontWeight: '600' }}>
                    Phone
                  </p>
                  <p style={{ fontSize: '16px', fontWeight: '600', color: 'var(--dark)' }}>
                    {selectedCustomer.phone}
                  </p>
                </div>
              )}

              {selectedCustomer.locationId && (
                <div>
                  <p style={{ fontSize: '14px', color: 'var(--gray-600)', marginBottom: '4px', fontWeight: '600' }}>
                    Location
                  </p>
                  <p style={{ fontSize: '16px', fontWeight: '600', color: 'var(--dark)' }}>
                    {selectedCustomer.locationId}
                  </p>
                </div>
              )}

              {selectedCustomer.zohoId && (
                <div>
                  <p style={{ fontSize: '14px', color: 'var(--gray-600)', marginBottom: '4px', fontWeight: '600' }}>
                    Zoho ID
                  </p>
                  <p style={{ 
                    fontSize: '16px', 
                    fontWeight: '600', 
                    color: 'var(--dark)',
                    fontFamily: 'monospace',
                    padding: '8px 12px',
                    background: 'var(--gray-100)',
                    borderRadius: '8px'
                  }}>
                    {selectedCustomer.zohoId}
                  </p>
                </div>
              )}

              <div>
                <p style={{ fontSize: '14px', color: 'var(--gray-600)', marginBottom: '4px', fontWeight: '600' }}>
                  Status
                </p>
                <span className={`badge ${selectedCustomer.isActive ? 'badge-success' : 'badge-danger'}`}>
                  {selectedCustomer.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Customers;

