// Valor API Service for Frontend
// Handles cloud-to-connect payment processing with VP100 PAX terminals via Valor API
// 
// IMPORTANT: This is a DIRECT integration with Valor API - NO Authorize.Net required!
// Valor API is a standalone payment gateway that communicates directly with VP100 terminals.

const getEnvVar = (key: string): string | undefined => {
  try {
    return (import.meta as any).env?.[key];
  } catch {
    return undefined;
  }
};

const API_BASE_URL = getEnvVar('VITE_API_BASE_URL') || 'http://localhost:3000';

// Helper function to get token from storage
const getToken = (): string | null => {
  return localStorage.getItem('token') || sessionStorage.getItem('token');
};

interface ValorApiResponse<T = any> {
  success: boolean;
  message?: string;
  data?: T;
  error?: string;
  pending?: boolean;
  transactionId?: string;
  status?: string;
}

/**
 * Authenticate with Valor API
 */
export const authenticateValorApi = async (): Promise<ValorApiResponse> => {
  const token = getToken();
  if (!token) {
    return { success: false, error: 'Authentication token not found' };
  }

  try {
    const response = await fetch(`${API_BASE_URL}/valor/auth`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    });

    const data = await response.json();
    return data;
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to authenticate with Valor API',
    };
  }
};

/**
 * Get list of registered terminals
 */
export const getValorDevices = async (): Promise<ValorApiResponse> => {
  const token = getToken();
  if (!token) {
    return { success: false, error: 'Authentication token not found' };
  }

  try {
    const response = await fetch(`${API_BASE_URL}/valor/devices`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    const data = await response.json();
    return data;
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to fetch Valor devices',
    };
  }
};

/**
 * Initiate a payment request via Valor API
 */
export const initiateValorPayment = async (
  amount: number,
  terminalSerialNumber: string,
  invoiceNumber?: string,
  description?: string
): Promise<ValorApiResponse> => {
  const token = getToken();
  if (!token) {
    return { success: false, error: 'Authentication token not found' };
  }

  if (!terminalSerialNumber || terminalSerialNumber.trim() === '') {
    return { success: false, error: 'Terminal serial number is required' };
  }

  try {
    const response = await fetch(`${API_BASE_URL}/valor/payment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        amount: amount.toFixed(2),
        terminalSerialNumber: terminalSerialNumber.trim(),
        invoiceNumber: invoiceNumber || `POS-${Date.now()}`,
        description: description || 'POS Sale - Terminal Payment',
      }),
    });

    const data = await response.json();
    return data;
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to initiate Valor payment',
    };
  }
};

/**
 * Check payment status
 */
export const checkValorPaymentStatus = async (
  transactionId: string,
  terminalSerialNumber?: string
): Promise<ValorApiResponse> => {
  const token = getToken();
  if (!token) {
    return { success: false, error: 'Authentication token not found' };
  }

  try {
    const url = new URL(`${API_BASE_URL}/valor/status/${transactionId}`);
    if (terminalSerialNumber) {
      url.searchParams.append('terminalSerialNumber', terminalSerialNumber);
    }

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    const data = await response.json();
    return data;
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to check payment status',
    };
  }
};

/**
 * Poll payment status until completion
 */
export const pollValorPaymentStatus = async (
  transactionId: string,
  terminalSerialNumber?: string,
  maxAttempts: number = 60,
  intervalMs: number = 2000,
  onStatusUpdate?: (status: ValorApiResponse, attempt: number) => void
): Promise<ValorApiResponse> => {
  let attempts = 0;

  while (attempts < maxAttempts) {
    attempts++;

    const status = await checkValorPaymentStatus(transactionId, terminalSerialNumber);

    // Call status update callback if provided
    if (onStatusUpdate) {
      onStatusUpdate(status, attempts);
    }

    // If payment is completed (approved or declined), return result
    if (status.data && !status.data.pending) {
      return status;
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  // Timeout - return pending status
  return {
    success: false,
    pending: true,
    error: 'Payment status check timeout. Please check terminal or transaction manually.',
    transactionId: transactionId,
  };
};

/**
 * Void a transaction
 */
export const voidValorTransaction = async (
  transactionId: string,
  terminalSerialNumber?: string
): Promise<ValorApiResponse> => {
  const token = getToken();
  if (!token) {
    return { success: false, error: 'Authentication token not found' };
  }

  try {
    const response = await fetch(`${API_BASE_URL}/valor/void`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        transactionId,
        terminalSerialNumber: terminalSerialNumber || null,
      }),
    });

    const data = await response.json();
    return data;
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to void transaction',
    };
  }
};
