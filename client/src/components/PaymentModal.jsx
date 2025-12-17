import React, { useState, useEffect } from 'react';
import { salesAPI, paxAPI, bluetoothAPI } from '../services/api';
import { showToast } from './ToastContainer';

const PaymentModal = ({ cart, customer, totals, onClose, onComplete, customerTaxPreference }) => {
  const [paymentMethod, setPaymentMethod] = useState('cash'); // 'cash', 'credit_card', 'debit_card', 'zelle', or 'ach'
  const [cardDetails, setCardDetails] = useState({
    cardNumber: '',
    expirationDate: '',
    cvv: '',
    zip: ''
  });
  const [zelleConfirmation, setZelleConfirmation] = useState('');
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [useTerminal, setUseTerminal] = useState(false);
  const [terminalIP, setTerminalIP] = useState('');
  const [terminalStatus, setTerminalStatus] = useState(null);
  const [checkingTerminal, setCheckingTerminal] = useState(false);
  const [achDetails, setAchDetails] = useState({
    nameOnAccount: '',
    routingNumber: '',
    accountNumber: '',
    accountType: 'checking',
    bankName: ''
  });
  const [useBluetoothReader, setUseBluetoothReader] = useState(false);
  const [bluetoothPayload, setBluetoothPayload] = useState(null);
  const [bluetoothReaderInfo, setBluetoothReaderInfo] = useState(null);
  const [bluetoothStatus, setBluetoothStatus] = useState(null);
  const [pairingBluetoothReader, setPairingBluetoothReader] = useState(false);
  const [testMode, setTestMode] = useState(false);
  const [testOpaqueData, setTestOpaqueData] = useState({
    descriptor: '',
    value: '',
    sessionId: ''
  });
  const [readerType, setReaderType] = useState('usb'); // 'usb' or 'bluetooth'
  const [usbReaderActive, setUsbReaderActive] = useState(false);
  const [cardInputFocused, setCardInputFocused] = useState(false);
  const [usbReaderConnected, setUsbReaderConnected] = useState(null); // null = checking, true = connected, false = not connected
  const [checkingUsbReader, setCheckingUsbReader] = useState(false);

  useEffect(() => {
    const savedTerminalIP = localStorage.getItem('paxTerminalIP') || '';
    if (savedTerminalIP) {
      setTerminalIP(savedTerminalIP);
    }
  }, []);

  useEffect(() => {
    const savedReader = localStorage.getItem('bbposReaderInfo');
    if (savedReader) {
      try {
        const parsed = JSON.parse(savedReader);
        if (parsed) {
          setBluetoothReaderInfo(parsed);
          setBluetoothStatus({
            connected: true,
            message: 'Saved Bluetooth reader ready'
          });
        }
      } catch (error) {
        localStorage.removeItem('bbposReaderInfo');
      }
    }
  }, []);

  useEffect(() => {
    if (paymentMethod !== 'credit_card' && paymentMethod !== 'debit_card') {
      setUseTerminal(false);
      setUseBluetoothReader(false);
      setBluetoothPayload(null);
      setBluetoothStatus(null);
    }
  }, [paymentMethod]);

  const subtotal = parseFloat(totals.subtotal) || 0;
  const tax = parseFloat(totals.tax) || 0;
  const grandTotal = parseFloat(totals.total) || (subtotal + tax);
  
  const cardFeeAmount = grandTotal * 0.03;
  // Extra 3% credit card processing fee (only when credit card selected)
  const creditCardFee = paymentMethod === 'credit_card' ? cardFeeAmount : 0;
  const finalTotal = grandTotal + creditCardFee;

  const checkTerminalConnection = async () => {
    if (!terminalIP) return;
    
    setCheckingTerminal(true);
    try {
      const response = await paxAPI.test(terminalIP);
      if (response.data.success) {
        setTerminalStatus({ connected: true, message: 'Terminal connected' });
        localStorage.setItem('paxTerminalIP', terminalIP);
        showToast('Terminal connected successfully', 'success', 2000);
      } else {
        setTerminalStatus({ connected: false, message: 'Terminal connection failed' });
        showToast('Terminal connection failed', 'error', 2000);
      }
    } catch (error) {
      setTerminalStatus({ connected: false, message: 'Cannot connect to terminal' });
      showToast('Cannot connect to terminal', 'error', 2000);
    } finally {
      setCheckingTerminal(false);
    }
  };

  const checkUsbReaderConnection = async () => {
    setCheckingUsbReader(true);
    setUsbReaderConnected(null);
    
    try {
      // Check if WebHID API is available (requires HTTPS)
      if (navigator.hid) {
        try {
          // First, check already connected devices (no user interaction needed)
          const existingDevices = await navigator.hid.getDevices();
          const bbposDevice = existingDevices.find(d => 
            d.productName?.includes('BBPOS') || 
            d.productName?.includes('Chipper') || 
            d.productName?.includes('CHIPPER') ||
            d.productName?.includes('CHB')
          );
          
          if (bbposDevice) {
            setUsbReaderConnected(true);
            showToast('BBPOS Chipper 3X USB reader detected!', 'success', 2000);
            return true;
          }
          
          // If not found in existing devices, request access (requires user interaction)
          const devices = await navigator.hid.requestDevice({
            filters: [
              { vendorId: 0x0bda }, // Common USB device vendor IDs
              { vendorId: 0x1a86 },
              { vendorId: 0x04e8 },
              { vendorId: 0x0bda }
            ]
          });
          
          if (devices && devices.length > 0) {
            // Check if any device is a BBPOS reader
            const bbposFound = devices.some(d => 
              d.productName?.includes('BBPOS') || 
              d.productName?.includes('Chipper') || 
              d.productName?.includes('CHIPPER') ||
              d.productName?.includes('CHB')
            );
            
            if (bbposFound) {
              setUsbReaderConnected(true);
              showToast('BBPOS Chipper 3X USB reader detected!', 'success', 2000);
              return true;
            } else {
              setUsbReaderConnected(false);
              showToast('USB device found, but not recognized as BBPOS Chipper 3X.', 'warning', 3000);
              return false;
            }
          } else {
            setUsbReaderConnected(false);
            showToast('No USB card reader detected. Please check connection.', 'error', 3000);
            return false;
          }
        } catch (hidError) {
          // WebHID not available or permission denied
          console.log('WebHID check failed:', hidError);
          // Fall through to manual check
        }
      }
      
      // Fallback: Show test method since WebHID requires HTTPS
      // For HTTP, we'll show a warning and test field
      setUsbReaderConnected(false);
      showToast('Cannot auto-detect USB reader over HTTP. Please test manually.', 'warning', 4000);
      return false;
    } catch (error) {
      console.error('USB reader check error:', error);
      setUsbReaderConnected(false);
      showToast('Error checking USB reader connection', 'error', 3000);
      return false;
    } finally {
      setCheckingUsbReader(false);
    }
  };

  const handleBluetoothToggle = async (checked) => {
    if (checked) {
      setUseTerminal(false);
      
      // If USB is selected, check connection
      if (readerType === 'usb') {
        await checkUsbReaderConnection();
      }
    } else {
      setBluetoothPayload(null);
      setBluetoothStatus(null);
      setUsbReaderConnected(null);
    }
    
    setUseBluetoothReader(checked);
  };

  const pairBluetoothReader = async () => {
    setBluetoothStatus(null);
    setPairingBluetoothReader(true);
    try {
      // Check if Web Bluetooth API is available
      if (navigator.bluetooth) {
        try {
          // Try to connect to Bluetooth device
          const device = await navigator.bluetooth.requestDevice({
            filters: [
              { namePrefix: 'BBPOS' },
              { namePrefix: 'Chipper' },
              { namePrefix: 'CHIPPER' },
              { namePrefix: 'CHB' }
            ],
            optionalServices: ['battery_service']
          });

          const server = await device.gatt.connect();
          
          setBluetoothStatus({
            connected: true,
            message: 'Bluetooth reader connected! Note: Card reading requires Accept Mobile SDK.'
          });
          
          setBluetoothReaderInfo({
            id: device.id,
            name: device.name || 'BBPOS Reader',
            batteryLevel: null
          });
          
          showToast('Reader connected! Use test mode or Accept Mobile SDK for card data.', 'success', 4000);
          
          // Enable test mode for manual entry
          setTestMode(true);
        } catch (bluetoothError) {
          if (bluetoothError.name === 'NotFoundError') {
            showToast('Reader not found. Enable test mode to manually enter card data.', 'warning', 4000);
            setTestMode(true);
          } else {
            throw bluetoothError;
          }
        }
      } else {
        // Web Bluetooth not available - enable test mode
        showToast('Web Bluetooth not available. Using test mode for manual entry.', 'info', 4000);
        setTestMode(true);
      }
    } catch (error) {
      const message = error.formattedMessage ||
        error.response?.data?.message ||
        error.message ||
        'Bluetooth connection failed. Enable test mode to manually enter card data.';
      setBluetoothStatus({ connected: false, message });
      showToast(message + ' You can use test mode to manually enter opaqueData.', 'warning', 5000);
      setTestMode(true);
    } finally {
      setPairingBluetoothReader(false);
    }
  };

  const handleTestOpaqueDataSubmit = () => {
    if (!testOpaqueData.descriptor || !testOpaqueData.value) {
      showToast('Please enter both descriptor and value', 'error', 3000);
      return;
    }

    const payload = {
      descriptor: testOpaqueData.descriptor,
      value: testOpaqueData.value,
      sessionId: testOpaqueData.sessionId || `TEST-${Date.now()}`
    };

    setBluetoothPayload(payload);
    setBluetoothReaderInfo({
      id: 'test-reader',
      name: 'Test Bluetooth Reader',
      maskedNumber: '****TEST',
      batteryLevel: 100
    });
    setBluetoothStatus({
      connected: true,
      message: 'Test opaqueData loaded. Ready to process payment.'
    });
    showToast('Test opaqueData loaded successfully!', 'success', 2000);
  };

  const validateCardDetails = () => {
    const cleanedCardNumber = cardDetails.cardNumber.replace(/\s/g, '');
    if (!/^\d{13,19}$/.test(cleanedCardNumber)) {
      return 'Invalid card number. Must be 13-19 digits.';
    }
    if (!/^\d{2}\/\d{2}$/.test(cardDetails.expirationDate)) {
      return 'Invalid expiration date. Use MM/YY format (e.g., 12/25).';
    }
    if (!/^\d{3,4}$/.test(cardDetails.cvv)) {
      return 'Invalid CVV. Must be 3-4 digits.';
    }
    if (cardDetails.zip && !/^\d{5}(-\d{4})?$/.test(cardDetails.zip)) {
      return 'Invalid ZIP code. Use 5 or 9 digits (e.g., 12345 or 12345-6789).';
    }
    return null;
  };

  const validateAchDetails = () => {
    if (!achDetails.nameOnAccount.trim()) {
      return 'Account holder name is required for ACH.';
    }
    if (!/^\d{9}$/.test(achDetails.routingNumber)) {
      return 'Routing number must be 9 digits.';
    }
    if (!/^\d{4,17}$/.test(achDetails.accountNumber)) {
      return 'Account number must be 4-17 digits.';
    }
    if (achDetails.accountType && !['checking', 'savings'].includes(achDetails.accountType)) {
      return 'Account type must be checking or savings.';
    }
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setProcessing(true);

    try {
      // Validation based on payment method
      if (paymentMethod === 'credit_card' || paymentMethod === 'debit_card') {
        if (useBluetoothReader) {
          if (readerType === 'bluetooth' && !bluetoothPayload) {
            setError('Bluetooth reader must be paired and card scanned before processing payment.');
            setProcessing(false);
            return;
          }
          if (readerType === 'usb') {
            // For USB reader, validate card details (reader fills card number, user enters rest)
            if (!cardDetails.cardNumber || cardDetails.cardNumber.length < 13) {
              setError('Please swipe/insert card in the card reader to capture card number.');
              setProcessing(false);
              return;
            }
            const validationError = validateCardDetails();
            if (validationError) {
              setError(validationError);
              setProcessing(false);
              return;
            }
          }
        }
        if (useTerminal && !terminalStatus?.connected) {
          setError('Terminal must be connected before processing payment.');
          setProcessing(false);
          return;
        }
        if (!useBluetoothReader && !useTerminal) {
          const validationError = validateCardDetails();
          if (validationError) {
            setError(validationError);
            setProcessing(false);
            return;
          }
        }
      } else if (paymentMethod === 'zelle') {
        if (!zelleConfirmation.trim()) {
          setError('Please enter Zelle confirmation number or transaction ID.');
          setProcessing(false);
          return;
        }
      } else if (paymentMethod === 'ach') {
        const validationError = validateAchDetails();
        if (validationError) {
          setError(validationError);
          setProcessing(false);
          return;
        }
      }
      // Cash requires no validation

      const saleData = {
        items: cart.map(item => ({
          itemId: item.id,
          quantity: item.quantity
        })),
        customerId: customer?.id || null,
        customerTaxPreference: customerTaxPreference || null,
        paymentType: paymentMethod,
        notes: `Sale at POS - ${new Date().toLocaleString()}${paymentMethod === 'zelle' ? ` - Zelle Confirmation: ${zelleConfirmation}` : ''}${paymentMethod === 'ach' ? ` - ACH payment` : ''}`,
        useBluetoothReader: (paymentMethod === 'credit_card' || paymentMethod === 'debit_card') ? useBluetoothReader : false,
        bluetoothPayload: ((paymentMethod === 'credit_card' || paymentMethod === 'debit_card') && useBluetoothReader) ? bluetoothPayload : null,
        useTerminal: (paymentMethod === 'credit_card' || paymentMethod === 'debit_card') ? useTerminal : false,
        terminalIP: ((paymentMethod === 'credit_card' || paymentMethod === 'debit_card') && useTerminal) ? terminalIP : null,
        paymentDetails: (paymentMethod === 'credit_card' || paymentMethod === 'debit_card') && !useBluetoothReader && !useTerminal ? cardDetails : 
                       paymentMethod === 'zelle' ? { zelleConfirmation } : 
                       paymentMethod === 'ach' ? achDetails : null
      };

      const response = await salesAPI.create(saleData);
      onComplete(response.data);
    } catch (err) {
      const errorMsg = err.formattedMessage || 
                      err.response?.data?.message || 
                      'Payment failed. Please try again.';
      setError(errorMsg);
      showToast(errorMsg, 'error', 5000);
    } finally {
      setProcessing(false);
    }
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
        maxHeight: '90vh', 
        overflowY: 'auto',
        boxShadow: 'var(--shadow-xl)'
      }}>
        <div className="flex-between mb-3">
          <h2 style={{ fontSize: '28px', fontWeight: '800', margin: 0 }}>
            Payment
          </h2>
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
        </div>

        {error && (
          <div className="error mb-3" style={{ padding: '14px 16px', borderRadius: '12px' }}>
            {error}
          </div>
        )}

        {/* Cart Items */}
        <div style={{ 
          background: 'var(--gray-50)', 
          padding: '20px',
          borderRadius: '12px',
          marginBottom: '16px',
          border: '2px solid var(--border)'
        }}>
          <div className="flex-between" style={{ marginBottom: '12px' }}>
            <span style={{ fontWeight: '700', color: 'var(--dark)' }}>Items</span>
            <span style={{ fontWeight: '600', color: 'var(--gray-600)' }}>{cart.length} item{cart.length === 1 ? '' : 's'}</span>
          </div>
          {cart.length === 0 ? (
            <p style={{ margin: 0, fontSize: '14px', color: 'var(--gray-500)' }}>No items in the cart yet.</p>
          ) : (
            cart.map(item => {
              const price = parseFloat(item.price || 0);
              const quantity = item.quantity || 1;
              return (
                <div key={item.id} style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center', 
                  padding: '8px 0', 
                  borderBottom: '1px solid var(--border)',
                  gap: '12px'
                }}>
                  <div style={{ flex: 1, display: 'flex', gap: '12px', alignItems: 'center', whiteSpace: 'nowrap', overflow: 'hidden' }}>
                    <span style={{ 
                      fontWeight: '600', 
                      fontSize: '14px', 
                      color: 'var(--dark)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}>
                      {item.name}
                    </span>
                    <span style={{ fontSize: '12px', color: 'var(--gray-600)' }}>
                      {quantity} × ${price.toFixed(2)}
                    </span>
                  </div>
                  <div style={{ fontWeight: '700', fontSize: '16px', color: 'var(--primary)' }}>
                    ${(price * quantity).toFixed(2)}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Totals Summary */}
        <div style={{ 
          background: 'var(--gray-50)', 
          padding: '20px', 
          borderRadius: '12px',
          marginBottom: '24px',
          border: '2px solid var(--border)'
        }}>
          <div className="flex-between" style={{ marginBottom: '10px', fontSize: '16px' }}>
            <span style={{ color: 'var(--gray-700)', fontWeight: '500' }}>Subtotal:</span>
            <span style={{ fontWeight: '700', color: 'var(--dark)' }}>${subtotal.toFixed(2)}</span>
          </div>
          <div className="flex-between" style={{ marginBottom: '10px', fontSize: '16px' }}>
            <span style={{ color: 'var(--gray-700)', fontWeight: '500' }}>Sales Tax:</span>
            <span style={{ fontWeight: '700', color: 'var(--dark)' }}>${tax.toFixed(2)}</span>
          </div>
          <div className="flex-between" style={{ marginBottom: '10px', fontSize: '16px' }}>
            <span style={{ color: 'var(--gray-700)', fontWeight: '500' }}>Grand Total:</span>
            <span style={{ fontWeight: '700', color: 'var(--dark)' }}>${grandTotal.toFixed(2)}</span>
          </div>
          {paymentMethod === 'credit_card' && creditCardFee > 0 && (
            <div className="flex-between" style={{ marginBottom: '10px', fontSize: '16px', color: 'var(--warning)' }}>
              <span style={{ fontWeight: '500' }}>Credit Card Processing Fee (3%):</span>
              <span style={{ fontWeight: '700' }}>${creditCardFee.toFixed(2)}</span>
            </div>
          )}
          <div className="flex-between" style={{ 
            fontSize: '28px', 
            fontWeight: '800',
            paddingTop: '16px',
            borderTop: '2px solid var(--border)',
            marginTop: '12px'
          }}>
            <span style={{ color: 'var(--dark)' }}>Total:</span>
            <span style={{ 
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent'
            }}>
              ${finalTotal.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Payment Method Selector */}
        <div style={{ marginBottom: '24px' }}>
          <label style={{ 
            display: 'block', 
            marginBottom: '12px', 
            fontWeight: '700',
            fontSize: '16px',
            color: 'var(--dark)'
          }}>
            Select Payment Method
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
            <button
              type="button"
              onClick={() => setPaymentMethod('cash')}
              style={{
                padding: '16px 12px',
                border: paymentMethod === 'cash' ? '3px solid var(--primary)' : '2px solid var(--border)',
                borderRadius: '10px',
                background: paymentMethod === 'cash' ? '#f0f9ff' : 'white',
                cursor: 'pointer',
                transition: 'all 0.2s',
                textAlign: 'center'
              }}
            >
              <div style={{ fontSize: '28px', marginBottom: '6px' }}>💵</div>
              <div style={{ 
                fontWeight: '700', 
                fontSize: '14px', 
                color: 'var(--dark)',
                fontFamily: 'var(--font-family)',
                marginBottom: '4px'
              }}>
                Cash
              </div>
              <div style={{ 
                fontSize: '11px', 
                color: 'var(--success)', 
                fontFamily: 'var(--font-family)',
                fontWeight: '600'
              }}>
                No fee
              </div>
            </button>
            
            <button
              type="button"
              onClick={() => setPaymentMethod('credit_card')}
              style={{
                padding: '16px 12px',
                border: paymentMethod === 'credit_card' ? '3px solid var(--primary)' : '2px solid var(--border)',
                borderRadius: '10px',
                background: paymentMethod === 'credit_card' ? '#f0f9ff' : 'white',
                cursor: 'pointer',
                transition: 'all 0.2s',
                textAlign: 'center'
              }}
            >
              <div style={{ fontSize: '28px', marginBottom: '6px' }}>💳</div>
              <div style={{ 
                fontWeight: '700', 
                fontSize: '14px', 
                color: 'var(--dark)',
                fontFamily: 'var(--font-family)',
                marginBottom: '4px'
              }}>
                Credit Card
              </div>
              <div style={{ 
                fontSize: '11px', 
                color: 'var(--warning)', 
                fontFamily: 'var(--font-family)',
                fontWeight: '600'
              }}>
                +3% fee ($${cardFeeAmount.toFixed(2)})
              </div>
            </button>

            <button
              type="button"
              onClick={() => setPaymentMethod('debit_card')}
              style={{
                padding: '16px 12px',
                border: paymentMethod === 'debit_card' ? '3px solid var(--primary)' : '2px solid var(--border)',
                borderRadius: '10px',
                background: paymentMethod === 'debit_card' ? '#f0f9ff' : 'white',
                cursor: 'pointer',
                transition: 'all 0.2s',
                textAlign: 'center'
              }}
            >
              <div style={{ fontSize: '28px', marginBottom: '6px' }}>💳</div>
              <div style={{ 
                fontWeight: '700', 
                fontSize: '14px', 
                color: 'var(--dark)',
                fontFamily: 'var(--font-family)',
                marginBottom: '4px'
              }}>
                Debit Card
              </div>
              <div style={{ 
                fontSize: '11px', 
                color: 'var(--success)', 
                fontFamily: 'var(--font-family)',
                fontWeight: '600'
              }}>
                No fee
              </div>
            </button>
            
            <button
              type="button"
              onClick={() => setPaymentMethod('zelle')}
              style={{
                padding: '16px 12px',
                border: paymentMethod === 'zelle' ? '3px solid var(--primary)' : '2px solid var(--border)',
                borderRadius: '10px',
                background: paymentMethod === 'zelle' ? '#f0f9ff' : 'white',
                cursor: 'pointer',
                transition: 'all 0.2s',
                textAlign: 'center'
              }}
            >
              <div style={{ fontSize: '28px', marginBottom: '6px' }}>📱</div>
              <div style={{ 
                fontWeight: '700', 
                fontSize: '14px', 
                color: 'var(--dark)',
                fontFamily: 'var(--font-family)',
                marginBottom: '4px'
              }}>
                Zelle
              </div>
              <div style={{ 
                fontSize: '11px', 
                color: 'var(--success)', 
                fontFamily: 'var(--font-family)',
                fontWeight: '600'
              }}>
                No fee
              </div>
            </button>
            
            <button
              type="button"
              onClick={() => setPaymentMethod('ach')}
              style={{
                padding: '16px 12px',
                border: paymentMethod === 'ach' ? '3px solid var(--primary)' : '2px solid var(--border)',
                borderRadius: '10px',
                background: paymentMethod === 'ach' ? '#f0f9ff' : 'white',
                cursor: 'pointer',
                transition: 'all 0.2s',
                textAlign: 'center'
              }}
            >
              <div style={{ fontSize: '28px', marginBottom: '6px' }}>🏦</div>
              <div style={{ 
                fontWeight: '700', 
                fontSize: '14px', 
                color: 'var(--dark)',
                fontFamily: 'var(--font-family)',
                marginBottom: '4px'
              }}>
                ACH
              </div>
              <div style={{ 
                fontSize: '11px', 
                color: 'var(--success)', 
                fontFamily: 'var(--font-family)',
                fontWeight: '600'
              }}>
                Bank account
              </div>
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Cash Payment */}
          {paymentMethod === 'cash' && (
            <div style={{
              background: '#f0fdf4',
              padding: '24px',
              borderRadius: '12px',
              border: '2px solid #10b981',
              marginBottom: '20px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '64px', marginBottom: '16px' }}>💵</div>
              <h3 style={{ 
                fontWeight: '700', 
                fontSize: '20px', 
                marginBottom: '12px',
                color: 'var(--dark)',
                fontFamily: 'var(--font-family)'
              }}>
                Cash Payment
              </h3>
              <p style={{
                fontSize: '16px',
                color: 'var(--gray-700)',
                marginBottom: '16px',
                fontFamily: 'var(--font-family)',
                lineHeight: '1.5'
              }}>
                Collect <strong style={{ fontSize: '24px', color: 'var(--success)' }}>${grandTotal.toFixed(2)}</strong> in cash from the customer.
              </p>
              <div style={{
                background: 'white',
                padding: '12px 20px',
                borderRadius: '8px',
                display: 'inline-block',
                fontSize: '14px',
                color: 'var(--success)',
                fontWeight: '600'
              }}>
                {paymentMethod === 'credit_card' ? `✅ Processing fee: $${creditCardFee.toFixed(2)}` : '✅ No processing fee'}
              </div>
            </div>
          )}

          {/* Card Payment (Credit Card or Debit Card) */}
          {(paymentMethod === 'credit_card' || paymentMethod === 'debit_card') && (
          <div>
              {/* Card Reader Option */}
              {true && (
              <div style={{
                background: '#f0fdf4',
                padding: '16px',
                borderRadius: '12px',
                marginBottom: '20px',
                border: '2px solid #10b981'
              }}>
                <div className="flex-between mb-2">
                  <div>
                    <p style={{ fontWeight: '700', marginBottom: '4px', fontSize: '16px' }}>
                      💳 Card Reader (USB/Bluetooth)
                    </p>
                    <p style={{ fontSize: '14px', color: '#059669' }}>
                      Use BBPOS Chipper 3X card reader (USB or Bluetooth) for {paymentMethod === 'credit_card' ? 'credit' : 'debit'} card payment
                    </p>
                    <div style={{ marginTop: '8px', fontSize: '12px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                        <input
                          type="radio"
                          name="readerType"
                          checked={readerType === 'usb'}
                          onChange={async () => {
                            setReaderType('usb');
                            // Check USB connection when switching to USB mode
                            if (useBluetoothReader) {
                              await checkUsbReaderConnection();
                            }
                          }}
                          style={{ cursor: 'pointer' }}
                        />
                        <span>USB Connected</span>
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginTop: '4px' }}>
                        <input
                          type="radio"
                          name="readerType"
                          checked={readerType === 'bluetooth'}
                          onChange={() => setReaderType('bluetooth')}
                          style={{ cursor: 'pointer' }}
                        />
                        <span>Bluetooth</span>
                      </label>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={useBluetoothReader}
                    onChange={(e) => handleBluetoothToggle(e.target.checked)}
                    style={{ width: '24px', height: '24px', cursor: 'pointer' }}
                  />
                </div>
                
                {useBluetoothReader && (
                  <div style={{ marginTop: '16px' }}>
                    {readerType === 'usb' ? (
                      /* USB Reader Mode */
                      <div>
                        <div style={{
                          background: '#eff6ff',
                          padding: '16px',
                          borderRadius: '8px',
                          border: '2px solid #3b82f6',
                          marginBottom: '12px'
                        }}>
                          <p style={{ 
                            fontWeight: '700', 
                            fontSize: '14px', 
                            marginBottom: '8px',
                            color: 'var(--dark)'
                          }}>
                            🔌 USB Card Reader Mode
                          </p>
                          {/* USB Reader Connection Status */}
                          {checkingUsbReader ? (
                            <div style={{
                              background: '#fff7ed',
                              padding: '12px',
                              borderRadius: '6px',
                              border: '2px solid #f59e0b',
                              marginBottom: '12px'
                            }}>
                              <p style={{ 
                                fontSize: '12px', 
                                color: 'var(--warning)',
                                fontWeight: '600',
                                margin: 0
                              }}>
                                ⏳ Checking USB reader connection...
                              </p>
                            </div>
                          ) : usbReaderConnected === true ? (
                            <div style={{
                              background: '#f0fdf4',
                              padding: '12px',
                              borderRadius: '6px',
                              border: '2px solid #10b981',
                              marginBottom: '12px'
                            }}>
                              <p style={{ 
                                fontSize: '12px', 
                                color: 'var(--success)',
                                fontWeight: '600',
                                margin: 0,
                                marginBottom: '8px'
                              }}>
                                ✓ USB Reader Connected
                              </p>
                              <p style={{ 
                                fontSize: '11px', 
                                color: 'var(--gray-600)',
                                margin: 0
                              }}>
                                Your USB card reader is connected and ready. Click in the "Card Number" field below, then swipe/insert/tap your card. 
                                The card data will be captured automatically!
                              </p>
                            </div>
                          ) : usbReaderConnected === false ? (
                            <div style={{
                              background: '#fef2f2',
                              padding: '12px',
                              borderRadius: '6px',
                              border: '2px solid #ef4444',
                              marginBottom: '12px'
                            }}>
                              <p style={{ 
                                fontSize: '12px', 
                                color: '#dc2626',
                                fontWeight: '700',
                                margin: 0,
                                marginBottom: '8px'
                              }}>
                                ❌ USB Reader Not Detected
                              </p>
                              <p style={{ 
                                fontSize: '11px', 
                                color: '#991b1b',
                                margin: 0,
                                marginBottom: '8px'
                              }}>
                                <strong>Warning:</strong> USB card reader is not detected. Please:
                              </p>
                              <ul style={{ 
                                fontSize: '11px', 
                                color: '#991b1b',
                                margin: '8px 0 0 20px',
                                padding: 0
                              }}>
                                <li>Check USB cable connection</li>
                                <li>Try a different USB port</li>
                                <li>Verify reader is powered on</li>
                                <li>Check Windows Device Manager</li>
                              </ul>
                              <button
                                type="button"
                                onClick={checkUsbReaderConnection}
                                className="btn btn-secondary"
                                style={{ 
                                  marginTop: '10px',
                                  padding: '8px 16px',
                                  fontSize: '12px',
                                  width: '100%'
                                }}
                              >
                                🔄 Check Again
                              </button>
                            </div>
                          ) : null}
                          
                          {/* Manual Test Option (if auto-detection failed) */}
                          {usbReaderConnected === false && (
                            <div style={{
                              background: '#eff6ff',
                              padding: '12px',
                              borderRadius: '6px',
                              border: '1px solid #3b82f6',
                              marginBottom: '12px'
                            }}>
                              <p style={{ 
                                fontSize: '11px', 
                                color: 'var(--gray-700)',
                                margin: 0,
                                marginBottom: '8px',
                                fontWeight: '600'
                              }}>
                                💡 Test Manually:
                              </p>
                              <p style={{ 
                                fontSize: '11px', 
                                color: 'var(--gray-600)',
                                margin: 0
                              }}>
                                Click in the "Card Number" field below and swipe a card. If data appears, the reader is working!
                              </p>
                            </div>
                          )}
                        </div>
                        
                        {/* Card Input Fields for USB Reader */}
                        {readerType === 'usb' && (
                          <div style={{ marginTop: '20px' }}>
                            <div className="mb-2">
                              <label style={{ 
                                display: 'block', 
                                marginBottom: '10px', 
                                fontWeight: '700',
                                fontSize: '16px',
                                color: 'var(--dark)'
                              }}>
                                Card Number (Swipe/Insert Card)
                              </label>
                              <input
                                type="text"
                                className="input"
                                placeholder="Swipe or insert card here..."
                                value={cardDetails.cardNumber}
                                onChange={(e) => {
                                  const value = e.target.value.replace(/\s/g, '');
                                  setCardDetails({ 
                                    ...cardDetails, 
                                    cardNumber: value
                                  });
                                  if (value.length > 10 && usbReaderConnected === true) {
                                    showToast('Card number captured!', 'success', 2000);
                                  }
                                }}
                                onFocus={() => {
                                  setCardInputFocused(true);
                                  if (usbReaderConnected === true) {
                                    showToast('Ready to read card. Swipe/Insert now.', 'info', 2000);
                                  }
                                }}
                                maxLength="19"
                                required
                                autoFocus={usbReaderConnected === true}
                                style={{
                                  fontSize: '18px',
                                  padding: '16px',
                                  fontFamily: 'monospace',
                                  border: (usbReaderConnected === true && cardInputFocused) ? '3px solid var(--success)' : undefined
                                }}
                              />
                              {usbReaderConnected === true && (
                                <p style={{
                                  fontSize: '12px',
                                  color: 'var(--success)',
                                  marginTop: '4px',
                                  fontWeight: '600'
                                }}>
                                  ✓ Click in field above, then swipe/insert your card
                                </p>
                              )}
                            </div>
                            
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px', marginTop: '16px' }}>
                              <div>
                                <label style={{ 
                                  display: 'block', 
                                  marginBottom: '10px', 
                                  fontWeight: '700',
                                  fontSize: '16px',
                                  color: 'var(--dark)'
                                }}>
                                  Expiration (MM/YY)
                                </label>
                                <input
                                  type="text"
                                  className="input"
                                  placeholder="12/25"
                                  value={cardDetails.expirationDate}
                                  onChange={(e) => {
                                    let value = e.target.value.replace(/\D/g, '');
                                    if (value.length >= 2) {
                                      value = value.slice(0, 2) + '/' + value.slice(2, 4);
                                    }
                                    setCardDetails({ ...cardDetails, expirationDate: value });
                                  }}
                                  maxLength="5"
                                  required
                                  style={{
                                    fontSize: '18px',
                                    padding: '16px',
                                    fontFamily: 'monospace'
                                  }}
                                />
                              </div>
                              <div>
                                <label style={{ 
                                  display: 'block', 
                                  marginBottom: '10px', 
                                  fontWeight: '700',
                                  fontSize: '16px',
                                  color: 'var(--dark)'
                                }}>
                                  CVV
                                </label>
                                <input
                                  type="text"
                                  className="input"
                                  placeholder="123"
                                  value={cardDetails.cvv}
                                  onChange={(e) => setCardDetails({ 
                                    ...cardDetails, 
                                    cvv: e.target.value.replace(/\D/g, '') 
                                  })}
                                  maxLength="4"
                                  required
                                  style={{
                                    fontSize: '18px',
                                    padding: '16px',
                                    fontFamily: 'monospace'
                                  }}
                                />
                              </div>
                            </div>

                            <div className="mb-3">
                              <label style={{ 
                                display: 'block', 
                                marginBottom: '10px', 
                                fontWeight: '700',
                                fontSize: '16px',
                                color: 'var(--dark)'
                              }}>
                                ZIP Code
                              </label>
                              <input
                                type="text"
                                className="input"
                                placeholder="12345"
                                value={cardDetails.zip}
                                onChange={(e) => setCardDetails({ 
                                  ...cardDetails, 
                                  zip: e.target.value.replace(/\D/g, '') 
                                })}
                                maxLength="10"
                                style={{
                                  fontSize: '18px',
                                  padding: '16px'
                                }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    ) : !bluetoothPayload ? (
                      /* Bluetooth Reader Mode */
                        <div>
                          <button
                            type="button"
                            onClick={pairBluetoothReader}
                            disabled={pairingBluetoothReader}
                            className="btn btn-primary"
                            style={{ 
                              width: '100%',
                              padding: '12px 20px',
                              marginBottom: '12px'
                            }}
                          >
                            {pairingBluetoothReader ? (
                              <>
                                <span className="spinner" style={{ width: '16px', height: '16px', borderWidth: '2px', marginRight: '8px' }}></span>
                                Pairing Reader...
                              </>
                            ) : (
                              '🔗 Pair Bluetooth Reader'
                            )}
                          </button>
                        
                        {/* Test Mode for Manual Entry */}
                        {testMode && (
                          <div style={{
                            background: '#fff7ed',
                            padding: '16px',
                            borderRadius: '8px',
                            border: '2px solid #f59e0b',
                            marginTop: '12px'
                          }}>
                            <p style={{ 
                              fontWeight: '700', 
                              fontSize: '14px', 
                              marginBottom: '12px',
                              color: 'var(--dark)'
                            }}>
                              🧪 Test Mode - Manual Entry
                            </p>
                            <p style={{ 
                              fontSize: '12px', 
                              color: 'var(--gray-600)',
                              marginBottom: '12px'
                            }}>
                              For testing: Generate test data or enter opaqueData manually
                            </p>
                            
                            {/* Quick Generate Button */}
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  const response = await bluetoothAPI.generateTestData({
                                    cardNumber: '4111111111111111',
                                    expDate: '12/25',
                                    cvv: '123',
                                    zip: '12345'
                                  });
                                  if (response.data?.success) {
                                    const testData = response.data.data.opaqueData;
                                    setTestOpaqueData({
                                      descriptor: testData.dataDescriptor,
                                      value: testData.dataValue,
                                      sessionId: response.data.data.deviceSessionId
                                    });
                                    showToast('Test data generated! Click "Load Test Data" to use it.', 'success', 3000);
                                  }
                                } catch (error) {
                                  showToast('Failed to generate test data', 'error', 3000);
                                }
                              }}
                              className="btn btn-secondary"
                              style={{ 
                                width: '100%',
                                padding: '10px',
                                fontSize: '13px',
                                marginBottom: '12px'
                              }}
                            >
                              ⚡ Quick Generate Test Data
                            </button>
                            
                            <div style={{ marginBottom: '10px' }}>
                              <label style={{ 
                                display: 'block', 
                                marginBottom: '4px', 
                                fontSize: '12px',
                                fontWeight: '600'
                              }}>
                                Data Descriptor:
                              </label>
                              <input
                                type="text"
                                className="input"
                                placeholder="COMMON.ACCEPT.INAPP.PAYMENT"
                                value={testOpaqueData.descriptor}
                                onChange={(e) => setTestOpaqueData({ ...testOpaqueData, descriptor: e.target.value })}
                                style={{ fontSize: '12px', padding: '8px' }}
                              />
                            </div>
                            
                            <div style={{ marginBottom: '10px' }}>
                              <label style={{ 
                                display: 'block', 
                                marginBottom: '4px', 
                                fontSize: '12px',
                                fontWeight: '600'
                              }}>
                                Data Value (encrypted):
                              </label>
                              <input
                                type="text"
                                className="input"
                                placeholder="Enter encrypted data value from reader"
                                value={testOpaqueData.value}
                                onChange={(e) => setTestOpaqueData({ ...testOpaqueData, value: e.target.value })}
                                style={{ fontSize: '12px', padding: '8px', fontFamily: 'monospace' }}
                              />
                            </div>
                            
                            <div style={{ marginBottom: '12px' }}>
                              <label style={{ 
                                display: 'block', 
                                marginBottom: '4px', 
                                fontSize: '12px',
                                fontWeight: '600'
                              }}>
                                Session ID (optional):
                              </label>
                              <input
                                type="text"
                                className="input"
                                placeholder="Device session ID"
                                value={testOpaqueData.sessionId}
                                onChange={(e) => setTestOpaqueData({ ...testOpaqueData, sessionId: e.target.value })}
                                style={{ fontSize: '12px', padding: '8px' }}
                              />
                            </div>
                            
                            <button
                              type="button"
                              onClick={handleTestOpaqueDataSubmit}
                              className="btn btn-primary"
                              style={{ 
                                width: '100%',
                                padding: '10px',
                                fontSize: '13px'
                              }}
                            >
                              Load Test Data
                            </button>
                          </div>
                        )}
                        
                        <p style={{
                          fontSize: '13px',
                          color: 'var(--gray-600)',
                          marginTop: '8px',
                          textAlign: 'center'
                        }}>
                          Click to pair with your BBPOS Chipper 3X Bluetooth card reader. Then scan or insert the card.
                        </p>
                      </div>
                    ) : (
                      <div style={{
                        background: 'white',
                        padding: '12px',
                        borderRadius: '8px',
                        border: '2px solid #10b981'
                      }}>
                        <div className="flex-between" style={{ marginBottom: '8px' }}>
                          <span style={{ fontWeight: '600', fontSize: '14px', color: 'var(--dark)' }}>
                            Reader Status:
                          </span>
                          <span style={{ 
                            color: 'var(--success)', 
                            fontWeight: '700',
                            fontSize: '14px'
                          }}>
                            ✅ Ready
                          </span>
                        </div>
                        {bluetoothReaderInfo && (
                          <div style={{ fontSize: '13px', color: 'var(--gray-600)' }}>
                            {bluetoothReaderInfo.name && (
                              <p style={{ margin: '4px 0' }}>Reader: {bluetoothReaderInfo.name}</p>
                            )}
                            {bluetoothReaderInfo.maskedNumber && (
                              <p style={{ margin: '4px 0' }}>Card: {bluetoothReaderInfo.maskedNumber}</p>
                            )}
                            {bluetoothReaderInfo.batteryLevel !== undefined && (
                              <p style={{ margin: '4px 0' }}>Battery: {bluetoothReaderInfo.batteryLevel}%</p>
                            )}
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setBluetoothPayload(null);
                            setBluetoothStatus(null);
                          }}
                          className="btn btn-outline"
                          style={{ 
                            width: '100%',
                            padding: '8px',
                            marginTop: '8px',
                            fontSize: '13px'
                          }}
                        >
                          Reset Reader
                        </button>
                      </div>
                    )}
                    {bluetoothStatus && !bluetoothPayload && (
                      <p style={{
                        fontSize: '13px',
                        marginTop: '8px',
                        color: bluetoothStatus.connected ? 'var(--success)' : 'var(--danger)',
                        fontWeight: '700'
                      }}>
                        {bluetoothStatus.connected ? '✅ ' : '❌ '}
                        {bluetoothStatus.message}
                      </p>
                    )}
                  </div>
                )}
              </div>
              )}

              {/* PAX Terminal Option - DISABLED (can be re-enabled later by changing false to true) */}
              {false && (
              <div style={{
                background: '#f0f9ff',
                padding: '16px',
                borderRadius: '12px',
                marginBottom: '20px',
                border: '2px solid #3b82f6'
              }}>
                <div className="flex-between mb-2">
                  <div>
                    <p style={{ fontWeight: '700', marginBottom: '4px', fontSize: '16px' }}>
                      💳 PAX Terminal Payment
                    </p>
                    <p style={{ fontSize: '14px', color: '#1e40af' }}>
                      Use physical PAX terminal for {paymentMethod === 'credit_card' ? 'credit' : 'debit'} card payment
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={useTerminal}
                    onChange={(e) => {
                      setUseTerminal(e.target.checked);
                      if (e.target.checked) {
                        setUseBluetoothReader(false);
                      }
                    }}
                    style={{ width: '24px', height: '24px', cursor: 'pointer' }}
                  />
                </div>
                
                {useTerminal && (
                  <div style={{ marginTop: '16px' }}>
                    <label style={{ 
                      display: 'block', 
                      marginBottom: '8px', 
                      fontWeight: '600', 
                      fontSize: '14px' 
                    }}>
                      Terminal IP Address
                    </label>
                    <div className="flex" style={{ gap: '8px' }}>
                      <input
                        type="text"
                        className="input"
                        placeholder="192.168.1.100"
                        value={terminalIP}
                        onChange={(e) => setTerminalIP(e.target.value)}
                        style={{ flex: 1 }}
                      />
                      <button
                        type="button"
                        onClick={checkTerminalConnection}
                        disabled={checkingTerminal || !terminalIP}
                        className="btn btn-secondary"
                        style={{ padding: '12px 20px' }}
                      >
                        {checkingTerminal ? 'Checking...' : 'Test'}
                      </button>
                    </div>
                    {terminalStatus && (
                      <p style={{
                        fontSize: '13px',
                        marginTop: '8px',
                        color: terminalStatus.connected ? 'var(--success)' : 'var(--danger)',
                        fontWeight: '700'
                      }}>
                        {terminalStatus.connected ? '✅ ' : '❌ '}
                        {terminalStatus.message}
                      </p>
                    )}
                  </div>
                )}
              </div>
              )}

              {/* Regular Card Entry - Only shown when card reader and terminal are disabled */}
              {!useBluetoothReader && !useTerminal && (
                <>
                  <div className="mb-2">
                    <label style={{ 
                      display: 'block', 
                      marginBottom: '10px', 
                      fontWeight: '700',
                      fontSize: '16px',
                      color: 'var(--dark)'
                    }}>
                      Card Number
                    </label>
                    <input
                      type="text"
                      className="input"
                      placeholder="4111111111111111"
                      value={cardDetails.cardNumber}
                      onChange={(e) => {
                        const value = e.target.value.replace(/\s/g, '');
                        setCardDetails({ 
                          ...cardDetails, 
                          cardNumber: value
                        });
                      }}
                      maxLength="19"
                      required
                      style={{
                        fontSize: '18px',
                        padding: '16px',
                        fontFamily: 'monospace'
                      }}
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                    <div>
                      <label style={{ 
                        display: 'block', 
                        marginBottom: '10px', 
                        fontWeight: '700',
                        fontSize: '16px',
                        color: 'var(--dark)'
                      }}>
                        Expiration (MM/YY)
                      </label>
                      <input
                        type="text"
                        className="input"
                        placeholder="12/25"
                        value={cardDetails.expirationDate}
                        onChange={(e) => {
                          let value = e.target.value.replace(/\D/g, '');
                          if (value.length >= 2) {
                            value = value.slice(0, 2) + '/' + value.slice(2, 4);
                          }
                          setCardDetails({ ...cardDetails, expirationDate: value });
                        }}
                        maxLength="5"
                        required
                        style={{
                          fontSize: '18px',
                          padding: '16px',
                          fontFamily: 'monospace'
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ 
                        display: 'block', 
                        marginBottom: '10px', 
                        fontWeight: '700',
                        fontSize: '16px',
                        color: 'var(--dark)'
                      }}>
                        CVV
                      </label>
                      <input
                        type="text"
                        className="input"
                        placeholder="123"
                        value={cardDetails.cvv}
                        onChange={(e) => setCardDetails({ 
                          ...cardDetails, 
                          cvv: e.target.value.replace(/\D/g, '') 
                        })}
                        maxLength="4"
                        required
                        style={{
                          fontSize: '18px',
                          padding: '16px',
                          fontFamily: 'monospace'
                        }}
                      />
                    </div>
                  </div>

                  <div className="mb-3">
                    <label style={{ 
                      display: 'block', 
                      marginBottom: '10px', 
                      fontWeight: '700',
                      fontSize: '16px',
                      color: 'var(--dark)'
                    }}>
                      ZIP Code
                    </label>
                    <input
                      type="text"
                      className="input"
                      placeholder="12345"
                      value={cardDetails.zip}
                      onChange={(e) => setCardDetails({ 
                        ...cardDetails, 
                        zip: e.target.value.replace(/\D/g, '') 
                      })}
                      maxLength="10"
                      style={{
                        fontSize: '18px',
                        padding: '16px'
                      }}
                    />
                  </div>
                </>
              )}
          </div>
          )}

          {/* ACH Payment */}
          {paymentMethod === 'ach' && (
            <div style={{
              background: '#eff6ff',
              padding: '24px',
              borderRadius: '12px',
              border: '2px solid #3b82f6',
              marginBottom: '20px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                <div style={{ fontSize: '36px' }}>🏦</div>
                <div>
                  <h3 style={{ margin: 0, fontWeight: '700', fontSize: '18px', color: 'var(--dark)' }}>ACH Bank Transfer</h3>
                  <p style={{ margin: 0, color: 'var(--gray-700)', fontSize: '14px' }}>Secure bank payment (no processing fee)</p>
                </div>
              </div>

              <div className="mb-3">
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '700', fontSize: '14px', color: 'var(--dark)' }}>
                  Account Holder Name
                </label>
                <input
                  type="text"
                  className="input"
                  placeholder="Full name on account"
                  value={achDetails.nameOnAccount}
                  onChange={(e) => setAchDetails({ ...achDetails, nameOnAccount: e.target.value })}
                  required
                  style={{ fontSize: '16px', padding: '14px' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: '700', fontSize: '14px', color: 'var(--dark)' }}>
                    Routing Number
                  </label>
                  <input
                    type="text"
                    className="input"
                    placeholder="9 digits"
                    value={achDetails.routingNumber}
                    onChange={(e) => setAchDetails({ ...achDetails, routingNumber: e.target.value.replace(/\D/g, '').slice(0, 9) })}
                    maxLength="9"
                    required
                    style={{ fontSize: '16px', padding: '14px', fontFamily: 'monospace' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: '700', fontSize: '14px', color: 'var(--dark)' }}>
                    Account Number
                  </label>
                  <input
                    type="text"
                    className="input"
                    placeholder="Bank account number"
                    value={achDetails.accountNumber}
                    onChange={(e) => setAchDetails({ ...achDetails, accountNumber: e.target.value.replace(/\D/g, '').slice(0, 17) })}
                    maxLength="17"
                    required
                    style={{ fontSize: '16px', padding: '14px', fontFamily: 'monospace' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: '700', fontSize: '14px', color: 'var(--dark)' }}>
                    Account Type
                  </label>
                  <select
                    className="input"
                    value={achDetails.accountType}
                    onChange={(e) => setAchDetails({ ...achDetails, accountType: e.target.value })}
                    style={{ fontSize: '16px', padding: '14px' }}
                  >
                    <option value="checking">Checking</option>
                    <option value="savings">Savings</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: '700', fontSize: '14px', color: 'var(--dark)' }}>
                    Bank Name (optional)
                  </label>
                  <input
                    type="text"
                    className="input"
                    placeholder="Bank of Example"
                    value={achDetails.bankName}
                    onChange={(e) => setAchDetails({ ...achDetails, bankName: e.target.value })}
                    style={{ fontSize: '16px', padding: '14px' }}
                  />
                </div>
              </div>
              <p style={{ fontSize: '12px', color: 'var(--gray-600)', marginTop: '10px' }}>
                By proceeding, you confirm the customer authorizes a one-time ACH debit for ${grandTotal.toFixed(2)}.
              </p>
          </div>
          )}

          {/* Zelle Payment */}
          {paymentMethod === 'zelle' && (
            <div style={{
              background: '#f0fdf4',
              padding: '24px',
              borderRadius: '12px',
              border: '2px solid #10b981',
              marginBottom: '20px'
            }}>
              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '32px', marginBottom: '12px', textAlign: 'center' }}>📱</div>
                <h3 style={{ 
                  fontWeight: '700', 
                  fontSize: '18px', 
                  marginBottom: '12px',
                  textAlign: 'center',
                  color: 'var(--dark)',
                  fontFamily: 'var(--font-family)'
                }}>
                  Zelle Payment
                </h3>
                <div style={{
                  background: 'white',
                  padding: '16px',
                  borderRadius: '8px',
                  marginBottom: '16px'
                }}>
                  <p style={{ 
                    fontSize: '14px', 
                    color: 'var(--gray-700)', 
                    marginBottom: '12px',
                    fontFamily: 'var(--font-family)',
                    lineHeight: '1.5'
                  }}>
                    <strong>Instructions:</strong>
                  </p>
                  <ol style={{ 
                    fontSize: '14px', 
                    color: 'var(--gray-700)', 
                    paddingLeft: '20px',
                    fontFamily: 'var(--font-family)',
                    lineHeight: '1.6'
                  }}>
                    <li>Ask customer to send <strong>${grandTotal.toFixed(2)}</strong> via Zelle</li>
                    <li>Wait for payment confirmation</li>
                    <li>Enter the Zelle confirmation number below</li>
                  </ol>
                </div>
              </div>

              <div>
                <label style={{ 
                  display: 'block', 
                  marginBottom: '10px', 
                  fontWeight: '700',
                  fontSize: '16px',
                  color: 'var(--dark)'
                }}>
                  Zelle Confirmation Number / Transaction ID *
                </label>
                <input
                  type="text"
                  className="input"
                  placeholder="Enter confirmation number"
                  value={zelleConfirmation}
                  onChange={(e) => setZelleConfirmation(e.target.value)}
                  required
                  style={{
                    fontSize: '16px',
                    padding: '16px',
                    background: 'white'
                  }}
                />
                <p style={{
                  fontSize: '12px',
                  color: 'var(--gray-600)',
                  marginTop: '8px',
                  fontFamily: 'var(--font-family)'
                }}>
                  Enter any identifier from the Zelle transaction for record keeping
                </p>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
            <button
              type="button"
              onClick={onClose}
              className="btn btn-outline"
              style={{ flex: 1, fontSize: '16px', fontWeight: '700', padding: '16px' }}
              disabled={processing}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              style={{ flex: 2, fontSize: '18px', fontWeight: '800', padding: '16px' }}
              disabled={processing}
            >
              {processing ? (
                <>
                  <span className="spinner" style={{ width: '20px', height: '20px', borderWidth: '3px', borderTopColor: 'white' }}></span>
                  Processing...
                </>
              ) : paymentMethod === 'cash' ? (
                `Complete Cash Sale - $${grandTotal.toFixed(2)}`
              ) : paymentMethod === 'zelle' ? (
                `Complete Zelle Payment - $${grandTotal.toFixed(2)}`
              ) : paymentMethod === 'credit_card' ? (
                `Pay $${finalTotal.toFixed(2)}`
              ) : (
                `Pay $${finalTotal.toFixed(2)}`
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PaymentModal;
