import React, { useState, useEffect, useRef } from 'react';
import { ordersAPI } from '../services/api';
import { showToast } from './ToastContainer';

/**
 * Payment Reconciliation Component
 * 
 * Displays order with invoice number and payment status
 * Polls backend every 10-15 seconds for payment status
 * Shows VOID/REFUND buttons when payment is complete
 * 
 * Usage:
 * <PaymentReconciliation 
 *   orderId={orderId}
 *   onPaymentComplete={(order) => {...}}
 *   onClose={() => {...}}
 * />
 */
const PaymentReconciliation = ({ orderId, onPaymentComplete, onClose }) => {
  const [order, setOrder] = useState(null);
  const [payment, setPayment] = useState(null);
  const [actions, setActions] = useState({ canVoid: false, canRefund: false });
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const pollingIntervalRef = useRef(null);
  const pollCountRef = useRef(0);
  const MAX_POLL_ATTEMPTS = 120; // 120 * 12 seconds = 24 minutes max

  // Fetch payment status
  const fetchPaymentStatus = async () => {
    try {
      const response = await ordersAPI.getPaymentStatus(orderId);
      
      if (response.data.success) {
        const { order: orderData, payment: paymentData, actions: actionsData } = response.data.data;
        
        setOrder(orderData);
        setPayment(paymentData);
        setActions(actionsData || { canVoid: false, canRefund: false });
        setError('');

        // If payment is complete, stop polling and notify parent
        if (orderData.status === 'PAID' && paymentData) {
          stopPolling();
          if (onPaymentComplete) {
            onPaymentComplete(orderData);
          }
        }

        // Stop polling if order is voided or refunded
        if (orderData.status === 'VOIDED' || orderData.status === 'REFUNDED') {
          stopPolling();
        }
      } else {
        setError(response.data.message || 'Failed to fetch payment status');
      }
    } catch (err) {
      const errorMsg = err.formattedMessage || err.response?.data?.message || err.message || 'Failed to fetch payment status';
      setError(errorMsg);
      
      // Don't show error toast on every poll, only on first failure
      if (pollCountRef.current === 0) {
        showToast(errorMsg, 'error', 3000);
      }
    } finally {
      setLoading(false);
    }
  };

  // Start polling
  const startPolling = () => {
    // Fetch immediately
    fetchPaymentStatus();

    // Then poll every 12 seconds (between 10-15 as requested)
    pollingIntervalRef.current = setInterval(() => {
      pollCountRef.current++;
      
      // Stop polling after max attempts
      if (pollCountRef.current >= MAX_POLL_ATTEMPTS) {
        stopPolling();
        setError('Payment status check timeout. Please refresh manually.');
        showToast('Payment status check timeout', 'warning', 5000);
        return;
      }

      fetchPaymentStatus();
    }, 12 * 1000); // 12 seconds
  };

  // Stop polling
  const stopPolling = () => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  };

  // Handle void
  const handleVoid = async () => {
    if (!window.confirm('Are you sure you want to void this transaction?')) {
      return;
    }

    setProcessing(true);
    setError('');

    try {
      const response = await ordersAPI.voidPayment(orderId);
      
      if (response.data.success) {
        showToast('Transaction voided successfully', 'success', 3000);
        await fetchPaymentStatus(); // Refresh status
      } else {
        const errorMsg = response.data.message || 'Failed to void transaction';
        setError(errorMsg);
        showToast(errorMsg, 'error', 5000);
      }
    } catch (err) {
      const errorMsg = err.formattedMessage || err.response?.data?.message || err.message || 'Failed to void transaction';
      setError(errorMsg);
      showToast(errorMsg, 'error', 5000);
    } finally {
      setProcessing(false);
    }
  };

  // Handle refund
  const handleRefund = async () => {
    if (!window.confirm('Are you sure you want to refund this transaction?')) {
      return;
    }

    setProcessing(true);
    setError('');

    try {
      const response = await ordersAPI.refundPayment(orderId);
      
      if (response.data.success) {
        showToast('Refund processed successfully', 'success', 3000);
        await fetchPaymentStatus(); // Refresh status
      } else {
        const errorMsg = response.data.message || 'Failed to refund transaction';
        setError(errorMsg);
        showToast(errorMsg, 'error', 5000);
      }
    } catch (err) {
      const errorMsg = err.formattedMessage || err.response?.data?.message || err.message || 'Failed to refund transaction';
      setError(errorMsg);
      showToast(errorMsg, 'error', 5000);
    } finally {
      setProcessing(false);
    }
  };

  // Start polling on mount
  useEffect(() => {
    startPolling();

    // Cleanup on unmount
    return () => {
      stopPolling();
    };
  }, [orderId]);

  if (loading && !order) {
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000
      }}>
        <div className="card" style={{ 
          width: '100%', 
          maxWidth: '500px', 
          padding: '40px',
          textAlign: 'center'
        }}>
          <div className="spinner" style={{ 
            width: '40px', 
            height: '40px', 
            borderWidth: '4px',
            margin: '0 auto 20px'
          }}></div>
          <p style={{ fontSize: '16px', color: 'var(--gray-700)' }}>Loading order...</p>
        </div>
      </div>
    );
  }

  if (!order) {
    return null;
  }

  const statusColors = {
    OPEN: 'var(--warning)',
    PAID: 'var(--success)',
    VOIDED: 'var(--gray-600)',
    REFUNDED: 'var(--danger)'
  };

  const statusLabels = {
    OPEN: 'Waiting for Payment',
    PAID: 'Paid',
    VOIDED: 'Voided',
    REFUNDED: 'Refunded'
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.6)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '20px',
      backdropFilter: 'blur(4px)'
    }}>
      <div className="card" style={{ 
        width: '100%', 
        maxWidth: '600px',
        boxShadow: 'var(--shadow-xl)'
      }}>
        {/* Header */}
        <div className="flex-between mb-3">
          <h2 style={{ fontSize: '28px', fontWeight: '800', margin: 0 }}>
            Payment Status
          </h2>
          {onClose && (
            <button
              onClick={onClose}
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
          )}
        </div>

        {error && (
          <div className="error mb-3" style={{ padding: '14px 16px', borderRadius: '12px' }}>
            {error}
          </div>
        )}

        {/* Invoice Number - Large Display */}
        <div style={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          padding: '32px',
          borderRadius: '16px',
          marginBottom: '24px',
          textAlign: 'center',
          color: 'white'
        }}>
          <div style={{ fontSize: '14px', opacity: 0.9, marginBottom: '8px', fontWeight: '600' }}>
            Invoice Number
          </div>
          <div style={{ 
            fontSize: '36px', 
            fontWeight: '800', 
            fontFamily: 'monospace',
            letterSpacing: '2px'
          }}>
            {order.invoiceNumber}
          </div>
          <div style={{ 
            fontSize: '14px', 
            opacity: 0.9, 
            marginTop: '12px',
            fontWeight: '500'
          }}>
            Enter this number in Authorize.net 2.0 Windows app
          </div>
        </div>

        {/* Amount */}
        <div style={{
          background: 'var(--gray-50)',
          padding: '24px',
          borderRadius: '12px',
          marginBottom: '24px',
          border: '2px solid var(--border)'
        }}>
          <div className="flex-between">
            <span style={{ fontSize: '18px', fontWeight: '600', color: 'var(--gray-700)' }}>
              Amount:
            </span>
            <span style={{ 
              fontSize: '32px', 
              fontWeight: '800', 
              color: 'var(--primary)'
            }}>
              ${parseFloat(order.amount).toFixed(2)}
            </span>
          </div>
        </div>

        {/* Status */}
        <div style={{
          background: 'var(--gray-50)',
          padding: '20px',
          borderRadius: '12px',
          marginBottom: '24px',
          border: '2px solid var(--border)'
        }}>
          <div className="flex-between" style={{ alignItems: 'center' }}>
            <span style={{ fontSize: '16px', fontWeight: '600', color: 'var(--gray-700)' }}>
              Status:
            </span>
            <span style={{
              fontSize: '18px',
              fontWeight: '700',
              color: statusColors[order.status] || 'var(--gray-700)',
              padding: '8px 16px',
              borderRadius: '8px',
              background: `${statusColors[order.status] || 'var(--gray-300)'}20`
            }}>
              {statusLabels[order.status] || order.status}
            </span>
          </div>

          {order.status === 'OPEN' && (
            <div style={{
              marginTop: '16px',
              padding: '12px',
              background: '#fff7ed',
              borderRadius: '8px',
              border: '2px solid #f59e0b',
              fontSize: '14px',
              color: '#92400e'
            }}>
              <div style={{ fontWeight: '700', marginBottom: '4px' }}>⏳ Waiting for payment...</div>
              <div style={{ fontSize: '12px', opacity: 0.9 }}>
                The reconciliation worker checks for payments every 60 seconds.
                This page will update automatically when payment is received.
              </div>
            </div>
          )}

          {payment && order.status === 'PAID' && (
            <div style={{ marginTop: '16px', fontSize: '14px', color: 'var(--gray-600)' }}>
              <div style={{ marginBottom: '8px' }}>
                <strong>Transaction ID:</strong> {payment.transactionId}
              </div>
              {payment.authCode && (
                <div style={{ marginBottom: '8px' }}>
                  <strong>Auth Code:</strong> {payment.authCode}
                </div>
              )}
              {payment.settledAt && (
                <div>
                  <strong>Settled:</strong> {new Date(payment.settledAt).toLocaleString()}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        {order.status === 'PAID' && payment && (
          <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
            {actions.canVoid && (
              <button
                onClick={handleVoid}
                disabled={processing}
                className="btn btn-outline"
                style={{ 
                  flex: 1, 
                  fontSize: '16px', 
                  fontWeight: '700', 
                  padding: '16px',
                  borderColor: 'var(--warning)',
                  color: 'var(--warning)'
                }}
              >
                {processing ? 'Processing...' : 'VOID'}
              </button>
            )}
            {actions.canRefund && (
              <button
                onClick={handleRefund}
                disabled={processing}
                className="btn btn-primary"
                style={{ 
                  flex: 1, 
                  fontSize: '16px', 
                  fontWeight: '700', 
                  padding: '16px'
                }}
              >
                {processing ? 'Processing...' : 'REFUND'}
              </button>
            )}
          </div>
        )}

        {/* Polling Indicator */}
        {order.status === 'OPEN' && pollingIntervalRef.current && (
          <div style={{
            marginTop: '16px',
            padding: '12px',
            background: 'var(--gray-50)',
            borderRadius: '8px',
            fontSize: '12px',
            color: 'var(--gray-600)',
            textAlign: 'center'
          }}>
            🔄 Checking payment status every 12 seconds...
          </div>
        )}
      </div>
    </div>
  );
};

export default PaymentReconciliation;

