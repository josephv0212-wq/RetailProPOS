import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Customer } from '../types';
import { Search, Users, Loader2, CreditCard, List, Plus, Trash2, ArrowRight, ArrowLeft } from 'lucide-react';
import { customersAPI } from '../../services/api';
import { useToast } from '../contexts/ToastContext';

interface AutoInvoiceEntry {
  id: number;
  customerId: number;
  frequency: 'weekly' | 'monthly';
  customer: { id: number; name: string; contactName: string; company: string; companyName: string; email: string; phone: string; zohoId: string };
}

function CustomerDetailPopover({
  customer,
  detailPaymentData,
  loadingDetailPayment,
  getPaymentInfo,
  getAutoInvoiceEntry,
  addingCustomerId,
  onAddToAutoInvoice,
  onRemoveFromAutoInvoice,
  position,
  onMouseEnter,
  onMouseLeave
}: {
  customer: Customer;
  detailPaymentData: { paymentProfiles?: any[]; zohoCards?: any[]; bank_account_last4?: string | null } | null;
  loadingDetailPayment: boolean;
  getPaymentInfo: (c: Customer) => string;
  getAutoInvoiceEntry: (id: number) => AutoInvoiceEntry | undefined;
  addingCustomerId: number | null;
  onAddToAutoInvoice: (c: Customer, f?: 'weekly' | 'monthly') => void;
  onRemoveFromAutoInvoice: (id: number) => void;
  position: { x: number; y: number };
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  const cid = customer.id ?? (customer as any).customerId;
  const entry = cid ? getAutoInvoiceEntry(cid) : undefined;
  const adding = cid && addingCustomerId === cid;

  const formatPaymentDisplay = () => {
    const parts: string[] = [];
    if (detailPaymentData?.paymentProfiles?.length) {
      detailPaymentData.paymentProfiles.forEach((p: any) => {
        const last4 = p.last4 || (p.cardNumber && String(p.cardNumber).replace(/\D/g, '').slice(-4)) || (p.accountNumber && String(p.accountNumber).replace(/\D/g, '').slice(-4));
        if (last4) parts.push(p.type === 'ach' ? `Bank: XXXX${last4}` : `Card •••• ${last4}`);
      });
    }
    if (detailPaymentData?.zohoCards?.length && parts.length === 0) {
      detailPaymentData.zohoCards.forEach((c: any) => {
        const last4 = c.last_four_digits || c.last4;
        const brand = c.card_type || (c as any).brand || 'Card';
        if (last4) parts.push(`${brand} •••• ${last4}`);
      });
    }
    if (detailPaymentData?.bank_account_last4 && !parts.some(p => p.startsWith('Bank:'))) {
      parts.push(`Bank: XXXX${detailPaymentData.bank_account_last4}`);
    }
    return parts.length > 0 ? parts.join(', ') : getPaymentInfo(customer);
  };

  return (
    <div
      className="rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 shadow-lg p-4 max-w-2xl"
      style={{ position: 'fixed', left: position.x, top: position.y, zIndex: 9999 }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
        <div>
          <span className="text-xs text-gray-500 dark:text-gray-400 uppercase">Contact</span>
          <p className="font-medium text-gray-900 dark:text-white">{customer.name || customer.contactName || 'N/A'}</p>
        </div>
        {customer.company && (
          <div>
            <span className="text-xs text-gray-500 dark:text-gray-400 uppercase">Company</span>
            <p className="text-gray-900 dark:text-white">{customer.company}</p>
          </div>
        )}
        {customer.email && (
          <div>
            <span className="text-xs text-gray-500 dark:text-gray-400 uppercase">Email</span>
            <p className="text-gray-900 dark:text-white">{customer.email}</p>
          </div>
        )}
        {customer.phone && (
          <div>
            <span className="text-xs text-gray-500 dark:text-gray-400 uppercase">Phone</span>
            <p className="text-gray-900 dark:text-white">{customer.phone}</p>
          </div>
        )}
        {(customer.locationName || customer.locationId) && (
          <div>
            <span className="text-xs text-gray-500 dark:text-gray-400 uppercase">Location</span>
            <p className="text-gray-900 dark:text-white">{customer.locationName || customer.locationId}</p>
          </div>
        )}
        <div>
          <span className="text-xs text-gray-500 dark:text-gray-400 uppercase">Payment</span>
          {loadingDetailPayment ? (
            <p className="flex items-center gap-1 text-gray-500"><Loader2 className="w-3 h-3 animate-spin" /> Loading...</p>
          ) : (
            <p className="text-gray-900 dark:text-white">{formatPaymentDisplay()}</p>
          )}
        </div>
        <div>
          <span className="text-xs text-gray-500 dark:text-gray-400 uppercase">Status</span>
          <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${customer.status === 'active' ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400' : 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400'}`}>
            {customer.status === 'active' ? 'Active' : 'Inactive'}
          </span>
        </div>
        {cid && (
          <div className="sm:col-span-2">
            <span className="text-xs text-gray-500 dark:text-gray-400 uppercase">Auto Invoice</span>
            <div className="mt-1 flex gap-2">
              {entry ? (
                <>
                  <span className="inline-flex items-center px-2 py-1 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs font-medium">
                    On list ({entry.frequency})
                  </span>
                  <button type="button" onClick={() => onRemoveFromAutoInvoice(cid)} className="inline-flex items-center gap-1 px-2 py-1 rounded text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 text-xs font-medium">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </>
              ) : (
                <>
                  <button type="button" onClick={() => onAddToAutoInvoice(customer, 'weekly')} disabled={!!adding} className="inline-flex items-center gap-1 px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 text-xs font-medium disabled:opacity-50">
                    {adding ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />} Add (Weekly)
                  </button>
                  <button type="button" onClick={() => onAddToAutoInvoice(customer, 'monthly')} disabled={!!adding} className="inline-flex items-center gap-1 px-2 py-1 rounded bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-500 text-xs font-medium disabled:opacity-50">
                    {adding ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />} Add (Monthly)
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface CustomersProps {
  customers: Customer[];
  isLoading?: boolean;
}

export function Customers({ customers, isLoading = false }: CustomersProps) {
  const { showToast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [popoverPosition, setPopoverPosition] = useState<{ x: number; y: number } | null>(null);
  const [detailPaymentData, setDetailPaymentData] = useState<{
    paymentProfiles?: Array<{ type: string; last4?: string; cardNumber?: string; accountNumber?: string }>;
    zohoCards?: Array<{ last_four_digits?: string; last4?: string; card_type?: string }>;
    bank_account_last4?: string | null;
  } | null>(null);
  const [loadingDetailPayment, setLoadingDetailPayment] = useState(false);
  const [autoInvoiceList, setAutoInvoiceList] = useState<AutoInvoiceEntry[]>([]);
  const [loadingAutoInvoice, setLoadingAutoInvoice] = useState(false);
  const [addingCustomerId, setAddingCustomerId] = useState<number | null>(null);

  const loadAutoInvoiceList = useCallback(async () => {
    setLoadingAutoInvoice(true);
    try {
      const res = await customersAPI.getAutoInvoiceList();
      if (res.success && res.data?.autoInvoiceCustomers) {
        setAutoInvoiceList(res.data.autoInvoiceCustomers);
      }
    } catch {
      showToast('Failed to load auto invoice list', 'error', 3000);
    } finally {
      setLoadingAutoInvoice(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadAutoInvoiceList();
  }, [loadAutoInvoiceList]);

  useEffect(() => {
    const cid = selectedCustomer?.id ?? (selectedCustomer as any)?.customerId;
    if (!cid) {
      setDetailPaymentData(null);
      return;
    }
    setLoadingDetailPayment(true);
    setDetailPaymentData(null);
    customersAPI.getPaymentProfiles(cid)
      .then((res) => {
        if (res.success && res.data) {
          const d = res.data as any;
          const isArray = Array.isArray(d);
          setDetailPaymentData({
            paymentProfiles: isArray ? d : d.paymentProfiles,
            zohoCards: isArray ? undefined : d.zohoCards,
            bank_account_last4: isArray ? undefined : d.bank_account_last4
          });
        }
      })
      .catch(() => setDetailPaymentData(null))
      .finally(() => setLoadingDetailPayment(false));
  }, [selectedCustomer?.id, (selectedCustomer as any)?.customerId]);

  const isInAutoInvoiceList = (customerId: number) =>
    autoInvoiceList.some((e) => e.customerId === customerId);

  const getAutoInvoiceEntry = (customerId: number) =>
    autoInvoiceList.find((e) => e.customerId === customerId);

  const weeklyList = useMemo(() => autoInvoiceList.filter((e) => e.frequency === 'weekly'), [autoInvoiceList]);
  const monthlyList = useMemo(() => autoInvoiceList.filter((e) => e.frequency === 'monthly'), [autoInvoiceList]);

  const handleAddToAutoInvoice = async (customer: Customer, frequency: 'weekly' | 'monthly' = 'weekly') => {
    const id = customer.id ?? (customer as any).customerId;
    if (!id) return;
    setAddingCustomerId(id);
    try {
      const res = await customersAPI.addToAutoInvoice(id, frequency);
      if (res.success) {
        showToast('Customer added to auto invoice list', 'success', 3000);
        await loadAutoInvoiceList();
      } else {
        showToast(res.message || 'Failed to add', 'error', 3000);
      }
    } catch {
      showToast('Failed to add customer to auto invoice list', 'error', 3000);
    } finally {
      setAddingCustomerId(null);
    }
  };

  const handleRemoveFromAutoInvoice = async (customerId: number) => {
    try {
      const res = await customersAPI.removeFromAutoInvoice(customerId);
      if (res.success) {
        showToast('Customer removed from auto invoice list', 'success', 3000);
        await loadAutoInvoiceList();
      } else {
        showToast(res.message || 'Failed to remove', 'error', 3000);
      }
    } catch {
      showToast('Failed to remove customer from auto invoice list', 'error', 3000);
    }
  };

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

  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const positionRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const handleRowHoverEnter = (customer: Customer, e: React.MouseEvent) => {
    positionRef.current = { x: e.clientX, y: e.clientY };
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
    if (showTimeoutRef.current) clearTimeout(showTimeoutRef.current);
    showTimeoutRef.current = setTimeout(() => {
      setSelectedCustomer(customer);
      setPopoverPosition({ ...positionRef.current });
    }, 200);
  };

  const handleRowHoverLeave = () => {
    if (showTimeoutRef.current) {
      clearTimeout(showTimeoutRef.current);
      showTimeoutRef.current = null;
    }
    if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    hideTimeoutRef.current = setTimeout(() => {
      setSelectedCustomer(null);
      setPopoverPosition(null);
    }, 150);
  };

  const handleDetailHoverEnter = () => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
  };

  const handleDetailHoverLeave = () => {
    if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    hideTimeoutRef.current = setTimeout(() => {
      setSelectedCustomer(null);
      setDetailPaymentData(null);
      setPopoverPosition(null);
    }, 150);
  };

  const parseZohoCards = (customer: Customer): Array<{ card_type?: string; last_four_digits?: string; last4?: string }> => {
    const raw = (customer as any).zohoCards;
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  const getPaymentInfo = (customer: Customer) => {
    const paymentMethods = [];
    const bankLast4 = customer.bankAccountLast4 || customer.paymentInfo?.bankAccountLast4;

    const zohoCards = parseZohoCards(customer);
    if (zohoCards.length > 0) {
      zohoCards.forEach((c) => {
        const brand = c.card_type || (c as any).brand || 'Card';
        const last4 = c.last_four_digits || c.last4;
        if (last4) paymentMethods.push(`${brand} •••• ${last4}`);
      });
    }

    if (paymentMethods.length === 0) {
      const cardBrand = customer.cardBrand || customer.paymentInfo?.cardBrand;
      const last4 = customer.last_four_digits || customer.paymentInfo?.last4;
      const hasCard = !!(cardBrand && last4) || customer.paymentInfo?.hasCard;
      if (hasCard && cardBrand && last4) {
        paymentMethods.push(`${cardBrand} •••• ${last4}`);
      } else if (customer.last_four_digits || customer.paymentInfo?.hasCard) {
        paymentMethods.push(`Card: •••• ${last4 || customer.last_four_digits || 'saved'}`);
      }
    }

    if (bankLast4) {
      paymentMethods.push(`Bank: XXXX${bankLast4}`);
    }

    if (paymentMethods.length === 0) return 'None';
    return paymentMethods.join(', ');
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-8">
      {/* Two-column layout: Customer List (left) | Auto Invoice (right) */}
      <div className="px-8 mt-8 flex gap-6">
        {/* Left: Customer List */}
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-2 shadow-sm mb-4">
            <div className="flex items-center justify-center gap-2 px-4 py-2">
              <List className="w-4 h-4 text-blue-600 dark:text-blue-500" />
              <span className="text-sm font-semibold text-gray-900 dark:text-white">Customer List</span>
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 shadow-sm mb-4">
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
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm overflow-hidden flex-1 min-h-[400px]">
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
                      Payment Info
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider w-24">
                      Auto Invoice
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {filteredCustomers.map((customer) => {
                    const custId = customer.id ?? (customer as any).customerId;
                    const inList = custId ? isInAutoInvoiceList(custId) : false;
                    const adding = custId && addingCustomerId === custId;
                    const isHovered = selectedCustomer?.id === customer.id || (selectedCustomer as any)?.customerId === custId;
                    return (
                    <React.Fragment key={customer.id}>
                    <tr
                      onMouseEnter={(e) => handleRowHoverEnter(customer, e)}
                      onMouseLeave={handleRowHoverLeave}
                      className={`transition-colors ${isHovered ? 'bg-purple-50 dark:bg-gray-700' : 'hover:bg-purple-50 dark:hover:bg-gray-700'}`}
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="font-medium text-gray-900 dark:text-white">
                          {customer.name || 'N/A'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-gray-700 dark:text-gray-300">
                        {getPaymentInfo(customer)}
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
                      <td className="px-6 py-4 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        {custId && (
                          inList ? (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs font-medium">
                              Added
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleAddToAutoInvoice(customer)}
                              disabled={adding}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-800/40 text-xs font-medium disabled:opacity-50"
                            >
                              {adding ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                              Add
                            </button>
                          )
                        )}
                      </td>
                    </tr>
                  </React.Fragment>
                  );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        </div>

        {/* Right: Auto Invoice Charge */}
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-2 shadow-sm mb-4">
            <div className="flex items-center justify-center gap-2 px-4 py-2">
              <CreditCard className="w-4 h-4 text-blue-600 dark:text-blue-500" />
              <span className="text-sm font-semibold text-gray-900 dark:text-white">Auto Invoice Charge (Weekly/Monthly)</span>
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm overflow-hidden flex-1 min-h-[400px]">
          <div className="p-6 space-y-6">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Add customers from the Customer List. These customers will be charged automatically on a weekly or monthly schedule.
            </p>
            {loadingAutoInvoice ? (
              <div className="flex flex-col items-center justify-center py-16">
                <Loader2 className="w-12 h-12 text-blue-600 animate-spin mb-4" />
                <p className="text-gray-500 dark:text-gray-400">Loading...</p>
              </div>
            ) : (
              <div className="flex gap-6">
                {/* Weekly - Left */}
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
                    <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400">Weekly</span>
                    ({weeklyList.length})
                  </h4>
                  {weeklyList.length === 0 ? (
                    <div className="py-8 text-center border border-dashed border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-500 dark:text-gray-400">
                      No weekly customers. Add from Customer List and select Weekly.
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-600">
                      <table className="w-full">
                        <thead>
                          <tr className="bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Contact</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase w-24">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                          {weeklyList.map((entry) => (
                            <tr key={entry.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                              <td className="px-4 py-3 font-medium text-gray-900 dark:text-white text-sm">
                                {entry.customer?.name || entry.customer?.contactName || 'N/A'}
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => handleAddToAutoInvoice({ id: entry.customerId } as Customer, 'monthly')}
                                    disabled={addingCustomerId === entry.customerId}
                                    title="Move to Monthly"
                                    className="p-1 text-gray-500 dark:text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 rounded hover:bg-purple-50 dark:hover:bg-purple-900/20"
                                  >
                                    <ArrowRight className="w-4 h-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveFromAutoInvoice(entry.customerId)}
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 text-xs font-medium"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Monthly - Right */}
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
                    <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-400">Monthly</span>
                    ({monthlyList.length})
                  </h4>
                  {monthlyList.length === 0 ? (
                    <div className="py-8 text-center border border-dashed border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-500 dark:text-gray-400">
                      No monthly customers. Add from Customer List and select Monthly.
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-600">
                      <table className="w-full">
                        <thead>
                          <tr className="bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Contact</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase w-24">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                          {monthlyList.map((entry) => (
                            <tr key={entry.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                              <td className="px-4 py-3 font-medium text-gray-900 dark:text-white text-sm">
                                {entry.customer?.name || entry.customer?.contactName || 'N/A'}
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => handleAddToAutoInvoice({ id: entry.customerId } as Customer, 'weekly')}
                                    disabled={addingCustomerId === entry.customerId}
                                    title="Move to Weekly"
                                    className="p-1 text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20"
                                  >
                                    <ArrowLeft className="w-4 h-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveFromAutoInvoice(entry.customerId)}
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 text-xs font-medium"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
        </div>
      </div>

      {/* Floating customer detail popover - positioned at cursor */}
      {selectedCustomer && popoverPosition && (
        <CustomerDetailPopover
          customer={selectedCustomer}
          detailPaymentData={detailPaymentData}
          loadingDetailPayment={loadingDetailPayment}
          getPaymentInfo={getPaymentInfo}
          getAutoInvoiceEntry={getAutoInvoiceEntry}
          addingCustomerId={addingCustomerId}
          onAddToAutoInvoice={handleAddToAutoInvoice}
          onRemoveFromAutoInvoice={handleRemoveFromAutoInvoice}
          position={popoverPosition}
          onMouseEnter={handleDetailHoverEnter}
          onMouseLeave={handleDetailHoverLeave}
        />
      )}
    </div>
  );
}