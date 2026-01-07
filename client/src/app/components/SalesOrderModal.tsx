import React from 'react';
import { X, FileText, Calendar, DollarSign } from 'lucide-react';

interface SalesOrder {
  salesorder_id: string;
  salesorder_number: string;
  date: string;
  total: number;
  reference_number?: string;
  line_items_count: number;
}

interface SalesOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  salesOrders: SalesOrder[];
  onSelectSalesOrder: (salesOrder: SalesOrder) => void;
  customerName: string;
}

export function SalesOrderModal({
  isOpen,
  onClose,
  salesOrders,
  onSelectSalesOrder,
  customerName,
}: SalesOrderModalProps) {
  if (!isOpen) return null;

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return dateString;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <FileText className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                Open Sales Orders
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                {customerName}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {salesOrders.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
              <p className="text-gray-500 dark:text-gray-400">
                No open sales orders found for this customer.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {salesOrders.map((so) => (
                <button
                  key={so.salesorder_id}
                  onClick={() => {
                    onSelectSalesOrder(so);
                    onClose();
                  }}
                  className="w-full p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-blue-500 dark:hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all text-left"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                        <span className="font-semibold text-gray-900 dark:text-white">
                          {so.salesorder_number}
                        </span>
                        {so.reference_number && (
                          <span className="text-sm text-gray-500 dark:text-gray-400">
                            ({so.reference_number})
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                        <div className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          <span>{formatDate(so.date)}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <DollarSign className="w-4 h-4" />
                          <span>${so.total.toFixed(2)}</span>
                        </div>
                        <span className="text-xs">
                          {so.line_items_count} item{so.line_items_count !== 1 ? 's' : ''}
                        </span>
                      </div>
                    </div>
                    <div className="text-blue-600 dark:text-blue-400 font-medium">
                      Select →
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
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
