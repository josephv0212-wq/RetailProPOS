import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { TopNavigation } from './components/TopNavigation';
import { PageWrapper } from './components/PageWrapper';
import { ShoppingCart } from './components/ShoppingCart';
import { ProductSelection } from './components/ProductSelection';
import { PaymentModal } from './components/PaymentModal';
import { ReceiptScreen } from './components/ReceiptScreen';
import { SignIn } from './components/SignIn';
import { SignUp } from './components/SignUp';
import { Customers } from './components/Customers';
import { Reports } from './components/Reports';
import { Settings } from './components/Settings';
import { AdminPage } from './components/AdminPage';
import { ToastProvider } from './contexts/ToastContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { AlertProvider } from './contexts/AlertContext';
import { useAuth } from './contexts/AuthContext';
import { useAlert } from './contexts/AlertContext';
import { Customer, Product, CartItem, PaymentDetails, Sale, UnitOfMeasureOption } from './types';
import { itemsAPI, customersAPI, salesAPI, zohoAPI, itemUnitsAPI, unitsAPI } from '../services/api';
import { SalesOrderInvoiceModal } from './components/SalesOrderInvoiceModal';
import { PaymentMethodSelector } from './components/PaymentMethodSelector';
import { InvoicePaymentReceiptPreview } from './components/InvoicePaymentReceiptPreview';
import { ZohoPaymentOptionsModal } from './components/ZohoPaymentOptionsModal';
import { isVendorContact } from './utils/contactType';
import { useToast } from './contexts/ToastContext';
import { logger } from '../utils/logger';
import { isDryIceItem } from './components/ShoppingCart';
import { Loader2 } from 'lucide-react';

type AppScreen = 'signin' | 'signup' | 'pos' | 'customers' | 'reports' | 'settings' | 'admin' | 'receipt';

export default function App() {
  return (
    <ThemeProvider>
      <AlertProvider>
        <ToastProvider>
          <AppContent />
        </ToastProvider>
      </AlertProvider>
    </ThemeProvider>
  );
}

// Helper function to get item price with UM conversion
const getItemPrice = (item: CartItem): number => {
  const basePrice = item.product.price;
  
  // Use unitPrecision from availableUnits for all items (including dry ice)
  if (item.selectedUM && item.availableUnits && item.availableUnits.length > 0) {
    const selectedUnit = item.availableUnits.find(u => 
      (u.symbol === item.selectedUM) || (u.unitName === item.selectedUM)
    );
    if (selectedUnit && selectedUnit.unitPrecision > 0) {
      // Price = original price * unitPrecision (Unit Rate)
      // Convert to number in case it's a string from database
      const rate = typeof selectedUnit.unitPrecision === 'string' 
        ? parseFloat(selectedUnit.unitPrecision) 
        : selectedUnit.unitPrecision;
      return basePrice * rate;
    }
  }
  
  return basePrice;
};

function AppContent() {
  const { user, isLoading: authLoading, isAuthenticated, logout } = useAuth();
  const { showAlert, showConfirm } = useAlert();
  const { showToast } = useToast();
  
  // App state
  const [currentScreen, setCurrentScreen] = useState<AppScreen>('signin');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerTaxPreference, setCustomerTaxPreference] = useState<'STANDARD' | 'SALES TAX EXCEPTION CERTIFICATE' | null>(null);
  const [customerCards, setCustomerCards] = useState<any[]>([]);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [completedSale, setCompletedSale] = useState<Sale | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [error, setError] = useState('');
  const [openSalesOrders, setOpenSalesOrders] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [isOrderInvoiceModalOpen, setIsOrderInvoiceModalOpen] = useState(false);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState<string | null>(null);
  const [isPaymentMethodSelectorOpen, setIsPaymentMethodSelectorOpen] = useState(false);
  const [pendingChargeItems, setPendingChargeItems] = useState<any[]>([]);
  const [isInvoicePaymentReceiptPreviewOpen, setIsInvoicePaymentReceiptPreviewOpen] = useState(false);
  const [pendingStoredPaymentSelection, setPendingStoredPaymentSelection] = useState<{ paymentProfileId: string; profileType: 'card' | 'ach' } | null>(null);
  const [isZohoPaymentOptionsOpen, setIsZohoPaymentOptionsOpen] = useState(false);
  const [isZohoDocsPaymentModalOpen, setIsZohoDocsPaymentModalOpen] = useState(false);
  const [zohoDocsCartItems, setZohoDocsCartItems] = useState<CartItem[]>([]);
  const [zohoDocsTotals, setZohoDocsTotals] = useState<{ total: number; subtotal: number; tax: number }>({ total: 0, subtotal: 0, tax: 0 });
  const [allUnits, setAllUnits] = useState<UnitOfMeasureOption[]>([]); // All units including basic UMs for dry ice

  // Memoized constants from user data - use logged-in user's tax percentage
  const constants = useMemo(() => {
    const pct = typeof user?.taxPercentage === 'number' ? user.taxPercentage : parseFloat(String(user?.taxPercentage ?? ''));
    const taxRate = Number.isFinite(pct) ? pct / 100 : 0.075;
    return {
    TAX_RATE: taxRate,
    STORE_NAME: user?.locationName || 'Store',
    STORE_ADDRESS: '123 Main Street, Suite 100, City, ST 12345', // Could come from API
    STORE_PHONE: '(555) 123-4567', // Could come from API
    USER_NAME: user?.name || user?.useremail || 'User',
  };
  }, [user?.taxPercentage, user?.locationName, user?.name, user?.useremail]);

  const loadProducts = useCallback(async () => {
    setLoadingProducts(true);
    setError('');
    try {
      const response = await itemsAPI.getAll({ isActive: true });
      if (response.success && response.data?.items) {
        // Transform API products to match UI format and filter out items with price 0
        const transformedProducts: Product[] = response.data.items
          .filter((item: any) => item.price > 0) // Filter out items with price 0
          .map((item: any) => {
            // Handle imageData - could be base64 string or full data URL
            let imageUrl = undefined;
            if (item.imageData) {
              // If it already has data: prefix, use as is, otherwise add it
              imageUrl = item.imageData.startsWith('data:') 
                ? item.imageData 
                : `data:image/png;base64,${item.imageData}`;
            }
            return {
              ...item,
              imageUrl,
            };
          });
        setProducts(transformedProducts);
      }
    } catch (err: any) {
      logger.error('Failed to load products', err);
      setError('Failed to load products');
    } finally {
      setLoadingProducts(false);
    }
  }, []);

  const loadCustomers = useCallback(async () => {
    setLoadingCustomers(true);
    try {
      const response = await customersAPI.getAll({ isActive: true });
      if (response.success && response.data?.customers) {
        // Transform API customers to match UI format
        const transformedCustomers: Customer[] = response.data.customers.map((cust: any) => ({
          ...cust,
          name: cust.contactName,
          company: cust.companyName,
          taxExempt: false, // Will be determined from price list
          hasZohoId: !!cust.zohoId,
          status: cust.isActive ? 'active' : 'inactive',
          paymentInfo: {
            cardBrand: cust.cardBrand,
            last4: cust.last_four_digits,
            hasCard: cust.hasPaymentMethod,
          },
        }));
        setCustomers(transformedCustomers);
      }
    } catch (err: any) {
      logger.error('Failed to load customers', err);
    } finally {
      setLoadingCustomers(false);
    }
  }, []);

  // Calculate totals for payment modal (memoized) - must be before any early returns
  const totalsForReceipt = useMemo(() => {
    const subtotal = cartItems.reduce((sum, item) => {
      const itemPrice = getItemPrice(item);
      return sum + (itemPrice * item.quantity);
    }, 0);
    const isTaxExempt = selectedCustomer?.taxExempt || false;
    const tax = isTaxExempt ? 0 : subtotal * constants.TAX_RATE;
    const total = subtotal + tax;
    return { subtotal, tax, total };
  }, [cartItems, selectedCustomer?.taxExempt, constants.TAX_RATE]);

  // Memoize navigation handlers to prevent unnecessary re-renders
  const navigationHandlers = useMemo(() => ({
    toPOS: () => setCurrentScreen('pos'),
    toCustomers: () => setCurrentScreen('customers'),
    toReports: () => setCurrentScreen('reports'),
    toSettings: () => setCurrentScreen('settings'),
    toAdmin: () => setCurrentScreen('admin'),
  }), []);

  // Load all units (including basic UMs for dry ice)
  const loadAllUnits = useCallback(async () => {
    try {
      const response = await unitsAPI.getAllIncludingBasic();
      if (response.success && response.data?.units) {
        setAllUnits(response.data.units as UnitOfMeasureOption[]);
      }
    } catch (err) {
      logger.error('Failed to load all units', err);
    }
  }, []);

  // Load products, customers, and units when authenticated
  useEffect(() => {
    if (isAuthenticated && user) {
      loadProducts();
      loadCustomers();
      loadAllUnits();
    }
  }, [isAuthenticated, user, loadProducts, loadCustomers, loadAllUnits]);

  // Track if we're syncing from URL to avoid loops
  const isSyncingFromUrl = useRef(false);

  // Handle URL-based routing on initial load and URL changes
  useEffect(() => {
    const handleRoute = () => {
      const path = window.location.pathname;
      
      // Map URL paths to screens
      const pathToScreen: Record<string, AppScreen> = {
        '/': 'signin',
        '/signin': 'signin',
        '/signup': 'signup',
        '/pos': 'pos', // Keep for backwards compatibility
        '/sales': 'pos', // Map /sales to pos screen
        '/reports': 'reports',
        '/customers': 'customers',
        '/settings': 'settings',
        '/admin': 'admin',
      };

      const screen = pathToScreen[path] || 'signin';
      isSyncingFromUrl.current = true;
      setCurrentScreen(screen);
      // Reset flag after state update
      setTimeout(() => { isSyncingFromUrl.current = false; }, 0);
    };

    // Handle initial route
    handleRoute();

    // Listen for popstate (back/forward browser buttons)
    window.addEventListener('popstate', handleRoute);
    return () => window.removeEventListener('popstate', handleRoute);
  }, []);

  // Update URL when screen changes programmatically (not from URL sync)
  useEffect(() => {
    if (isSyncingFromUrl.current) return;

    const screenToPath: Record<AppScreen, string> = {
      'signin': '/signin',
      'signup': '/signup',
      'pos': '/sales',
      'reports': '/reports',
      'customers': '/customers',
      'settings': '/settings',
      'admin': '/admin',
      'receipt': '/receipt',
    };

    const path = screenToPath[currentScreen] || '/';
    if (window.location.pathname !== path && currentScreen !== 'receipt') {
      window.history.pushState({}, '', path);
    }
  }, [currentScreen]);

  // Redirect to signin if not authenticated (except on signin/signup screens)
  useEffect(() => {
    if (!authLoading && !isAuthenticated && currentScreen !== 'signin' && currentScreen !== 'signup') {
      setCurrentScreen('signin');
      window.history.pushState({}, '', '/signin');
    } else if (!authLoading && isAuthenticated && currentScreen === 'signin') {
      setCurrentScreen('pos');
      window.history.pushState({}, '', '/pos');
    }
  }, [authLoading, isAuthenticated, currentScreen]);

  // Handle customer selection with pricebook integration
  const handleSelectCustomer = async (customer: Customer | null) => {
    // #region agent log
    fetch('http://127.0.0.1:1024/ingest/d43f1d4c-4d33-4f77-a4e3-9e9d56debc45',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'App.tsx:handleSelectCustomer entry',message:'customer selected',data:{customerId:customer?.id,customerName:customer?.contactName,zohoId:!!customer?.zohoId},timestamp:Date.now(),hypothesisId:'H5'})}).catch(()=>{});
    // #endregion
    // Check if vendor contact
    if (customer && isVendorContact(customer.contactType)) {
      showToast('Only Zoho customer contacts can be selected for POS checkouts.', 'warning', 4000);
      return;
    }

    // Reset tax preference and cards when no customer selected
    if (!customer) {
      setSelectedCustomer(null);
      setCustomerTaxPreference(null);
      setCustomerCards([]);
      setOpenSalesOrders([]);
      setInvoices([]);
      await loadProducts(); // Load regular items
      return;
    }

    // Set customer first (needed for SO/Invoice modals and continuation)
    setSelectedCustomer(customer);

    // Check for open sales orders and invoices if customer has Zoho ID
    if (customer.zohoId) {
      try {
        setLoadingOrders(true);
        setLoadingMessage('Checking orders & invoices…');
        // #region agent log
        const invoiceResponse = await zohoAPI.getCustomerInvoices(customer.zohoId, 'unpaid').catch(() => ({ success: false, data: { invoices: [] } }));
        const invoiceList = invoiceResponse.success && invoiceResponse.data?.invoices ? invoiceResponse.data.invoices : [];

        setOpenSalesOrders([]);
        setInvoices(invoiceList);

        // Show modal if we have any invoices
        if (invoiceList.length > 0) {
          setIsOrderInvoiceModalOpen(true);
          setLoadingOrders(false);
          setLoadingMessage(null);
          return;
        }
      } catch (err: any) {
        logger.error('Failed to check for invoices', err);
        setOpenSalesOrders([]);
        setInvoices([]);
      } finally {
        setLoadingOrders(false);
        setLoadingMessage(null);
      }
    } else {
      setOpenSalesOrders([]);
      setInvoices([]);
    }

    // #region agent log
    fetch('http://127.0.0.1:1024/ingest/d43f1d4c-4d33-4f77-a4e3-9e9d56debc45',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'App.tsx:before continueCustomerSelection',message:'calling continueCustomerSelection',data:{},timestamp:Date.now(),hypothesisId:'H5'})}).catch(()=>{});
    // #endregion
    // Continue with customer selection (this will be called after SO/Invoice check or if none found)
    await continueCustomerSelection(customer);
  };

  // Shopping cart functions
  const handleAddToCart = async (product: Product) => {
    // Check if product price is $0
    if (product.price === 0) {
      showAlert({ message: 'Cannot add item with $0 price to cart.' });
      return;
    }
    
    const existingItem = cartItems.find(item => item.product.id === product.id);
    
    if (existingItem) {
      setCartItems(cartItems.map(item =>
        item.product.id === product.id
          ? { ...item, quantity: item.quantity + 1 }
          : item
      ));
    } else {
      // When first adding to cart, try to load available units for this item
      let availableUnits: UnitOfMeasureOption[] | undefined;
      let selectedUM: string | undefined;

      const isDryIce = isDryIceItem(product.name);
      const itemNameLower = product.name.toLowerCase();
      const isOnlineDryIce =
        itemNameLower.includes('online dry ice block') ||
        itemNameLower.includes('online dry ice pellets');
      const isDryIcePellets =
        isDryIce && !isOnlineDryIce && itemNameLower.includes('dry ice pellets');
      const isDryIceBlasting =
        isDryIce && !isOnlineDryIce && itemNameLower.includes('dry ice blasting');

      // 1) Always prefer item-specific unit assignments (admin-configured) for ALL items,
      //    including dry ice. This ensures admin control over which UMs appear per item.
      try {
        const unitsResponse = await itemUnitsAPI.getItemUnits(product.id);
        if (unitsResponse.success && unitsResponse.data?.units && unitsResponse.data.units.length > 0) {
          availableUnits = unitsResponse.data.units as UnitOfMeasureOption[];

          // Prefer unit that matches the item's default unit field first
          const matchByItemUnit = product.unit
            ? availableUnits.find(u => (u.symbol || u.unitName) === product.unit)
            : undefined;

          // Then prefer one flagged as default in the join table
          const matchByFlag = availableUnits.find(u => u.ItemUnitOfMeasure?.isDefault);

          const defaultUnit =
            matchByItemUnit || matchByFlag || availableUnits[0];

          if (defaultUnit) {
            selectedUM = defaultUnit.symbol || defaultUnit.unitName;
          }
        }
      } catch (err) {
        logger.error('Failed to load item units', err);
      }

      // 2) Backward-compatible fallback: if no item-specific units exist AND this is a dry ice
      //    item, fall back to the legacy allUnits-based dry ice list so older databases still work.
      if (!availableUnits && isDryIce && !isOnlineDryIce) {
        const dryIceUnits = allUnits.filter(unit => {
          // Include 'lb' (basicUM=null) and units with basicUM='lb'
          if (unit.unitName === 'lb' || unit.basicUM === 'lb') {
            // Filter based on item type
            if (isDryIcePellets) {
              // Dry ice pellets: lb, Bin 500 lb, and Bag 50 lb
              return (
                unit.unitName === 'lb' ||
                unit.unitName === 'Bin 500 lb' ||
                unit.unitName === 'Bag 50 lb'
              );
            } else if (isDryIceBlasting) {
              // Dry ice blasting: only lb and Bin 500 lb
              return unit.unitName === 'lb' || unit.unitName === 'Bin 500 lb';
            } else {
              // Other dry ice items: all options
              return true;
            }
          }
          return false;
        });

        if (dryIceUnits.length > 0) {
          availableUnits = dryIceUnits;
          // Default to 'lb'
          const lbUnit = dryIceUnits.find(u => u.unitName === 'lb');
          selectedUM = lbUnit
            ? lbUnit.symbol || lbUnit.unitName
            : dryIceUnits[0].symbol || dryIceUnits[0].unitName;
        }
      }

      // Fallback: if no units from API, use product.unit (if present) or, for dry ice, default to "lb"
      if (!selectedUM) {
        if (product.unit) {
          selectedUM = product.unit;
        } else if (isDryIce) {
          selectedUM = 'lb';
        }
      }

      setCartItems([...cartItems, { product, quantity: 0, selectedUM, availableUnits }]);
    }
  };

  const handleUpdateQuantity = (productId: number | string, quantity: number) => {
    setCartItems(cartItems.map(item =>
      String(item.product.id) === String(productId)
        ? { ...item, quantity: Math.max(0, quantity) }
        : item
    ));
  };

  const handleUpdateUM = (productId: number | string, um: string) => {
    setCartItems(cartItems.map(item =>
      String(item.product.id) === String(productId)
        ? { ...item, selectedUM: um }
        : item
    ));
  };

  const handleRemoveItem = (productId: number | string) => {
    setCartItems(cartItems.filter(item => String(item.product.id) !== String(productId)));
  };

  const handleClearCart = async () => {
    if (cartItems.length > 0) {
      const confirmed = await showConfirm({
        message: 'Are you sure you want to clear the cart?',
      });
      if (confirmed) {
        setCartItems([]);
        setSelectedCustomer(null);
        setCustomerTaxPreference(null);
        setCustomerCards([]);
        setOpenSalesOrders([]);
        setInvoices([]);
        await loadProducts(); // Load regular items
      }
    }
  };

  // Handle selection of sales orders and/or invoices - show payment options (Zoho vs POS methods)
  const handleSelectOrdersInvoices = async (items: any[]) => {
    if (items.length === 0) return;

    if (!selectedCustomer || !selectedCustomer.id) {
      showToast('Customer must be selected to charge invoices', 'error', 4000);
      return;
    }

    // Prepare items for charging - extract amounts
    const chargeItems = items.map(item => {
      if (item.type === 'invoice') {
        // For invoices, use balance (outstanding amount) if available, otherwise use total
        const amount = item.balance > 0 ? item.balance : item.total;
        return {
          type: 'invoice' as const,
          id: item.invoice_id,
          number: item.invoice_number,
          amount: parseFloat(amount)
        };
      }
      return null;
    }).filter(Boolean) as Array<{
      type: 'invoice';
      id: string;
      number: string;
      amount: number;
    }>;

    if (chargeItems.length === 0) {
      showToast('No valid items to charge', 'error', 4000);
      return;
    }

    // Store items and show payment options
    setPendingChargeItems(chargeItems);
    setIsOrderInvoiceModalOpen(false);
    setOpenSalesOrders([]);
    setInvoices([]);
    setIsZohoPaymentOptionsOpen(true);
  };

  const openZohoDocsPosPaymentModal = () => {
    const totalAmount = (pendingChargeItems || []).reduce((sum, it: any) => sum + (Number(it.amount) || 0), 0);
    const fakeCartItems: CartItem[] = (pendingChargeItems || []).map((it: any) => ({
      product: {
        id: `${it.type}-${it.id}`,
        name: `Invoice ${it.number}`,
        price: Number(it.amount) || 0,
      } as any,
      quantity: 1,
      selectedUM: null,
      availableUnits: [],
    }));

    setZohoDocsCartItems(fakeCartItems);
    setZohoDocsTotals({ total: totalAmount, subtotal: totalAmount, tax: 0 });
    setIsZohoDocsPaymentModalOpen(true);
  };

  const handleConfirmZohoDocsPayment = async (paymentDetails: PaymentDetails): Promise<any> => {
    const count = pendingChargeItems.length;
    const amountCharged = Number(paymentDetails.amount) ?? (pendingChargeItems || []).reduce((sum: number, it: any) => sum + (Number(it.amount) || 0), 0);
    const items = pendingChargeItems || [];

    showToast(
      `Payment completed for ${count} document${count !== 1 ? 's' : ''} ($${amountCharged.toFixed(2)}) via ${paymentDetails.method?.toUpperCase() ?? 'POS'}.`,
      'success',
      6000
    );

    setIsZohoDocsPaymentModalOpen(false);
    setIsZohoPaymentOptionsOpen(false);

    // Build receipt sale and show receipt screen (same as stored-payment flow)
    const subtotal = items.reduce((sum: number, it: any) => sum + (Number(it.amount) || 0), 0);
    const ccFee = amountCharged > subtotal ? Math.round((amountCharged - subtotal) * 100) / 100 : 0;
    const receiptSale: Sale = {
      id: 0,
      subtotal,
      taxAmount: 0,
      taxPercentage: 0,
      ccFee,
      total: amountCharged,
      paymentType: (paymentDetails.method || 'cash') as Sale['paymentType'],
      locationId: user?.locationId || '',
      locationName: constants.STORE_NAME,
      customerId: selectedCustomer?.id ?? null,
      userId: user?.id ?? 0,
      transactionId: `ZOHO-POS-${Date.now()}`,
      receiptNumber: `ZOHO-POS-${Date.now()}`,
      syncedToZoho: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      items: items.map((it: any, idx: number) => ({
        id: idx + 1,
        saleId: 0,
        itemId: 0,
        itemName: `Invoice ${it.number}`,
        quantity: 1,
        price: Number(it.amount) || 0,
        taxPercentage: 0,
        taxAmount: 0,
        lineTotal: Number(it.amount) || 0,
      })),
      customer: selectedCustomer ?? undefined,
      payment: {
        method: paymentDetails.method || 'cash',
        amount: amountCharged,
        confirmationNumber: undefined,
      },
      timestamp: new Date(),
      tax: 0,
      cashier: constants.USER_NAME,
      zohoSynced: false,
    };
    setCompletedSale(receiptSale);
    setPendingChargeItems([]);
    setCurrentScreen('receipt');
    return { success: true };
  };

  // Open receipt preview when user selects a stored payment method (before charging)
  const handleOpenReceiptPreview = (paymentProfileId: string, profileType?: 'card' | 'ach') => {
    setPendingStoredPaymentSelection({
      paymentProfileId,
      profileType: profileType === 'ach' ? 'ach' : 'card',
    });
    setIsPaymentMethodSelectorOpen(false);
    setIsInvoicePaymentReceiptPreviewOpen(true);
  };

  // Handle payment method selection and charge (called from receipt preview "Confirm & Pay")
  const handlePaymentMethodSelected = async (paymentProfileId: string, profileType?: 'card' | 'ach') => {
    if (!selectedCustomer || !selectedCustomer.id || pendingChargeItems.length === 0) {
      return;
    }

    try {
      setLoadingOrders(true);
      setIsPaymentMethodSelectorOpen(false);

      const paymentType = profileType === 'ach' ? 'ach' : 'card';

      // Charge invoices/sales orders via Authorize.net CIM (backend adds 3% CC fee when paymentType is card)
      const response = await salesAPI.chargeInvoicesSalesOrders({
        customerId: selectedCustomer.id,
        paymentProfileId,
        paymentType,
        items: pendingChargeItems
      });

      if (response.success && response.data) {
        const { results, errors, summary } = response.data;

        // Clear pending items and receipt preview state
        setPendingChargeItems([]);
        setPendingStoredPaymentSelection(null);
        setIsInvoicePaymentReceiptPreviewOpen(false);

        // Check for transactions under review
        const underReviewItems = results.filter((r: any) => r.underReview);
        const approvedItems = results.filter((r: any) => !r.underReview);

        // Show results
        if (summary.successful > 0) {
          const totalAmount = results.reduce((sum: number, r: any) => sum + r.amount, 0);
          
          if (underReviewItems.length > 0 && approvedItems.length === 0) {
            // All transactions are under review
            const reviewNumbers = underReviewItems.map((r: any) => `${r.type} ${r.number}`).join(', ');
            showAlert({
              title: 'Transactions Under Review',
              message: `${underReviewItems.length} transaction(s) submitted but are under review by Authorize.net:\n\n${reviewNumbers}\n\nPlease check your Authorize.net merchant interface to approve or decline these transactions.`
            });
          } else if (underReviewItems.length > 0) {
            // Some approved, some under review
            const reviewNumbers = underReviewItems.map((r: any) => `${r.type} ${r.number}`).join(', ');
            showToast(
              `Charged ${approvedItems.length} item(s) successfully. ${underReviewItems.length} transaction(s) under review: ${reviewNumbers}`,
              'warning',
              7000
            );
          } else {
            // All approved
            showToast(
              `Successfully charged ${summary.successful} item(s) totaling $${totalAmount.toFixed(2)}`,
              'success',
              5000
            );
          }
        }

        if (summary.failed > 0) {
          const errorMessages = errors.map((e: any) =>
            e.item?.type === 'batch' ? e.error : `${e.item.type} ${e.item.number}: ${e.error}`
          ).join('\n');
          showAlert({
            title: summary.successful > 0 ? 'Some charges failed' : 'Charge declined',
            message: `Failed to charge ${summary.failed} item(s):\n\n${errorMessages}`
          });
        }

        // If all succeeded and none are under review, show detailed success message
        if (summary.failed === 0 && underReviewItems.length === 0) {
          const txnIds = [...new Set(results.map((r: any) => r.transactionId).filter(Boolean))];
          const txnLabel = txnIds.length <= 1 ? `Transaction ID: ${txnIds[0] || '—'}` : `Transaction IDs: ${txnIds.join(', ')}`;
          showToast(
            `All charges processed successfully. ${txnLabel}`,
            'success',
            6000
          );
        }

        // Warn if any invoice payment was not recorded in Zoho
        const invoiceResults = results.filter((r: any) => r.type === 'invoice');
        const zohoFailed = invoiceResults.filter((r: any) => r.zohoPaymentError);
        if (zohoFailed.length > 0) {
          const msg = zohoFailed.length === 1
            ? `Payment was charged but could not be recorded in Zoho Books: ${zohoFailed[0].zohoPaymentError}`
            : `${zohoFailed.length} invoice(s): payment charged but not recorded in Zoho. Check server logs.`;
          showToast(msg, 'warning', 8000);
        }

        // Show sales receipt page when at least one charge succeeded
        if (summary.successful > 0 && results.length > 0) {
          const subtotal = results.reduce((sum: number, r: any) => sum + (Number(r.amount) || 0), 0);
          const totalCharged = results.reduce((sum: number, r: any) => sum + ((Number(r.amountCharged) ?? Number(r.amount)) || 0), 0);
          const ccFeeTotal = results.reduce((sum: number, r: any) => sum + (Number(r.ccFee) || 0), 0);
          const receiptSale: Sale = {
            id: 0,
            subtotal,
            taxAmount: 0,
            taxPercentage: 0,
            ccFee: ccFeeTotal,
            total: totalCharged,
            paymentType: paymentType as Sale['paymentType'],
            locationId: user?.locationId || '',
            locationName: constants.STORE_NAME,
            customerId: selectedCustomer.id,
            userId: user?.id ?? 0,
            transactionId: results[0]?.transactionId || `INV-${Date.now()}`,
            syncedToZoho: (zohoFailed?.length ?? 0) === 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            items: results.map((r: any, idx: number) => ({
              id: idx + 1,
              saleId: 0,
              itemId: 0,
              itemName: `Invoice ${r.number}`,
              quantity: 1,
              price: Number(r.amount) || 0,
              taxPercentage: 0,
              taxAmount: 0,
              lineTotal: ((Number(r.amountCharged) ?? Number(r.amount)) || 0),
            })),
            customer: selectedCustomer,
            payment: {
              method: paymentType as PaymentDetails['method'],
              amount: totalCharged,
              confirmationNumber: results.map((r: any) => r.transactionId).filter(Boolean).join(', '),
            },
            timestamp: new Date(),
            tax: 0,
            cashier: constants.USER_NAME,
            zohoSynced: (zohoFailed?.length ?? 0) === 0,
          };
          setCompletedSale(receiptSale);
          setCurrentScreen('receipt');
        }
      } else {
        showToast(
          response.error || 'Failed to charge invoices/sales orders',
          'error',
          5000
        );
      }
    } catch (err: any) {
      logger.error('Failed to charge invoices/sales orders', err);
      showToast(
        err.message || 'Failed to charge invoices/sales orders',
        'error',
        5000
      );
    } finally {
      setLoadingOrders(false);
    }
  };


  // Continue customer selection after SO/Invoice handling
  const continueCustomerSelection = async (customer: Customer | null) => {
    if (!customer) return;
    // #region agent log
    const t0Continue = Date.now();
    fetch('http://127.0.0.1:1024/ingest/d43f1d4c-4d33-4f77-a4e3-9e9d56debc45',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'App.tsx:continueCustomerSelection entry',message:'start',data:{t0:t0Continue},timestamp:Date.now(),hypothesisId:'H5'})}).catch(()=>{});
    // #endregion
    setLoadingMessage('Loading price list…');
    try {
      // Use items already in DB (synced via Nav "Sync Zoho" or background). Do not sync on every customer select to avoid 15+ s latency.
      // Fetch price list first only (no parallel loadProducts) so server isn't handling two heavy requests; then get pricebook or loadProducts.
      if (customer.id) {
        try {
          // #region agent log
          const t0PriceList = Date.now();
          fetch('http://127.0.0.1:1024/ingest/d43f1d4c-4d33-4f77-a4e3-9e9d56debc45',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'App.tsx:before getPriceList',message:'before getPriceList',data:{t0:t0PriceList},timestamp:Date.now(),hypothesisId:'H2'})}).catch(()=>{});
          // #endregion
          const priceListRes = await customersAPI.getPriceList(customer.id);
        // #region agent log
        fetch('http://127.0.0.1:1024/ingest/d43f1d4c-4d33-4f77-a4e3-9e9d56debc45',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'App.tsx:after getPriceList',message:'after getPriceList',data:{durationMs:Date.now()-t0PriceList,pricebookName:priceListRes?.data?.pricebook_name},timestamp:Date.now(),hypothesisId:'H2'})}).catch(()=>{});
        // #endregion
        const pricebookName = priceListRes.data?.pricebook_name;
        const taxPreference = priceListRes.data?.tax_preference;
        const cards = priceListRes.data?.cards || [];
        const last_four_digits = priceListRes.data?.last_four_digits;
        const card_type = priceListRes.data?.card_type;
        const has_card_info = priceListRes.data?.has_card_info;
        const card_info_checked = priceListRes.data?.card_info_checked;
        const bank_account_last4 = priceListRes.data?.bank_account_last4;
        
        // Update customer object with card info, bank account info, and tax exemption from Zoho
        const isTaxExemptFromZoho = taxPreference === 'SALES TAX EXCEPTION CERTIFICATE';
        const updatedCustomer: Customer = {
          ...customer,
          last_four_digits: last_four_digits || customer.last_four_digits,
          cardBrand: card_type || customer.cardBrand,
          bankAccountLast4: bank_account_last4 || customer.bankAccountLast4,
          taxExempt: isTaxExemptFromZoho,
          paymentInfo: {
            ...customer.paymentInfo,
            cardBrand: card_type || customer.cardBrand,
            last4: last_four_digits || customer.last_four_digits,
            hasCard: has_card_info !== undefined ? has_card_info : customer.hasPaymentMethod,
            bankAccountLast4: bank_account_last4 || customer.bankAccountLast4,
            hasBankAccount: !!bank_account_last4,
          },
        };
        
        // Set customer state once with all updated info
        setSelectedCustomer(updatedCustomer);
        setCustomerTaxPreference((taxPreference === 'SALES TAX EXCEPTION CERTIFICATE' ? 'SALES TAX EXCEPTION CERTIFICATE' : 'STANDARD') as 'STANDARD' | 'SALES TAX EXCEPTION CERTIFICATE');
        setCustomerCards(cards);
        
        if (pricebookName) {
          setLoadingMessage('Loading items…');
          // Fetch items from the pricebook (includes both pricebook items and regular items)
          try {
            // #region agent log
            const t0Pricebook = Date.now();
            fetch('http://127.0.0.1:1024/ingest/d43f1d4c-4d33-4f77-a4e3-9e9d56debc45',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'App.tsx:before getFromPricebook',message:'before getFromPricebook',data:{pricebookName,t0:t0Pricebook},timestamp:Date.now(),hypothesisId:'H3'})}).catch(()=>{});
            // #endregion
            const pricebookItemsRes = await itemsAPI.getFromPricebook(pricebookName);
            // #region agent log
            fetch('http://127.0.0.1:1024/ingest/d43f1d4c-4d33-4f77-a4e3-9e9d56debc45',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'App.tsx:after getFromPricebook',message:'after getFromPricebook',data:{durationMs:Date.now()-t0Pricebook,itemsCount:pricebookItemsRes?.data?.items?.length??0},timestamp:Date.now(),hypothesisId:'H3'})}).catch(()=>{});
            // #endregion
            const allItems = pricebookItemsRes.data?.items || [];
            const pricebookItemsCount = pricebookItemsRes.data?.pricebookItemsCount || 0;
            
            if (allItems.length > 0) {
              // Transform pricebook items and filter out items with price 0
              const transformedProducts: Product[] = allItems
                .filter((item: any) => item.price > 0) // Filter out items with price 0
                .map((item: any) => {
                  let imageUrl = undefined;
                  if (item.imageData) {
                    imageUrl = item.imageData.startsWith('data:') 
                      ? item.imageData 
                      : `data:image/png;base64,${item.imageData}`;
                  }
                  return {
                    ...item,
                    imageUrl,
                  };
                });
              
              // Update items with merged list (pricebook items have custom prices, others have regular prices)
              setProducts(transformedProducts);
              if (pricebookItemsCount > 0) {
                // #region agent log
                fetch('http://127.0.0.1:1024/ingest/d43f1d4c-4d33-4f77-a4e3-9e9d56debc45',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'App.tsx:loaded items toast',message:'showToast loaded items',data:{totalDurationMs:Date.now()-t0Continue},timestamp:Date.now(),hypothesisId:'H5'})}).catch(()=>{});
                // #endregion
                showToast(
                  `Loaded ${allItems.length} items (${pricebookItemsCount} with pricebook prices, ${allItems.length - pricebookItemsCount} with regular prices)`,
                  'success',
                  4000
                );
              } else {
                // #region agent log
                fetch('http://127.0.0.1:1024/ingest/d43f1d4c-4d33-4f77-a4e3-9e9d56debc45',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'App.tsx:loaded items toast',message:'showToast loaded items',data:{totalDurationMs:Date.now()-t0Continue},timestamp:Date.now(),hypothesisId:'H5'})}).catch(()=>{});
                // #endregion
                showToast(`Loaded ${allItems.length} items with regular prices`, 'info', 3000);
              }
            } else {
              // If no items, fall back to regular items
              setLoadingMessage('Loading products…');
              await loadProducts();
              showToast(`No items found in pricebook. Showing all items.`, 'info', 3000);
            }
          } catch (pricebookError: any) {
            const errorMsg = pricebookError.response?.data?.message || pricebookError.message || 'Unknown error';
            // Fall back to regular items if pricebook fetch fails
            setLoadingMessage('Loading products…');
            await loadProducts();
            showToast(`Failed to load pricebook items: ${errorMsg}. Showing all items.`, 'warning', 5000);
          }
        } else {
          // No pricebook, load regular items
          if (!customer.zohoId) {
            showToast('Customer has no Zoho ID. Cannot fetch pricebook items.', 'info', 3000);
          }
          setLoadingMessage('Loading products…');
          await loadProducts();
          // #region agent log
          fetch('http://127.0.0.1:1024/ingest/d43f1d4c-4d33-4f77-a4e3-9e9d56debc45',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'App.tsx:no pricebook loaded',message:'path no pricebook',data:{totalDurationMs:Date.now()-t0Continue},timestamp:Date.now(),hypothesisId:'H5'})}).catch(()=>{});
          // #endregion
        }
      } catch (error: any) {
        const errorMsg = error.response?.data?.message || error.message || 'Unknown error';
        // Set customer even if price list fetch fails
        setSelectedCustomer(customer);
        setCustomerTaxPreference(null);
        setCustomerCards([]);
        setLoadingMessage('Loading products…');
        await loadProducts();
        showToast(`Failed to fetch customer details: ${errorMsg}. Showing all items.`, 'warning', 5000);
      }
    } else {
      // No customer ID, set customer and load regular items
      setSelectedCustomer(customer);
      setCustomerTaxPreference(null);
      setCustomerCards([]);
      setLoadingMessage('Loading products…');
      await loadProducts();
    }
    } finally {
      setLoadingMessage(null);
    }
  };

  const handlePayNow = () => {
    if (cartItems.length === 0) {
      showAlert({ message: 'Cart is empty. Please add items before checkout.' });
      return;
    }
    
    if (!selectedCustomer) {
      showAlert({ message: 'Please select a customer before checkout.' });
      return;
    }
    
    // Check if any item has quantity 0
    const itemsWithZeroQty = cartItems.filter(item => !item.quantity || item.quantity === 0);
    if (itemsWithZeroQty.length > 0) {
      showAlert({ 
        message: `Please set quantity greater than 0 for all items. ${itemsWithZeroQty.length} item(s) have quantity 0.` 
      });
      return;
    }
    
    setIsPaymentModalOpen(true);
  };

  const handleConfirmPayment = async (paymentDetails: PaymentDetails): Promise<any> => {
    if (!user || !selectedCustomer) return;

    const subtotal = cartItems.reduce((sum, item) => {
      const itemPrice = getItemPrice(item);
      return sum + (itemPrice * item.quantity);
    }, 0);
    
    // Get customer tax preference
    let customerTaxPreference: 'STANDARD' | 'SALES TAX EXCEPTION CERTIFICATE' = 'STANDARD';
    try {
      const priceListRes = await customersAPI.getPriceList(selectedCustomer.id);
      if (priceListRes.success && priceListRes.data?.tax_preference === 'SALES TAX EXCEPTION CERTIFICATE') {
        customerTaxPreference = 'SALES TAX EXCEPTION CERTIFICATE';
      }
    } catch (err) {
      logger.error('Failed to get customer tax preference', err);
    }

    const isTaxExempt = customerTaxPreference === 'SALES TAX EXCEPTION CERTIFICATE';
    const tax = isTaxExempt ? 0 : subtotal * constants.TAX_RATE;
    const total = subtotal + tax;

    // Prepare payment details for API
    let paymentType = paymentDetails.method;
    const apiPaymentDetails: any = {};

    if (paymentDetails.method === 'cash') {
      apiPaymentDetails.cashReceived = paymentDetails.cashReceived || total;
    } else if (paymentDetails.method === 'card' || paymentDetails.method === 'credit_card' || paymentDetails.method === 'debit_card') {
      if (paymentDetails.useStandaloneMode) {
        // Standalone mode - no payment processing, just record the sale
        apiPaymentDetails.useStandaloneMode = true;
      } else if (paymentDetails.useValorApi) {
        // Valor API payment - already processed in PaymentModal
        // Just record the sale with the transaction ID
        apiPaymentDetails.useValorApi = true;
        apiPaymentDetails.terminalNumber = paymentDetails.terminalNumber;
        apiPaymentDetails.valorTransactionId = paymentDetails.valorTransactionId;
        // Payment already processed via Valor API, so we just need to record the sale
      } else if (paymentDetails.useEBizChargeTerminal) {
        apiPaymentDetails.useEBizChargeTerminal = true;
        apiPaymentDetails.terminalIP = paymentDetails.terminalIP;
      } else if (paymentDetails.useTerminal) {
        // PAX Terminal (Valor Connect) - uses terminalNumber, not terminalIP/terminalPort
        apiPaymentDetails.useTerminal = true;
        apiPaymentDetails.terminalNumber = paymentDetails.terminalNumber;
      } else if (paymentDetails.useBluetoothReader) {
        apiPaymentDetails.useBluetoothReader = true;
        apiPaymentDetails.bluetoothPayload = paymentDetails.bluetoothPayload;
      } else {
        apiPaymentDetails.cardNumber = paymentDetails.cardNumber;
        apiPaymentDetails.expirationDate = paymentDetails.expirationDate;
        apiPaymentDetails.cvv = paymentDetails.cvv;
        apiPaymentDetails.zip = paymentDetails.zip;
      }
    } else if (paymentDetails.useStoredPayment && paymentDetails.paymentProfileId) {
      // Stored payment method via CIM
      // Note: useStoredPayment and paymentProfileId will be added at root level below
      // Determine payment type from stored profile (will be determined on backend)
      // For now, set paymentType based on method
      const isAch = paymentDetails.method === 'ach';
      paymentType = isAch ? 'ach' : 'card';
    } else if (paymentDetails.method === 'zelle') {
      apiPaymentDetails.zelleConfirmation = paymentDetails.zelleConfirmation;
    } else if (paymentDetails.method === 'ach') {
      apiPaymentDetails.routingNumber = paymentDetails.achDetails?.routingNumber;
      apiPaymentDetails.accountNumber = paymentDetails.achDetails?.accountNumber;
      apiPaymentDetails.accountType = paymentDetails.achDetails?.accountType;
      apiPaymentDetails.nameOnAccount = paymentDetails.achDetails?.name;
      apiPaymentDetails.bankName = paymentDetails.achDetails?.bankName;
    }

    try {
      // Build request body - useBluetoothReader and bluetoothPayload need to be at root level
      const requestBody: any = {
        items: cartItems.map(item => {
          const itemPrice = getItemPrice(item);
          return {
            itemId: typeof item.product.id === 'number' ? item.product.id : parseInt(item.product.id),
            quantity: item.quantity,
            price: itemPrice, // Send converted price for dry ice items
            selectedUM: item.selectedUM || null, // Include selected unit of measure
          };
        }),
        customerId: selectedCustomer.id,
        paymentType: paymentType as any,
        paymentDetails: apiPaymentDetails,
        customerTaxPreference,
      };

      // Add useBluetoothReader and bluetoothPayload at root level if using USB card reader
      if (paymentDetails.useBluetoothReader) {
        requestBody.useBluetoothReader = true;
        requestBody.bluetoothPayload = paymentDetails.bluetoothPayload;
      }

      // Add useValorApi at root level if using Valor API
      if (paymentDetails.useValorApi) {
        requestBody.useValorApi = true;
        requestBody.terminalNumber = paymentDetails.terminalNumber;
        requestBody.valorTransactionId = paymentDetails.valorTransactionId;
      }

      // Add useTerminal at root level if using PAX terminal (Valor Connect)
      if (paymentDetails.useTerminal) {
        requestBody.useTerminal = true;
        requestBody.terminalNumber = paymentDetails.terminalNumber;
      }

      // Add useStandaloneMode at root level if using standalone card reader mode
      if (paymentDetails.useStandaloneMode) {
        requestBody.useStandaloneMode = true;
      }

      // Add useStoredPayment and paymentProfileId at root level if using stored payment method
      if (paymentDetails.useStoredPayment && paymentDetails.paymentProfileId) {
        requestBody.useStoredPayment = true;
        requestBody.paymentProfileId = paymentDetails.paymentProfileId;
      }

      const response = await salesAPI.create(requestBody);

      // Handle pending terminal payment (waiting for VP100 device)
      if (response.success && response.pending && (response.data as any)?.transactionId) {
        // Payment is pending - return to PaymentModal for polling
        // PaymentModal will handle the polling and notifications
        return {
          success: true,
          pending: true,
          message: response.message || 'Payment request sent to terminal. Waiting for customer to complete payment on VP100 device.',
          data: response.data
        };
      }

      if (response.success && response.data?.sale) {
        // Transform API sale to match UI format
        // Use sale.items from backend which have correct prices with UM conversion
        // Map backend SaleItem format to match frontend CartItem format for display
        const backendItems = (response.data.sale.items || []).map((saleItem: any) => {
          // Extract UM from itemName if it's in format "Item Name (UM)"
          const itemNameMatch = saleItem.itemName?.match(/^(.+?)\s*\((.+?)\)$/);
          const baseItemName = itemNameMatch ? itemNameMatch[1] : saleItem.itemName;
          const extractedUM = itemNameMatch ? itemNameMatch[2] : null;
          
          // Find matching cartItem to get product details and selectedUM
          const matchingCartItem = cartItems.find(ci => 
            String(ci.product.id) === String(saleItem.itemId)
          );
          
          return {
            ...saleItem,
            product: matchingCartItem?.product || { 
              id: saleItem.itemId, 
              name: baseItemName,
              price: saleItem.price 
            },
            selectedUM: matchingCartItem?.selectedUM || extractedUM || null,
            // Use the price from backend (already includes UM conversion)
            price: saleItem.price
          };
        });
        
        const sale: Sale = {
          ...response.data.sale,
          receiptNumber: response.data.sale.transactionId,
          customer: selectedCustomer,
          items: backendItems.length > 0 ? backendItems : cartItems, // Use backend items if available
          tax: response.data.sale.taxAmount,
          payment: paymentDetails,
          timestamp: new Date(response.data.sale.createdAt),
          cashier: constants.USER_NAME,
          zohoSynced: response.data.sale.syncedToZoho,
          zohoError: response.data.sale.syncError || undefined,
        };

        setCompletedSale(sale);
        setIsPaymentModalOpen(false);
        setCartItems([]);
        setSelectedCustomer(null);
        setCurrentScreen('receipt');
      } else {
        showAlert({ message: response.message || 'Failed to complete sale' });
      }
    } catch (err: any) {
      logger.error('Failed to create sale', err);
      showAlert({ message: err.message || 'An error occurred while processing the sale' });
    }
  };

  const handleNewSale = async () => {
    setSelectedCustomer(null);
    setCustomerTaxPreference(null);
    setCustomerCards([]);
    setCartItems([]);
    setCompletedSale(null);
    setCurrentScreen('pos');
    await loadProducts(); // Load regular items
  };

  const handleLogout = async () => {
    const confirmed = await showConfirm({
      message: 'Are you sure you want to logout?',
    });
    if (confirmed) {
      logout();
      setCurrentScreen('signin');
      setCartItems([]);
      setSelectedCustomer(null);
      setCompletedSale(null);
    }
  };

  // Show loading state while checking auth
  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-gray-500 dark:text-gray-400">Loading...</div>
      </div>
    );
  }

  if (currentScreen === 'receipt' && completedSale) {
    return (
      <ReceiptScreen
        sale={completedSale}
        storeName={constants.STORE_NAME}
        storeAddress={constants.STORE_ADDRESS}
        storePhone={constants.STORE_PHONE}
        userName={constants.USER_NAME}
        onNewSale={handleNewSale}
        onLogout={handleLogout}
        onNavigateToReports={navigationHandlers.toReports}
      />
    );
  }

  if (currentScreen === 'signin') {
    return (
      <SignIn
        onSignIn={() => setCurrentScreen('pos')}
        onNavigateToSignUp={() => setCurrentScreen('signup')}
      />
    );
  }

  if (currentScreen === 'signup') {
    return (
      <SignUp
        onSignUp={() => {
          setCurrentScreen('signin');
        }}
        onNavigateToSignIn={() => setCurrentScreen('signin')}
      />
    );
  }

  if (currentScreen === 'customers') {
    return (
      <PageWrapper
        storeName={constants.STORE_NAME}
        userName={constants.USER_NAME}
        userRole={user?.role || 'cashier'}
        userLocation={user?.locationName || 'Store'}
        onLogout={handleLogout}
        onNavigateToPOS={navigationHandlers.toPOS}
        onNavigateToCustomers={navigationHandlers.toCustomers}
        onNavigateToReports={navigationHandlers.toReports}
        onNavigateToSettings={navigationHandlers.toSettings}
        onNavigateToAdmin={navigationHandlers.toAdmin}
      >
        <Customers customers={customers} />
      </PageWrapper>
    );
  }

  if (currentScreen === 'reports') {
    return (
      <PageWrapper
        storeName={constants.STORE_NAME}
        userName={constants.USER_NAME}
        userRole={user?.role || 'cashier'}
        userLocation={user?.locationName || 'Store'}
        onLogout={handleLogout}
        onNavigateToPOS={navigationHandlers.toPOS}
        onNavigateToCustomers={navigationHandlers.toCustomers}
        onNavigateToReports={navigationHandlers.toReports}
        onNavigateToSettings={navigationHandlers.toSettings}
        onNavigateToAdmin={navigationHandlers.toAdmin}
      >
        <Reports
          transactions={[]}
          userLocationId={user?.locationId || ''}
          storeName={constants.STORE_NAME}
          storeAddress={constants.STORE_ADDRESS}
          storePhone={constants.STORE_PHONE}
          userName={constants.USER_NAME}
          userRole={user?.role || 'cashier'}
        />
      </PageWrapper>
    );
  }

  if (currentScreen === 'settings') {
    return (
      <PageWrapper
        storeName={constants.STORE_NAME}
        userName={constants.USER_NAME}
        userRole={user?.role || 'cashier'}
        userLocation={user?.locationName || 'Store'}
        onLogout={handleLogout}
        onNavigateToPOS={navigationHandlers.toPOS}
        onNavigateToCustomers={navigationHandlers.toCustomers}
        onNavigateToReports={navigationHandlers.toReports}
        onNavigateToSettings={navigationHandlers.toSettings}
        onNavigateToAdmin={navigationHandlers.toAdmin}
      >
        <Settings
          locationId={user?.locationId || ''}
          locationName={user?.locationName || ''}
          userName={constants.USER_NAME}
          userRole={user?.role || 'cashier'}
        />
      </PageWrapper>
    );
  }

  if (currentScreen === 'admin') {
    return (
      <PageWrapper
        storeName={constants.STORE_NAME}
        userName={constants.USER_NAME}
        userRole={user?.role || 'cashier'}
        userLocation={user?.locationName || 'Store'}
        onLogout={handleLogout}
        onNavigateToPOS={navigationHandlers.toPOS}
        onNavigateToCustomers={navigationHandlers.toCustomers}
        onNavigateToReports={navigationHandlers.toReports}
        onNavigateToSettings={navigationHandlers.toSettings}
        onNavigateToAdmin={navigationHandlers.toAdmin}
      >
        <AdminPage currentUser={user ? { useremail: user.useremail, role: user.role } : { useremail: '', role: 'cashier' }} />
      </PageWrapper>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 relative">
      {/* Loading overlay with icon and process text */}
      {loadingMessage && (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4 bg-black/40 dark:bg-black/50 backdrop-blur-[2px]">
          <Loader2 className="w-12 h-12 text-blue-600 dark:text-blue-400 animate-spin flex-shrink-0" aria-hidden />
          <p className="text-gray-100 dark:text-gray-100 font-medium text-center text-lg tabular-nums">
            {loadingMessage}
          </p>
        </div>
      )}

      <TopNavigation
        storeName={constants.STORE_NAME}
        userName={constants.USER_NAME}
        onLogout={handleLogout}
        onNavigateToPOS={navigationHandlers.toPOS}
        onNavigateToCustomers={navigationHandlers.toCustomers}
        onNavigateToReports={navigationHandlers.toReports}
        onNavigateToSettings={navigationHandlers.toSettings}
        onNavigateToAdmin={navigationHandlers.toAdmin}
        userRole={user?.role || 'cashier'}
        userLocation={user?.locationName || 'Store'}
      />

        <div className="pt-[73px] h-screen flex flex-col md:flex-row">
        {/* Left Panel - Shopping Cart */}
        <div className="w-full md:w-[400px] lg:w-[450px] flex-shrink-0 h-1/2 md:h-auto">
          <ShoppingCart
            customers={customers}
            selectedCustomer={selectedCustomer}
            customerTaxPreference={customerTaxPreference}
            customerCards={customerCards}
            onSelectCustomer={handleSelectCustomer}
            cartItems={cartItems}
            onUpdateQuantity={handleUpdateQuantity}
            onUpdateUM={handleUpdateUM}
            onRemoveItem={handleRemoveItem}
            onClearCart={handleClearCart}
            onPayNow={handlePayNow}
            taxRate={constants.TAX_RATE}
          />
        </div>

        {/* Right Panel - Product Selection */}
        <div className="flex-1 overflow-hidden h-1/2 md:h-auto">
          {loadingProducts ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-gray-500 dark:text-gray-400">Loading products...</div>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-red-500 dark:text-red-400">{error}</div>
            </div>
          ) : (
            <ProductSelection
              products={products}
              selectedCustomer={selectedCustomer}
              onAddToCart={handleAddToCart}
            />
          )}
        </div>
      </div>

      {/* Payment Modal */}
      <PaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        total={totalsForReceipt.total}
        subtotal={totalsForReceipt.subtotal}
        tax={totalsForReceipt.tax}
        taxRate={constants.TAX_RATE}
        isTaxExempt={customerTaxPreference === 'SALES TAX EXCEPTION CERTIFICATE' || selectedCustomer?.taxExempt || false}
        cartItems={cartItems}
        onConfirmPayment={handleConfirmPayment}
        context="sale"
        userTerminalNumber={user?.terminalNumber}
        userTerminalIP={user?.terminalIP}
        userTerminalPort={user?.terminalPort}
        cardReaderMode={user?.cardReaderMode || 'integrated'}
        customerId={selectedCustomer?.id || null}
        customerName={selectedCustomer?.name || selectedCustomer?.contactName || null}
      />

      {/* POS Payment Modal for Zoho invoices/sales orders */}
      <PaymentModal
        isOpen={isZohoDocsPaymentModalOpen}
        onClose={() => setIsZohoDocsPaymentModalOpen(false)}
        total={zohoDocsTotals.total}
        subtotal={zohoDocsTotals.subtotal}
        tax={zohoDocsTotals.tax}
        taxRate={constants.TAX_RATE}
        isTaxExempt={customerTaxPreference === 'SALES TAX EXCEPTION CERTIFICATE' || selectedCustomer?.taxExempt || false}
        cartItems={zohoDocsCartItems}
        onConfirmPayment={handleConfirmZohoDocsPayment}
        context="zohoDocuments"
        userTerminalNumber={user?.terminalNumber}
        userTerminalIP={user?.terminalIP}
        userTerminalPort={user?.terminalPort}
        cardReaderMode={user?.cardReaderMode || 'integrated'}
        customerId={selectedCustomer?.id || null}
        customerName={selectedCustomer?.name || selectedCustomer?.contactName || null}
      />

      {/* Invoice Modal */}
      {selectedCustomer && (
        <SalesOrderInvoiceModal
          isOpen={isOrderInvoiceModalOpen}
          onClose={() => {
            setIsOrderInvoiceModalOpen(false);
            setOpenSalesOrders([]);
            setInvoices([]);
            // Continue with customer selection if modal is closed without selecting
            if (selectedCustomer) {
              continueCustomerSelection(selectedCustomer);
            }
          }}
          salesOrders={openSalesOrders}
          invoices={invoices}
          onSelectItems={handleSelectOrdersInvoices}
          customerName={selectedCustomer.name || selectedCustomer.contactName}
        />
      )}

      {/* Payment Method Selector Modal - selecting a method opens receipt preview first */}
      {selectedCustomer && (
        <PaymentMethodSelector
          isOpen={isPaymentMethodSelectorOpen}
          onClose={() => {
            setIsPaymentMethodSelectorOpen(false);
            setPendingChargeItems([]);
          }}
          onSelect={(profileId, profileType) => {
            handleOpenReceiptPreview(profileId, profileType);
            setIsPaymentMethodSelectorOpen(false);
          }}
          customerId={selectedCustomer.id}
          customerName={selectedCustomer.name || selectedCustomer.contactName || 'Customer'}
          loading={loadingOrders}
          totalAmount={pendingChargeItems.length > 0 ? (pendingChargeItems as any[]).reduce((sum: number, it: any) => sum + (Number(it.amount) || 0), 0) : undefined}
        />
      )}

      {/* Invoice payment receipt preview - confirm before charging stored payment */}
      {selectedCustomer && pendingStoredPaymentSelection && pendingChargeItems.length > 0 && (
        <InvoicePaymentReceiptPreview
          isOpen={isInvoicePaymentReceiptPreviewOpen}
          onClose={() => {
            setIsInvoicePaymentReceiptPreviewOpen(false);
            setPendingStoredPaymentSelection(null);
            setPendingChargeItems([]);
          }}
          storeName={constants.STORE_NAME}
          customerName={selectedCustomer.name || selectedCustomer.contactName || 'Customer'}
          items={pendingChargeItems.map((it: any) => ({
            type: it.type === 'invoice' ? 'invoice' : 'sales_order',
            id: String(it.id),
            number: it.number || it.id,
            amount: Number(it.amount) || 0,
          }))}
          paymentMethodLabel={pendingStoredPaymentSelection.profileType === 'ach' ? 'ACH / Bank Account' : 'Card'}
          subtotal={(pendingChargeItems as any[]).reduce((sum: number, it: any) => sum + (Number(it.amount) || 0), 0)}
          ccSurcharge={pendingStoredPaymentSelection.profileType === 'card' ? Math.round((pendingChargeItems as any[]).reduce((sum: number, it: any) => sum + (Number(it.amount) || 0), 0) * 0.03 * 100) / 100 : 0}
          totalWithFee={(pendingChargeItems as any[]).reduce((sum: number, it: any) => sum + (Number(it.amount) || 0), 0) + (pendingStoredPaymentSelection.profileType === 'card' ? Math.round((pendingChargeItems as any[]).reduce((sum: number, it: any) => sum + (Number(it.amount) || 0), 0) * 0.03 * 100) / 100 : 0)}
          onConfirmPay={async () => {
            if (!pendingStoredPaymentSelection) return;
            await handlePaymentMethodSelected(pendingStoredPaymentSelection.paymentProfileId, pendingStoredPaymentSelection.profileType);
            setPendingStoredPaymentSelection(null);
            setIsInvoicePaymentReceiptPreviewOpen(false);
          }}
          loading={loadingOrders}
        />
      )}

      {/* Payment Options (Zoho vs POS methods) */}
      {selectedCustomer && (
        <ZohoPaymentOptionsModal
          isOpen={isZohoPaymentOptionsOpen}
          onClose={() => setIsZohoPaymentOptionsOpen(false)}
          customerName={selectedCustomer.name || selectedCustomer.contactName || 'Customer'}
          itemCount={pendingChargeItems.length}
          totalAmount={(pendingChargeItems || []).reduce((sum: number, it: any) => sum + (Number(it.amount) || 0), 0)}
          onChooseZohoPayment={() => {
            setIsZohoPaymentOptionsOpen(false);
            setIsPaymentMethodSelectorOpen(true);
          }}
          onChoosePosPayment={() => {
            setIsZohoPaymentOptionsOpen(false);
            openZohoDocsPosPaymentModal();
          }}
        />
      )}
    </div>
  );
}