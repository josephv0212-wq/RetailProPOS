// Valor Connect API Service for Frontend
// Handles cloud-to-connect payment processing with VP100 PAX terminals via Valor Connect API
// 
// IMPORTANT: This is a DIRECT integration with Valor Connect API - NO Authorize.Net required!
// Valor Connect API is a standalone payment gateway that communicates directly with VP100 terminals.
// Uses EPI (Equipment Profile Identifier) to target terminals.

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
  reqTxnId?: string; // Transaction reference ID from Valor Connect
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
 * Check EPI (Equipment Profile Identifier) status
 */
export const checkValorEPI = async (epi: string): Promise<ValorApiResponse> => {
  const token = getToken();
  if (!token) {
    return { success: false, error: 'Authentication token not found' };
  }

  if (!epi || epi.trim() === '') {
    return { success: false, error: 'EPI is required' };
  }

  try {
    const response = await fetch(`${API_BASE_URL}/valor/checkepi`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ epi: epi.trim() }),
    });

    const data = await response.json();
    return data;
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to check EPI status',
    };
  }
};

/**
 * Get list of registered terminals
 * Note: Valor Connect uses EPI to target terminals, not a device list
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
 * Initiate a payment request via Valor Connect API
 * @param amount - Payment amount
 * @param epi - Equipment Profile Identifier (required for Valor Connect)
 * @param invoiceNumber - Optional invoice number
 * @param description - Optional transaction description
 * @param terminalSerialNumber - Optional, for backward compatibility (will be used as EPI if epi not provided)
 */
export const initiateValorPayment = async (
  amount: number,
  epi: string,
  invoiceNumber?: string,
  description?: string,
  terminalSerialNumber?: string
): Promise<ValorApiResponse> => {
  const token = getToken();
  if (!token) {
    return { success: false, error: 'Authentication token not found' };
  }

  // Use EPI if provided, otherwise fall back to terminalSerialNumber for backward compatibility
  const epiValue = epi || terminalSerialNumber;
  
  if (!epiValue || epiValue.trim() === '') {
    return { success: false, error: 'EPI (Equipment Profile Identifier) is required' };
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
        epi: epiValue.trim(),
        // Include terminalSerialNumber for backward compatibility
        terminalSerialNumber: epiValue.trim(),
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
 * @param transactionId - Transaction ID (should be reqTxnId from payment response)
 * @param epi - Optional EPI for lookup
 * @param terminalSerialNumber - Optional, for backward compatibility
 */
export const checkValorPaymentStatus = async (
  transactionId: string,
  epi?: string,
  terminalSerialNumber?: string
): Promise<ValorApiResponse> => {
  const token = getToken();
  if (!token) {
    return { success: false, error: 'Authentication token not found' };
  }

  try {
    const url = new URL(`${API_BASE_URL}/valor/status/${transactionId}`);
    // Support both EPI and terminalSerialNumber for backward compatibility
    if (epi) {
      url.searchParams.append('epi', epi);
    } else if (terminalSerialNumber) {
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
 * @param transactionId - Transaction ID (should be reqTxnId from payment response)
 * @param epi - Optional EPI for lookup
 * @param terminalSerialNumber - Optional, for backward compatibility
 */
export const pollValorPaymentStatus = async (
  transactionId: string,
  epi?: string,
  terminalSerialNumber?: string,
  maxAttempts: number = 60,
  intervalMs: number = 2000,
  onStatusUpdate?: (status: ValorApiResponse, attempt: number) => void
): Promise<ValorApiResponse> => {
  let attempts = 0;

  while (attempts < maxAttempts) {
    attempts++;

    const status = await checkValorPaymentStatus(transactionId, epi, terminalSerialNumber);

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
 * Cancel a pending transaction via Valor Connect API
 * @param reqTxnId - Transaction reference ID (from payment response)
 * @param epi - Optional EPI
 * @param terminalSerialNumber - Optional, for backward compatibility
 */
export const cancelValorTransaction = async (
  reqTxnId: string,
  epi?: string,
  terminalSerialNumber?: string
): Promise<ValorApiResponse> => {
  const token = getToken();
  if (!token) {
    return { success: false, error: 'Authentication token not found' };
  }

  try {
    const response = await fetch(`${API_BASE_URL}/valor/cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        reqTxnId,
        epi: epi || terminalSerialNumber || null,
      }),
    });

    const data = await response.json();
    return data;
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to cancel transaction',
    };
  }
};

/**
 * Void a transaction (legacy function - uses cancel internally)
 * @param transactionId - Transaction ID
 * @param reqTxnId - Transaction reference ID (preferred)
 * @param epi - Optional EPI
 * @param terminalSerialNumber - Optional, for backward compatibility
 */
export const voidValorTransaction = async (
  transactionId: string,
  reqTxnId?: string,
  epi?: string,
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
        reqTxnId: reqTxnId || transactionId,
        epi: epi || terminalSerialNumber || null,
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
