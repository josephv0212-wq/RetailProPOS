import React from 'react';
import { X, Wallet, Banknote } from 'lucide-react';

interface ZohoPaymentOptionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  customerName: string;
  itemCount: number;
  totalAmount: number;
  onChooseZohoPayment: () => void; // existing flow (stored/Zoho payment info)
  onChoosePosPayment: () => void;  // normal methods (cash/cc/dc/zelle/ach)
}

export function ZohoPaymentOptionsModal({
  isOpen,
  onClose,
  customerName,
  itemCount,
  totalAmount,
  onChooseZohoPayment,
  onChoosePosPayment,
}: ZohoPaymentOptionsModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Payment Options</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              {customerName} • {itemCount} item{itemCount !== 1 ? 's' : ''} • ${totalAmount.toFixed(2)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        <div className="p-6 space-y-3">
          <button
            onClick={onChooseZohoPayment}
            className="w-full p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-blue-500 dark:hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all text-left"
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
                <Wallet className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1">
                <div className="font-semibold text-gray-900 dark:text-white">Zoho / Stored Payment</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  Use the customer’s stored payment method (existing flow).
                </div>
              </div>
            </div>
          </button>

          <button
            onClick={onChoosePosPayment}
            className="w-full p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-green-500 dark:hover:border-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 transition-all text-left"
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-green-600 rounded-lg flex items-center justify-center">
                <Banknote className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1">
                <div className="font-semibold text-gray-900 dark:text-white">POS Payment Methods</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  Pay with CASH / CC / DC / ZELLE / ACH (Payment Modal).
                </div>
              </div>
            </div>
          </button>
        </div>

        <div className="p-6 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-gray-900 dark:text-white"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

