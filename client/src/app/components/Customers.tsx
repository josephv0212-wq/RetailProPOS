import React, { useState, useMemo, MouseEvent } from 'react';
import { Customer } from '../types';
import { Search, Users, X, Loader2 } from 'lucide-react';

interface CustomersProps {
  customers: Customer[];
  isLoading?: boolean;
}

export function Customers({ customers, isLoading = false }: CustomersProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  // Filter customers based on search term
  const filteredCustomers = useMemo(() => {
    if (!searchTerm.trim()) return customers;

    const lowerSearch = searchTerm.toLowerCase();
    return customers.filter(customer => {
      const name = customer.name || customer.contactName || '';
      const company = customer.company || customer.companyName || '';
      return name.toLowerCase().includes(lowerSearch) ||
        company.toLowerCase().includes(lowerSearch) ||
        customer.email?.toLowerCase().includes(lowerSearch) ||
        customer.phone?.toLowerCase().includes(lowerSearch);
    });
  }, [customers, searchTerm]);

  const handleRowClick = (customer: Customer) => {
    setSelectedCustomer(customer);
  };

  const handleCloseDrawer = () => {
    setSelectedCustomer(null);
  };

  const handleOverlayClick = (e: MouseEvent) => {
    if (e.target === e.currentTarget) {
      handleCloseDrawer();
    }
  };

  const getPaymentInfo = (customer: Customer) => {
    const paymentMethods = [];
    
    if (customer.paymentInfo?.hasCard && customer.paymentInfo.cardBrand && customer.paymentInfo.last4) {
      paymentMethods.push(`${customer.paymentInfo.cardBrand} •••• ${customer.paymentInfo.last4}`);
    }
    
    if (customer.bankAccountLast4 || customer.paymentInfo?.bankAccountLast4) {
      paymentMethods.push(`Bank: XXXX${customer.bankAccountLast4 || customer.paymentInfo?.bankAccountLast4}`);
    }
    
    if (paymentMethods.length === 0) {
      return customer.paymentInfo?.hasCard ? 'Card info saved' : 'None';
    }
    
    return paymentMethods.join(', ');
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-8">
      {/* Page Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 md:px-8 py-6 md:py-8">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white mb-2">
          Customers
        </h1>
        <p className="text-sm md:text-base text-gray-600 dark:text-gray-400">
          View and search customers from Zoho Books (View Only)
        </p>
      </div>

      {/* Search Bar Section */}
      <div className="px-8 mt-8">
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 shadow-sm">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-gray-500" />
            <input
              type="text"
              placeholder="Search customers by name, company, email, or phone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
            />
          </div>
        </div>
      </div>

      {/* Customers Table Section */}
      <div className="px-8 mt-6">
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm overflow-hidden">
          {isLoading ? (
            // Loading State
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 className="w-12 h-12 text-blue-600 animate-spin mb-4" />
              <p className="text-gray-500 dark:text-gray-400">Loading...</p>
            </div>
          ) : filteredCustomers.length === 0 ? (
            // Empty State
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Users className="w-16 h-16 text-gray-300 dark:text-gray-600 mb-4" />
              <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
                {searchTerm ? 'No customers found' : 'No customers available'}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {searchTerm 
                  ? 'Try a different search term' 
                  : 'Sync customers from Zoho Books in Settings'}
              </p>
            </div>
          ) : (
            // Table
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Contact
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Company
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Email
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Phone
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Payment Info
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Location
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {filteredCustomers.map((customer) => (
                    <tr
                      key={customer.id}
                      onClick={() => handleRowClick(customer)}
                      className="hover:bg-purple-50 dark:hover:bg-gray-700 cursor-pointer transition-colors"
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="font-medium text-gray-900 dark:text-white">
                          {customer.name || 'N/A'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-gray-700 dark:text-gray-300">
                        {customer.company || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-gray-700 dark:text-gray-300">
                        {customer.email || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-gray-700 dark:text-gray-300">
                        {customer.phone || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-gray-700 dark:text-gray-300">
                        {getPaymentInfo(customer)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-gray-700 dark:text-gray-300">
                        {customer.locationName || customer.locationId || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex px-3 py-1 rounded-full text-xs font-medium ${
                            customer.status === 'active'
                              ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400'
                              : 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400'
                          }`}
                        >
                          {customer.status === 'active' ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Customer Detail Drawer */}
      {selectedCustomer && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 dark:bg-opacity-70 z-50 flex items-center justify-end"
          onClick={handleOverlayClick}
        >
          <div
            className="bg-white dark:bg-gray-800 w-full max-w-[500px] h-full max-h-[90vh] overflow-y-auto shadow-2xl animate-slide-in"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer Header */}
            <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-8 py-6 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                Customer Details
              </h2>
              <button
                onClick={handleCloseDrawer}
                className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg p-2 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Drawer Content */}
            <div className="px-8 py-6 space-y-6">
              {/* Customer Name Section */}
              <div>
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
                  {selectedCustomer.name || 'N/A'}
                </h3>
                {selectedCustomer.company && (
                  <p className="text-gray-500 dark:text-gray-400 mt-1">
                    {selectedCustomer.company}
                  </p>
                )}
              </div>

              {/* Details Section */}
              <div className="space-y-5">
                {selectedCustomer.email && (
                  <div>
                    <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                      Email
                    </label>
                    <p className="mt-1 font-semibold text-gray-900 dark:text-white">
                      {selectedCustomer.email}
                    </p>
                  </div>
                )}

                {selectedCustomer.phone && (
                  <div>
                    <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                      Phone
                    </label>
                    <p className="mt-1 font-semibold text-gray-900 dark:text-white">
                      {selectedCustomer.phone}
                    </p>
                  </div>
                )}

                {(selectedCustomer.locationName || selectedCustomer.locationId) && (
                  <div>
                    <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                      Location
                    </label>
                    <p className="mt-1 font-semibold text-gray-900 dark:text-white">
                      {selectedCustomer.locationName || selectedCustomer.locationId}
                    </p>
                  </div>
                )}

                {selectedCustomer.zohoId && (
                  <div>
                    <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                      Zoho ID
                    </label>
                    <p className="mt-1 font-mono bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 rounded-lg inline-block">
                      {selectedCustomer.zohoId}
                    </p>
                  </div>
                )}

                {selectedCustomer.status && (
                  <div>
                    <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                      Status
                    </label>
                    <div className="mt-2">
                      <span
                        className={`inline-flex px-4 py-2 rounded-lg font-semibold ${
                          selectedCustomer.status === 'active'
                            ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400'
                            : 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400'
                        }`}
                      >
                        {selectedCustomer.status === 'active' ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  </div>
                )}

                {selectedCustomer.paymentInfo?.hasCard && (
                  <div>
                    <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                      Payment Info
                    </label>
                    <p className="mt-1 font-semibold text-gray-900 dark:text-white">
                      {getPaymentInfo(selectedCustomer)}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes slide-in {
          from {
            transform: translateX(100%);
          }
          to {
            transform: translateX(0);
          }
        }
        .animate-slide-in {
          animation: slide-in 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}