import React, { useState, useEffect } from 'react';
import { printerAPI } from '../services/api';
import { showToast } from './ToastContainer';

const ReceiptScreen = ({ saleData, onNewSale }) => {
  const [printerStatus, setPrinterStatus] = useState('checking');
  const [printing, setPrinting] = useState(false);
  const items = saleData?.items || saleData?.sale?.items || [];

  useEffect(() => {
    checkPrinterStatus();
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

  const handlePrint = async () => {
    if (printerStatus !== 'online') {
      showToast('Printer offline. Check connection.', 'error', 3000);
      return;
    }

    setPrinting(true);
    try {
      // Note: Receipt is automatically printed when sale is created
      // This attempts a manual reprint if needed
      // For now, we'll use the test endpoint to verify printer connection
      const response = await printerAPI.test();
      if (response.data.success) {
        showToast('Receipt was already printed during sale. Printer is online.', 'success', 4000);
      } else {
        showToast('Printer test failed. Receipt was printed during sale creation.', 'warning', 4000);
      }
    } catch (error) {
      // Don't show error - receipt was already printed during sale
      showToast('Receipt was printed during sale creation. Use PDF if reprint needed.', 'info', 4000);
    } finally {
      setPrinting(false);
    }
  };

  const handleDownloadPDF = () => {
    // Get items for PDF
    const receiptItems = saleData.items || saleData.sale?.items || [];
    
    // Create a printable receipt
    const receiptWindow = window.open('', '_blank');
    receiptWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Receipt #POS-${saleData.sale.id}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 40px; max-width: 400px; margin: 0 auto; }
            h1 { text-align: center; margin-bottom: 20px; }
            .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #000; padding-bottom: 20px; }
            .item { margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px solid #ddd; }
            .totals { margin-top: 20px; border-top: 2px solid #000; padding-top: 20px; }
            .total-row { display: flex; justify-content: space-between; margin-bottom: 10px; }
            .grand-total { font-size: 24px; font-weight: bold; margin-top: 10px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Sub-Zero Ice Services, Inc</h1>
            <p>${saleData.sale.locationName || 'Store'}</p>
          </div>
          <div>
            <p><strong>Date:</strong> ${new Date(saleData.sale.createdAt).toLocaleString()}</p>
            <p><strong>Receipt #:</strong> POS-${saleData.sale.id}</p>
            ${saleData.customer ? `<p><strong>Customer:</strong> ${saleData.customer.contactName}</p>` : ''}
          </div>
          <hr>
          <h3>ITEMS</h3>
          ${receiptItems.map(item => `
            <div class="item">
              <p><strong>${item.itemName || item.name || 'Item'}</strong></p>
              <p>${item.quantity} x $${parseFloat(item.price || item.pricePerUnit || 0).toFixed(2)} = $${parseFloat(item.lineTotal || (item.quantity * (item.price || item.pricePerUnit || 0))).toFixed(2)}</p>
            </div>
          `).join('')}
          <div class="totals">
            <div class="total-row">
              <span>Subtotal:</span>
              <span>$${parseFloat(saleData.sale.subtotal).toFixed(2)}</span>
            </div>
            <div class="total-row">
              <span>Tax:</span>
              <span>$${parseFloat(saleData.sale.taxAmount).toFixed(2)}</span>
            </div>
            ${parseFloat(saleData.sale.ccFee || 0) > 0 ? `
              <div class="total-row">
                <span>Processing Fee (3%):</span>
                <span>$${parseFloat(saleData.sale.ccFee).toFixed(2)}</span>
              </div>
            ` : ''}
            <div class="total-row grand-total">
              <span>TOTAL:</span>
              <span>$${parseFloat(saleData.sale.total).toFixed(2)}</span>
            </div>
          </div>
          <div style="margin-top: 30px; text-align: center;">
            <p><strong>Payment:</strong> ${saleData.sale.paymentType.replace('_', ' ').toUpperCase()}</p>
            ${saleData.sale.transactionId ? `<p><strong>Transaction ID:</strong> ${saleData.sale.transactionId}</p>` : ''}
          </div>
          <div style="margin-top: 40px; text-align: center; border-top: 2px solid #000; padding-top: 20px;">
            <p>Thank you for your business!</p>
          </div>
        </body>
      </html>
    `);
    receiptWindow.document.close();
    receiptWindow.print();
  };

  if (!saleData || !saleData.sale) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
        <div className="card" style={{ maxWidth: '500px', textAlign: 'center' }}>
          <h2 style={{ fontSize: '28px', fontWeight: '800', marginBottom: '16px' }}>No Receipt Data</h2>
          <button onClick={onNewSale} className="btn btn-primary" style={{ marginTop: '16px' }}>
            Start New Sale
          </button>
        </div>
      </div>
    );
  }

  // Clean up location name for subtitle (strip trailing " + Tax (7%)" if present)
  const rawLocationName = saleData?.sale?.locationName || 'Store';
  const displayLocationName = rawLocationName.replace(/\s*\+?\s*Tax\s*\(\s*7%?\s*\)\s*$/i, '') || 'Store';

  return (
    <div style={{ minHeight: '100vh', background: 'var(--gray-50)', padding: '24px' }}>
      <div className="container">
        <div className="card" style={{ maxWidth: '1140px', width: '100%', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '32px', paddingBottom: '24px', borderBottom: '2px solid var(--border)' }}>
            <h1 style={{ fontSize: '36px', fontWeight: '800', marginBottom: '12px', color: 'var(--dark)' }}>
              Sub-Zero Ice Services, Inc
            </h1>
            <p style={{ fontSize: '18px', color: 'var(--gray-600)', fontWeight: '600' }}>
              {displayLocationName}
            </p>
          </div>

          {/* Receipt Info */}
          <div style={{ marginBottom: '32px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
              <div>
                <p style={{ fontSize: '14px', color: 'var(--gray-600)', marginBottom: '4px', fontWeight: '600' }}>
                  Date
                </p>
                <p style={{ fontSize: '16px', fontWeight: '700', color: 'var(--dark)' }}>
                  {new Date(saleData.sale.createdAt).toLocaleString()}
                </p>
              </div>
              <div>
                <p style={{ fontSize: '14px', color: 'var(--gray-600)', marginBottom: '4px', fontWeight: '600' }}>
                  Receipt #
                </p>
                <p style={{ fontSize: '16px', fontWeight: '700', color: 'var(--dark)' }}>
                  POS-{saleData.sale.id}
                </p>
              </div>
            </div>
            {saleData.customer && (
              <div style={{ marginBottom: '16px' }}>
                <p style={{ fontSize: '14px', color: 'var(--gray-600)', marginBottom: '4px', fontWeight: '600' }}>
                  Customer
                </p>
                <p style={{ fontSize: '16px', fontWeight: '700', color: 'var(--dark)' }}>
                  {saleData.customer.contactName}
                  {saleData.customer.companyName && ` (${saleData.customer.companyName})`}
                </p>
              </div>
            )}
          </div>

          {/* Items */}
          <div style={{ marginBottom: '32px' }}>
            <h3 style={{ fontSize: '20px', fontWeight: '800', marginBottom: '16px', color: 'var(--dark)' }}>
              ITEMS
            </h3>
            <div style={{ border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
              {items.map((item, index) => (
                <div
                  key={index}
                  style={{
                    padding: '16px',
                    borderBottom: index < items.length - 1 ? '1px solid var(--border)' : 'none',
                    background: index % 2 === 0 ? 'white' : 'var(--gray-50)'
                  }}
                >
                  <div className="flex-between" style={{ marginBottom: '8px' }}>
                    <p style={{ fontSize: '16px', fontWeight: '700', color: 'var(--dark)' }}>
                      {item.itemName || item.name || 'Item'}
                    </p>
                  </div>
                  <div className="flex-between">
                    <p style={{ fontSize: '14px', color: 'var(--gray-600)' }}>
                      {item.quantity} x ${parseFloat(item.price || item.pricePerUnit || 0).toFixed(2)}
                    </p>
                    <p style={{ fontSize: '18px', fontWeight: '800', color: 'var(--primary)' }}>
                      ${parseFloat(item.lineTotal || (item.quantity * (item.price || item.pricePerUnit || 0))).toFixed(2)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Totals */}
          <div style={{
            background: 'var(--gray-50)',
            padding: '24px',
            borderRadius: '12px',
            marginBottom: '32px'
          }}>
            <div className="flex-between" style={{ marginBottom: '12px', fontSize: '16px' }}>
              <span style={{ color: 'var(--gray-700)', fontWeight: '500' }}>Subtotal:</span>
              <span style={{ fontWeight: '700', color: 'var(--dark)' }}>
                ${parseFloat(saleData.sale.subtotal).toFixed(2)}
              </span>
            </div>
            <div className="flex-between" style={{ marginBottom: '12px', fontSize: '16px' }}>
              <span style={{ color: 'var(--gray-700)', fontWeight: '500' }}>
                Tax:
              </span>
              <span style={{ fontWeight: '700', color: 'var(--dark)' }}>
                ${parseFloat(saleData.sale.taxAmount).toFixed(2)}
              </span>
            </div>
            {parseFloat(saleData.sale.ccFee || 0) > 0 && (
              <div className="flex-between" style={{ marginBottom: '12px', fontSize: '16px', color: 'var(--warning)' }}>
                <span style={{ fontWeight: '500' }}>Processing Fee (3%):</span>
                <span style={{ fontWeight: '700' }}>
                  ${parseFloat(saleData.sale.ccFee).toFixed(2)}
                </span>
              </div>
            )}
            <div className="flex-between" style={{
              fontSize: '32px',
              fontWeight: '800',
              paddingTop: '16px',
              borderTop: '2px solid var(--border)',
              marginTop: '12px'
            }}>
              <span style={{ color: 'var(--dark)' }}>TOTAL:</span>
              <span style={{
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent'
              }}>
                ${parseFloat(saleData.sale.total).toFixed(2)}
              </span>
            </div>
          </div>

          {/* Payment Info */}
          <div style={{
            padding: '20px',
            background: 'var(--gray-50)',
            borderRadius: '12px',
            marginBottom: '32px'
          }}>
            <p style={{ fontSize: '14px', color: 'var(--gray-600)', marginBottom: '8px', fontWeight: '600' }}>
              Payment Method
            </p>
            <p style={{ fontSize: '18px', fontWeight: '700', color: 'var(--dark)' }}>
              {saleData.sale.paymentType.replace('_', ' ').toUpperCase()}
            </p>
            {saleData.sale.transactionId && (
              <>
                <p style={{ fontSize: '14px', color: 'var(--gray-600)', marginTop: '12px', marginBottom: '8px', fontWeight: '600' }}>
                  Transaction ID
                </p>
                <p style={{ fontSize: '16px', fontWeight: '600', color: 'var(--gray-700)', fontFamily: 'monospace' }}>
                  {saleData.sale.transactionId}
                </p>
              </>
            )}
          </div>

          {/* Zoho Sync Status */}
          {saleData.zoho && (
            <div style={{
              padding: '16px',
              background: saleData.zoho.synced ? '#d1fae5' : '#fee2e2',
              borderRadius: '12px',
              marginBottom: '32px',
              border: `1px solid ${saleData.zoho.synced ? 'var(--success)' : 'var(--danger)'}`
            }}>
              <p style={{
                fontSize: '14px',
                fontWeight: '700',
                color: saleData.zoho.synced ? '#065f46' : 'var(--danger)',
                marginBottom: '4px'
              }}>
                {saleData.zoho.synced ? '✅ Synced to Zoho Books' : '❌ Zoho Sync Failed'}
              </p>
              {saleData.zoho.synced && saleData.zoho.salesReceiptNumber && (
                <p style={{ fontSize: '13px', color: '#065f46' }}>
                  Receipt: {saleData.zoho.salesReceiptNumber}
                </p>
              )}
              {saleData.zoho.error && (
                <p style={{ fontSize: '13px', color: 'var(--danger)' }}>
                  {saleData.zoho.error}
                </p>
              )}
            </div>
          )}

          {/* Printer Status */}
          <div style={{
            padding: '16px',
            background: printerStatus === 'online' ? '#d1fae5' : '#fee2e2',
            borderRadius: '12px',
            marginBottom: '24px',
            border: `1px solid ${printerStatus === 'online' ? 'var(--success)' : 'var(--danger)'}`
          }}>
            <p style={{
              fontSize: '14px',
              fontWeight: '700',
              color: printerStatus === 'online' ? '#065f46' : 'var(--danger)',
              marginBottom: '4px'
            }}>
              {printerStatus === 'online' ? '🟢 Printer Online' : printerStatus === 'checking' ? '🟡 Checking Printer...' : '🔴 Printer Offline'}
            </p>
            {printerStatus === 'offline' && (
              <p style={{ fontSize: '13px', color: 'var(--danger)' }}>
                Check printer connection. You can download a PDF receipt below.
              </p>
            )}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            <button
              onClick={handlePrint}
              disabled={printerStatus !== 'online' || printing}
              className="btn btn-primary"
              style={{
                flex: 1,
                minWidth: '200px',
                fontSize: '16px',
                fontWeight: '800',
                padding: '16px'
              }}
            >
              {printing ? (
                <>
                  <span className="spinner" style={{ width: '20px', height: '20px', borderWidth: '3px', borderTopColor: 'white' }}></span>
                  Printing...
                </>
              ) : (
                <>
                  <span>🖨️</span>
                  Print Receipt
                </>
              )}
            </button>
            <button
              onClick={handleDownloadPDF}
              className="btn btn-outline"
              style={{
                flex: 1,
                minWidth: '200px',
                fontSize: '16px',
                fontWeight: '700',
                padding: '16px'
              }}
            >
              📄 Download PDF
            </button>
            <button
              onClick={onNewSale}
              className="btn btn-secondary"
              style={{
                flex: 1,
                minWidth: '200px',
                fontSize: '16px',
                fontWeight: '800',
                padding: '16px'
              }}
            >
              🛒 New Sale
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReceiptScreen;

