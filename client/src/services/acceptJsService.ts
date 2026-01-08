/**
 * Authorize.Net Accept.js Service
 * Handles card data encryption using Accept.js
 * 
 * Note: Accept.js requires HTTPS in production (except localhost)
 * Accept.js library is loaded from CDN in index.html
 */

// Accept.js types
declare global {
  interface Window {
    Accept: {
      dispatchData: (data: any, callback: (response: AcceptJsResponse) => void) => void;
    };
  }
}

export interface AcceptJsResponse {
  opaqueData: {
    dataDescriptor: string;
    dataValue: string;
  };
  messages?: {
    resultCode: string;
    message: Array<{
      code: string;
      text: string;
    }>;
  };
}

/**
 * Load Accept.js library
 */
export const loadAcceptJs = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    // Check if already loaded
    if (window.Accept) {
      resolve();
      return;
    }

    // Check if script already exists
    const existingScript = document.querySelector('script[src*="Accept.js"]');
    if (existingScript) {
      // Wait for Accept to be available
      const checkInterval = setInterval(() => {
        if (window.Accept) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);

      setTimeout(() => {
        clearInterval(checkInterval);
        if (!window.Accept) {
          reject(new Error('Accept.js failed to load'));
        }
      }, 5000);
      return;
    }

    // Load Accept.js script
    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.src = 'https://js.authorize.net/v1/Accept.js';
    script.async = true;
    
    script.onload = () => {
      // Wait a bit for Accept to initialize
      setTimeout(() => {
        if (window.Accept) {
          resolve();
        } else {
          reject(new Error('Accept.js loaded but Accept object not available'));
        }
      }, 500);
    };
    
    script.onerror = () => {
      reject(new Error('Failed to load Accept.js library'));
    };
    
    document.head.appendChild(script);
  });
};

/**
 * Encrypt card data using Accept.js
 * @param cardData - Card information
 * @param publicClientKey - Authorize.Net public client key
 * @returns Promise with opaqueData
 */
export const encryptCardData = async (
  cardData: {
    cardNumber: string;
    expirationDate: string; // MMYY format
    cardCode: string; // CVV
    zip?: string;
  },
  publicClientKey: string
): Promise<AcceptJsResponse> => {
  if (!window.Accept) {
    await loadAcceptJs();
  }

  if (!window.Accept) {
    throw new Error('Accept.js is not available. Please check your connection and try again.');
  }

  return new Promise((resolve, reject) => {
    // Clean card number (remove spaces and dashes)
    const cardNumber = cardData.cardNumber.replace(/[\s-]/g, '');
    
    // Convert expiration date from MM/YY to MMYY
    const expirationDate = cardData.expirationDate.replace(/\//g, '').replace(/^(\d{2})(\d{2})$/, '$1$2');

    const secureData = {
      authData: {
        clientKey: publicClientKey,
        apiLoginID: '' // Not needed for Accept.js, only public client key
      },
      cardData: {
        cardNumber: cardNumber,
        month: expirationDate.substring(0, 2),
        year: `20${expirationDate.substring(2, 4)}`,
        cardCode: cardData.cardCode,
        zip: cardData.zip || ''
      }
    };

    try {
      window.Accept.dispatchData(secureData, (response: AcceptJsResponse) => {
        if (response.messages?.resultCode === 'Error') {
          const errorMessages = response.messages.message.map((m: any) => m.text).join(', ');
          reject(new Error(`Accept.js Error: ${errorMessages}`));
        } else if (response.opaqueData) {
          resolve(response);
        } else {
          reject(new Error('Invalid response from Accept.js - no opaqueData received'));
        }
      });
    } catch (error: any) {
      reject(new Error(`Accept.js dispatch failed: ${error.message}`));
    }
  });
};

/**
 * Check if Accept.js is available
 */
export const isAcceptJsAvailable = (): boolean => {
  return typeof window !== 'undefined' && !!window.Accept;
};
