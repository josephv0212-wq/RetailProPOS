// API Service for RetailPro POS
// Based on API_DOCUMENTATION.md

import { logger } from '../utils/logger';

const getEnvVar = (key: string): string | undefined => {
  try {
    return (import.meta as any).env?.[key];
  } catch {
    return undefined;
  }
};

const API_BASE_URL = getEnvVar('VITE_API_BASE_URL') || 'http://localhost:3000';

// Request cache for GET requests (5 seconds)
const requestCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_DURATION = 5000; // 5 seconds

interface ApiResponse<T = any> {
  success: boolean;
  message?: string;
  data?: T;
  error?: string;
  pending?: boolean; // For terminal payments
}

// Helper function to get token from storage (checks both localStorage and sessionStorage)
const getToken = (): string | null => {
  return localStorage.getItem('token') || sessionStorage.getItem('token');
};

// Helper function to set token in storage (localStorage for persistent, sessionStorage for session-only)
const setToken = (token: string, rememberDevice: boolean = true): void => {
  // Clear token from both storages first to avoid conflicts
  localStorage.removeItem('token');
  sessionStorage.removeItem('token');
  
  // Store in appropriate storage based on rememberDevice flag
  if (rememberDevice) {
    localStorage.setItem('token', token);
  } else {
    sessionStorage.setItem('token', token);
  }
};

// Helper function to remove token from both storages
const removeToken = (): void => {
  localStorage.removeItem('token');
  sessionStorage.removeItem('token');
};

// Helper function to handle 401 errors
const handleUnauthorized = (): void => {
  removeToken();
  // Redirect to login - you may want to use a router here
  if (window.location.pathname !== '/signin') {
    window.location.href = '/signin';
  }
};

// Main API request function
async function apiRequest<T = any>(
  endpoint: string,
  options: RequestInit = {},
  noCache: boolean = false
): Promise<ApiResponse<T>> {
  const url = `${API_BASE_URL}${endpoint}`;
  const cacheKey = `${options.method || 'GET'}:${url}`;

  // Check cache for GET requests
  if (!noCache && (options.method === 'GET' || !options.method)) {
    const cached = requestCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return cached.data;
    }
  }

  // Get token and add to headers
  const token = getToken();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });

    // Handle 401 Unauthorized
    if (response.status === 401) {
      handleUnauthorized();
      throw new Error('Unauthorized');
    }

    // Handle printer test 500 errors gracefully (printer may not be configured)
    const isPrinterTest = endpoint.includes('/printer/test');
    if (isPrinterTest && response.status === 500) {
      // Silently return failure response for printer tests - expected when printer isn't configured
      return { 
        success: false, 
        message: 'Printer not available', 
        error: 'Printer test failed' 
      } as ApiResponse<T>;
    }

    const data: ApiResponse<T> = await response.json();

    // Cache successful GET requests
    if (!noCache && (options.method === 'GET' || !options.method) && data.success) {
      requestCache.set(cacheKey, { data, timestamp: Date.now() });
    }

    return data;
  } catch (error: any) {
    // Don't log errors for printer tests as they're expected when printer isn't configured
    const isPrinterTest = endpoint.includes('/printer/test');
    
    if (isPrinterTest) {
      // Silently handle printer test failures - return a failure response instead of throwing
      return { 
        success: false, 
        message: 'Printer not available', 
        error: 'Printer test failed' 
      } as ApiResponse<T>;
    }
    
    logger.error('API request failed', error);
    throw error;
  }
}

// Authentication API
export const authAPI = {
  login: async (useremail: string, password: string, rememberDevice: boolean = true) => {
    const response = await apiRequest<{ token: string; user: any }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ useremail, password }),
    }, true);

    if (response.success && response.data?.token) {
      setToken(response.data.token, rememberDevice);
    }

    return response;
  },

  register: async (data: {
    useremail: string;
    password: string;
    role: string;
    locationId: string;
    locationName: string;
    taxPercentage: number;
    zohoTaxId?: string | null;
  }) => {
    return apiRequest('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    }, true);
  },

  getCurrentUser: async () => {
    return apiRequest<{ user: any }>('/auth/me');
  },

  updateMyProfile: async (data: {
    name?: string;
    password?: string;
    locationId?: string;
    locationName?: string;
  }) => {
    return apiRequest<{ user: any }>('/auth/me/profile', {
      method: 'PATCH',
      body: JSON.stringify(data),
    }, true);
  },

  updateTerminalSettings: async (terminalNumber?: string | null, terminalIP?: string | null, terminalPort?: number | string | null, cardReaderMode?: 'integrated' | 'standalone') => {
    return apiRequest<{ user: any }>('/auth/me/terminal', {
      method: 'PATCH',
      body: JSON.stringify({ 
        terminalNumber: terminalNumber?.trim() || null,
        terminalIP: terminalIP?.trim() || null,
        terminalPort: terminalPort?.toString().trim() || null,
        cardReaderMode: cardReaderMode || null
      }),
    }, true);
  },

  getPendingUsers: async () => {
    return apiRequest<{ users: any[] }>('/auth/users/pending');
  },

  getAllUsers: async () => {
    return apiRequest<{ users: any[] }>('/auth/users');
  },

  createUser: async (data: {
    useremail: string;
    password: string;
    role: string;
    locationId: string;
    locationName: string;
    taxPercentage: number;
    zohoTaxId?: string | null;
  }) => {
    return apiRequest('/auth/users', {
      method: 'POST',
      body: JSON.stringify(data),
    }, true);
  },

  updateUser: async (id: number, data: {
    role?: string;
    isActive?: boolean;
    locationId?: string;
    locationName?: string;
    taxPercentage?: number;
    zohoTaxId?: string | null;
  }) => {
    return apiRequest(`/auth/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }, true);
  },

  approveUser: async (id: number) => {
    return apiRequest(`/auth/users/${id}/approve`, {
      method: 'PATCH',
    }, true);
  },

  rejectUser: async (id: number) => {
    return apiRequest(`/auth/users/${id}/reject`, {
      method: 'PATCH',
    }, true);
  },

  logout: () => {
    removeToken();
  },
};

// Items API
export const itemsAPI = {
  getAll: async (params?: { search?: string; isActive?: boolean }) => {
    const queryParams = new URLSearchParams();
    if (params?.search) queryParams.append('search', params.search);
    if (params?.isActive !== undefined) queryParams.append('isActive', String(params.isActive));
    
    const query = queryParams.toString();
    return apiRequest<{ items: any[] }>(`/items${query ? `?${query}` : ''}`);
  },

  getById: async (id: number) => {
    return apiRequest<{ item: any }>(`/items/${id}`);
  },

  getFromPricebook: async (pricebookName: string) => {
    return apiRequest<{ items: any[]; pricebookName: string; count: number; pricebookItemsCount: number }>(
      `/items/pricebook?pricebookName=${encodeURIComponent(pricebookName)}`
    );
  },

  updateImage: async (id: number, imageData: string | null) => {
    return apiRequest(`/items/${id}/image`, {
      method: 'POST',
      body: JSON.stringify({ imageData }),
    }, true);
  },

  syncFromZoho: async () => {
    return apiRequest<{
      items: any[];
      syncStats: {
        total: number;
        created: number;
        updated: number;
        active: number;
      };
    }>('/items/sync', {
      method: 'POST',
    }, true);
  },
};

// Customers API
export const customersAPI = {
  getAll: async (params?: { search?: string; isActive?: boolean }) => {
    const queryParams = new URLSearchParams();
    if (params?.search) queryParams.append('search', params.search);
    if (params?.isActive !== undefined) queryParams.append('isActive', String(params.isActive));
    
    const query = queryParams.toString();
    return apiRequest<{ customers: any[] }>(`/customers${query ? `?${query}` : ''}`);
  },

  getById: async (id: number) => {
    return apiRequest<{ customer: any }>(`/customers/${id}`);
  },

  getByLocation: async (locationId: string) => {
    return apiRequest<{ customers: any[] }>(`/customers/location/${locationId}`);
  },

  getPriceList: async (id: number) => {
    return apiRequest<{
      pricebook_name: string;
      tax_preference: string;
      cards: any[];
      last_four_digits: string;
      card_type: string;
      has_card_info: boolean;
      card_info_checked: boolean;
      bank_account_last4: string | null;
    }>(`/customers/${id}/price-list`);
  },

  getPaymentProfiles: async (id: number) => {
    return apiRequest<{
      customerProfileId: string | null;
      paymentProfiles: Array<{
        paymentProfileId: string;
        type: 'credit_card' | 'ach';
        cardNumber?: string;
        expirationDate?: string;
        accountNumber?: string;
        isDefault?: boolean;
        isStored?: boolean;
      }>;
      message?: string;
    }>(`/customers/${id}/payment-profiles`);
  },
};

// Sales API
export const salesAPI = {
  getTransactions: async (params?: { startDate?: string; endDate?: string; syncedToZoho?: string }) => {
    const queryParams = new URLSearchParams();
    if (params?.startDate) queryParams.append('startDate', params.startDate);
    if (params?.endDate) queryParams.append('endDate', params.endDate);
    if (params?.syncedToZoho !== undefined) queryParams.append('syncedToZoho', params.syncedToZoho);
    
    const query = queryParams.toString();
    return apiRequest<{ transactions: any[] }>(`/sales/transactions${query ? `?${query}` : ''}`, {
      method: 'GET',
    }, true);
  },
  create: async (data: {
    items: Array<{ itemId: number; quantity: number }>;
    customerId?: number;
    paymentType: 'cash' | 'credit_card' | 'debit_card' | 'zelle' | 'ach';
    paymentDetails: any;
    notes?: string;
    customerTaxPreference?: 'STANDARD' | 'SALES TAX EXCEPTION CERTIFICATE';
  }) => {
    return apiRequest<{
      sale: any;
      payment: any;
      printResult: any;
      zoho: any;
    }>('/sales', {
      method: 'POST',
      body: JSON.stringify(data),
    }, true);
  },

  getAll: async (params?: {
    locationId?: string;
    startDate?: string;
    endDate?: string;
    syncedToZoho?: boolean;
  }, noCache: boolean = false) => {
    const queryParams = new URLSearchParams();
    if (params?.locationId) queryParams.append('locationId', params.locationId);
    if (params?.startDate) queryParams.append('startDate', params.startDate);
    if (params?.endDate) queryParams.append('endDate', params.endDate);
    if (params?.syncedToZoho !== undefined) queryParams.append('syncedToZoho', String(params.syncedToZoho));
    
    const query = queryParams.toString();
    return apiRequest<{ sales: any[] }>(`/sales${query ? `?${query}` : ''}`, {}, noCache);
  },

  getById: async (id: number) => {
    return apiRequest<{ sale: any }>(`/sales/${id}`);
  },

  getSyncStatus: async (limit: number = 10) => {
    return apiRequest<{
      sales: any[];
      summary: {
        total: number;
        synced: number;
        failed: number;
        noCustomer: number;
        noZohoId: number;
      };
    }>(`/sales/sync/status?limit=${limit}`);
  },

  retryZohoSync: async (saleId: number) => {
    return apiRequest<{
      salesReceiptId: string;
      salesReceiptNumber: string;
    }>(`/sales/${saleId}/sync/zoho`, {
      method: 'POST',
    }, true);
  },

  cancelZohoTransaction: async (saleId: number) => {
    return apiRequest<{
      sale: {
        id: number;
        zohoSalesReceiptId: string;
        cancelledInZoho: boolean;
      };
      zoho: any;
    }>(`/sales/${saleId}/cancel-zoho`, {
      method: 'POST',
    }, true);
  },

  chargeInvoicesSalesOrders: async (data: {
    customerId: number;
    paymentProfileId: string;
    paymentType?: 'credit_card' | 'debit_card';
    items: Array<{
      type: 'invoice' | 'salesorder';
      id: string;
      number: string;
      amount: number;
    }>;
  }) => {
    return apiRequest<{
      customer: {
        id: number;
        name: string;
        customerProfileId: string;
        customerPaymentProfileId: string;
      };
      results: Array<{
        type: string;
        id: string;
        number: string;
        amount: number;
        transactionId: string;
        authCode: string;
        message: string;
        success: boolean;
        underReview?: boolean;
        reviewStatus?: string | null;
        zohoPaymentRecorded?: boolean;
        zohoPaymentError?: string;
      }>;
      errors: Array<{
        item: { type: string; id: string; number: string };
        error: string;
        errorCode?: string;
      }>;
      summary: {
        total: number;
        successful: number;
        failed: number;
      };
    }>('/sales/charge-invoices', {
      method: 'POST',
      body: JSON.stringify(data),
    }, true);
  },
};

// Zoho API
export const zohoAPI = {
  syncAll: async () => {
    return apiRequest<{
      customers: { total: number; created: number; updated: number };
      items: { total: number; created: number; updated: number };
    }>('/zoho/sync/all', {
      method: 'POST',
    }, true);
  },

  syncCustomers: async () => {
    return apiRequest<{
      stats: { total: number; created: number; updated: number };
    }>('/zoho/sync/customers', {
      method: 'POST',
    }, true);
  },

  syncItems: async () => {
    return apiRequest<{
      stats: { total: number; created: number; updated: number };
    }>('/zoho/sync/items', {
      method: 'POST',
    }, true);
  },

  getTaxRates: async () => {
    return apiRequest<{ taxes: any[] }>('/zoho/taxes');
  },

  getLocations: async () => {
    return apiRequest<{ locations: any[] }>('/zoho/locations');
  },

  getOrganization: async () => {
    return apiRequest<{ organizations: any[] }>('/zoho/organization');
  },

  getCustomerOpenSalesOrders: async (customerId: string) => {
    return apiRequest<{ salesOrders: any[] }>(
      `/zoho/salesorders?customer_id=${encodeURIComponent(customerId)}`
    );
  },

  getSalesOrderDetails: async (salesorderId: string) => {
    return apiRequest<{ salesOrder: any }>(
      `/zoho/salesorders/${encodeURIComponent(salesorderId)}`
    );
  },

  getCustomerInvoices: async (customerId: string, status?: string) => {
    const statusParam = status ? `&status=${encodeURIComponent(status)}` : '';
    return apiRequest<{ invoices: any[] }>(
      `/zoho/invoices?customer_id=${encodeURIComponent(customerId)}${statusParam}`
    );
  },

  getInvoiceDetails: async (invoiceId: string) => {
    return apiRequest<{ invoice: any }>(
      `/zoho/invoices/${encodeURIComponent(invoiceId)}`
    );
  },

  organizeZohoSalesOrdersFuelSurcharge: async (data?: {
    filter_by?: string;
    sort_column?: string;
    sort_order?: string;
    search_text?: string;
    maxOrders?: number;
    dryRun?: boolean;
    fuelItemName?: string;
  }) => {
    return apiRequest<{ result: any }>(
      '/zoho/salesorders/organize-fuel-surcharge',
      {
        method: 'POST',
        body: JSON.stringify(data || {}),
      },
      true
    );
  },
};

// Payment Status API (for terminal payments)
export const paymentAPI = {
  getDevices: async () => {
    return apiRequest<{ devices: any[] }>('/payment/devices', {
      method: 'GET',
    }, true);
  },
  checkStatus: async (transactionId: string) => {
    return apiRequest<{
      success: boolean;
      pending: boolean;
      declined: boolean;
      data: any;
    }>(`/payment/status/${transactionId}`);
  },

  pollStatus: async (transactionId: string, maxAttempts: number = 60, intervalMs: number = 2000) => {
    return apiRequest<{
      success: boolean;
      pending: boolean;
      declined: boolean;
      data: any;
    }>(`/payment/poll/${transactionId}`, {
      method: 'POST',
      body: JSON.stringify({ maxAttempts, intervalMs }),
    }, true);
  },
};

// PAX Terminal API (kept for discovery and testing)
export const paxAPI = {
  discover: async () => {
    return apiRequest<{ terminals: Array<{ ip: string; port: number }> }>('/pax/discover', {
      method: 'POST',
    }, true);
  },

  test: async (terminalIP: string) => {
    return apiRequest('/pax/test', {
      method: 'POST',
      body: JSON.stringify({ terminalIP }),
    }, true);
  },

  getStatus: async (terminalIP: string) => {
    return apiRequest<{ success: boolean; status: string; ip: string }>(
      `/pax/status?terminalIP=${encodeURIComponent(terminalIP)}`
    );
  },
};

// Bluetooth Reader API
export const bluetoothAPI = {
  pairReader: async () => {
    return apiRequest<{ ready: boolean; instructions: string }>('/bbpos/pair', {
      method: 'POST',
    }, true);
  },

  generateTestData: async (data: {
    cardNumber: string;
    expDate: string;
    cvv: string;
    zip: string;
  }) => {
    return apiRequest<{
      opaqueData: { dataDescriptor: string; dataValue: string };
      deviceSessionId: string;
      instructions: any;
    }>('/bbpos/generate-test-data', {
      method: 'POST',
      body: JSON.stringify(data),
    }, true);
  },

  processPayment: async (data: {
    amount: number;
    opaqueData: { descriptor: string; value: string };
    deviceSessionId: string;
    invoiceNumber: string;
    description: string;
  }) => {
    return apiRequest<{
      success: boolean;
      transactionId: string;
      amount: number;
    }>('/bbpos/payment', {
      method: 'POST',
      body: JSON.stringify(data),
    }, true);
  },
};

// Printer API
export const printerAPI = {
  test: async () => {
    return apiRequest<{ success: boolean; message: string }>('/printer/test', {
      method: 'POST',
    }, true);
  },
};

// Units of Measure API
export const unitsAPI = {
  getAll: async () => {
    return apiRequest<{ units: any[] }>('/units');
  },

  getAllIncludingBasic: async () => {
    return apiRequest<{ units: any[] }>('/units/all');
  },

  create: async (data: {
    unitName: string;
    symbol: string;
    unitPrecision: number;
    basicUM?: string | null;
  }) => {
    return apiRequest<{ unit: any }>('/units', {
      method: 'POST',
      body: JSON.stringify(data),
    }, true);
  },

  update: async (id: number, data: {
    unitName: string;
    symbol: string;
    unitPrecision: number;
    basicUM?: string | null;
  }) => {
    return apiRequest<{ unit: any }>(`/units/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }, true);
  },

  delete: async (id: number) => {
    return apiRequest(`/units/${id}`, {
      method: 'DELETE',
    }, true);
  },
};

// Item Unit of Measure API
export const itemUnitsAPI = {
  getItemUnits: async (itemId: number) => {
    return apiRequest<{ units: any[] }>(`/items/${itemId}/units`);
  },

  addItemUnit: async (itemId: number, data: {
    unitOfMeasureId: number;
    isDefault?: boolean;
  }) => {
    return apiRequest(`/items/${itemId}/units`, {
      method: 'POST',
      body: JSON.stringify(data),
    }, true);
  },

  removeItemUnit: async (itemId: number, unitOfMeasureId: number) => {
    return apiRequest(`/items/${itemId}/units/${unitOfMeasureId}`, {
      method: 'DELETE',
    }, true);
  },

  setDefaultUnit: async (itemId: number, unitOfMeasureId: number) => {
    return apiRequest(`/items/${itemId}/units/${unitOfMeasureId}/default`, {
      method: 'PATCH',
    }, true);
  },
};

// Health Check
export const healthAPI = {
  check: async () => {
    return apiRequest<{
      status: string;
      database: string;
      timestamp: string;
    }>('/health');
  },
};

// Export all APIs
export default {
  auth: authAPI,
  items: itemsAPI,
  customers: customersAPI,
  sales: salesAPI,
  zoho: zohoAPI,
  pax: paxAPI,
  bluetooth: bluetoothAPI,
  printer: printerAPI,
  units: unitsAPI,
  itemUnits: itemUnitsAPI,
  health: healthAPI,
};

