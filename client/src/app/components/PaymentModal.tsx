/// <reference types="vite/client" />
import React, { useState, useEffect } from 'react';
import { PaymentMethod, PaymentDetails, CartItem } from '../types';
import { X, CreditCard, Smartphone, Loader, Wallet, Building2, Banknote, CheckCircle2 } from 'lucide-react';
import { encryptCardData, loadAcceptJs, isAcceptJsAvailable } from '../../services/acceptJsService';
import { connectAndReadCard, isWebSerialSupported } from '../../services/usbCardReaderService';
// TerminalDiscoveryDialog removed - not needed for Valor Connect (only Terminal number required)
import { pollPaymentStatus } from '../../services/paymentPollingService';
import { initiateValorPayment, pollValorPaymentStatus } from '../../services/valorApiService';
import { useToast } from '../contexts/ToastContext';
import { customersAPI } from '../../services/api';
import { PaymentMethodSelector } from './PaymentMethodSelector';
import { logger } from '../../utils/logger';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  total: number;
  subtotal: number;
  tax: number;
  cartItems: CartItem[];
  onConfirmPayment: (details: PaymentDetails) => Promise<any> | void;
  context?: 'sale' | 'zohoDocuments';
  userTerminalNumber?: string | null;
  userTerminalIP?: string | null;
  userTerminalPort?: number | string | null;
  cardReaderMode?: 'integrated' | 'standalone';
  customerId?: number | null;
  customerName?: string | null;
}

const paymentMethods: PaymentMethod[] = [
  { type: 'cash', label: 'Cash' },
  { type: 'credit_card', label: 'Credit Card' },
  { type: 'debit_card', label: 'Debit Card' },
  { type: 'stored_payment', label: 'Stored Payment Method' },
  { type: 'zelle', label: 'Zelle' },
  { type: 'ach', label: 'ACH' },
];

export function PaymentModal({ isOpen, onClose, total, subtotal, tax, cartItems, onConfirmPayment, context = 'sale', userTerminalNumber, userTerminalIP, userTerminalPort, cardReaderMode = 'integrated', customerId, customerName }: PaymentModalProps) {
  const { showToast } = useToast();
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod['type']>('cash');
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');
  const [cardZip, setCardZip] = useState('');
  const [achName, setAchName] = useState('');
  const [achRouting, setAchRouting] = useState('');
  const [achAccount, setAchAccount] = useState('');
  const [achAccountType, setAchAccountType] = useState<'checking' | 'savings'>('checking');
  const [achBankName, setAchBankName] = useState('');
  const [achEntryMode, setAchEntryMode] = useState<'hidden' | 'details'>('hidden');
  // Default CC/DC to terminal flow; only show fields when user selects Manual Entry.
  const [cardPaymentMethod, setCardPaymentMethod] = useState<'usb_reader' | 'pax_terminal' | 'valor_api' | 'manual'>('valor_api');
  const [cardReaderStatus, setCardReaderStatus] = useState<'ready' | 'connecting' | 'reading' | 'processing'>('ready');
  const [error, setError] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [acceptJsReady, setAcceptJsReady] = useState(false);
  const [serialSupported, setSerialSupported] = useState(false);
  // Terminal discovery removed - not needed for Valor Connect
  const [selectedTerminalNumber, setSelectedTerminalNumber] = useState<string | null>(userTerminalNumber || null);
  const [selectedTerminalIP, setSelectedTerminalIP] = useState<string | null>(userTerminalIP || null);
  const [selectedTerminalPort, setSelectedTerminalPort] = useState<number | string | null>(userTerminalPort || null);
  const [paymentProfiles, setPaymentProfiles] = useState<any[]>([]);
  const [selectedPaymentProfileId, setSelectedPaymentProfileId] = useState<string | null>(null);
  const [isPaymentMethodSelectorOpen, setIsPaymentMethodSelectorOpen] = useState(false);
  const [loadingPaymentProfiles, setLoadingPaymentProfiles] = useState(false);

  // Load Accept.js on mount
  useEffect(() => {
    const loadAccept = async () => {
      try {
        await loadAcceptJs();
        setAcceptJsReady(isAcceptJsAvailable());
      } catch (err) {
        logger.warn('Accept.js failed to load', err);
        setAcceptJsReady(false);
      }
    };
    loadAccept();

    // Check Web Serial API support
    setSerialSupported(isWebSerialSupported());
  }, []);

  // Update selected terminal when user settings change
  useEffect(() => {
    if (userTerminalNumber) {
      setSelectedTerminalNumber(userTerminalNumber);
    }
    if (userTerminalIP) {
      setSelectedTerminalIP(userTerminalIP);
    }
    if (userTerminalPort) {
      setSelectedTerminalPort(userTerminalPort);
    }
  }, [userTerminalNumber, userTerminalIP, userTerminalPort]);

  // Load payment profiles when customer is available
  useEffect(() => {
    if (context === 'sale' && isOpen && customerId) {
      loadPaymentProfiles();
    } else {
      setPaymentProfiles([]);
      setSelectedPaymentProfileId(null);
    }
  }, [isOpen, customerId, context]);

  const loadPaymentProfiles = async () => {
    if (!customerId) return;
    
    setLoadingPaymentProfiles(true);
    try {
      const response = await customersAPI.getPaymentProfiles(customerId);
      if (response.success && response.data?.paymentProfiles) {
        setPaymentProfiles(response.data.paymentProfiles);
        // Auto-select default or stored profile if available
        const defaultProfile = response.data.paymentProfiles.find((p: any) => p.isDefault || p.isStored) || response.data.paymentProfiles[0];
        if (defaultProfile) {
          setSelectedPaymentProfileId(defaultProfile.paymentProfileId);
        }
      }
    } catch (err) {
      console.error('Failed to load payment profiles:', err);
    } finally {
      setLoadingPaymentProfiles(false);
    }
  };

  // Terminal discovery removed - Valor Connect only needs Terminal number (configured in Settings)

  // Calculate price with UM conversion rate (same logic as ShoppingCart)
  const getItemPrice = (item: CartItem): number => {
    const basePrice = item.product.price;
    
    // Use unitPrecision from availableUnits for all items
    if (item.selectedUM && item.availableUnits && item.availableUnits.length > 0) {
      const selectedUnit = item.availableUnits.find(u => 
        (u.symbol === item.selectedUM) || (u.unitName === item.selectedUM)
      );
      if (selectedUnit && selectedUnit.unitPrecision > 0) {
        // Price = original price * unitPrecision (Unit Rate)
        const rate = typeof selectedUnit.unitPrecision === 'string' 
          ? parseFloat(selectedUnit.unitPrecision) 
          : selectedUnit.unitPrecision;
        return basePrice * rate;
      }
    }
    
    return basePrice;
  };

  // Calculate convenience fee for CREDIT card payments and stored CREDIT card profiles
  const isCreditCardPayment = selectedMethod === 'credit_card' || 
    (selectedMethod === 'stored_payment' && selectedPaymentProfileId && 
     paymentProfiles.find((p: any) => p.paymentProfileId === selectedPaymentProfileId)?.type === 'credit_card');
  const convenienceFee = isCreditCardPayment ? total * 0.03 : 0;
  const finalTotal = total + convenienceFee;

  if (!isOpen) return null;

  const handleConfirmPayment = async () => {
    setError('');
    setIsProcessing(true);

    // Standalone mode: Skip payment processing, just record the sale
    if (cardReaderMode === 'standalone' && (selectedMethod === 'credit_card' || selectedMethod === 'debit_card')) {
      const paymentDetails: PaymentDetails = {
        method: selectedMethod,
        amount: finalTotal,
        useStandaloneMode: true // Flag to indicate standalone mode
      };
      
      try {
        await onConfirmPayment(paymentDetails);
        setIsProcessing(false);
        onClose();
        showToast(
          context === 'zohoDocuments'
            ? 'Payment recorded. Please process payment manually on the external card reader.'
            : 'Sale recorded. Please process payment manually on the external card reader.',
          'success',
          5000
        );
      } catch (err: any) {
        setError(err.message || (context === 'zohoDocuments' ? 'Failed to record payment' : 'Failed to record sale'));
        setIsProcessing(false);
        showToast(context === 'zohoDocuments' ? 'Failed to record payment' : 'Failed to record sale', 'error', 4000);
      }
      return;
    }

    // Validation
    if (selectedMethod === 'credit_card' || selectedMethod === 'debit_card') {
      if (cardPaymentMethod === 'valor_api') {
        // Valor Connect API validation - EPI is required
        const terminalNumber = selectedTerminalNumber || userTerminalNumber || '';
        if (!terminalNumber || terminalNumber.trim() === '') {
          setError('Terminal is not configured. Please configure it in Settings.');
          setIsProcessing(false);
          return;
        }
      } else if (cardPaymentMethod === 'pax_terminal') {
        // PAX Terminal validation - Terminal number is required for Valor Connect
        const terminalNumber = selectedTerminalNumber || userTerminalNumber || '';
        if (!terminalNumber || terminalNumber.trim() === '') {
          setError('PAX Terminal number is required. Please configure your VP100 serial number in Settings.');
          setIsProcessing(false);
          return;
        }
      } else if (cardPaymentMethod === 'manual' && (!cardNumber || !cardExpiry || !cardCvv || !cardZip)) {
        setError('Please fill in all card details');
        setIsProcessing(false);
        return;
      }
    } else if (selectedMethod === 'stored_payment') {
      if (!selectedPaymentProfileId) {
        setError('Please select a stored payment method');
        setIsProcessing(false);
        return;
      }
      if (paymentProfiles.length === 0) {
        setError('No stored payment methods available for this customer');
        setIsProcessing(false);
        return;
      }
    } else if (selectedMethod === 'ach' && (!achName || !achRouting || !achAccount || !achBankName)) {
      setAchEntryMode('details');
      setError('Please fill in ACH details');
      setIsProcessing(false);
      return;
    }

    // Simulate payment processing
    await new Promise(resolve => setTimeout(resolve, 1500));

    // For stored_payment, determine type from selected profile
    let paymentMethod = selectedMethod;
    if (selectedMethod === 'stored_payment') {
      // Determine payment type from selected profile
      const selectedProfile = paymentProfiles.find(p => p.paymentProfileId === selectedPaymentProfileId);
      paymentMethod = selectedProfile?.type === 'ach' ? 'ach' : 'credit_card';
    }
    
    const paymentDetails: PaymentDetails = {
      method: paymentMethod,
      amount: finalTotal,
    };

    if (selectedMethod === 'credit_card' || selectedMethod === 'debit_card') {
      if (cardPaymentMethod === 'valor_api') {
        // Valor Connect API mode - direct integration with Valor Connect API
        const terminalNumber = selectedTerminalNumber || userTerminalNumber || '';
        
        if (!terminalNumber || terminalNumber.trim() === '') {
          setError('Terminal is not configured. Please configure it in Settings.');
          setIsProcessing(false);
          return;
        }

        paymentDetails.useValorApi = true;
        paymentDetails.terminalNumber = terminalNumber.trim(); // EPI value
        
        // Valor Connect API handles payment directly - no card data needed
        // Terminal will automatically display payment prompt
        setCardReaderStatus('processing');
      } else if (cardPaymentMethod === 'pax_terminal') {
        // PAX WiFi Terminal mode (Valor Connect - cloud-to-cloud)
        const terminalNumber = selectedTerminalNumber || userTerminalNumber || '';
        
        if (!terminalNumber || terminalNumber.trim() === '') {
          setError('PAX Terminal number is required. Please configure your VP100 serial number in Settings.');
          setIsProcessing(false);
          return;
        }

        paymentDetails.useTerminal = true;
        paymentDetails.terminalNumber = terminalNumber.trim();
        
        // PAX terminal handles card reading on the device itself via Valor Connect
        // Payment request is sent to Authorize.Net, which routes to VP100 terminal
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
            logger.warn('Accept.js public client key not configured. Using direct card data.');
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
          logger.warn('Accept.js encryption failed, using direct card data', encryptError);
          paymentDetails.cardNumber = cardNumber;
          paymentDetails.expirationDate = cardExpiry;
          paymentDetails.cvv = cardCvv;
          paymentDetails.zip = cardZip;
        }
      }
    } else if (selectedMethod === 'stored_payment') {
      // Use stored payment method via CIM
      paymentDetails.useStoredPayment = true;
      paymentDetails.paymentProfileId = selectedPaymentProfileId;
    } else if (selectedMethod === 'ach') {
      paymentDetails.achDetails = {
        name: achName,
        routingNumber: achRouting,
        accountNumber: achAccount,
        accountType: achAccountType,
        bankName: achBankName,
      };
    }

    // For terminal payments, handle pending status and polling
    if (cardPaymentMethod === 'valor_api' && paymentDetails.useValorApi) {
      // Valor API payment flow
      try {
        setCardReaderStatus('processing');
        setError('');
        
        const terminalNumber = paymentDetails.terminalNumber || '';
        const invoiceNumber = `POS-${Date.now()}`;
        const description = `POS Sale - ${invoiceNumber}`;
        
        // Initiate payment via Valor API
        const paymentResult = await initiateValorPayment(
          finalTotal,
          terminalNumber,
          invoiceNumber,
          description
        );
        
        if (!paymentResult.success) {
          throw new Error(paymentResult.error || 'Failed to initiate Valor API payment');
        }
        
        // Show notification
        showToast(
          'Payment request sent to VP100 terminal via Valor API. Waiting for customer to complete payment...',
          'info',
          5000
        );
        
        // Get transaction reference ID from result (reqTxnId is preferred for Valor Connect)
        const reqTxnId = paymentResult.data?.reqTxnId || paymentResult.reqTxnId || 
                        paymentResult.data?.transactionId || paymentResult.transactionId;
        if (!reqTxnId) {
          throw new Error('No transaction reference ID (reqTxnId) received from Valor Connect API');
        }
        
        // Start polling for payment status
        const finalStatus = await pollValorPaymentStatus(
          reqTxnId,
          terminalNumber, // EPI value
          undefined, // terminalSerialNumber (not used, EPI is preferred)
          60, // maxAttempts: 2 minutes max (60 * 2 seconds)
          2000, // intervalMs: Poll every 2 seconds
          (status, attempt) => {
            // Update UI during polling
            if (status.data?.pending) {
              setCardReaderStatus('processing');
            }
          }
        );
        
        // Payment completed (approved or declined)
        if (!finalStatus.data?.pending && !finalStatus.pending) {
          if (finalStatus.success || finalStatus.data?.success) {
            // Payment approved - call onConfirmPayment to complete sale
            paymentDetails.valorTransactionId = reqTxnId;
            await onConfirmPayment(paymentDetails);
            showToast('Payment approved! Transaction completed.', 'success', 5000);
            setIsProcessing(false);
            onClose();
          } else {
            // Payment declined
            setError(finalStatus.data?.message || finalStatus.data?.error || finalStatus.error || 'Payment was declined. Please try again.');
            setCardReaderStatus('ready');
            setIsProcessing(false);
            showToast('Payment declined. Please try again.', 'error', 5000);
          }
        } else {
          // Timeout
          setError('Payment timeout. Please check the terminal or try again.');
          setCardReaderStatus('ready');
          setIsProcessing(false);
          showToast('Payment timeout. Please check terminal status.', 'error', 5000);
        }
      } catch (err: any) {
        setError(err.message || 'Failed to process Valor API payment');
        setCardReaderStatus('ready');
        setIsProcessing(false);
        showToast('Payment processing error. Please try again.', 'error', 5000);
      }
    } else if (cardPaymentMethod === 'pax_terminal' && paymentDetails.useTerminal) {
      try {
        // Call onConfirmPayment which will initiate payment and may return pending status
        const result = await onConfirmPayment(paymentDetails);
        
        // If payment is pending, start polling
        if (result?.pending && result?.data?.transactionId) {
          setCardReaderStatus('processing');
          setError('');
          
          // Show notification
          showToast(
            'Payment request sent to VP100 terminal. Waiting for customer to complete payment...',
            'info',
            5000
          );
          
          // Start polling for payment status
          const finalStatus = await pollPaymentStatus(
            result.data.transactionId,
            {
              maxAttempts: 60, // 2 minutes max (60 * 2 seconds)
              intervalMs: 2000, // Poll every 2 seconds
              onStatusUpdate: (status, attempt) => {
                // Update UI during polling
                if (status.pending) {
                  setCardReaderStatus('processing');
                }
              }
            }
          );
          
          // Payment completed (approved or declined)
          if (!finalStatus.pending) {
            if (finalStatus.success) {
              // Payment approved - show success notification
              showToast('Payment approved! Transaction completed.', 'success', 5000);
              // Close modal - sale will be completed by App.tsx
              setIsProcessing(false);
              onClose();
            } else {
              // Payment declined
              setError(finalStatus.message || finalStatus.error || 'Payment was declined. Please try again.');
              setCardReaderStatus('ready');
              setIsProcessing(false);
              showToast('Payment declined. Please try again.', 'error', 5000);
            }
          } else {
            // Timeout
            setError('Payment timeout. Please check the terminal or try again.');
            setCardReaderStatus('ready');
            setIsProcessing(false);
            showToast('Payment timeout. Please check terminal status.', 'error', 5000);
          }
        } else {
          // Not pending - normal flow continues
          setIsProcessing(false);
        }
      } catch (err: any) {
        setError(err.message || 'Failed to process terminal payment');
        setCardReaderStatus('ready');
        setIsProcessing(false);
        showToast('Payment processing error. Please try again.', 'error', 5000);
      }
    } else {
      // Normal payment flow (non-terminal)
      await onConfirmPayment(paymentDetails);
      setIsProcessing(false);
    }
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
              {cartItems.map((item, index) => {
                const itemPrice = getItemPrice(item);
                const itemTotal = itemPrice * item.quantity;
                const displayUM = item.selectedUM || item.product.unit || '';
                return (
                  <div key={index} className="px-4 py-3">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <span className="font-medium text-gray-900 dark:text-white">{item.product.name}</span>
                        <span className="text-sm text-gray-500 dark:text-gray-400 ml-2">
                          ({item.quantity} {displayUM ? displayUM + ' ×' : '×'} ${itemPrice.toFixed(2)})
                        </span>
                      </div>
                      <div className="font-medium text-blue-600 dark:text-blue-400 whitespace-nowrap">
                        ${itemTotal.toFixed(2)}
                      </div>
                    </div>
                  </div>
                );
              })}
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
                  <span className="text-gray-600 dark:text-gray-400">Credit Card Surcharge 3%</span>
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
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
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
                onClick={() => {
                  setSelectedMethod('credit_card');
                  setCardPaymentMethod('valor_api');
                  setCardReaderStatus('ready');
                }}
                className={`px-4 py-3 rounded-lg border-2 transition-all flex flex-col items-center gap-2 ${
                  selectedMethod === 'credit_card'
                    ? 'border-blue-600 dark:border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                    : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:border-gray-400 dark:hover:border-gray-500'
                }`}
              >
                <CreditCard className="w-6 h-6" />
                <span className="text-sm">CC</span>
              </button>

              <button
                onClick={() => {
                  setSelectedMethod('debit_card');
                  setCardPaymentMethod('valor_api');
                  setCardReaderStatus('ready');
                }}
                className={`px-4 py-3 rounded-lg border-2 transition-all flex flex-col items-center gap-2 ${
                  selectedMethod === 'debit_card'
                    ? 'border-blue-600 dark:border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                    : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:border-gray-400 dark:hover:border-gray-500'
                }`}
              >
                <CreditCard className="w-6 h-6" />
                <span className="text-sm">DC</span>
              </button>
              
              {context !== 'zohoDocuments' && customerId && paymentProfiles.length > 0 && (
                <button
                  onClick={() => {
                    setSelectedMethod('stored_payment');
                    if (!selectedPaymentProfileId && paymentProfiles.length > 0) {
                      const defaultProfile = paymentProfiles.find((p: any) => p.isDefault || p.isStored) || paymentProfiles[0];
                      if (defaultProfile) {
                        setSelectedPaymentProfileId(defaultProfile.paymentProfileId);
                      }
                    }
                  }}
                  className={`px-4 py-3 rounded-lg border-2 transition-all flex flex-col items-center gap-2 ${
                    selectedMethod === 'stored_payment'
                      ? 'border-blue-600 dark:border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                      : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:border-gray-400 dark:hover:border-gray-500'
                  }`}
                >
                  <Wallet className="w-6 h-6" />
                  <span className="text-sm">Stored</span>
                </button>
              )}
              
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
                onClick={() => {
                  setSelectedMethod('ach');
                  setAchEntryMode('hidden');
                }}
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
            {selectedMethod === 'cash' && null}

            {(selectedMethod === 'credit_card' || selectedMethod === 'debit_card') && (
              <div className="border-0 bg-transparent rounded-none p-0 m-0 space-y-3">
                <div className="flex justify-center">
                  {cardPaymentMethod !== 'manual' ? (
                    <button
                      onClick={() => setCardPaymentMethod('manual')}
                      className="px-3 py-2 rounded-lg border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:border-gray-400 dark:hover:border-gray-500 transition-all text-sm font-medium"
                    >
                      Manual Entry
                    </button>
                  ) : (
                    <button
                      onClick={() => setCardPaymentMethod('valor_api')}
                      className="px-3 py-2 rounded-lg border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:border-gray-400 dark:hover:border-gray-500 transition-all text-sm font-medium"
                    >
                      Use Terminal
                    </button>
                  )}
                </div>

                {cardPaymentMethod !== 'manual' ? null : (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Card Number
                      </label>
                      <input
                        type="text"
                        value={cardNumber}
                        onChange={(e) => setCardNumber(e.target.value.replace(/\D/g, '').slice(0, 16))}
                        placeholder="1234 5678 9012 3456"
                        className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 caret-gray-900 dark:caret-gray-200"
                      />
                    </div>
                    
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Expiry
                        </label>
                        <input
                          type="text"
                          value={cardExpiry}
                          onChange={(e) => setCardExpiry(e.target.value)}
                          placeholder="MM/YY"
                          className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 caret-gray-900 dark:caret-gray-200"
                        />
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          CVV
                        </label>
                        <input
                          type="text"
                          value={cardCvv}
                          onChange={(e) => setCardCvv(e.target.value.replace(/\D/g, '').slice(0, 4))}
                          placeholder="123"
                          className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 caret-gray-900 dark:caret-gray-200"
                        />
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          ZIP
                        </label>
                        <input
                          type="text"
                          value={cardZip}
                          onChange={(e) => setCardZip(e.target.value.slice(0, 5))}
                          placeholder="12345"
                          className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 caret-gray-900 dark:caret-gray-200"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {selectedMethod === 'zelle' && null}

            {context !== 'zohoDocuments' && selectedMethod === 'stored_payment' && (
              <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border-2 border-green-400 dark:border-green-600 rounded-xl p-6 space-y-3">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-green-500 rounded-lg flex items-center justify-center">
                    <Wallet className="w-7 h-7 text-white" />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Stored Payment Method</h3>
                </div>

                {loadingPaymentProfiles ? (
                  <div className="text-center py-8">
                    <Loader className="w-8 h-8 text-green-600 dark:text-green-400 mx-auto animate-spin mb-2" />
                    <p className="text-gray-600 dark:text-gray-400">Loading payment methods...</p>
                  </div>
                ) : paymentProfiles.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-gray-600 dark:text-gray-400 mb-2">No stored payment methods available</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">This customer does not have any stored payment methods in Authorize.net</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {paymentProfiles.map((profile: any) => {
                      const isSelected = selectedPaymentProfileId === profile.paymentProfileId;
                      const formatCardNumber = (cardNumber: string) => {
                        if (!cardNumber || cardNumber === 'XXXX') return 'XXXX';
                        if (cardNumber.includes('X')) return cardNumber;
                        const digits = cardNumber.replace(/\D/g, '');
                        return digits.length >= 4 ? `XXXX${digits.slice(-4)}` : 'XXXX';
                      };
                      const formatAccountNumber = (accountNumber: string) => {
                        if (!accountNumber || accountNumber === 'XXXX') return 'XXXX';
                        if (accountNumber.includes('X')) return accountNumber;
                        const digits = accountNumber.replace(/\D/g, '');
                        return digits.length >= 4 ? `XXXX${digits.slice(-4)}` : 'XXXX';
                      };

                      return (
                        <button
                          key={profile.paymentProfileId}
                          onClick={() => setSelectedPaymentProfileId(profile.paymentProfileId)}
                          className={`w-full p-4 border rounded-lg transition-all text-left ${
                            isSelected
                              ? 'border-green-600 dark:border-green-400 bg-green-50 dark:bg-green-900/20'
                              : 'border-gray-200 dark:border-gray-700 hover:border-green-500 dark:hover:border-green-400 hover:bg-green-50 dark:hover:bg-green-900/20'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-5 h-5 border-2 rounded flex items-center justify-center ${
                              isSelected
                                ? 'bg-green-600 dark:bg-green-500 border-green-600 dark:border-green-500'
                                : 'border-gray-300 dark:border-gray-600'
                            }`}>
                              {isSelected && <CheckCircle2 className="w-3 h-3 text-white" />}
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                {profile.type === 'credit_card' ? (
                                  <CreditCard className="w-5 h-5 text-green-600 dark:text-green-400" />
                                ) : (
                                  <Building2 className="w-5 h-5 text-green-600 dark:text-green-400" />
                                )}
                                <span className="font-semibold text-gray-900 dark:text-white">
                                  {profile.type === 'credit_card' ? 'Credit Card' : 'Bank Account'}
                                </span>
                                {(profile.isDefault || profile.isStored) && (
                                  <span className="text-xs text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30 px-2 py-0.5 rounded">
                                    {profile.isDefault ? 'Default' : 'Stored'}
                                  </span>
                                )}
                              </div>
                              <div className="text-sm text-gray-600 dark:text-gray-400">
                                {profile.type === 'credit_card' ? (
                                  <>
                                    <div>Card: {formatCardNumber(profile.cardNumber || 'XXXX')}</div>
                                    {profile.expirationDate && (
                                      <div className="text-xs mt-1">Exp: {profile.expirationDate}</div>
                                    )}
                                  </>
                                ) : (
                                  <div>Account: {formatAccountNumber(profile.accountNumber || 'XXXX')}</div>
                                )}
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {selectedMethod === 'ach' && (
              <div className="border-0 bg-transparent rounded-none p-0 m-0 space-y-3">
                <div className="flex justify-center">
                  {achEntryMode !== 'details' ? (
                    <button
                      onClick={() => setAchEntryMode('details')}
                      className="px-3 py-2 rounded-lg border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:border-gray-400 dark:hover:border-gray-500 transition-all text-sm font-medium"
                    >
                      Enter Details
                    </button>
                  ) : (
                    <button
                      onClick={() => setAchEntryMode('hidden')}
                      className="px-3 py-2 rounded-lg border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:border-gray-400 dark:hover:border-gray-500 transition-all text-sm font-medium"
                    >
                      Hide Details
                    </button>
                  )}
                </div>

                {achEntryMode !== 'details' ? null : (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Account Holder Name
                      </label>
                      <input
                        type="text"
                        value={achName}
                        onChange={(e) => setAchName(e.target.value)}
                        placeholder="John Doe"
                        className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 caret-gray-900 dark:caret-gray-200"
                      />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Routing Number
                        </label>
                        <input
                          type="text"
                          value={achRouting}
                          onChange={(e) => setAchRouting(e.target.value.replace(/\D/g, '').slice(0, 9))}
                          placeholder="123456789"
                          className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 caret-gray-900 dark:caret-gray-200"
                        />
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Account Number
                        </label>
                        <input
                          type="text"
                          value={achAccount}
                          onChange={(e) => setAchAccount(e.target.value.replace(/\D/g, ''))}
                          placeholder="1234567890"
                          className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 caret-gray-900 dark:caret-gray-200"
                        />
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Account Type
                        </label>
                        <select
                          value={achAccountType}
                          onChange={(e) => setAchAccountType(e.target.value as 'checking' | 'savings')}
                          className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        >
                          <option value="checking">Checking</option>
                          <option value="savings">Savings</option>
                        </select>
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Bank Name
                        </label>
                        <input
                          type="text"
                          value={achBankName}
                          onChange={(e) => setAchBankName(e.target.value)}
                          placeholder="Bank of America"
                          className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 caret-gray-900 dark:caret-gray-200"
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Error Display */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
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

      {/* Terminal Discovery Dialog - Removed for Valor Connect (only Terminal number needed) */}
    </div>
  );
}