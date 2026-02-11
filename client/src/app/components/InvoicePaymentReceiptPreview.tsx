import React from 'react';
import { X, CreditCard, Loader2 } from 'lucide-react';

export interface InvoicePaymentReceiptItem {
  type: 'invoice' | 'sales_order';
  id: string;
  number: string;
  amount: number;
}

interface InvoicePaymentReceiptPreviewProps {
  isOpen: boolean;
  onClose: () => void;
  storeName: string;
  customerName: string;
  items: InvoicePaymentReceiptItem[];
  paymentMethodLabel: string;
  subtotal: number;
  ccSurcharge: number;
  totalWithFee: number;
  onConfirmPay: () => Promise<void> | void;
  loading?: boolean;
}

export function InvoicePaymentReceiptPreview({
  isOpen,
  onClose,
  storeName,
  customerName,
  items,
  paymentMethodLabel,
  subtotal,
  ccSurcharge,
  totalWithFee,
  onConfirmPay,
  loading = false,
}: InvoicePaymentReceiptPreviewProps) {
  const [isConfirming, setIsConfirming] = React.useState(false);

  const handleConfirmPay = async () => {
    setIsConfirming(true);
    try {
      await onConfirmPay();
      onClose();
    } finally {
      setIsConfirming(false);
    }
  };

  if (!isOpen) return null;

  const busy = loading || isConfirming;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <div className="flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <span className="font-semibold text-gray-900 dark:text-white">Payment receipt</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        {/* Receipt body - scrollable */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="text-center border-b border-gray-200 dark:border-gray-700 pb-3">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">{storeName}</h2>
          </div>

          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">Date</span>
              <span className="font-medium text-gray-900 dark:text-white">
                {new Date().toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">Customer</span>
              <span className="font-medium text-gray-900 dark:text-white">{customerName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">Payment method</span>
              <span className="font-medium text-gray-900 dark:text-white">{paymentMethodLabel}</span>
            </div>
          </div>

          <div>
            <h3 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2">
              Items
            </h3>
            <div className="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
              {items.map((item, index) => (
                <div
                  key={`${item.type}-${item.id}`}
                  className={`flex justify-between items-center px-3 py-2 ${
                    index % 2 === 0 ? 'bg-gray-50 dark:bg-gray-700/30' : 'bg-white dark:bg-gray-800'
                  } ${index < items.length - 1 ? 'border-b border-gray-200 dark:border-gray-600' : ''}`}
                >
                  <span className="text-sm font-medium text-gray-900 dark:text-white">
                    Invoice {item.number}
                  </span>
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">
                    ${(Number(item.amount) || 0).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-gray-50 dark:bg-gray-700/30 rounded-lg p-3 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">Subtotal</span>
              <span className="font-medium text-gray-900 dark:text-white">${subtotal.toFixed(2)}</span>
            </div>
            {ccSurcharge > 0 && (
              <div className="flex justify-between text-sm text-amber-700 dark:text-amber-400">
                <span>Processing fee 3%</span>
                <span className="font-medium">${ccSurcharge.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between pt-2 border-t border-gray-200 dark:border-gray-600">
              <span className="font-semibold text-gray-900 dark:text-white">Total</span>
              <span className="font-bold text-gray-900 dark:text-white receipt-total-amount">
                ${totalWithFee.toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex gap-3 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="flex-1 px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
          >
            Back
          </button>
          <button
            type="button"
            onClick={handleConfirmPay}
            disabled={busy}
            className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {busy ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Processing…
              </>
            ) : (
              'Confirm & Pay'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
