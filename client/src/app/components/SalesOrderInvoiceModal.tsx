import React, { useState } from 'react';
import { X, FileText, Calendar, DollarSign, Check } from 'lucide-react';

interface SalesOrder {
  salesorder_id: string;
  salesorder_number: string;
  date: string;
  total: number;
  reference_number?: string;
  type: 'salesorder';
}

interface Invoice {
  invoice_id: string;
  invoice_number: string;
  date: string;
  due_date?: string;
  total: number;
  balance: number;
  reference_number?: string;
  status: string;
  type: 'invoice';
}

type OrderItem = SalesOrder | Invoice;

interface SalesOrderInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  salesOrders: SalesOrder[];
  invoices: Invoice[];
  onSelectItems: (items: OrderItem[]) => void;
  customerName: string;
}

export function SalesOrderInvoiceModal({
  isOpen,
  onClose,
  salesOrders,
  invoices,
  onSelectItems,
  customerName,
}: SalesOrderInvoiceModalProps) {
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());

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

  const getStatusColor = (status?: string) => {
    if (!status) return 'text-gray-600 dark:text-gray-400';
    switch (status.toLowerCase()) {
      case 'unpaid':
        return 'text-red-600 dark:text-red-400';
      case 'partially_paid':
        return 'text-yellow-600 dark:text-yellow-400';
      case 'paid':
        return 'text-green-600 dark:text-green-400';
      case 'sent':
        return 'text-blue-600 dark:text-blue-400';
      default:
        return 'text-gray-600 dark:text-gray-400';
    }
  };

  const allItems: OrderItem[] = [
    ...salesOrders.map(so => ({ ...so, type: 'salesorder' as const })),
    ...invoices.map(inv => ({ ...inv, type: 'invoice' as const })),
  ];

  const toggleItem = (itemId: string) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(itemId)) {
      newSelected.delete(itemId);
    } else {
      newSelected.add(itemId);
    }
    setSelectedItems(newSelected);
  };

  const handleSelect = () => {
    const selected = allItems.filter(item => {
      const id = item.type === 'salesorder' ? item.salesorder_id : item.invoice_id;
      return selectedItems.has(id);
    });
    
    if (selected.length > 0) {
      onSelectItems(selected);
      setSelectedItems(new Set());
      onClose();
    }
  };

  const hasItems = allItems.length > 0;
  const hasSelection = selectedItems.size > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <FileText className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                Sales Orders & Invoices
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
          {!hasItems ? (
            <div className="text-center py-12">
              <FileText className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
              <p className="text-gray-500 dark:text-gray-400">
                No sales orders or invoices found for this customer.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Sales Orders Section */}
              {salesOrders.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Sales Orders ({salesOrders.length})
                  </h3>
                  {salesOrders.map((so) => {
                    const isSelected = selectedItems.has(so.salesorder_id);
                    return (
                      <button
                        key={so.salesorder_id}
                        onClick={() => toggleItem(so.salesorder_id)}
                        className={`w-full p-4 border rounded-lg transition-all text-left mb-2 ${
                          isSelected
                            ? 'border-blue-500 dark:border-blue-400 bg-blue-50 dark:bg-blue-900/20'
                            : 'border-gray-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className={`mt-1 flex-shrink-0 w-5 h-5 border-2 rounded flex items-center justify-center ${
                            isSelected
                              ? 'bg-blue-600 dark:bg-blue-500 border-blue-600 dark:border-blue-500'
                              : 'border-gray-300 dark:border-gray-600'
                          }`}>
                            {isSelected && <Check className="w-3 h-3 text-white" />}
                          </div>
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
                              <span className="text-xs text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30 px-2 py-0.5 rounded">
                                SO
                              </span>
                            </div>
                            <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                              <div className="flex items-center gap-1">
                                <Calendar className="w-4 h-4" />
                                <span>{formatDate(so.date)}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <DollarSign className="w-4 h-4" />
                                <span>{so.total.toFixed(2)}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Invoices Section */}
              {invoices.length > 0 && (
                <div className={salesOrders.length > 0 ? 'mt-6' : ''}>
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Invoices ({invoices.length})
                  </h3>
                  {invoices.map((inv) => {
                    const isSelected = selectedItems.has(inv.invoice_id);
                    return (
                      <button
                        key={inv.invoice_id}
                        onClick={() => toggleItem(inv.invoice_id)}
                        className={`w-full p-4 border rounded-lg transition-all text-left mb-2 ${
                          isSelected
                            ? 'border-blue-500 dark:border-blue-400 bg-blue-50 dark:bg-blue-900/20'
                            : 'border-gray-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className={`mt-1 flex-shrink-0 w-5 h-5 border-2 rounded flex items-center justify-center ${
                            isSelected
                              ? 'bg-blue-600 dark:bg-blue-500 border-blue-600 dark:border-blue-500'
                              : 'border-gray-300 dark:border-gray-600'
                          }`}>
                            {isSelected && <Check className="w-3 h-3 text-white" />}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                              <span className="font-semibold text-gray-900 dark:text-white">
                                {inv.invoice_number}
                              </span>
                              {inv.reference_number && (
                                <span className="text-sm text-gray-500 dark:text-gray-400">
                                  ({inv.reference_number})
                                </span>
                              )}
                              <span className={`text-xs font-medium px-2 py-0.5 rounded ${getStatusColor(inv.status)} bg-opacity-10`}>
                                {inv.status.replace('_', ' ')}
                              </span>
                            </div>
                            <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                              <div className="flex items-center gap-1">
                                <Calendar className="w-4 h-4" />
                                <span>{formatDate(inv.date)}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <DollarSign className="w-4 h-4" />
                                <span>{inv.total.toFixed(2)}</span>
                              </div>
                              {inv.balance > 0 && (
                                <span className="text-xs text-red-600 dark:text-red-400">
                                  Balance: {inv.balance.toFixed(2)}
                                </span>
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
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 dark:border-gray-700 space-y-3">
          {hasSelection && (
            <div className="text-sm text-gray-600 dark:text-gray-400 text-center">
              {selectedItems.size} item{selectedItems.size !== 1 ? 's' : ''} selected
            </div>
          )}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-gray-900 dark:text-white"
            >
              Cancel
            </button>
            <button
              onClick={handleSelect}
              disabled={!hasSelection}
              className="flex-1 px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:from-gray-400 disabled:to-gray-400"
            >
              Proceed to Payment ({selectedItems.size})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
