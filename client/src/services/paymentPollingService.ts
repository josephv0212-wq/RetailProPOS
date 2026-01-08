/**
 * Payment Polling Service
 * Polls Authorize.Net for terminal payment status
 */

import { paymentAPI } from './api';

export interface PaymentStatus {
  success: boolean;
  pending: boolean;
  declined: boolean;
  transactionId?: string;
  status?: string;
  amount?: number;
  authCode?: string;
  message?: string;
  error?: string;
}

export interface PollingOptions {
  maxAttempts?: number; // Maximum polling attempts (default: 60)
  intervalMs?: number; // Polling interval in milliseconds (default: 2000)
  onStatusUpdate?: (status: PaymentStatus, attempt: number) => void; // Callback for status updates
}

/**
 * Poll payment status until completion or timeout
 */
export const pollPaymentStatus = async (
  transactionId: string,
  options: PollingOptions = {}
): Promise<PaymentStatus> => {
  const {
    maxAttempts = 60, // 60 attempts * 2 seconds = 2 minutes max
    intervalMs = 2000, // Poll every 2 seconds
    onStatusUpdate
  } = options;

  let attempts = 0;

  while (attempts < maxAttempts) {
    attempts++;

    try {
      const response = await paymentAPI.checkStatus(transactionId);

      if (response.success && response.data) {
        const status: PaymentStatus = {
          success: response.data.success || false,
          pending: response.data.pending || false,
          declined: response.data.declined || false,
          transactionId: response.data.transactionId,
          status: response.data.status,
          amount: response.data.amount,
          authCode: response.data.authCode,
          message: response.data.message,
          error: response.data.error
        };

        // Call status update callback if provided
        if (onStatusUpdate) {
          onStatusUpdate(status, attempts);
        }

        // If payment is completed (approved or declined), return result
        if (!status.pending) {
          return status;
        }
      }
    } catch (error: any) {
      console.error('Payment status check error:', error);
      // Continue polling on error (might be temporary network issue)
    }

    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }

  // Timeout - return pending status
  return {
    success: false,
    pending: true,
    declined: false,
    transactionId: transactionId,
    error: 'Payment status check timeout. Please check terminal or transaction manually.'
  };
};
