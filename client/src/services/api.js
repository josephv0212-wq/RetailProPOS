import axios from 'axios';

// Use environment variable for API base URL, fallback to /api for proxy
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

// Request cache for deduplication
const requestCache = new Map();
const CACHE_DURATION = 5000; // 5 seconds

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  },
});

// Request interceptor for caching GET requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  
  // Cache GET requests for deduplication
  if (config.method === 'get' && !config.params?.noCache) {
    const cacheKey = `${config.method}:${config.url}:${JSON.stringify(config.params)}`;
    const cached = requestCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return Promise.reject({
        __cached: true,
        data: cached.data
      });
    }
  }
  
  return config;
});

api.interceptors.response.use(
  (response) => {
    // Cache GET responses
    if (response.config.method === 'get' && !response.config.params?.noCache) {
      const cacheKey = `${response.config.method}:${response.config.url}:${JSON.stringify(response.config.params)}`;
      requestCache.set(cacheKey, {
        data: response.data,
        timestamp: Date.now()
      });
    }
    
    // Backend returns standardized format: { success, message, data }
    // Ensure response has the expected structure
    if (response.data && typeof response.data === 'object') {
      return response;
    }
    return response;
  },
  (error) => {
    // Handle cached responses
    if (error.__cached) {
      return Promise.resolve({ data: error.data });
    }
    
    // Extract error message from new backend format
    const errorMessage = error.response?.data?.message || 
                        error.response?.data?.error || 
                        error.message || 
                        'An error occurred';
    
    // Attach formatted error message for easier access
    error.formattedMessage = errorMessage;
    
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/';
    }
    
    return Promise.reject(error);
  }
);

// Clean up old cache entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of requestCache.entries()) {
    if (now - value.timestamp > CACHE_DURATION) {
      requestCache.delete(key);
    }
  }
}, CACHE_DURATION);

export const authAPI = {
  login: (credentials) => api.post('/auth/login', credentials),
  register: (userData) => api.post('/auth/register', userData),
  getCurrentUser: () => api.get('/auth/me'),
  getPendingUsers: () => api.get('/auth/users/pending'),
  getAllUsers: () => api.get('/auth/users'),
  updateUser: (id, data) => api.patch(`/auth/users/${id}`, data),
  approveUser: (id) => api.patch(`/auth/users/${id}/approve`),
  rejectUser: (id) => api.patch(`/auth/users/${id}/reject`),
};

export const itemsAPI = {
  getAll: (params) => api.get('/items', { params }),
  getById: (id) => api.get(`/items/${id}`),
  getFromPricebook: (pricebookName) => api.get('/items/pricebook', { params: { pricebookName } }),
  updateImage: (id, imageData) => api.post(`/items/${id}/image`, { imageData }),
};

export const customersAPI = {
  getAll: (params) => api.get('/customers', { params }),
  getById: (id) => api.get(`/customers/${id}`),
  getByLocation: (locationId) => api.get(`/customers/location/${locationId}`),
  getPriceList: (id) => api.get(`/customers/${id}/price-list`),
};

export const salesAPI = {
  create: (saleData) => api.post('/sales', saleData),
  getAll: (params) => api.get('/sales', { params }),
  getById: (id) => api.get(`/sales/${id}`),
  getSyncStatus: (limit) => api.get('/sales/sync/status', { params: { limit } }),
  retryZohoSync: (saleId) => api.post(`/sales/${saleId}/sync/zoho`),
};

export const zohoAPI = {
  syncAll: () => api.post('/zoho/sync/all'),
  syncCustomers: () => api.post('/zoho/sync/customers'),
  syncItems: () => api.post('/zoho/sync/items'),
  getTaxRates: () => api.get('/zoho/taxes'),
};

export const paxAPI = {
  discover: () => api.post('/pax/discover'),
  test: (terminalIP) => api.post('/pax/test', { terminalIP }),
  getStatus: (terminalIP) => api.get('/pax/status', { params: { terminalIP } }),
  processPayment: (paymentData) => api.post('/pax/payment', paymentData),
  voidTransaction: (transactionId, terminalIP) => api.post('/pax/void', { transactionId, terminalIP }),
};

export const bluetoothAPI = {
  pairReader: () => api.post('/bbpos/pair'),
  processPayment: (paymentData) => api.post('/bbpos/payment', paymentData),
  generateTestData: (cardData) => api.post('/bbpos/generate-test-data', cardData),
};

export const printerAPI = {
  test: () => api.post('/printer/test'),
  // Note: Receipt printing is handled automatically during sale creation
  // Manual reprint endpoint can be added to backend if needed
};

export default api;
