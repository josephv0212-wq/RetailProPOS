import React, { useState, useRef, useEffect } from 'react';
import { Customer } from '../types';
import { CircleCheck, TriangleAlert, User, ChevronDown, Search } from 'lucide-react';

interface CustomerSelectorProps {
  customers: Customer[];
  selectedCustomer: Customer | null;
  onSelectCustomer: (customer: Customer | null) => void;
}

export function CustomerSelector({ customers, selectedCustomer, onSelectCustomer }: CustomerSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredCustomers = customers.filter(customer =>
    customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    customer.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    customer.phone?.includes(searchTerm)
  );

  const getStatusIcon = () => {
    if (!selectedCustomer) return <User className="w-5 h-5 text-gray-400" />;
    if (selectedCustomer.taxExempt) return <CircleCheck className="w-5 h-5 text-green-600 dark:text-green-400" />;
    if (!selectedCustomer.hasZohoId) return <TriangleAlert className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />;
    return <CircleCheck className="w-5 h-5 text-blue-600 dark:text-blue-400" />;
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <label className="block text-sm text-gray-600 dark:text-gray-400 mb-2">Customer</label>
      
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:border-blue-400 dark:hover:border-blue-500 transition-colors"
      >
        <div className="flex items-center gap-3">
          {getStatusIcon()}
          <span className={selectedCustomer ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-500'}>
            {selectedCustomer ? selectedCustomer.name : 'Select a customer'}
          </span>
        </div>
        <ChevronDown className={`w-5 h-5 text-gray-400 dark:text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-10 max-h-80 overflow-hidden">
          <div className="p-3 border-b border-gray-200 dark:border-gray-700">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search customers..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
                autoFocus
              />
            </div>
          </div>
          
          <div className="max-h-64 overflow-y-auto">
            {/* Walk-in Customer Option */}
            <button
              onClick={() => {
                onSelectCustomer(null);
                setIsOpen(false);
                setSearchTerm('');
              }}
              className={`w-full px-4 py-3 text-left hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors border-b border-gray-100 dark:border-gray-700 ${
                !selectedCustomer ? 'bg-blue-50 dark:bg-blue-900/20' : ''
              }`}
            >
              <div className="flex items-center gap-3">
                <User className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                <div className="flex-1">
                  <div className="font-medium text-gray-900 dark:text-white">Walk-in Customer</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">No Zoho Invoice</div>
                </div>
              </div>
            </button>

            {filteredCustomers.length === 0 ? (
              <div className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                No customers found
              </div>
            ) : (
              filteredCustomers.map((customer) => (
                <button
                  key={customer.id}
                  onClick={() => {
                    onSelectCustomer(customer);
                    setIsOpen(false);
                    setSearchTerm('');
                  }}
                  className={`w-full px-4 py-3 text-left hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors border-b border-gray-100 dark:border-gray-700 last:border-b-0 ${
                    selectedCustomer?.id === customer.id ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {customer.taxExempt ? (
                      <CircleCheck className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5" />
                    ) : !customer.hasZohoId ? (
                      <TriangleAlert className="w-5 h-5 text-yellow-600 dark:text-yellow-400 mt-0.5" />
                    ) : (
                      <User className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" />
                    )}
                    <div className="flex-1">
                      <div className="font-medium text-gray-900 dark:text-white flex items-center gap-2 flex-wrap">
                        <span>{customer.name}</span>
                        {customer.zohoId && <span className="text-xs">✅</span>}
                        {!customer.zohoId && <span className="text-xs">⚠️</span>}
                        {customer.cardBrand && customer.last_four_digits && (
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            ({customer.cardBrand}: xxxx xxxx xxxx {customer.last_four_digits})
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                        {customer.company && customer.company !== customer.name && (
                          <div>{customer.company}</div>
                        )}
                        {customer.email && <div>{customer.email}</div>}
                        {customer.phone && <div>{customer.phone}</div>}
                      </div>
                      {customer.taxExempt && (
                        <div className="text-xs text-green-600 dark:text-green-400 mt-1">Tax Exempt</div>
                      )}
                      {!customer.hasZohoId && (
                        <div className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">No Zoho ID</div>
                      )}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}