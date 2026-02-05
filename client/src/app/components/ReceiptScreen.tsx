import React, { useState, useEffect } from 'react';
import { Sale } from '../types';
import { Printer, FileDown, ShoppingCart, CheckCircle, AlertCircle } from 'lucide-react';

interface ReceiptScreenProps {
  sale: Sale;
  storeName: string;
  storeAddress: string;
  storePhone: string;
  userName: string;
  onNewSale: () => void;
  onLogout: () => void;
}

export function ReceiptScreen({
  sale,
  storeName,
  storeAddress,
  storePhone,
  userName,
  onNewSale,
  onLogout,
}: ReceiptScreenProps) {
  const [isPrinting, setIsPrinting] = useState(false);
  const [printerStatus, setPrinterStatus] = useState<'checking' | 'online' | 'offline'>('checking');

  // Check printer status on mount
  useEffect(() => {
    const checkPrinter = async () => {
      // Simulate printer check
      await new Promise(resolve => setTimeout(resolve, 1000));
      // Random printer status for demo (90% online)
      setPrinterStatus(Math.random() > 0.1 ? 'online' : 'offline');
    };
    checkPrinter();
  }, []);

  // Clean location name (remove tax info)
  const cleanLocationName = (name: string) => {
    return name.replace(/\s*\+\s*Tax\s*\([^)]*\)/gi, '').trim();
  };

  const handlePrint = async () => {
    if (printerStatus !== 'online') return;
    setIsPrinting(true);
    // Simulate print delay
    await new Promise(resolve => setTimeout(resolve, 500));
    window.print();
    setIsPrinting(false);
  };

  const handleDownloadPDF = () => {
    window.print();
  };

  // Get processing fee from sale object (already calculated and included in total)
  const processingFee = sale.ccFee || 0;
  const taxAmount = sale.tax ?? sale.taxAmount ?? 0;
  // Show the user's configured tax rate only (no recalculation). API may return taxPercentage as number or string (e.g. DECIMAL).
  const rawPct = sale.taxPercentage;
  const parsedPct = rawPct != null ? parseFloat(String(rawPct)) : NaN;
  const taxRate = Number.isFinite(parsedPct) ? parsedPct : 0;

  // Format payment method (merge credit_card and debit_card to CARD)
  const formatPaymentMethod = (method: string) => {
    if (method === 'credit_card' || method === 'debit_card') return 'CARD';
    return method.toUpperCase().replace(/_/g, ' ');
  };

  if (!sale) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">No Receipt Data</h2>
          <button
            onClick={onNewSale}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Start New Sale
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Print Styles */}
      <style>{`
        @media print {
          body {
            margin: 0;
            padding: 0;
            background: white;
          }
          .no-print {
            display: none !important;
          }
          .print-container {
            max-width: 800px;
            margin: 0 auto;
            padding: 12px;
            background: white;
            box-shadow: none;
            border-radius: 0;
          }
          .receipt-card {
            box-shadow: none;
            border: none;
          }
          .receipt-total-amount {
            color: #000 !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
      `}</style>

      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        {/* Content Container */}
        <div className="print-container max-w-[800px] mx-auto p-4 md:p-8">
          {/* Receipt Card */}
          <div className="receipt-card bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
            
            {/* Header Section */}
            <div className="text-center px-6 py-6 border-b-2 border-gray-200 dark:border-gray-700">
              <h1 className="text-[22px] font-extrabold text-gray-900 dark:text-white mb-1">
                Sub-Zero Ice Services, Inc
              </h1>
              <p className="text-[12px] font-medium text-gray-500 dark:text-gray-400">
                {cleanLocationName(storeName)}
              </p>
            </div>

            {/* Receipt Information Section */}
            <div className="px-6 py-6 border-b border-gray-200 dark:border-gray-700">
              <div className="flex flex-wrap justify-between gap-6">
                {/* Left Column */}
                <div className="flex gap-6">
                  {/* Date */}
                  <div>
                    <p className="text-[9px] text-gray-500 dark:text-gray-400 font-bold uppercase mb-1">
                      Date
                    </p>
                    <p className="text-[11px] font-bold text-gray-900 dark:text-white">
                      {(sale.timestamp ?? new Date(sale.createdAt)).toLocaleString()}
                    </p>
                  </div>

                  {/* Customer */}
                  {sale.customer && (
                    <div>
                      <p className="text-[9px] text-gray-500 dark:text-gray-400 font-bold uppercase mb-1">
                        Customer
                      </p>
                      <p className="text-[11px] font-bold text-gray-900 dark:text-white">
                        {sale.customer.name}
                      </p>
                    </div>
                  )}
                </div>

                {/* Right Column */}
                <div>
                  <p className="text-[9px] text-gray-500 dark:text-gray-400 font-bold uppercase mb-1">
                    Receipt #
                  </p>
                  <p className="text-[11px] font-bold text-gray-900 dark:text-white">
                    {sale.receiptNumber ?? sale.transactionId ?? `POS-${sale.id}`}
                  </p>
                </div>
              </div>
            </div>

            {/* Items Section */}
            <div className="px-6 py-6">
              <h2 className="text-[12px] font-extrabold text-gray-900 dark:text-white uppercase mb-3">
                ITEMS
              </h2>
              
              <div className="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
                {(sale.items || []).map((item, index) => {
                  // Use price from SaleItem (already includes UM conversion from backend)
                  const itemPrice = item.price ?? (item as any).product?.price ?? 0;
                  const itemQuantity = item.quantity ?? 1;
                  // Calculate line total WITHOUT tax to match subtotal
                  const itemLineSubtotal = itemPrice * itemQuantity;
                  const itemsLength = sale.items?.length ?? 0;
                  
                  // Extract base item name (remove UM from itemName if present)
                  const itemNameFull = item.itemName || (item as any).product?.name || 'Item';
                  const itemNameMatch = itemNameFull.match(/^(.+?)\s*\((.+?)\)$/);
                  const baseItemName = itemNameMatch ? itemNameMatch[1] : itemNameFull;
                  
                  // Get UM - prefer selectedUM, then extract from itemName, then from product.unit
                  const displayUM = (item as any).selectedUM || 
                                   (itemNameMatch ? itemNameMatch[2] : null) || 
                                   (item as any).product?.unit || 
                                   '';
                  
                  return (
                    <div
                      key={index}
                      className={`flex justify-between items-start gap-4 px-[10px] py-[9px] ${
                        index % 2 === 0 ? 'bg-gray-50 dark:bg-gray-700/30' : 'bg-white dark:bg-gray-800'
                      } ${index !== itemsLength - 1 ? 'border-b border-gray-200 dark:border-gray-600' : ''}`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-bold text-gray-900 dark:text-white">
                          {baseItemName}
                        </p>
                        <p className="text-[9px] text-gray-500 dark:text-gray-400 mt-0.5">
                          ({itemQuantity} {displayUM ? displayUM + ' ×' : '×'} ${itemPrice.toFixed(2)})
                        </p>
                      </div>
                      <div className="text-[12px] font-bold text-blue-600 dark:text-blue-400 whitespace-nowrap">
                        ${itemLineSubtotal.toFixed(2)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Totals Section */}
            <div className="px-6 pb-6">
              <div className="bg-gray-50 dark:bg-gray-700/30 rounded-lg px-[14px] py-[10px] space-y-2">
                {/* Subtotal */}
                <div className="flex justify-between items-center text-[11px]">
                  <span className="font-medium text-gray-700 dark:text-gray-300">Subtotal:</span>
                  <span className="font-bold text-gray-900 dark:text-white">${sale.subtotal.toFixed(2)}</span>
                </div>

                {/* Tax */}
                <div className="flex justify-between items-center text-[11px]">
                  <span className="font-medium text-gray-700 dark:text-gray-300">
                    Tax ({taxRate.toFixed(2)}%):
                  </span>
                  <span className="font-bold text-gray-900 dark:text-white">${taxAmount.toFixed(2)}</span>
                </div>

                {/* Processing Fee (if applicable) */}
                {processingFee > 0 && (
                  <div className="flex justify-between items-center text-[11px] text-yellow-600 dark:text-yellow-400">
                    <span className="font-medium">Processing Fee (3%):</span>
                    <span className="font-bold">${processingFee.toFixed(2)}</span>
                  </div>
                )}

                {/* Grand Total */}
                <div className="flex justify-between items-center pt-2 border-t border-gray-300 dark:border-gray-600">
                  <span className="text-[19px] font-extrabold text-gray-900 dark:text-white">TOTAL:</span>
                  <span className="receipt-total-amount text-[19px] font-extrabold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent dark:from-blue-400 dark:to-purple-400">
                    ${sale.total.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            {/* Payment Information Section */}
            <div className="px-6 pb-6">
              <div className="bg-gray-50 dark:bg-gray-700/30 rounded-lg px-[14px] py-[10px]">
                <div className="flex flex-wrap gap-6">
                  {/* Payment Method */}
                  <div>
                    <p className="text-[9px] text-gray-500 dark:text-gray-400 font-bold uppercase mb-1">
                      Payment Method
                    </p>
                    <p className="text-[11px] font-bold text-gray-900 dark:text-white">
                      {sale.payment ? formatPaymentMethod(sale.payment.method) : 'N/A'}
                    </p>
                  </div>

                  {/* Transaction ID (if exists) */}
                  {sale.payment?.confirmationNumber && (
                    <div>
                      <p className="text-[9px] text-gray-500 dark:text-gray-400 font-bold uppercase mb-1">
                        Transaction ID
                      </p>
                      <p className="text-[10px] font-bold text-gray-500 dark:text-gray-400 font-mono">
                        {sale.payment?.confirmationNumber}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Zoho Sync Status Section (only if Zoho data exists) */}
            {(sale.zohoSynced !== undefined) && (
              <div className="px-6 pb-6">
                {sale.zohoSynced ? (
                  <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg px-4 py-3">
                    <p className="text-[11px] font-bold text-green-700 dark:text-green-400 flex items-center gap-2">
                      <CheckCircle className="w-4 h-4" />
                      Synced to Zoho Books
                    </p>
                    <p className="text-[9px] text-green-600 dark:text-green-500 mt-1">
                      Receipt: {sale.receiptNumber}
                    </p>
                  </div>
                ) : (
                  <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3">
                    <p className="text-[11px] font-bold text-red-700 dark:text-red-400 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4" />
                      Zoho Sync Failed
                    </p>
                    <p className="text-[9px] text-red-600 dark:text-red-500 mt-1">
                      {sale.zohoError || 'Failed to sync with Zoho Books'}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Printer Status Section (no-print) */}
            <div className="no-print px-6 pb-6">
              {printerStatus === 'checking' && (
                <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg px-4 py-3">
                  <p className="text-[11px] font-bold text-yellow-700 dark:text-yellow-400">
                    🟡 Checking Printer...
                  </p>
                </div>
              )}
              
              {printerStatus === 'online' && (
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg px-4 py-3">
                  <p className="text-[11px] font-bold text-green-700 dark:text-green-400">
                    🟢 Printer Online
                  </p>
                </div>
              )}
              
              {printerStatus === 'offline' && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3">
                  <p className="text-[11px] font-bold text-red-700 dark:text-red-400 mb-1">
                    🔴 Printer Offline
                  </p>
                  <p className="text-[9px] text-red-600 dark:text-red-500">
                    Check printer connection. You can download a PDF receipt below.
                  </p>
                </div>
              )}
            </div>

          </div>

          {/* Action Buttons Section (no-print) */}
          <div className="no-print mt-6 flex flex-wrap gap-3">
            {/* Print Receipt */}
            <button
              onClick={handlePrint}
              disabled={printerStatus !== 'online' || isPrinting}
              className="flex-1 min-w-[200px] flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Printer className="w-5 h-5" />
              <span>{isPrinting ? 'Printing...' : 'Print Receipt'}</span>
            </button>

            {/* Download PDF */}
            <button
              onClick={handleDownloadPDF}
              className="flex-1 min-w-[200px] flex items-center justify-center gap-2 px-6 py-3 border-2 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              <FileDown className="w-5 h-5" />
              <span>Download PDF</span>
            </button>

            {/* New Sale */}
            <button
              onClick={onNewSale}
              className="flex-1 min-w-[200px] flex items-center justify-center gap-2 px-6 py-3 bg-gray-900 dark:bg-gray-700 text-white rounded-lg hover:bg-gray-800 dark:hover:bg-gray-600 transition-colors"
            >
              <ShoppingCart className="w-5 h-5" />
              <span>New Sale</span>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
