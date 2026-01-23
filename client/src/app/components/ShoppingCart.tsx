import React from 'react';
import { Customer, CartItem } from '../types';
import { CustomerSelector } from './CustomerSelector';
import { ShoppingCart as ShoppingCartIcon, CircleCheck, TriangleAlert, Info, Trash2, ArrowLeft } from 'lucide-react';

export const isDryIceItem = (itemName: string): boolean => {
  return itemName.toLowerCase().includes('dry ice');
};

interface ShoppingCartProps {
  customers: Customer[];
  selectedCustomer: Customer | null;
  customerTaxPreference?: 'STANDARD' | 'SALES TAX EXCEPTION CERTIFICATE' | null;
  customerCards?: any[];
  onSelectCustomer: (customer: Customer | null) => void;
  cartItems: CartItem[];
  onUpdateQuantity: (productId: string, quantity: number) => void;
  onUpdateUM?: (productId: string, um: string) => void;
  onRemoveItem: (productId: string) => void;
  onClearCart: () => void;
  onPayNow: () => void;
  taxRate: number;
}

export function ShoppingCart({
  customers,
  selectedCustomer,
  customerTaxPreference,
  customerCards = [],
  onSelectCustomer,
  cartItems,
  onUpdateQuantity,
  onUpdateUM,
  onRemoveItem,
  onClearCart,
  onPayNow,
  taxRate,
}: ShoppingCartProps) {
  // Calculate price with UM conversion rate
  const getItemPrice = (item: CartItem): number => {
    const basePrice = item.product.price;
    
    // Use unitPrecision from availableUnits for all items (including dry ice)
    if (item.selectedUM && item.availableUnits && item.availableUnits.length > 0) {
      const selectedUnit = item.availableUnits.find(u => 
        (u.symbol === item.selectedUM) || (u.unitName === item.selectedUM)
      );
      if (selectedUnit && selectedUnit.unitPrecision > 0) {
        // Price = original price * unitPrecision (Unit Rate)
        // Convert to number in case it's a string from database
        const rate = typeof selectedUnit.unitPrecision === 'string' 
          ? parseFloat(selectedUnit.unitPrecision) 
          : selectedUnit.unitPrecision;
        return basePrice * rate;
      }
    }
    
    return basePrice;
  };

  const subtotal = cartItems.reduce((sum, item) => {
    const itemPrice = getItemPrice(item);
    return sum + (itemPrice * item.quantity);
  }, 0);
  const isTaxExempt = customerTaxPreference === 'SALES TAX EXCEPTION CERTIFICATE' || selectedCustomer?.taxExempt || false;
  const tax = isTaxExempt ? 0 : subtotal * taxRate;
  const total = subtotal + tax;

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700">
      {/* Header */}
      <div className="px-3 md:px-6 py-3 md:py-4 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-lg md:text-xl font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          Shopping Cart
          {cartItems.length > 0 && (
            <span className="bg-blue-600 dark:bg-blue-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
              {cartItems.reduce((sum, item) => sum + item.quantity, 0)}
            </span>
          )}
        </h2>
      </div>

      {/* Customer Selection */}
      <div className="px-3 md:px-6 py-3 md:py-4 border-b border-gray-200 dark:border-gray-700">
        <CustomerSelector
          customers={customers}
          selectedCustomer={selectedCustomer}
          onSelectCustomer={onSelectCustomer}
        />

        {/* Info Banners */}
        <div className="mt-3 space-y-2">
          {isTaxExempt && (
            <div className="flex items-center gap-2 px-3 py-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
              <CircleCheck className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0" />
              <span className="text-xs md:text-sm text-green-700 dark:text-green-300">Tax Exempt Customer</span>
            </div>
          )}
          
          {selectedCustomer && customerCards.length > 0 && (
            <div className="flex flex-col gap-1 px-3 py-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <div className="flex items-center gap-2">
                <CircleCheck className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                <span className="text-xs md:text-sm font-medium text-blue-700 dark:text-blue-300">Saved Payment Methods</span>
              </div>
              <div className="ml-6 space-y-1">
                {customerCards.map((card, idx) => (
                  <div key={idx} className="text-xs text-blue-600 dark:text-blue-400">
                    {card.cardBrand && card.last_four_digits ? (
                      <span>{card.cardBrand}: xxxx xxxx xxxx {card.last_four_digits}</span>
                    ) : selectedCustomer.cardBrand && selectedCustomer.last_four_digits ? (
                      <span>{selectedCustomer.cardBrand}: xxxx xxxx xxxx {selectedCustomer.last_four_digits}</span>
                    ) : null}
                  </div>
                ))}
                {customerCards.length === 0 && selectedCustomer.cardBrand && selectedCustomer.last_four_digits && (
                  <div className="text-xs text-blue-600 dark:text-blue-400">
                    {selectedCustomer.cardBrand}: xxxx xxxx xxxx {selectedCustomer.last_four_digits}
                  </div>
                )}
                {(selectedCustomer.bankAccountLast4 || selectedCustomer.paymentInfo?.bankAccountLast4) && (
                  <div className="text-xs text-blue-600 dark:text-blue-400">
                    Bank: XXXX{selectedCustomer.bankAccountLast4 || selectedCustomer.paymentInfo?.bankAccountLast4}
                  </div>
                )}
              </div>
            </div>
          )}
          
          {selectedCustomer && !selectedCustomer.hasZohoId && (
            <div className="flex items-center gap-2 px-3 py-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
              <TriangleAlert className="w-4 h-4 text-yellow-600 dark:text-yellow-400 flex-shrink-0" />
              <span className="text-xs md:text-sm text-yellow-700 dark:text-yellow-300">Customer has no Zoho ID</span>
            </div>
          )}
          
          {!selectedCustomer && (
            <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg">
              <Info className="w-4 h-4 text-gray-600 dark:text-gray-400 flex-shrink-0" />
              <span className="text-xs md:text-sm text-gray-600 dark:text-gray-400">Please select a customer to continue</span>
            </div>
          )}
        </div>
      </div>

      {/* Cart Items */}
      <div className="flex-1 overflow-y-auto px-3 md:px-6 py-3 md:py-4">
        {cartItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <ShoppingCartIcon className="w-12 h-12 md:w-16 md:h-16 text-gray-300 dark:text-gray-600 mb-4" />
            <h3 className="font-medium text-gray-400 dark:text-gray-500 mb-2">Cart is empty</h3>
            <p className="text-sm text-gray-400 dark:text-gray-500">Click on items to add them</p>
          </div>
        ) : (
          <div className="space-y-3">
            {cartItems.map((item) => {
              const itemNameLower = item.product.name.toLowerCase();
              // Exclude "Online Dry Ice Block" and "Online Dry Ice Pellets" from dry ice UM dropdown
              const isOnlineDryIce = itemNameLower.includes('online dry ice block') || 
                                     itemNameLower.includes('online dry ice pellets');
              const isDryIce = isDryIceItem(item.product.name) && !isOnlineDryIce;
              
              // Use availableUnits from backend (already filtered in App.tsx)
              const availableUMOptions = item.availableUnits || [];
              
              const itemPrice = getItemPrice(item);
              
              // Get UM rate for display
              const getUMRate = (): number | null => {
                if (item.selectedUM && item.availableUnits && item.availableUnits.length > 0) {
                  const selectedUnit = item.availableUnits.find(u => 
                    (u.symbol === item.selectedUM) || (u.unitName === item.selectedUM)
                  );
                  if (selectedUnit && selectedUnit.unitPrecision > 0) {
                    return typeof selectedUnit.unitPrecision === 'string' 
                      ? parseFloat(selectedUnit.unitPrecision) 
                      : selectedUnit.unitPrecision;
                  }
                }
                return null;
              };
              
              const umRate = getUMRate();
              const basicPrice = item.product.price;
              const displayUMRate = umRate !== null ? umRate : 1;
              const amount = itemPrice * item.quantity;

              return (
                <div key={item.product.id} className="flex items-center gap-2 pb-3 border-b border-gray-100 dark:border-gray-700 last:border-b-0">
                  {/* Item name */}
                  <h4 className="text-xs font-medium text-gray-900 dark:text-white flex-1 min-w-0 truncate">{item.product.name}</h4>
                  
                  {/* Quantity input */}
                  <input
                    type="number"
                    value={item.quantity || ''}
                    onChange={(e) => {
                      const value = e.target.value === '' ? 0 : parseInt(e.target.value) || 0;
                      onUpdateQuantity(String(item.product.id), Math.max(0, value));
                    }}
                    className="w-12 text-xs text-center border border-gray-300 dark:border-gray-600 rounded py-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-white flex-shrink-0"
                    min="0"
                  />
                  
                  {/* UM Dropdown for Dry Ice Items */}
                  {isDryIce && onUpdateUM && availableUMOptions.length > 0 && (
                    <select
                      value={item.selectedUM || ''}
                      onChange={(e) => onUpdateUM(String(item.product.id), e.target.value)}
                      className="text-xs border border-gray-300 dark:border-gray-600 rounded py-1 px-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 flex-shrink-0"
                      style={{ minWidth: '100px' }}
                    >
                      {availableUMOptions.map((um) => {
                        const label = um.symbol || um.unitName;
                        return (
                          <option key={um.id} value={label}>
                            {label}
                          </option>
                        );
                      })}
                    </select>
                  )}
                  
                  {/* UM Dropdown for Other Items - supports multiple units from backend */}
                  {!isDryIce && (
                    <>
                      {onUpdateUM && item.availableUnits && item.availableUnits.length > 0 ? (
                        <select
                          value={item.selectedUM || ''}
                          onChange={(e) => onUpdateUM(String(item.product.id), e.target.value)}
                          className="text-xs border border-gray-300 dark:border-gray-600 rounded py-1 px-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 flex-shrink-0"
                          style={{ minWidth: '100px' }}
                        >
                          {item.availableUnits.map((unit) => {
                            const label = unit.symbol || unit.unitName;
                            return (
                              <option key={unit.id} value={label}>
                                {label}
                              </option>
                            );
                          })}
                        </select>
                      ) : (
                        item.product.unit && (
                          <select
                            value={item.product.unit}
                            disabled
                            className="text-xs border border-gray-300 dark:border-gray-600 rounded py-1 px-2 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 cursor-not-allowed flex-shrink-0"
                            style={{ minWidth: '80px' }}
                          >
                            <option value={item.product.unit}>{item.product.unit}</option>
                          </select>
                        )
                      )}
                    </>
                  )}
                  
                  {/* Calculation */}
                  <p className="text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap flex-shrink-0">
                    ${displayUMRate.toFixed(2)}  = <span className="text-base font-medium text-white">${amount.toFixed(2)}</span>
                  </p>
                  
                  {/* Delete button */}
                  <button
                    onClick={() => onRemoveItem(String(item.product.id))}
                    className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 transition-colors flex-shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Totals */}
      <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 space-y-3">
        <div className="flex items-center justify-between text-gray-700 dark:text-gray-300">
          <span>Subtotal</span>
          <span>${subtotal.toFixed(2)}</span>
        </div>
        
        <div className="flex items-center justify-between text-gray-700 dark:text-gray-300">
          <span>Tax {isTaxExempt ? '(Exempt)' : `(${(taxRate * 100).toFixed(1)}%)`}</span>
          <span>${tax.toFixed(2)}</span>
        </div>
        
        <div className="pt-3 border-t border-gray-300 dark:border-gray-600">
          <div className="flex items-center justify-between text-xl font-bold text-gray-900 dark:text-white">
            <span>Total</span>
            <span>${total.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 space-y-3">
        <button
          onClick={onClearCart}
          disabled={cartItems.length === 0}
          className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-gray-900 dark:text-white"
        >
          Clear Cart
        </button>
        
        <button
          onClick={onPayNow}
          disabled={cartItems.length === 0 || !selectedCustomer}
          className="w-full px-4 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:from-gray-400 disabled:to-gray-400 flex items-center justify-center gap-2"
        >
          Checkout <span>→</span>
        </button>
      </div>
    </div>
  );
}