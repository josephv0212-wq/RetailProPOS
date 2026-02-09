// API-based types matching the backend models

export interface Customer {
  id: number;
  zohoId?: string;
  contactName: string;
  companyName?: string;
  email?: string;
  phone?: string;
  contactType: 'customer' | 'vendor' | 'other';
  locationId?: string;
  locationName?: string;
  isDefaultCustomer: boolean;
  hasPaymentMethod: boolean;
  paymentMethodType?: 'card' | null;
  last_four_digits?: string;
  cardBrand?: string;
  bankAccountLast4?: string;
  isActive: boolean;
  lastSyncedAt?: Date | string | null;
  createdAt?: Date | string;
  updatedAt?: Date | string;
  // Computed/helper properties for UI compatibility
  name?: string; // Alias for contactName
  company?: string; // Alias for companyName
  taxExempt?: boolean; // Computed from tax preference
  hasZohoId?: boolean; // Computed from zohoId
  status?: 'active' | 'inactive'; // Alias for isActive
  paymentInfo?: {
    cardBrand?: string;
    last4?: string;
    hasCard?: boolean;
    bankAccountLast4?: string;
    hasBankAccount?: boolean;
  };
}

export interface Product {
  id: number;
  zohoId?: string;
  name: string;
  sku?: string;
  description?: string;
  price: number;
  taxId?: string;
  taxName?: string;
  taxPercentage: number;
  unit?: string;
  isActive: boolean;
  imageData?: string | null; // base64 image data
  lastSyncedAt?: Date | string | null;
  createdAt?: Date | string;
  updatedAt?: Date | string;
  // UI compatibility properties
  stock?: number; // Not in API, but used in UI
  category?: string; // Not in API, but used in UI
  imageUrl?: string; // Computed from imageData
}

// Unit of measure option associated with an item
export interface UnitOfMeasureOption {
  id: number;
  unitName: string;
  symbol: string;
  unitPrecision: number;
  basicUM?: string | null;
  // Present when loaded via /items/:itemId/units include
  ItemUnitOfMeasure?: {
    isDefault: boolean;
  };
}

export interface CartItem {
  product: Product;
  quantity: number;
  // Selected unit text (symbol or name). For dry ice, this also controls price conversion.
  selectedUM?: string;
  // All available units for this item (from backend many-to-many mapping)
  availableUnits?: UnitOfMeasureOption[];
}

export interface PaymentMethod {
  type: 'cash' | 'card' | 'stored_payment' | 'zelle' | 'ach';
  label: string;
}

export interface PaymentDetails {
  method: PaymentMethod['type'];
  amount: number;
  cashReceived?: number;
  confirmationNumber?: string;
  zelleConfirmation?: string;
  achDetails?: {
    name: string;
    routingNumber: string;
    accountNumber: string;
    accountType: 'checking' | 'savings';
    bankName: string;
  };
  // Stored payment method via CIM (Authorize.net)
  useStoredPayment?: boolean;
  paymentProfileId?: string | null;
  // For card payments
  useTerminal?: boolean; // PAX Terminal via Authorize.Net Valor Connect
  useValorApi?: boolean; // Valor API direct cloud-to-connect
  useEBizChargeTerminal?: boolean;
  terminalNumber?: string; // VP100 serial number for Valor Connect/Valor API (cloud-to-cloud)
  terminalIP?: string; // Legacy support for direct terminal connection
  terminalPort?: number | string; // Legacy support for direct terminal connection
  useBluetoothReader?: boolean;
  valorTransactionId?: string; // Transaction ID from Valor API
  useStandaloneMode?: boolean; // Standalone card reader mode - no payment processing, just record sale
  bluetoothPayload?: {
    descriptor: string;
    value: string;
    sessionId: string;
  };
  // Manual card entry
  cardNumber?: string;
  expirationDate?: string;
  cvv?: string;
  zip?: string;
  // When true, backend will attempt to save this payment method
  // to Authorize.Net CIM for future "stored payment" use.
  savePaymentMethod?: boolean;
}

export interface SaleItem {
  id: number;
  saleId: number;
  itemId: number;
  zohoItemId?: string | null;
  itemName: string;
  quantity: number;
  price: number;
  taxPercentage: number;
  taxAmount: number;
  lineTotal: number;
  taxId?: string | null;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

export interface Sale {
  id: number;
  subtotal: number;
  taxAmount: number;
  taxPercentage: number;
  ccFee: number;
  total: number;
  paymentType: 'cash' | 'card' | 'zelle' | 'ach';
  locationId: string;
  locationName: string;
  customerId?: number | null;
  zohoCustomerId?: string | null;
  userId: number;
  transactionId: string;
  notes?: string | null;
  syncedToZoho: boolean;
  zohoSalesReceiptId?: string | null;
  syncError?: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  // Relations
  items?: SaleItem[];
  customer?: Customer | null;
  user?: {
    useremail: string;
  };
  // UI compatibility properties
  receiptNumber?: string; // Alias for transactionId
  tax?: number; // Alias for taxAmount
  payment?: PaymentDetails;
  timestamp?: Date; // Alias for createdAt
  cashier?: string; // Alias for user.useremail
  zohoSynced?: boolean; // Alias for syncedToZoho
  zohoError?: string; // Alias for syncError
}