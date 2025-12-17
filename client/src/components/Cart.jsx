import React, { useState, useEffect, useRef, useMemo, useCallback, memo } from 'react';
import { showToast } from './ToastContainer';
import { isVendorContact } from '../utils/contactType';

const Cart = ({ 
  cart, 
  customers, 
  selectedCustomer, 
  customerTaxPreference,
  customerCards = [],
  onSelectCustomer, 
  onUpdateQuantity, 
  onRemoveItem, 
  onClear, 
  onCheckout,
  totals,
  disabled = false
}) => {
  const [showCustomerPicker, setShowCustomerPicker] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const dropdownRef = useRef(null);

  // Memoize calculations
  const subtotal = useMemo(() => parseFloat(totals.subtotal) || 0, [totals.subtotal]);
  const tax = useMemo(() => parseFloat(totals.tax) || 0, [totals.tax]);
  const grandTotal = useMemo(() => parseFloat(totals.total) || (subtotal + tax), [totals.total, subtotal, tax]);
  
  // Memoize filtered customers
  const filteredCustomers = useMemo(() => {
    if (!customerSearch) return customers;
    const search = customerSearch.toLowerCase();
    return customers.filter(customer => {
      const contactName = (customer.contactName || '').toLowerCase();
      const companyName = (customer.companyName || '').toLowerCase();
      return contactName.includes(search) || companyName.includes(search);
    });
  }, [customers, customerSearch]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowCustomerPicker(false);
      }
    };

    if (showCustomerPicker) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showCustomerPicker]);

  const handleCustomerPick = (customer) => {
    if (customer && isVendorContact(customer.contactType)) {
      showToast('Only Zoho customer contacts can be used for POS sales.', 'warning', 4000);
      return;
    }

    onSelectCustomer(customer);
    setShowCustomerPicker(false);
    setCustomerSearch('');
  };

  return (
    <div className="card cart-container" style={{ 
      position: 'sticky', 
      top: '20px',
      opacity: disabled ? 0.6 : 1,
      pointerEvents: disabled ? 'none' : 'auto',
      background: 'white',
      boxShadow: 'var(--shadow-lg)',
      height: 'fit-content',
      maxHeight: 'calc(100vh - 120px)',
      display: 'flex',
      flexDirection: 'column'
    }}>
      <h2 style={{ 
        fontSize: 'var(--font-size-2xl)', 
        fontWeight: '700', 
        marginBottom: '12px',
        color: 'var(--dark)',
        margin: '0 0 16px 0',
        fontFamily: 'var(--font-family)',
        lineHeight: 'var(--line-height-tight)',
        letterSpacing: 'var(--letter-spacing-tight)'
      }}>
        Shopping Cart
      </h2>

      {/* Customer Selection */}
      <div className="mb-2">
        <label style={{ 
          display: 'block', 
          marginBottom: '10px', 
          fontWeight: '600', 
          fontSize: 'var(--font-size-base)',
          color: 'var(--dark)',
          fontFamily: 'var(--font-family)',
          lineHeight: 'var(--line-height-normal)'
        }}>
          Customer {selectedCustomer?.zohoId ? '✅' : selectedCustomer ? '⚠️' : '👤'}
        </label>
        {selectedCustomer && customerTaxPreference === 'SALES TAX EXCEPTION CERTIFICATE' && (
          <div style={{
            fontSize: 'var(--font-size-xs)',
            color: '#065f46',
            marginBottom: '8px',
            padding: '8px 12px',
            background: '#d1fae5',
            borderRadius: '8px',
            fontWeight: '500',
            fontFamily: 'var(--font-family)',
            lineHeight: 'var(--line-height-relaxed)'
          }}>
            💰 This customer is TAX EXEMPT - No tax will be applied
          </div>
        )}
        {selectedCustomer && !selectedCustomer.zohoId && (
          <div style={{
            fontSize: 'var(--font-size-xs)',
            color: 'var(--warning-dark)',
            marginBottom: '8px',
            padding: '8px 12px',
            background: '#fef3c7',
            borderRadius: '8px',
            fontWeight: '500',
            fontFamily: 'var(--font-family)',
            lineHeight: 'var(--line-height-relaxed)'
          }}>
            ⚠️ This customer has no Zoho ID. Invoice won't be created in Zoho.
          </div>
        )}
        {!selectedCustomer && (
          <div style={{
            fontSize: 'var(--font-size-xs)',
            color: 'var(--gray-600)',
            marginBottom: '8px',
            padding: '8px 12px',
            background: '#f3f4f6',
            borderRadius: '8px',
            fontWeight: '500',
            fontFamily: 'var(--font-family)',
            lineHeight: 'var(--line-height-relaxed)'
          }}>
            ℹ️ Please select a customer to continue
          </div>
        )}
        
        {/* Selected Customer Display or Search Input */}
        <div ref={dropdownRef} style={{ position: 'relative' }}>
          {!showCustomerPicker && selectedCustomer ? (
            <button
              onClick={() => setShowCustomerPicker(true)}
              disabled={disabled}
              style={{
                width: '100%',
                padding: '14px 16px',
                fontSize: 'var(--font-size-base)',
                border: '2px solid var(--border)',
                borderRadius: '10px',
                fontFamily: 'var(--font-family)',
                background: 'white',
                textAlign: 'left',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <span>👤</span>
              <span style={{ fontWeight: '600', display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
                <span>
                  {selectedCustomer.contactName}
                  {selectedCustomer.companyName && selectedCustomer.companyName !== selectedCustomer.contactName && ` (${selectedCustomer.companyName})`}
                  {selectedCustomer.last_four_digits && selectedCustomer.cardBrand ? (
                    <span style={{
                      fontSize: 'var(--font-size-sm)',
                      color: 'var(--gray-600)',
                      fontWeight: '500',
                      marginLeft: '8px',
                      fontFamily: 'var(--font-family)'
                    }}>
                      ({selectedCustomer.cardBrand}: xxxx xxxx xxxx {selectedCustomer.last_four_digits})
                    </span>
                  ) : selectedCustomer.card_info_checked && !selectedCustomer.has_card_info ? (
                    <span style={{
                      fontSize: 'var(--font-size-sm)',
                      color: 'var(--gray-500)',
                      fontWeight: '500',
                      marginLeft: '8px',
                      fontFamily: 'var(--font-family)',
                      fontStyle: 'italic'
                    }}>
                      (No Card Info)
                    </span>
                  ) : null}
                </span>
              </span>
            </button>
          ) : !showCustomerPicker && !selectedCustomer ? (
            <button
              onClick={() => setShowCustomerPicker(true)}
              disabled={disabled}
              style={{
                width: '100%',
                padding: '14px 16px',
                fontSize: 'var(--font-size-base)',
                border: '2px solid var(--border)',
                borderRadius: '10px',
                fontFamily: 'var(--font-family)',
                background: 'white',
                textAlign: 'left',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                color: 'var(--gray-500)'
              }}
            >
              <span>👤</span>
              <span style={{ fontWeight: '600' }}>
                Select a customer
              </span>
            </button>
          ) : (
            <input
              type="text"
              placeholder="🔍 Search customer by name or company..."
              value={customerSearch}
              onChange={(e) => setCustomerSearch(e.target.value)}
              autoFocus
              disabled={disabled}
              style={{
                width: '100%',
                padding: '14px 16px',
                fontSize: 'var(--font-size-base)',
                border: '2px solid var(--border)',
                borderRadius: '10px',
                fontFamily: 'var(--font-family)',
                outline: 'none',
                transition: 'all 0.2s',
                background: 'white'
              }}
            />
          )}
          
          {/* Dropdown List */}
          {showCustomerPicker && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                marginTop: '8px',
                background: 'white',
                border: '2px solid var(--border)',
                borderRadius: '10px',
                boxShadow: 'var(--shadow-lg)',
                maxHeight: '300px',
                overflowY: 'auto',
                zIndex: 100
              }}
            >
              {/* Walk-in Customer Option */}
              <button
                onClick={() => handleCustomerPick(null)}
                className="btn btn-outline"
                style={{
                  width: '100%',
                  margin: '8px',
                  width: 'calc(100% - 16px)',
                  textAlign: 'left',
                  padding: '12px 14px',
                  justifyContent: 'flex-start',
                  fontSize: 'var(--font-size-sm)',
                  borderColor: !selectedCustomer ? 'var(--primary)' : 'var(--border)',
                  background: !selectedCustomer ? 'var(--primary)' : 'white',
                  color: !selectedCustomer ? 'white' : 'var(--dark)'
                }}
              >
                Walk-in Customer (No Zoho Invoice)
              </button>
              
              {/* Filtered Customers */}
              {(() => {
                if (filteredCustomers.length === 0 && customerSearch) {
                  return (
                    <div style={{ 
                      textAlign: 'center', 
                      padding: '20px', 
                      color: 'var(--gray-500)'
                    }}>
                      <p style={{ 
                        fontSize: 'var(--font-size-sm)', 
                        fontWeight: '600', 
                        color: 'var(--dark)',
                        fontFamily: 'var(--font-family)'
                      }}>
                        No customers found
                      </p>
                    </div>
                  );
                }

                return filteredCustomers.map(customer => {
                  const isSelected = selectedCustomer?.id === customer.id;
                  return (
                  <button
                key={customer.id}
                    onClick={() => handleCustomerPick(customer)}
                    className="btn btn-outline"
                    style={{
                      width: 'calc(100% - 16px)',
                      margin: '0 8px 8px 8px',
                      textAlign: 'left',
                      justifyContent: 'flex-start',
                      padding: '12px 14px',
                      background: isSelected ? 'var(--primary)' : 'white',
                      color: isSelected ? 'white' : 'var(--dark)',
                      borderColor: isSelected ? 'var(--primary)' : 'var(--border)'
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px' }}>
                      <span style={{ 
                        fontWeight: '600', 
                        fontSize: 'var(--font-size-sm)',
                        fontFamily: 'var(--font-family)',
                        lineHeight: 'var(--line-height-normal)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        flexWrap: 'wrap'
                      }}>
                        <span>
                          {customer.contactName}
                          {customer.companyName && customer.companyName !== customer.contactName && ` (${customer.companyName})`}
                        </span>
                        {customer.zohoId && <span>✅</span>}
                        {!customer.zohoId && <span>⚠️</span>}
                        {customer.last_four_digits && customer.cardBrand && (
                          <span style={{
                            fontSize: 'var(--font-size-xs)',
                            color: 'var(--gray-600)',
                            fontWeight: '500',
                            fontFamily: 'var(--font-family)'
                          }}>
                            ({customer.cardBrand}: xxxx xxxx xxxx {customer.last_four_digits})
                          </span>
                        )}
                      </span>
                      {customer.companyName && (
                        <span style={{ 
                          fontSize: 'var(--font-size-xs)', 
                          opacity: 0.8,
                          fontFamily: 'var(--font-family)',
                          lineHeight: 'var(--line-height-relaxed)'
                        }}>
                          {customer.companyName}
                        </span>
                      )}
                    </div>
                  </button>
                  );
                });
              })()}
            </div>
          )}
        </div>
      </div>

      {/* Cart Items */}
      <div style={{ 
        maxHeight: 'calc(100vh - 500px)', 
        minHeight: '180px',
        overflowY: 'auto',
        marginBottom: '12px',
        border: '1px solid var(--border)',
        borderRadius: '12px',
        padding: '10px',
        background: 'var(--gray-50)'
      }}>
        {cart.length === 0 ? (
          <div style={{ 
            textAlign: 'center', 
            padding: '60px 20px', 
            color: 'var(--gray-500)'
          }}>
            <div style={{ fontSize: '64px', marginBottom: '16px' }}>🛒</div>
            <p style={{ 
              fontSize: 'var(--font-size-lg)', 
              fontWeight: '700', 
              marginBottom: '8px', 
              color: 'var(--dark)',
              fontFamily: 'var(--font-family)',
              lineHeight: 'var(--line-height-tight)'
            }}>
              Cart is empty
            </p>
            <p style={{ 
              fontSize: 'var(--font-size-sm)', 
              color: 'var(--gray-600)',
              fontFamily: 'var(--font-family)',
              lineHeight: 'var(--line-height-relaxed)'
            }}>
              Click on items to add them
            </p>
          </div>
        ) : (
          cart.map(item => (
            <div 
              key={item.id}
              style={{
                padding: '6px 10px',
                background: 'white',
                borderRadius: '10px',
                marginBottom: '4px',
                border: '1px solid var(--border)',
                transition: 'all 0.2s',
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1fr) 80px 90px 40px',
                gap: '10px',
                alignItems: 'center'
              }}
            >
              <div style={{ minWidth: 0 }}>
                <span style={{
                  fontWeight: '600',
                  fontSize: 'var(--font-size-base)',
                  color: 'var(--dark)',
                  fontFamily: 'var(--font-family)',
                  lineHeight: 'var(--line-height-tight)',
                  display: 'block',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}>
                  {item.name}
                </span>
                <span style={{
                  fontSize: '12px',
                  color: 'var(--gray-600)'
                }}>
                  ${parseFloat(item.price || 0).toFixed(2)} each
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <input
                  type="number"
                  min="1"
                  value={item.quantity}
                  onChange={(e) => {
                    const value = parseInt(e.target.value) || 1;
                    if (value > 0) {
                      onUpdateQuantity(item.id, value);
                    }
                  }}
                  disabled={disabled}
                  style={{ 
                    width: '60px', 
                    textAlign: 'center', 
                    fontWeight: '700',
                    fontSize: 'var(--font-size-lg)',
                    color: 'var(--dark)',
                    fontFamily: 'var(--font-family)',
                    lineHeight: 'var(--line-height-tight)',
                    border: '2px solid var(--border)',
                    borderRadius: '10px',
                    padding: '6px',
                    outline: 'none',
                    background: 'white',
                    transition: 'all 0.2s',
                    cursor: disabled ? 'not-allowed' : 'text'
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = 'var(--primary)';
                    e.target.style.background = 'var(--gray-50)';
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = 'var(--border)';
                    e.target.style.background = 'white';
                    const value = parseInt(e.target.value);
                    if (!value || value < 1) {
                      onUpdateQuantity(item.id, 1);
                    }
                  }}
                />
              </div>
              <div style={{ 
                fontWeight: '700', 
                fontSize: 'var(--font-size-lg)',
                color: 'var(--primary)',
                fontFamily: 'var(--font-family)',
                letterSpacing: 'var(--letter-spacing-tight)',
                textAlign: 'right'
              }}>
                ${(parseFloat(item.price || 0) * item.quantity).toFixed(2)}
              </div>
              <button
                onClick={() => onRemoveItem(item.id)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--danger)',
                  cursor: 'pointer',
                  fontSize: '22px',
                  padding: '0 6px',
                  fontWeight: 'bold',
                  width: '32px',
                  height: '32px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '6px',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#fee2e2';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                ×
              </button>
            </div>
          ))
        )}
      </div>

      {/* Totals Card */}
      <div style={{ 
        borderTop: '2px solid var(--border)', 
        paddingTop: '12px',
        marginBottom: '12px',
        background: 'var(--gray-50)',
        padding: '12px',
        borderRadius: '12px'
      }}>
        <div className="flex-between" style={{ 
          marginBottom: '8px', 
          fontSize: 'var(--font-size-base)',
          fontFamily: 'var(--font-family)'
        }}>
          <span style={{ color: 'var(--gray-700)', fontWeight: '500', lineHeight: 'var(--line-height-normal)' }}>Subtotal:</span>
          <span style={{ fontWeight: '700', color: 'var(--dark)', lineHeight: 'var(--line-height-normal)' }}>${subtotal.toFixed(2)}</span>
        </div>
        <div className="flex-between" style={{ 
          marginBottom: '8px', 
          fontSize: 'var(--font-size-base)',
          fontFamily: 'var(--font-family)'
        }}>
          <span style={{ color: 'var(--gray-700)', fontWeight: '500', lineHeight: 'var(--line-height-normal)' }}>
            {totals.isTaxExempt ? 'Tax (Exempt):' : `Tax (${totals.taxRate ? totals.taxRate.toFixed(2) : '7.5'}%):`}
          </span>
          <span style={{ fontWeight: '700', color: 'var(--dark)', lineHeight: 'var(--line-height-normal)' }}>${tax.toFixed(2)}</span>
        </div>
        <div className="flex-between" style={{ 
          fontSize: 'var(--font-size-xl)', 
          fontWeight: '700',
          paddingTop: '10px',
          borderTop: '2px solid var(--border)',
          marginTop: '8px',
          fontFamily: 'var(--font-family)',
          lineHeight: 'var(--line-height-tight)'
        }}>
          <span style={{ color: 'var(--dark)' }}>Grand Total:</span>
          <span style={{ 
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent'
          }}>
            ${grandTotal.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div style={{ marginBottom: '16px' }}>
        <button
          onClick={onClear}
          className="btn btn-outline"
          style={{ 
            width: '100%',
            border: '2px solid var(--border)',
            fontWeight: '600',
            fontSize: 'var(--font-size-base)',
            padding: '14px',
            fontFamily: 'var(--font-family)'
          }}
          disabled={cart.length === 0 || disabled}
        >
          Clear Cart
        </button>
      </div>

      {/* Payment Buttons */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <button
          onClick={() => onCheckout('card')}
          className="btn"
          style={{ 
            width: '100%',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            color: 'white',
            fontWeight: '700',
            fontSize: 'var(--font-size-lg)',
            padding: '16px',
            borderRadius: '12px',
            boxShadow: 'var(--shadow-md)',
            fontFamily: 'var(--font-family)'
          }}
          disabled={cart.length === 0 || disabled}
        >
          Pay Now
        </button>
      </div>
    </div>
  );
};

export default memo(Cart);
