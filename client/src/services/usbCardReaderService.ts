/**
 * USB Card Reader Service
 * Handles communication with BBPOS CHIPPER 3X USB card reader
 * 
 * Note: Web Serial API requires HTTPS (except localhost)
 *       User must grant permission to access USB device
 */

export interface CardReaderData {
  cardNumber: string;
  expirationDate?: string;
  cardHolderName?: string;
  track1?: string;
  track2?: string;
  track3?: string;
}

/**
 * Check if Web Serial API is supported
 */
export const isWebSerialSupported = (): boolean => {
  return 'serial' in navigator;
};

/**
 * Request access to USB serial device
 */
export const requestSerialPort = async (): Promise<SerialPort | null> => {
  if (!isWebSerialSupported()) {
    throw new Error('Web Serial API is not supported in this browser. Please use Chrome, Edge, or another supported browser.');
  }

  try {
    // Request port - this will show a device picker dialog
    const port = await (navigator as any).serial.requestPort();
    return port;
  } catch (error: any) {
    if (error.name === 'NotFoundError') {
      throw new Error('No USB device selected or device not found');
    } else if (error.name === 'SecurityError') {
      throw new Error('Permission denied. Please grant permission to access the USB device.');
    }
    throw new Error(`Failed to request serial port: ${error.message}`);
  }
};

/**
 * Open and configure serial port for BBPOS reader
 */
export const openSerialPort = async (port: SerialPort): Promise<ReadableStreamDefaultReader<Uint8Array>> => {
  try {
    // Configure port settings for BBPOS reader
    await port.open({
      baudRate: 115200, // Common baud rate for BBPOS readers
      dataBits: 8,
      parity: 'none',
      stopBits: 1,
      flowControl: 'none'
    });

    // Get reader
    const reader = port.readable?.getReader();
    if (!reader) {
      throw new Error('Could not get reader from serial port');
    }

    return reader;
  } catch (error: any) {
    throw new Error(`Failed to open serial port: ${error.message}`);
  }
};

/**
 * Read card data from USB reader
 * This is a simplified version - actual implementation depends on BBPOS protocol
 */
export const readCardData = async (
  port: SerialPort,
  timeout: number = 30000
): Promise<CardReaderData> => {
  return new Promise(async (resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error('Card read timeout. Please try again.'));
    }, timeout);

    try {
      const reader = await openSerialPort(port);
      
      // Read data from reader
      // Note: Actual BBPOS protocol parsing needed here
      // This is a placeholder implementation
      const chunks: Uint8Array[] = [];
      
      while (true) {
        const { value, done } = await reader.read();
        
        if (done) {
          break;
        }
        
        if (value) {
          chunks.push(value);
          
          // Check if we have complete card data
          // BBPOS readers typically send data in specific format
          // Parse the data based on BBPOS protocol
          const data = new TextDecoder().decode(new Uint8Array(chunks.flatMap(c => Array.from(c))));
          
          // Basic parsing (needs to be adapted for actual BBPOS protocol)
          if (data.includes('%') && data.includes('?')) {
            // Track data detected (standard card track format)
            clearTimeout(timeoutId);
            reader.releaseLock();
            await port.close();
            
            const cardData = parseCardTrackData(data);
            resolve(cardData);
            return;
          }
        }
      }

      clearTimeout(timeoutId);
      reader.releaseLock();
      reject(new Error('No card data received from reader'));
    } catch (error: any) {
      clearTimeout(timeoutId);
      reject(error);
    }
  });
};

/**
 * Parse card track data (simplified - needs actual BBPOS protocol)
 */
const parseCardTrackData = (trackData: string): CardReaderData => {
  // Parse track data format: %B1234567890123456^CARDHOLDER/NAME^YYMM1234567890123456?
  const track1Match = trackData.match(/%B(\d+)\^([^/]+)\/([^\^]+)\^(\d{4})/);
  const track2Match = trackData.match(/;(\d+)=(\d{4})/);

  let cardNumber = '';
  let expirationDate = '';
  let cardHolderName = '';

  if (track1Match) {
    cardNumber = track1Match[1];
    cardHolderName = track1Match[2] + ' ' + track1Match[3];
    expirationDate = track1Match[4];
  } else if (track2Match) {
    cardNumber = track2Match[1];
    expirationDate = track2Match[2];
  }

  // Convert YYMM to MM/YY
  if (expirationDate && expirationDate.length === 4) {
    expirationDate = `${expirationDate.substring(2, 4)}/${expirationDate.substring(0, 2)}`;
  }

  return {
    cardNumber,
    expirationDate,
    cardHolderName,
    track1: trackData.match(/%[^?]+/)?.[0] || '',
    track2: trackData.match(/;[^?]+/)?.[0] || ''
  };
};

/**
 * Connect to USB card reader and read card
 * Main function to use for USB card reading
 */
export const connectAndReadCard = async (
  onStatus?: (status: string) => void
): Promise<CardReaderData> => {
  if (!isWebSerialSupported()) {
    throw new Error(
      'Web Serial API is not supported. ' +
      'Please use Chrome, Edge, or Opera browser. ' +
      'Note: HTTPS is required (except localhost)'
    );
  }

  try {
    onStatus?.('Requesting USB device access...');
    const port = await requestSerialPort();
    
    if (!port) {
      throw new Error('No USB device selected');
    }

    onStatus?.('Reading card... Please insert, swipe, or tap card.');
    const cardData = await readCardData(port);
    
    onStatus?.('Card read successfully!');
    return cardData;
  } catch (error: any) {
    onStatus?.('Error: ' + error.message);
    throw error;
  }
};
