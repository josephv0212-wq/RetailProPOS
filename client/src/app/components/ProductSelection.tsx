import React, { useState, useMemo } from 'react';
import { Product, Customer } from '../types';
import { Search, ShoppingBag, ArrowLeft, Package } from 'lucide-react';

interface ProductSelectionProps {
  products: Product[];
  selectedCustomer: Customer | null;
  onAddToCart: (product: Product) => void;
}

export function ProductSelection({ products, selectedCustomer, onAddToCart }: ProductSelectionProps) {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredProducts = useMemo(() => {
    return products.filter(product => {
      const matchesSearch = 
        product.name.toLowerCase().includes(searchTerm.toLowerCase());
      
      return matchesSearch;
    });
  }, [products, searchTerm]);

  if (!selectedCustomer) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-8">
        <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-8">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full mb-4">
              <ShoppingBag className="w-8 h-8 text-blue-600 dark:text-blue-400" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              Select a Customer First
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Please select a customer from the shopping cart panel to start adding items to the sale.
            </p>
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 flex items-start gap-3">
              <ArrowLeft className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-blue-700 dark:text-blue-300 text-left">
                Use the customer selector on the left to choose a customer or create a new customer record.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900">
      {/* Search and Filters */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-3 md:px-6 py-3 md:py-4">
        <div className="flex flex-col gap-4">
          {/* Search Bar */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 md:w-5 md:h-5 text-gray-400 dark:text-gray-500" />
            <input
              type="text"
              placeholder="Search items by name"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 md:pl-10 pr-4 py-2 md:py-3 text-sm md:text-base border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
            />
          </div>
        </div>
      </div>

      {/* Product Grid */}
      <div className="flex-1 overflow-y-auto px-3 md:px-6 py-3 md:py-4">
        {filteredProducts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <Package className="w-16 h-16 text-gray-300 dark:text-gray-600 mb-4" />
            <h3 className="font-medium text-gray-400 dark:text-gray-500 mb-2">No items found</h3>
            <p className="text-sm text-gray-400 dark:text-gray-500">Adjust your search or filters</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-2 md:gap-3">
            {filteredProducts.map((product) => (
              <button
                key={product.id}
                onClick={() => onAddToCart(product)}
                disabled={product.stock === 0 || product.price === 0}
                className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-2 md:p-3 hover:border-blue-400 dark:hover:border-blue-500 hover:shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-gray-200 dark:disabled:hover:border-gray-700 disabled:hover:shadow-none text-left group"
              >
                {/* Product Image */}
                <div className="aspect-square bg-gray-100 dark:bg-gray-700 rounded-lg mb-2 flex items-center justify-center group-hover:bg-blue-50 dark:group-hover:bg-blue-900/20 transition-colors overflow-hidden">
                  {product.imageUrl ? (
                    <img 
                      src={product.imageUrl} 
                      alt={product.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Package className="w-6 h-6 md:w-8 md:h-8 text-gray-300 dark:text-gray-600 group-hover:text-blue-400 transition-colors" />
                  )}
                </div>

                {/* Product Info */}
                <h3 className="font-medium text-gray-900 dark:text-white mb-1 line-clamp-2 text-xs md:text-sm">
                  {product.name}
                </h3>
                
                <div className="font-bold text-blue-600 dark:text-blue-400 text-sm md:text-base">
                  ${product.price.toFixed(2)}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}