/// <reference types="vite/client" />
import React, { useState, useEffect } from 'react';
import { PaymentMethod, PaymentDetails, CartItem } from '../types';
import { X, CreditCard, DollarSign, Smartphone, Loader, Wallet, Building2, Banknote, CheckCircle2, Wifi } from 'lucide-react';
import { encryptCardData, loadAcceptJs, isAcceptJsAvailable } from '../../services/acceptJsService';
import { connectAndReadCard, isWebSerialSupported } from '../../services/usbCardReaderService';
import { TerminalDiscoveryDialog } from './TerminalDiscoveryDialog';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  total: number;
  subtotal: number;
  tax: number;
  cartItems: CartItem[];
  onConfirmPayment: (details: PaymentDetails) => void;
  userTerminalIP?: string | null;
  userTerminalPort?: number | string | null;
}

const paymentMethods: PaymentMethod[] = [
  { type: 'cash', label: 'Cash' },
  { type: 'credit_card', label: 'Credit Card' },
  { type: 'debit_card', label: 'Debit Card' },
  { type: 'zelle', label: 'Zelle' },
  { type: 'ach', label: 'ACH' },
];

export function PaymentModal({ isOpen, onClose, total, subtotal, tax, cartItems, onConfirmPayment, userTerminalIP, userTerminalPort }: PaymentModalProps) {
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod['type']>('cash');
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');
  const [cardZip, setCardZip] = useState('');
  const [zelleConfirmation, setZelleConfirmation] = useState('');
  const [achName, setAchName] = useState('');
  const [achRouting, setAchRouting] = useState('');
  const [achAccount, setAchAccount] = useState('');
  const [achAccountType, setAchAccountType] = useState<'checking' | 'savings'>('checking');
  const [achBankName, setAchBankName] = useState('');
  const [cardPaymentMethod, setCardPaymentMethod] = useState<'usb_reader' | 'pax_terminal' | 'manual'>('manual');
  const [cardReaderStatus, setCardReaderStatus] = useState<'ready' | 'connecting' | 'reading' | 'processing'>('ready');
  const [error, setError] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [acceptJsReady, setAcceptJsReady] = useState(false);
  const [serialSupported, setSerialSupported] = useState(false);
  const [showTerminalDiscovery, setShowTerminalDiscovery] = useState(false);
  const [selectedTerminalIP, setSelectedTerminalIP] = useState<string | null>(userTerminalIP || null);
  const [selectedTerminalPort, setSelectedTerminalPort] = useState<number | string | null>(userTerminalPort || null);

  // Load Accept.js on mount
  useEffect(() => {
    const loadAccept = async () => {
      try {
        await loadAcceptJs();
        setAcceptJsReady(isAcceptJsAvailable());
      } catch (err) {
        console.warn('Accept.js failed to load:', err);
        setAcceptJsReady(false);
      }
    };
    loadAccept();

    // Check Web Serial API support
    setSerialSupported(isWebSerialSupported());
  }, []);

  // Update selected terminal when user settings change
  useEffect(() => {
    if (userTerminalIP) {
      setSelectedTerminalIP(userTerminalIP);
    }
    if (userTerminalPort) {
      setSelectedTerminalPort(userTerminalPort);
    }
  }, [userTerminalIP, userTerminalPort]);

  // Handle terminal selection from discovery dialog
  const handleTerminalSelected = (terminal: { ip: string; port: number }) => {
    setSelectedTerminalIP(terminal.ip);
    setSelectedTerminalPort(terminal.port);
    setShowTerminalDiscovery(false);
  };

  const convenienceFee = (selectedMethod === 'credit_card' || selectedMethod === 'debit_card') ? total * 0.03 : 0;
  const finalTotal = total + convenienceFee;

  if (!isOpen) return null;

  const handleConfirmPayment = async () => {
    setError('');
    setIsProcessing(true);

    // Validation
    if (selectedMethod === 'credit_card' || selectedMethod === 'debit_card') {
      if (cardPaymentMethod === 'pax_terminal') {
        // PAX Terminal validation
        const terminalIP = userTerminalIP || '';
        if (!terminalIP || terminalIP.trim() === '') {
          setError('PAX Terminal IP address is required. Please configure it in Settings.');
          setIsProcessing(false);
          return;
        }
      } else if (cardPaymentMethod === 'manual' && (!cardNumber || !cardExpiry || !cardCvv || !cardZip)) {
        setError('Please fill in all card details');
        setIsProcessing(false);
        return;
      }
    } else if (selectedMethod === 'zelle' && !zelleConfirmation) {
      setError('Please enter Zelle confirmation number');
      setIsProcessing(false);
      return;
    } else if (selectedMethod === 'ach' && (!achName || !achRouting || !achAccount || !achBankName)) {
      setError('Please fill in all ACH details');
      setIsProcessing(false);
      return;
    }

    // Simulate payment processing
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Ensure card payments use credit_card (can be changed to debit_card if needed)
    const paymentMethod = (selectedMethod === 'credit_card' || selectedMethod === 'debit_card') 
      ? 'credit_card'  // Default to credit_card, can add UI to select debit_card later
      : selectedMethod;
    
    const paymentDetails: PaymentDetails = {
      method: paymentMethod,
      amount: finalTotal,
    };

    if (selectedMethod === 'credit_card' || selectedMethod === 'debit_card') {
      if (cardPaymentMethod === 'pax_terminal') {
        // PAX WiFi Terminal mode
        const terminalIP = selectedTerminalIP || userTerminalIP || '';
        const terminalPort = selectedTerminalPort || userTerminalPort || 10009;
        
        if (!terminalIP || terminalIP.trim() === '') {
          setError('PAX Terminal IP address is required. Please select a terminal or configure it in Settings.');
          setIsProcessing(false);
          return;
        }

        paymentDetails.useTerminal = true;
        paymentDetails.terminalIP = terminalIP.trim();
        paymentDetails.terminalPort = typeof terminalPort === 'string' ? parseInt(terminalPort, 10) : terminalPort;
        
        // PAX terminal handles card reading on the device itself
        // No card data needed - terminal will prompt customer
        setCardReaderStatus('processing');
      } else if (cardPaymentMethod === 'usb_reader') {
        // USB Card Reader mode (BBPOS CHIPPER 3X)
        try {
          setCardReaderStatus('connecting');
          setError('');
          
          if (!serialSupported) {
            throw new Error(
              'Web Serial API is not supported in this browser. ' +
              'Please use Chrome, Edge, or Opera. ' +
              'Note: HTTPS is required (except localhost)'
            );
          }
          
          // Read card from USB reader using Web Serial API
          const cardData = await connectAndReadCard((status) => {
            if (status.includes('Reading')) {
              setCardReaderStatus('reading');
            } else if (status.includes('Error')) {
              setCardReaderStatus('ready');
            }
          });

          if (!cardData.cardNumber) {
            throw new Error('No card data received from reader');
          }

          // Encrypt card data using Accept.js
          if (!acceptJsReady) {
            await loadAcceptJs();
            if (!isAcceptJsAvailable()) {
              throw new Error('Accept.js is not available. Please check your connection and try again.');
            }
          }

          // Get public client key from environment
          // You need to add this to your .env file:
          // VITE_AUTHORIZE_NET_PUBLIC_CLIENT_KEY=your_public_client_key
          const publicClientKey = import.meta.env.VITE_AUTHORIZE_NET_PUBLIC_CLIENT_KEY || '';
          
          if (publicClientKey) {
            // Encrypt card data using Accept.js
            const encrypted = await encryptCardData(
              {
                cardNumber: cardData.cardNumber,
                expirationDate: cardData.expirationDate || cardExpiry,
                cardCode: '', // CVV typically not available from reader swipe/insert
                zip: cardZip
              },
              publicClientKey
            );

            paymentDetails.useBluetoothReader = true;
            paymentDetails.bluetoothPayload = {
              descriptor: encrypted.opaqueData.dataDescriptor,
              value: encrypted.opaqueData.dataValue,
              sessionId: `SESSION-${Date.now()}`
            };
          } else {
            // If no public key configured, still send card data
            // Backend can process directly (less secure but functional)
            // Note: You should configure VITE_AUTHORIZE_NET_PUBLIC_CLIENT_KEY for better security
            console.warn('⚠️ Accept.js public client key not configured. Using direct card data.');
            paymentDetails.useBluetoothReader = true;
            paymentDetails.bluetoothPayload = {
              descriptor: 'COMMON.ACCEPT.INAPP.PAYMENT',
              value: `READER_${cardData.cardNumber}_${cardData.expirationDate || 'NO_EXP'}`,
              sessionId: `SESSION-${Date.now()}`
            };
          }

          setCardReaderStatus('ready');
        } catch (readerError: any) {
          setCardReaderStatus('ready');
          const errorMessage = readerError.message || 'Failed to read card from USB reader.';
          
          // Provide helpful error message with fallback option
          if (errorMessage.includes('No compatible') || errorMessage.includes('No compatible devices')) {
            setError(
              errorMessage + '\n\n' +
              '💡 Tip: BBPOS CHIPPER 3X may not work directly with Web Serial API.\n' +
              'Please use "Manual Entry" mode instead, or use the Authorize.Net 2.0 desktop app.'
            );
          } else {
            setError(errorMessage);
          }
          
          setIsProcessing(false);
          return;
        }
      } else {
        // Manual Entry mode - encrypt using Accept.js if available
        try {
          if (!acceptJsReady) {
            await loadAcceptJs();
          }

          // Get public client key from environment
          const publicClientKey = import.meta.env.VITE_AUTHORIZE_NET_PUBLIC_CLIENT_KEY || '';
          
          if (isAcceptJsAvailable() && publicClientKey) {
            // Encrypt card data using Accept.js
            const encrypted = await encryptCardData(
              {
                cardNumber,
                expirationDate: cardExpiry,
                cardCode: cardCvv,
                zip: cardZip
              },
              publicClientKey
            );

            // Use encrypted opaqueData (more secure, PCI compliant)
            paymentDetails.useBluetoothReader = true;
            paymentDetails.bluetoothPayload = {
              descriptor: encrypted.opaqueData.dataDescriptor,
              value: encrypted.opaqueData.dataValue,
              sessionId: `SESSION-${Date.now()}`
            };
          } else {
            // Accept.js not available or no public key - send card data directly
            // Note: Less secure, but functional. Configure public key for better security.
            if (!publicClientKey) {
              console.warn('⚠️ Accept.js public client key not configured. Card data will be sent directly (less secure).');
            }
            paymentDetails.cardNumber = cardNumber;
            paymentDetails.expirationDate = cardExpiry;
            paymentDetails.cvv = cardCvv;
            paymentDetails.zip = cardZip;
          }
        } catch (encryptError: any) {
          // If encryption fails, send card data directly
          console.warn('Accept.js encryption failed, using direct card data:', encryptError);
          paymentDetails.cardNumber = cardNumber;
          paymentDetails.expirationDate = cardExpiry;
          paymentDetails.cvv = cardCvv;
          paymentDetails.zip = cardZip;
        }
      }
    } else if (selectedMethod === 'zelle') {
      paymentDetails.confirmationNumber = zelleConfirmation;
    } else if (selectedMethod === 'ach') {
      paymentDetails.achDetails = {
        name: achName,
        routingNumber: achRouting,
        accountNumber: `****${achAccount.slice(-4)}`,
        accountType: achAccountType,
        bankName: achBankName,
      };
    }

    onConfirmPayment(paymentDetails);
    setIsProcessing(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Take Payment</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <X className="w-6 h-6 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        <div className="px-6 py-6 space-y-6 overflow-y-auto flex-1">
          {/* Cart Items Summary */}
          <div className="bg-white dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-xl overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
              <div className="flex items-center justify-between">
                <span className="font-medium text-gray-900 dark:text-white">Items</span>
                <span className="text-sm text-gray-600 dark:text-gray-400">{cartItems.length} {cartItems.length === 1 ? 'item' : 'items'}</span>
              </div>
            </div>
            
            <div className="divide-y divide-gray-100 dark:divide-gray-600">
              {cartItems.map((item, index) => (
                <div key={index} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-gray-900 dark:text-white">{item.product.name}</span>
                      <span className="text-sm text-gray-500 dark:text-gray-400 ml-2">
                        ({item.quantity} × ${item.product.price.toFixed(2)})
                      </span>
                    </div>
                    <div className="font-medium text-blue-600 dark:text-blue-400 whitespace-nowrap">
                      ${(item.product.price * item.quantity).toFixed(2)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Totals Summary */}
          <div className="bg-white dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-gray-700 dark:text-gray-300">Subtotal:</span>
              <span className="font-medium text-gray-900 dark:text-white">${subtotal.toFixed(2)}</span>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-gray-700 dark:text-gray-300">Sales Tax:</span>
              <span className="font-medium text-gray-900 dark:text-white">${tax.toFixed(2)}</span>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-gray-700 dark:text-gray-300">Grand Total:</span>
              <span className="font-semibold text-gray-900 dark:text-white">${total.toFixed(2)}</span>
            </div>
            
            {convenienceFee > 0 && (
              <>
                <div className="pt-2 border-t border-gray-200 dark:border-gray-600"></div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Convenience Fee (3%)</span>
                  <span className="text-gray-900 dark:text-white">${convenienceFee.toFixed(2)}</span>
                </div>
              </>
            )}
            
            <div className="pt-3 border-t-2 border-gray-300 dark:border-gray-600">
              <div className="flex items-center justify-between">
                <span className="text-xl font-semibold text-gray-900 dark:text-white">Total:</span>
                <span className="text-3xl font-bold text-blue-600 dark:text-blue-400">${finalTotal.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Payment Methods */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Payment Method</label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <button
                onClick={() => setSelectedMethod('cash')}
                className={`px-4 py-3 rounded-lg border-2 transition-all flex flex-col items-center gap-2 ${
                  selectedMethod === 'cash'
                    ? 'border-blue-600 dark:border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                    : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:border-gray-400 dark:hover:border-gray-500'
                }`}
              >
                <Banknote className="w-6 h-6" />
                <span className="text-sm">Cash</span>
              </button>
              
              <button
                onClick={() => setSelectedMethod('credit_card')}
                className={`px-4 py-3 rounded-lg border-2 transition-all flex flex-col items-center gap-2 ${
                  selectedMethod === 'credit_card' || selectedMethod === 'debit_card'
                    ? 'border-blue-600 dark:border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                    : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:border-gray-400 dark:hover:border-gray-500'
                }`}
              >
                <CreditCard className="w-6 h-6" />
                <span className="text-sm">Card</span>
              </button>
              
              <button
                onClick={() => setSelectedMethod('zelle')}
                className={`px-4 py-3 rounded-lg border-2 transition-all flex flex-col items-center gap-2 ${
                  selectedMethod === 'zelle'
                    ? 'border-blue-600 dark:border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                    : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:border-gray-400 dark:hover:border-gray-500'
                }`}
              >
                <Smartphone className="w-6 h-6" />
                <span className="text-sm">Zelle</span>
              </button>
              
              <button
                onClick={() => setSelectedMethod('ach')}
                className={`px-4 py-3 rounded-lg border-2 transition-all flex flex-col items-center gap-2 ${
                  selectedMethod === 'ach'
                    ? 'border-blue-600 dark:border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                    : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:border-gray-400 dark:hover:border-gray-500'
                }`}
              >
                <Building2 className="w-6 h-6" />
                <span className="text-sm">ACH</span>
              </button>
            </div>
          </div>

          {/* Payment Details */}
          <div>
            {selectedMethod === 'cash' && (
              <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border-2 border-emerald-400 rounded-xl p-8 text-center">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-12 h-12 bg-emerald-500 rounded-lg flex items-center justify-center">
                    <DollarSign className="w-7 h-7 text-white" strokeWidth={3} />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900">Cash Payment</h3>
                </div>
                
                <p className="text-gray-700 mb-2">
                  Collect <span className="text-3xl font-bold text-emerald-600 mx-1">${finalTotal.toFixed(2)}</span> in cash from the customer.
                </p>
              </div>
            )}

            {(selectedMethod === 'credit_card' || selectedMethod === 'debit_card') && (
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-400 rounded-xl p-6 space-y-4">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-blue-500 rounded-lg flex items-center justify-center">
                    <CreditCard className="w-7 h-7 text-white" />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900">Card Payment</h3>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <button
                    onClick={() => setCardPaymentMethod('pax_terminal')}
                    className={`px-4 py-3 rounded-lg border-2 transition-all flex flex-col items-center gap-2 ${
                      cardPaymentMethod === 'pax_terminal'
                        ? 'border-blue-600 bg-blue-600 text-white'
                        : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
                    }`}
                  >
                    <Wifi className="w-5 h-5" />
                    <span className="text-xs font-medium">PAX WiFi Terminal</span>
                  </button>
                  <button
                    onClick={() => setCardPaymentMethod('usb_reader')}
                    className={`px-4 py-3 rounded-lg border-2 transition-all flex flex-col items-center gap-2 ${
                      cardPaymentMethod === 'usb_reader'
                        ? 'border-blue-600 bg-blue-600 text-white'
                        : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
                    }`}
                  >
                    <CreditCard className="w-5 h-5" />
                    <span className="text-xs font-medium">USB Reader</span>
                  </button>
                  <button
                    onClick={() => setCardPaymentMethod('manual')}
                    className={`px-4 py-3 rounded-lg border-2 transition-all flex flex-col items-center gap-2 ${
                      cardPaymentMethod === 'manual'
                        ? 'border-blue-600 bg-blue-600 text-white'
                        : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
                    }`}
                  >
                    <CreditCard className="w-5 h-5" />
                    <span className="text-xs font-medium">Manual Entry</span>
                  </button>
                </div>

                {cardPaymentMethod === 'pax_terminal' ? (
                  <div className="space-y-4">
                    {/* PAX WiFi Terminal Instructions */}
                    <div className="bg-white border border-blue-200 rounded-lg p-6 text-center space-y-4">
                      <Wifi className="w-12 h-12 text-blue-400 mx-auto" />
                      <div>
                        <p className="font-medium text-gray-900 mb-1">
                          {cardReaderStatus === 'ready' && 'PAX WiFi Terminal Ready'}
                          {cardReaderStatus === 'processing' && 'Processing Payment...'}
                        </p>
                        <p className="text-sm text-gray-600 mb-2">
                          {cardReaderStatus === 'ready' && 'Click "Confirm Payment" to process payment on PAX terminal'}
                          {cardReaderStatus === 'processing' && 'Customer will be prompted on the PAX terminal. Please wait...'}
                        </p>
                        <div className="mt-3 text-left bg-gray-50 rounded-lg p-3">
                          <p className="text-xs text-gray-600 mb-1">
                            <strong>Terminal IP:</strong> {selectedTerminalIP || userTerminalIP || 'Not selected'}
                          </p>
                          <p className="text-xs text-gray-600">
                            <strong>Port:</strong> {selectedTerminalPort || userTerminalPort || '10009 (default)'}
                          </p>
                        </div>
                        <button
                          onClick={() => setShowTerminalDiscovery(true)}
                          className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium flex items-center gap-2 mx-auto"
                        >
                          <Wifi className="w-4 h-4" />
                          {selectedTerminalIP || userTerminalIP ? 'Change Terminal' : 'Select Terminal'}
                        </button>
                        {!selectedTerminalIP && !userTerminalIP && (
                          <p className="text-xs text-red-600 mt-2 font-medium">
                            ⚠️ Please select a terminal or configure Terminal IP in Settings
                          </p>
                        )}
                      </div>
                    </div>
                    
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <p className="text-xs text-gray-600">
                        <strong>How it works:</strong> When you click "Confirm Payment", the system will send the payment amount to your PAX VP100 terminal via WiFi. The customer will be prompted on the terminal to insert, swipe, or tap their card. The terminal processes the payment and returns the result.
                      </p>
                    </div>
                  </div>
                ) : cardPaymentMethod === 'usb_reader' ? (
                  <div className="space-y-4">
                    {/* USB Card Reader Instructions */}
                    <div className="bg-white border border-blue-200 rounded-lg p-6 text-center space-y-4">
                      <CreditCard className="w-12 h-12 text-blue-400 mx-auto" />
                      <div>
                        <p className="font-medium text-gray-900 mb-1">
                          {cardReaderStatus === 'ready' && 'USB Card Reader Ready'}
                          {cardReaderStatus === 'connecting' && 'Connecting to Reader...'}
                          {cardReaderStatus === 'reading' && 'Reading Card...'}
                        </p>
                        <p className="text-sm text-gray-600 mb-2">
                          {cardReaderStatus === 'ready' && 'Click "Confirm Payment" to connect to USB reader'}
                          {cardReaderStatus === 'connecting' && 'Select USB card reader from device picker...'}
                          {cardReaderStatus === 'reading' && 'Insert, swipe, or tap card on reader. Do not remove card.'}
                        </p>
                        {!serialSupported && (
                          <p className="text-xs text-red-600 mt-2 font-medium">
                            ⚠️ Web Serial API not supported. Please use Chrome, Edge, or Opera browser.
                          </p>
                        )}
                        {serialSupported && (
                          <p className="text-xs text-gray-500 mt-2">
                            Ensure your BBPOS CHIPPER™ 3X reader is connected via USB cable
                          </p>
                        )}
                      </div>
                    </div>
                    
                    {serialSupported ? (
                      <div className="space-y-3">
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                          <p className="text-xs text-gray-600 mb-2">
                            <strong>Note:</strong> When you click "Confirm Payment", you'll be asked to select the USB card reader from a device picker dialog. Then insert, swipe, or tap the card on the reader.
                          </p>
                          <p className="text-xs text-gray-600">
                            Card data will be encrypted using Accept.js and processed securely through Authorize.Net.
                          </p>
                        </div>
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                          <p className="text-xs text-gray-700">
                            <strong>⚠️ Important:</strong> BBPOS CHIPPER 3X may not appear in the device picker if it doesn't use standard serial communication. If you see "No compatible devices found", please use <strong>Manual Entry</strong> mode instead, or use the Authorize.Net 2.0 desktop app as a bridge.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                        <p className="text-xs text-gray-700">
                          <strong>Browser Compatibility:</strong> USB card reader requires Web Serial API, which is only available in Chrome, Edge, or Opera browsers. For other browsers, please use Manual Entry mode instead.
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Card Number
                      </label>
                      <input
                        type="text"
                        value={cardNumber}
                        onChange={(e) => setCardNumber(e.target.value.replace(/\D/g, '').slice(0, 16))}
                        placeholder="1234 5678 9012 3456"
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      />
                    </div>
                    
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Expiry
                        </label>
                        <input
                          type="text"
                          value={cardExpiry}
                          onChange={(e) => setCardExpiry(e.target.value)}
                          placeholder="MM/YY"
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                        />
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          CVV
                        </label>
                        <input
                          type="text"
                          value={cardCvv}
                          onChange={(e) => setCardCvv(e.target.value.replace(/\D/g, '').slice(0, 4))}
                          placeholder="123"
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                        />
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          ZIP
                        </label>
                        <input
                          type="text"
                          value={cardZip}
                          onChange={(e) => setCardZip(e.target.value.slice(0, 5))}
                          placeholder="12345"
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {selectedMethod === 'zelle' && (
              <div className="bg-gradient-to-br from-purple-50 to-pink-50 border-2 border-purple-400 rounded-xl p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-purple-500 rounded-lg flex items-center justify-center">
                    <Smartphone className="w-7 h-7 text-white" />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900">Zelle Payment</h3>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Zelle Confirmation Number
                  </label>
                  <div className="relative">
                    <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="text"
                      value={zelleConfirmation}
                      onChange={(e) => setZelleConfirmation(e.target.value)}
                      placeholder="Enter confirmation number"
                      className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white"
                      autoFocus
                    />
                  </div>
                </div>
              </div>
            )}

            {selectedMethod === 'ach' && (
              <div className="bg-gradient-to-br from-orange-50 to-amber-50 border-2 border-orange-400 rounded-xl p-6 space-y-3">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-orange-500 rounded-lg flex items-center justify-center">
                    <Building2 className="w-7 h-7 text-white" />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900">ACH Payment</h3>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Account Holder Name
                  </label>
                  <input
                    type="text"
                    value={achName}
                    onChange={(e) => setAchName(e.target.value)}
                    placeholder="John Doe"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white"
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Routing Number
                    </label>
                    <input
                      type="text"
                      value={achRouting}
                      onChange={(e) => setAchRouting(e.target.value.replace(/\D/g, '').slice(0, 9))}
                      placeholder="123456789"
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Account Number
                    </label>
                    <input
                      type="text"
                      value={achAccount}
                      onChange={(e) => setAchAccount(e.target.value.replace(/\D/g, ''))}
                      placeholder="1234567890"
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white"
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Account Type
                    </label>
                    <select
                      value={achAccountType}
                      onChange={(e) => setAchAccountType(e.target.value as 'checking' | 'savings')}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white"
                    >
                      <option value="checking">Checking</option>
                      <option value="savings">Savings</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Bank Name
                    </label>
                    <input
                      type="text"
                      value={achBankName}
                      onChange={(e) => setAchBankName(e.target.value)}
                      placeholder="Bank of America"
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Error Display */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
          
          {/* Actions */}
          <div className="pt-4 border-t border-gray-200 dark:border-gray-700 flex gap-3">
            <button
              onClick={onClose}
              disabled={isProcessing}
              className="flex-1 px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-gray-900 dark:text-white"
            >
              Cancel
            </button>
            
            <button
              onClick={handleConfirmPayment}
              disabled={isProcessing}
              className="flex-1 px-4 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isProcessing ? (
                <>
                  <Loader className="w-5 h-5 animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <span>Confirm Payment</span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Terminal Discovery Dialog */}
      <TerminalDiscoveryDialog
        isOpen={showTerminalDiscovery}
        onClose={() => setShowTerminalDiscovery(false)}
        onSelectTerminal={handleTerminalSelected}
        currentTerminalIP={userTerminalIP}
        currentTerminalPort={userTerminalPort}
      />
    </div>
  );
}