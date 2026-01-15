import React, { useState, useEffect, useRef } from 'react';
import { TopNavigation } from './components/TopNavigation';
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
import { Customer, Product, CartItem, PaymentDetails, Sale } from './types';
import { itemsAPI, customersAPI, salesAPI, zohoAPI } from '../services/api';
import { SalesOrderInvoiceModal } from './components/SalesOrderInvoiceModal';
import { PaymentMethodSelector } from './components/PaymentMethodSelector';
import { isVendorContact } from './utils/contactType';
import { useToast } from './contexts/ToastContext';

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
  const [isPaymentMethodSelectorOpen, setIsPaymentMethodSelectorOpen] = useState(false);
  const [pendingChargeItems, setPendingChargeItems] = useState<any[]>([]);

  // Constants from user data
  const TAX_RATE = user?.taxPercentage ? user.taxPercentage / 100 : 0.0825;
  const STORE_NAME = user?.locationName || 'Store';
  const STORE_ADDRESS = '123 Main Street, Suite 100, City, ST 12345'; // Could come from API
  const STORE_PHONE = '(555) 123-4567'; // Could come from API
  const USER_NAME = user?.username || 'User';

  // Load products and customers when authenticated
  useEffect(() => {
    if (isAuthenticated && user) {
      loadProducts();
      loadCustomers();
    }
  }, [isAuthenticated, user]);

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

  const loadProducts = async () => {
    setLoadingProducts(true);
    setError('');
    try {
      const response = await itemsAPI.getAll({ isActive: true });
      if (response.success && response.data?.items) {
        // Transform API products to match UI format
        const transformedProducts: Product[] = response.data.items.map((item: any) => {
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
      console.error('Failed to load products:', err);
      setError('Failed to load products');
    } finally {
      setLoadingProducts(false);
    }
  };

  const loadCustomers = async () => {
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
      console.error('Failed to load customers:', err);
    } finally {
      setLoadingCustomers(false);
    }
  };

  // Handle customer selection with pricebook integration
  const handleSelectCustomer = async (customer: Customer | null) => {
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
        // Check both sales orders and invoices in parallel
        const [soResponse, invoiceResponse] = await Promise.all([
          zohoAPI.getCustomerOpenSalesOrders(customer.zohoId).catch(() => ({ success: false, data: { salesOrders: [] } })),
          zohoAPI.getCustomerInvoices(customer.zohoId, 'unpaid').catch(() => ({ success: false, data: { invoices: [] } }))
        ]);

        const salesOrders = soResponse.success && soResponse.data?.salesOrders ? soResponse.data.salesOrders : [];
        const invoiceList = invoiceResponse.success && invoiceResponse.data?.invoices ? invoiceResponse.data.invoices : [];

        setOpenSalesOrders(salesOrders);
        setInvoices(invoiceList);

        // Show modal if we have any sales orders or invoices
        if (salesOrders.length > 0 || invoiceList.length > 0) {
          setIsOrderInvoiceModalOpen(true);
          setLoadingOrders(false);
          return;
        }
      } catch (err: any) {
        console.error('Failed to check for sales orders/invoices:', err);
        setOpenSalesOrders([]);
        setInvoices([]);
      } finally {
        setLoadingOrders(false);
      }
    } else {
      setOpenSalesOrders([]);
      setInvoices([]);
    }

    // Continue with customer selection (this will be called after SO/Invoice check or if none found)
    await continueCustomerSelection(customer);
  };

  // Shopping cart functions
  const handleAddToCart = (product: Product) => {
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
      setCartItems([...cartItems, { product, quantity: 1 }]);
    }
  };

  const handleUpdateQuantity = (productId: number | string, quantity: number) => {
    setCartItems(cartItems.map(item =>
      String(item.product.id) === String(productId)
        ? { ...item, quantity: Math.max(1, quantity) }
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

  // Handle selection of sales orders and/or invoices - show payment method selector first
  const handleSelectOrdersInvoices = async (items: any[]) => {
    if (items.length === 0) return;

    if (!selectedCustomer || !selectedCustomer.id) {
      showToast('Customer must be selected to charge invoices/sales orders', 'error', 4000);
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
      } else if (item.type === 'salesorder') {
        // For sales orders, use total
        return {
          type: 'salesorder' as const,
          id: item.salesorder_id,
          number: item.salesorder_number,
          amount: parseFloat(item.total)
        };
      }
      return null;
    }).filter(Boolean) as Array<{
      type: 'invoice' | 'salesorder';
      id: string;
      number: string;
      amount: number;
    }>;

    if (chargeItems.length === 0) {
      showToast('No valid items to charge', 'error', 4000);
      return;
    }

    // Store items and show payment method selector
    setPendingChargeItems(chargeItems);
    setIsOrderInvoiceModalOpen(false);
    setOpenSalesOrders([]);
    setInvoices([]);
    setIsPaymentMethodSelectorOpen(true);
  };

  // Handle payment method selection and charge
  const handlePaymentMethodSelected = async (paymentProfileId: string) => {
    if (!selectedCustomer || !selectedCustomer.id || pendingChargeItems.length === 0) {
      return;
    }

    try {
      // Show loading state
      setLoadingOrders(true);
      setIsPaymentMethodSelectorOpen(false);

      // Charge invoices/sales orders via Authorize.net CIM
      const response = await salesAPI.chargeInvoicesSalesOrders({
        customerId: selectedCustomer.id,
        paymentProfileId,
        items: pendingChargeItems
      });

      if (response.success && response.data) {
        const { results, errors, summary } = response.data;

        // Clear pending items
        setPendingChargeItems([]);

        // Check for transactions under review
        const underReviewItems = results.filter(r => r.underReview);
        const approvedItems = results.filter(r => !r.underReview);

        // Show results
        if (summary.successful > 0) {
          const totalAmount = results.reduce((sum, r) => sum + r.amount, 0);
          
          if (underReviewItems.length > 0 && approvedItems.length === 0) {
            // All transactions are under review
            const reviewNumbers = underReviewItems.map(r => `${r.type} ${r.number}`).join(', ');
            showAlert({
              title: 'Transactions Under Review',
              message: `${underReviewItems.length} transaction(s) submitted but are under review by Authorize.net:\n\n${reviewNumbers}\n\nPlease check your Authorize.net merchant interface to approve or decline these transactions.`
            });
          } else if (underReviewItems.length > 0) {
            // Some approved, some under review
            const reviewNumbers = underReviewItems.map(r => `${r.type} ${r.number}`).join(', ');
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
          const errorMessages = errors.map(e => `${e.item.type} ${e.item.number}: ${e.error}`).join('\n');
          showAlert({
            title: 'Some charges failed',
            message: `Failed to charge ${summary.failed} item(s):\n\n${errorMessages}`
          });
        }

        // If all succeeded and none are under review, show detailed success message
        if (summary.failed === 0 && underReviewItems.length === 0) {
          const transactionIds = results.map(r => r.transactionId).join(', ');
          showToast(
            `All charges processed successfully. Transaction IDs: ${transactionIds}`,
            'success',
            6000
          );
        }
      } else {
        showToast(
          response.error || 'Failed to charge invoices/sales orders',
          'error',
          5000
        );
      }
    } catch (err: any) {
      console.error('Failed to charge invoices/sales orders:', err);
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

    // Fetch customer pricebook and items from pricebook
    if (customer.id) {
      try {
        // Get customer's pricebook name, tax preference, cards, and last_four_digits
        const priceListRes = await customersAPI.getPriceList(customer.id);
        const pricebookName = priceListRes.data?.pricebook_name;
        const taxPreference = priceListRes.data?.tax_preference;
        const cards = priceListRes.data?.cards || [];
        const last_four_digits = priceListRes.data?.last_four_digits;
        const card_type = priceListRes.data?.card_type;
        const has_card_info = priceListRes.data?.has_card_info;
        const card_info_checked = priceListRes.data?.card_info_checked;
        const bank_account_last4 = priceListRes.data?.bank_account_last4;
        
        // Update customer object with card info and bank account info
        const updatedCustomer: Customer = {
          ...customer,
          last_four_digits: last_four_digits || customer.last_four_digits,
          cardBrand: card_type || customer.cardBrand,
          bankAccountLast4: bank_account_last4 || customer.bankAccountLast4,
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
          // Fetch items from the pricebook (includes both pricebook items and regular items)
          try {
            const pricebookItemsRes = await itemsAPI.getFromPricebook(pricebookName);
            const allItems = pricebookItemsRes.data?.items || [];
            const pricebookItemsCount = pricebookItemsRes.data?.pricebookItemsCount || 0;
            
            if (allItems.length > 0) {
              // Transform pricebook items
              const transformedProducts: Product[] = allItems.map((item: any) => {
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
                showToast(
                  `Loaded ${allItems.length} items (${pricebookItemsCount} with pricebook prices, ${allItems.length - pricebookItemsCount} with regular prices)`,
                  'success',
                  4000
                );
              } else {
                showToast(`Loaded ${allItems.length} items with regular prices`, 'info', 3000);
              }
            } else {
              // If no items, fall back to regular items
              await loadProducts();
              showToast(`No items found in pricebook. Showing all items.`, 'info', 3000);
            }
          } catch (pricebookError: any) {
            const errorMsg = pricebookError.response?.data?.message || pricebookError.message || 'Unknown error';
            // Fall back to regular items if pricebook fetch fails
            await loadProducts();
            showToast(`Failed to load pricebook items: ${errorMsg}. Showing all items.`, 'warning', 5000);
          }
        } else {
          // No pricebook, load regular items
          if (!customer.zohoId) {
            showToast('Customer has no Zoho ID. Cannot fetch pricebook items.', 'info', 3000);
          }
          await loadProducts();
        }
      } catch (error: any) {
        const errorMsg = error.response?.data?.message || error.message || 'Unknown error';
        // Set customer even if price list fetch fails
        setSelectedCustomer(customer);
        setCustomerTaxPreference(null);
        setCustomerCards([]);
        // Fall back to regular items
        await loadProducts();
        showToast(`Failed to fetch customer details: ${errorMsg}. Showing all items.`, 'warning', 5000);
      }
    } else {
      // No customer ID, set customer and load regular items
      setSelectedCustomer(customer);
      setCustomerTaxPreference(null);
      setCustomerCards([]);
      await loadProducts();
    }
  };

  const handlePayNow = () => {
    if (cartItems.length > 0 && selectedCustomer) {
      setIsPaymentModalOpen(true);
    }
  };

  const handleConfirmPayment = async (paymentDetails: PaymentDetails): Promise<any> => {
    if (!user || !selectedCustomer) return;

    const subtotal = cartItems.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);
    
    // Get customer tax preference
    let customerTaxPreference: 'STANDARD' | 'SALES TAX EXCEPTION CERTIFICATE' = 'STANDARD';
    try {
      const priceListRes = await customersAPI.getPriceList(selectedCustomer.id);
      if (priceListRes.success && priceListRes.data?.tax_preference === 'SALES TAX EXCEPTION CERTIFICATE') {
        customerTaxPreference = 'SALES TAX EXCEPTION CERTIFICATE';
      }
    } catch (err) {
      console.error('Failed to get customer tax preference:', err);
    }

    const isTaxExempt = customerTaxPreference === 'SALES TAX EXCEPTION CERTIFICATE';
    const tax = isTaxExempt ? 0 : subtotal * TAX_RATE;
    const total = subtotal + tax;

    // Prepare payment details for API
    let paymentType = paymentDetails.method;
    const apiPaymentDetails: any = {};

    if (paymentDetails.method === 'cash') {
      apiPaymentDetails.cashReceived = paymentDetails.cashReceived || total;
    } else if (paymentDetails.method === 'credit_card' || paymentDetails.method === 'debit_card') {
      if (paymentDetails.useValorApi) {
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
      paymentType = isAch ? 'ach' : 'credit_card';
    } else if (paymentDetails.method === 'zelle') {
      apiPaymentDetails.zelleConfirmation = paymentDetails.zelleConfirmation;
    }

    try {
      // Build request body - useBluetoothReader and bluetoothPayload need to be at root level
      const requestBody: any = {
        items: cartItems.map(item => ({
          itemId: typeof item.product.id === 'number' ? item.product.id : parseInt(item.product.id),
          quantity: item.quantity,
        })),
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
        const sale: Sale = {
          ...response.data.sale,
          receiptNumber: response.data.sale.transactionId,
          customer: selectedCustomer,
          items: cartItems,
          tax: response.data.sale.taxAmount,
          payment: paymentDetails,
          timestamp: new Date(response.data.sale.createdAt),
          cashier: USER_NAME,
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
      console.error('Failed to create sale:', err);
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

  // Calculate totals for payment modal
  const subtotal = cartItems.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);
  const isTaxExempt = selectedCustomer?.taxExempt || false;
  const tax = isTaxExempt ? 0 : subtotal * TAX_RATE;
  const total = subtotal + tax;

  if (currentScreen === 'receipt' && completedSale) {
    return (
      <ReceiptScreen
        sale={completedSale}
        storeName={STORE_NAME}
        storeAddress={STORE_ADDRESS}
        storePhone={STORE_PHONE}
        userName={USER_NAME}
        onNewSale={handleNewSale}
        onLogout={handleLogout}
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
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <TopNavigation
          storeName={STORE_NAME}
          userName={USER_NAME}
          onLogout={handleLogout}
          onNavigateToPOS={() => setCurrentScreen('pos')}
          onNavigateToCustomers={() => setCurrentScreen('customers')}
          onNavigateToReports={() => setCurrentScreen('reports')}
          onNavigateToSettings={() => setCurrentScreen('settings')}
          onNavigateToAdmin={() => setCurrentScreen('admin')}
          userRole={user?.role || 'cashier'}
          userLocation={user?.locationName || 'Store'}
        />
        <div className="pt-[73px]">
          <Customers customers={customers} />
        </div>
      </div>
    );
  }

  if (currentScreen === 'reports') {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <TopNavigation
          storeName={STORE_NAME}
          userName={USER_NAME}
          onLogout={handleLogout}
          onNavigateToPOS={() => setCurrentScreen('pos')}
          onNavigateToCustomers={() => setCurrentScreen('customers')}
          onNavigateToReports={() => setCurrentScreen('reports')}
          onNavigateToSettings={() => setCurrentScreen('settings')}
          onNavigateToAdmin={() => setCurrentScreen('admin')}
          userRole={user?.role || 'cashier'}
          userLocation={user?.locationName || 'Store'}
        />
        <div className="pt-[73px]">
          <Reports transactions={[]} userLocationId={user?.locationId || ''} />
        </div>
      </div>
    );
  }

  if (currentScreen === 'settings') {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <TopNavigation
          storeName={STORE_NAME}
          userName={USER_NAME}
          onLogout={handleLogout}
          onNavigateToPOS={() => setCurrentScreen('pos')}
          onNavigateToCustomers={() => setCurrentScreen('customers')}
          onNavigateToReports={() => setCurrentScreen('reports')}
          onNavigateToSettings={() => setCurrentScreen('settings')}
          onNavigateToAdmin={() => setCurrentScreen('admin')}
          userRole={user?.role || 'cashier'}
          userLocation={user?.locationName || 'Store'}
        />
        <div className="pt-[73px]">
          <Settings
            locationId={user?.locationId || ''}
            locationName={user?.locationName || ''}
            userName={USER_NAME}
            userRole={user?.role || 'cashier'}
          />
        </div>
      </div>
    );
  }

  if (currentScreen === 'admin') {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <TopNavigation
          storeName={STORE_NAME}
          userName={USER_NAME}
          onLogout={handleLogout}
          onNavigateToPOS={() => setCurrentScreen('pos')}
          onNavigateToCustomers={() => setCurrentScreen('customers')}
          onNavigateToReports={() => setCurrentScreen('reports')}
          onNavigateToSettings={() => setCurrentScreen('settings')}
          onNavigateToAdmin={() => setCurrentScreen('admin')}
          userRole={user?.role || 'cashier'}
          userLocation={user?.locationName || 'Store'}
        />
        <AdminPage currentUser={user ? { username: user.username, role: user.role } : { username: '', role: 'cashier' }} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <TopNavigation
        storeName={STORE_NAME}
        userName={USER_NAME}
        onLogout={handleLogout}
        onNavigateToPOS={() => setCurrentScreen('pos')}
        onNavigateToCustomers={() => setCurrentScreen('customers')}
        onNavigateToReports={() => setCurrentScreen('reports')}
        onNavigateToSettings={() => setCurrentScreen('settings')}
        onNavigateToAdmin={() => setCurrentScreen('admin')}
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
            onRemoveItem={handleRemoveItem}
            onClearCart={handleClearCart}
            onPayNow={handlePayNow}
            taxRate={TAX_RATE}
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
        total={total}
        subtotal={subtotal}
        tax={tax}
        cartItems={cartItems}
        onConfirmPayment={handleConfirmPayment}
        userTerminalNumber={user?.terminalNumber}
        userTerminalIP={user?.terminalIP}
        userTerminalPort={user?.terminalPort}
        customerId={selectedCustomer?.id || null}
        customerName={selectedCustomer?.name || selectedCustomer?.contactName || null}
      />

      {/* Unified Sales Order & Invoice Modal */}
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

      {/* Payment Method Selector Modal */}
      {selectedCustomer && (
        <PaymentMethodSelector
          isOpen={isPaymentMethodSelectorOpen}
          onClose={() => {
            setIsPaymentMethodSelectorOpen(false);
            setPendingChargeItems([]);
          }}
          onSelect={handlePaymentMethodSelected}
          customerId={selectedCustomer.id}
          customerName={selectedCustomer.name || selectedCustomer.contactName || 'Customer'}
          loading={loadingOrders}
        />
      )}
    </div>
  );
}