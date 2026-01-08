import React, { useState } from 'react';
import { PaymentMethod, PaymentDetails, CartItem } from '../types';
import { X, CreditCard, DollarSign, Smartphone, Loader, Wallet, Building2, Banknote, CheckCircle2 } from 'lucide-react';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  total: number;
  subtotal: number;
  tax: number;
  cartItems: CartItem[];
  onConfirmPayment: (details: PaymentDetails) => void;
  userTerminalIP?: string;
  userTerminalPort?: number | string;
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
  const [useCardReader, setUseCardReader] = useState(true);
  const [useEBizChargeTerminal, setUseEBizChargeTerminal] = useState(true);
  const [terminalIP, setTerminalIP] = useState(userTerminalIP || '');
  const [terminalPort, setTerminalPort] = useState(userTerminalPort ? userTerminalPort.toString() : '');
  const [cardReaderStatus, setCardReaderStatus] = useState<'ready' | 'connecting' | 'reading'>('ready');
  const [error, setError] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const convenienceFee = (selectedMethod === 'credit_card' || selectedMethod === 'debit_card') ? total * 0.03 : 0;
  const finalTotal = total + convenienceFee;

  if (!isOpen) return null;

  const handleConfirmPayment = async () => {
    setError('');
    setIsProcessing(true);

    // Validation
    if (selectedMethod === 'credit_card' || selectedMethod === 'debit_card') {
      if (!useCardReader && (!cardNumber || !cardExpiry || !cardCvv || !cardZip)) {
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

    const paymentDetails: PaymentDetails = {
      method: selectedMethod,
      amount: finalTotal,
    };

    if (selectedMethod === 'credit_card' || selectedMethod === 'debit_card') {
      if (useCardReader) {
        if (useEBizChargeTerminal) {
          // EBizCharge WiFi Terminal mode
          if (!terminalIP) {
            setError('Please enter or configure your terminal IP address');
            setIsProcessing(false);
            return;
          }
          paymentDetails.useEBizChargeTerminal = true;
          paymentDetails.terminalIP = terminalIP;
        } else {
          // PAX Terminal mode (legacy)
          paymentDetails.useTerminal = true;
          paymentDetails.terminalIP = terminalIP || undefined;
          paymentDetails.terminalPort = terminalPort || undefined;
        }
      } else {
        paymentDetails.cardNumber = cardNumber;
        paymentDetails.expirationDate = cardExpiry;
        paymentDetails.cvv = cardCvv;
        paymentDetails.zip = cardZip;
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
                onClick={() => setSelectedMethod('card')}
                className={`px-4 py-3 rounded-lg border-2 transition-all flex flex-col items-center gap-2 ${
                  selectedMethod === 'card'
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

            {selectedMethod === 'card' && (
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-400 rounded-xl p-6 space-y-4">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-blue-500 rounded-lg flex items-center justify-center">
                    <CreditCard className="w-7 h-7 text-white" />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900">Card Payment</h3>
                </div>

                <div className="flex items-center gap-4">
                  <button
                    onClick={() => setUseCardReader(true)}
                    className={`flex-1 px-4 py-3 rounded-lg border-2 transition-all ${
                      useCardReader
                        ? 'border-blue-600 bg-blue-600 text-white'
                        : 'border-gray-300 bg-white text-gray-700'
                    }`}
                  >
                    WiFi Terminal
                  </button>
                  <button
                    onClick={() => setUseCardReader(false)}
                    className={`flex-1 px-4 py-3 rounded-lg border-2 transition-all ${
                      !useCardReader
                        ? 'border-blue-600 bg-blue-600 text-white'
                        : 'border-gray-300 bg-white text-gray-700'
                    }`}
                  >
                    Manual Entry
                  </button>
                </div>

                {useCardReader ? (
                  <div className="space-y-4">
                    {/* Terminal Type Selection */}
                    <div className="flex items-center gap-4">
                      <button
                        onClick={() => setUseEBizChargeTerminal(true)}
                        className={`flex-1 px-4 py-2 rounded-lg border-2 transition-all text-sm ${
                          useEBizChargeTerminal
                            ? 'border-green-600 bg-green-600 text-white'
                            : 'border-gray-300 bg-white text-gray-700'
                        }`}
                      >
                        EBizCharge WiFi
                      </button>
                      <button
                        onClick={() => setUseEBizChargeTerminal(false)}
                        className={`flex-1 px-4 py-2 rounded-lg border-2 transition-all text-sm ${
                          !useEBizChargeTerminal
                            ? 'border-blue-600 bg-blue-600 text-white'
                            : 'border-gray-300 bg-white text-gray-700'
                        }`}
                      >
                        PAX Terminal
                      </button>
                    </div>

                    {/* Terminal IP Input */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Terminal IP Address
                      </label>
                      <input
                        type="text"
                        value={terminalIP}
                        onChange={(e) => setTerminalIP(e.target.value)}
                        placeholder="192.168.1.100 or localhost"
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      />
                      {!terminalIP && (
                        <p className="text-xs text-gray-500 mt-1">
                          {useEBizChargeTerminal 
                            ? 'Enter your EBizCharge terminal IP address (e.g., 192.168.1.100)'
                            : 'Enter your PAX terminal IP (e.g., 192.168.1.100 for WiFi, localhost for USB)'}
                        </p>
                      )}
                    </div>

                    {/* Terminal Port Input (only for PAX Terminal) */}
                    {!useEBizChargeTerminal && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Terminal Port (Optional)
                        </label>
                        <input
                          type="number"
                          value={terminalPort}
                          onChange={(e) => setTerminalPort(e.target.value)}
                          placeholder="4430 (USB) or 10009 (WiFi)"
                          min="1"
                          max="65535"
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          Default: 4430 for USB, 10009 for WiFi. Leave empty to use default.
                        </p>
                      </div>
                    )}

                    {/* Terminal Status */}
                    <div className="bg-white border border-blue-200 rounded-lg p-6 text-center space-y-4">
                      <CreditCard className="w-12 h-12 text-blue-400 mx-auto" />
                      <div>
                        <p className="font-medium text-gray-900 mb-1">
                          {cardReaderStatus === 'ready' && 'Terminal Ready'}
                          {cardReaderStatus === 'connecting' && 'Connecting...'}
                          {cardReaderStatus === 'reading' && 'Processing card...'}
                        </p>
                        <p className="text-sm text-gray-600">
                          {cardReaderStatus === 'ready' && (useEBizChargeTerminal 
                            ? 'Insert, swipe, or tap card on terminal'
                            : 'Insert, swipe, or tap card on PAX terminal (VP100)')}
                          {cardReaderStatus === 'connecting' && 'Connecting to terminal via WiFi...'}
                          {cardReaderStatus === 'reading' && 'Do not remove card'}
                        </p>
                        {terminalIP && (
                          <p className="text-xs text-gray-500 mt-2">
                            Terminal: {terminalIP}
                          </p>
                        )}
                      </div>
                    </div>
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
    </div>
  );
}