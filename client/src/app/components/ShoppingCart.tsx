import React from 'react';
import { Customer, CartItem } from '../types';
import { CustomerSelector } from './CustomerSelector';
import { ShoppingCart as ShoppingCartIcon, CircleCheck, TriangleAlert, Info, Plus, Minus, Trash2, ArrowLeft } from 'lucide-react';

interface ShoppingCartProps {
  customers: Customer[];
  selectedCustomer: Customer | null;
  customerTaxPreference?: 'STANDARD' | 'SALES TAX EXCEPTION CERTIFICATE' | null;
  customerCards?: any[];
  onSelectCustomer: (customer: Customer | null) => void;
  cartItems: CartItem[];
  onUpdateQuantity: (productId: string, quantity: number) => void;
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
  onRemoveItem,
  onClearCart,
  onPayNow,
  taxRate,
}: ShoppingCartProps) {
  const subtotal = cartItems.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);
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
            {cartItems.map((item) => (
              <div key={item.product.id} className="flex items-start gap-3 pb-3 border-b border-gray-100 dark:border-gray-700 last:border-b-0">
                <div className="flex-1">
                  <h4 className="font-medium text-gray-900 dark:text-white">{item.product.name}</h4>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">${item.product.price.toFixed(2)} each</p>
                </div>
                
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onUpdateQuantity(item.product.id, Math.max(1, item.quantity - 1))}
                    className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  >
                    <Minus className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                  </button>
                  
                  <input
                    type="number"
                    value={item.quantity}
                    onChange={(e) => {
                      const value = parseInt(e.target.value) || 1;
                      onUpdateQuantity(item.product.id, Math.max(1, value));
                    }}
                    className="w-12 text-center border border-gray-300 dark:border-gray-600 rounded py-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    min="1"
                  />
                  
                  <button
                    onClick={() => onUpdateQuantity(item.product.id, item.quantity + 1)}
                    className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  >
                    <Plus className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                  </button>
                </div>
                
                <div className="w-20 text-right font-medium text-gray-900 dark:text-white">
                  ${(item.product.price * item.quantity).toFixed(2)}
                </div>
                
                <button
                  onClick={() => onRemoveItem(item.product.id)}
                  className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 transition-colors"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            ))}
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