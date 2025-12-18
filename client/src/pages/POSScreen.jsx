import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { itemsAPI, customersAPI, salesAPI, zohoAPI, printerAPI } from '../services/api';
import ItemSelector from '../components/ItemSelector';
import Cart from '../components/Cart';
import PaymentModal from '../components/PaymentModal';
import ReceiptScreen from '../components/ReceiptScreen';
import TopNavigation from '../components/TopNavigation';
import { showToast } from '../components/ToastContainer';
import { isVendorContact } from '../utils/contactType';

// Resolve a user's tax percentage, falling back to numbers embedded in the
// location name (e.g., "Miami Dade Sales Tax (7%)") before defaulting.
const resolveUserTaxPercentage = (user) => {
  const direct = parseFloat(user?.taxPercentage);
  if (!Number.isNaN(direct) && Number.isFinite(direct)) {
    return direct;
  }

  const name = user?.locationName || '';
  const match = name.match(/(\d+(?:\.\d+)?)\s*%/);
  if (match) {
    const fromName = parseFloat(match[1]);
    if (!Number.isNaN(fromName) && Number.isFinite(fromName)) {
      return fromName;
    }
  }

  return 7.5;
};

const POSScreen = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [cart, setCart] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerTaxPreference, setCustomerTaxPreference] = useState(null);
  const [customerCards, setCustomerCards] = useState([]);
  const [customerSelected, setCustomerSelected] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [paymentType, setPaymentType] = useState(null);
  const [receiptData, setReceiptData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [printerStatus, setPrinterStatus] = useState('checking');

  useEffect(() => {
    // If admin somehow hits POS route, redirect them to admin dashboard
    if (user && user.role === 'admin') {
      navigate('/admin', { replace: true });
      return;
    }

    loadData();
    checkPrinterStatus();
  }, [user]);

  const checkPrinterStatus = async () => {
    try {
      const response = await printerAPI.test();
      if (response.data.success) {
        setPrinterStatus('online');
      } else {
        setPrinterStatus('offline');
      }
    } catch (error) {
      setPrinterStatus('offline');
    }
  };

  const loadData = async () => {
    try {
      setLoading(true);
      const [itemsRes, customersRes] = await Promise.all([
        itemsAPI.getAll({ isActive: true }),
        customersAPI.getAll({ isActive: true })
      ]);
      
      setItems(itemsRes.data.data?.items || itemsRes.data.items || []);
      setCustomers(customersRes.data.data?.customers || customersRes.data.customers || []);
    } catch (err) {
      const errorMsg = err.formattedMessage || err.message || 'Failed to load data. Please refresh the page.';
      showToast(errorMsg, 'error', 5000);
    } finally {
      setLoading(false);
    }
  };

  const handleSyncNow = async () => {
    if (isSyncing) return;

    setIsSyncing(true);
    try {
      const response = await zohoAPI.syncAll();
      await loadData();
      
      const syncData = response.data.data || response.data;
      const itemsTotal = syncData?.items?.total || syncData?.items?.length || 0;
      const customersTotal = syncData?.customers?.total || syncData?.customers?.length || 0;
      
      showToast(
        `Synced: ${itemsTotal} items, ${customersTotal} customers`,
        'success',
        4000
      );
    } catch (error) {
      const errorMsg = error.formattedMessage || error.response?.data?.message || 'Sync failed';
      showToast(errorMsg, 'error', 5000);
    } finally {
      setIsSyncing(false);
    }
  };

  const addToCart = useCallback((item) => {
    setCart(prevCart => {
      const existingItem = prevCart.find(i => i.id === item.id);
      if (existingItem) {
        return prevCart.map(i => 
          i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i
        );
      } else {
        return [...prevCart, { ...item, quantity: 1 }];
      }
    });
    showToast('Item added to cart', 'success', 2000);
  }, []);

  const updateQuantity = useCallback((itemId, quantity) => {
    setCart(prevCart => {
      if (quantity <= 0) {
        return prevCart.filter(i => i.id !== itemId);
      } else {
        return prevCart.map(i => 
          i.id === itemId ? { ...i, quantity } : i
        );
      }
    });
  }, []);

  const removeFromCart = useCallback((itemId) => {
    setCart(prevCart => prevCart.filter(i => i.id !== itemId));
  }, []);

  const handleSelectCustomer = async (customer) => {
    if (customer && isVendorContact(customer.contactType)) {
      showToast('Only Zoho customer contacts can be selected for POS checkouts.', 'warning', 4000);
      return;
    }
    setSelectedCustomer(customer);
    setCustomerSelected(true);
    
    // Fetch customer pricebook and items from pricebook
    if (customer && customer.id) {
      try {
        // Get customer's pricebook name, tax preference, cards, and last_four_digits
        const priceListRes = await customersAPI.getPriceList(customer.id);
        const pricebookName = priceListRes.data.data?.pricebook_name;
        const taxPreference = priceListRes.data.data?.tax_preference;
        const cards = priceListRes.data.data?.cards || [];
        const last_four_digits = priceListRes.data.data?.last_four_digits;
        const card_type = priceListRes.data.data?.card_type;
        const has_card_info = priceListRes.data.data?.has_card_info;
        const card_info_checked = priceListRes.data.data?.card_info_checked;
        
        // Update customer object with card info
        setSelectedCustomer({
          ...customer,
          last_four_digits: last_four_digits || customer.last_four_digits,
          cardBrand: card_type || customer.cardBrand,
          has_card_info: has_card_info !== undefined ? has_card_info : customer.has_card_info,
          card_info_checked: card_info_checked !== undefined ? card_info_checked : customer.card_info_checked
        });
        
        // Store tax preference and cards for display
        setCustomerTaxPreference(taxPreference);
        setCustomerCards(cards);
        
        if (pricebookName) {
          // Fetch items from the pricebook (includes both pricebook items and regular items)
          try {
            const pricebookItemsRes = await itemsAPI.getFromPricebook(pricebookName);
            const allItems = pricebookItemsRes.data.data?.items || [];
            const pricebookItemsCount = pricebookItemsRes.data.data?.pricebookItemsCount || 0;
            
            if (allItems.length > 0) {
              // Update items with merged list (pricebook items have custom prices, others have regular prices)
              setItems(allItems);
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
              await loadData();
              showToast(`No items found in pricebook. Showing all items.`, 'info', 3000);
            }
          } catch (pricebookError) {
            const errorMsg = pricebookError.response?.data?.message || pricebookError.message || 'Unknown error';
            // Fall back to regular items if pricebook fetch fails
            await loadData();
            showToast(`Failed to load pricebook items: ${errorMsg}. Showing all items.`, 'warning', 5000);
          }
        } else {
          // No pricebook, load regular items
          if (!customer.zohoId) {
            showToast('Customer has no Zoho ID. Cannot fetch pricebook items.', 'info', 3000);
          }
          await loadData();
        }
      } catch (error) {
        const errorMsg = error.response?.data?.message || error.message || 'Unknown error';
        // Fall back to regular items
        await loadData();
        showToast(`Failed to fetch customer details: ${errorMsg}. Showing all items.`, 'warning', 5000);
      }
    } else {
      // No customer selected, load regular items
      await loadData();
    }
  };

  const clearCart = useCallback(() => {
    setCart([]);
    setSelectedCustomer(null); // Reset to Walk-in Customer
    setCustomerTaxPreference(null); // Reset tax preference
    setCustomerCards([]); // Reset customer cards
    setCustomerSelected(false); // Reset selection state
  }, []);

  const handleCheckout = useCallback((type) => {
    setPaymentType(type);
    setShowPayment(true);
  }, []);

  const calculateTotal = useMemo(() => {
    // Check if customer is tax exempt
    const isTaxExempt = customerTaxPreference === 'SALES TAX EXCEPTION CERTIFICATE';
    
    // Get tax percentage from user, default to 7.5% if not available
    // But set to 0 if customer is tax exempt
    const taxRate = isTaxExempt 
      ? 0 
      : resolveUserTaxPercentage(user) / 100;
    
    const subtotal = cart.reduce((sum, item) => {
      return sum + (parseFloat(item.price || 0) * (item.quantity || 0));
    }, 0);

    const tax = cart.reduce((sum, item) => {
      const itemSubtotal = parseFloat(item.price || 0) * (item.quantity || 0);
      const itemTax = itemSubtotal * taxRate;
      return sum + itemTax;
    }, 0);

    const baseTotal = subtotal + tax;
    const total = baseTotal;

    return {
      subtotal: subtotal.toFixed(2),
      tax: tax.toFixed(2),
      total: total.toFixed(2),
      taxRate: taxRate * 100, // Return as percentage for display
      isTaxExempt: isTaxExempt
    };
  }, [cart, customerTaxPreference, user]);

  const handlePaymentComplete = (saleResponse) => {
    const saleData = saleResponse.data?.sale || saleResponse.sale;
    const zohoStatus = saleResponse.data?.zoho || null;
    const items = saleResponse.data?.items || saleData?.items || [];
    const customer = saleResponse.data?.customer || selectedCustomer;
    
    // Show success message
    showToast(
      `✅ Sale completed! Total: $${parseFloat(saleData.total).toFixed(2)}`,
      'success',
      5000
    );
    
    // Show Zoho sync status
    if (zohoStatus) {
      if (zohoStatus.synced) {
        showToast(
          `📋 Invoice created in Zoho: ${zohoStatus.salesReceiptNumber || 'POS-' + saleData.id}`,
          'success',
          6000
        );
      } else if (zohoStatus.error) {
        showToast(
          `⚠️ Zoho sync failed: ${zohoStatus.error}`,
          'warning',
          8000
        );
      }
    }

    // Set receipt data and show receipt screen
    setReceiptData({
      sale: saleData,
      items: items,
      customer: customer,
      zoho: zohoStatus
    });

    clearCart();
    setShowPayment(false);
  };

  const handleNewSale = () => {
    setReceiptData(null);
    clearCart();
  };

  if (loading) {
    return (
      <div className="loading" style={{ minHeight: '100vh' }}>
        <div className="spinner"></div>
      </div>
    );
  }

  // Show receipt screen if sale is completed
  if (receiptData) {
    return (
      <>
        <TopNavigation 
          printerStatus={printerStatus} 
          syncStatus={isSyncing ? 'syncing' : null}
          onSyncNow={handleSyncNow}
        />
        <ReceiptScreen 
          saleData={receiptData} 
          onNewSale={handleNewSale}
        />
      </>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--light-gray)' }}>
      <TopNavigation 
        printerStatus={printerStatus} 
        syncStatus={isSyncing ? 'syncing' : null}
        onSyncNow={handleSyncNow}
      />

      <div className="container">
        <div className="pos-layout">
          {/* Left Panel - Cart */}
          <div>
            <Cart
              cart={cart}
              customers={customers}
              selectedCustomer={selectedCustomer}
              customerTaxPreference={customerTaxPreference}
              customerCards={customerCards}
              onSelectCustomer={handleSelectCustomer}
              onUpdateQuantity={updateQuantity}
              onRemoveItem={removeFromCart}
              onClear={clearCart}
              onCheckout={handleCheckout}
              totals={calculateTotal}
              disabled={isSyncing}
            />
          </div>

          {/* Right Panel - Products */}
          <div>
            {customerSelected ? (
              <ItemSelector 
                items={items} 
                onSelectItem={addToCart}
                onRefresh={loadData}
                disabled={isSyncing}
              />
            ) : (
              <div className="card" style={{
                padding: '60px 40px',
                textAlign: 'center',
                background: 'white',
                borderRadius: '16px',
                boxShadow: 'var(--shadow-lg)'
              }}>
                <div style={{ fontSize: '80px', marginBottom: '24px' }}>🛍️</div>
                <h2 style={{
                  fontSize: 'var(--font-size-3xl)',
                  fontWeight: '700',
                  color: 'var(--dark)',
                  marginBottom: '16px',
                  fontFamily: 'var(--font-family)',
                  lineHeight: 'var(--line-height-tight)'
                }}>
                  Select a Customer First
                </h2>
                <p style={{
                  fontSize: 'var(--font-size-lg)',
                  color: 'var(--gray-600)',
                  marginBottom: '32px',
                  fontFamily: 'var(--font-family)',
                  lineHeight: 'var(--line-height-relaxed)'
                }}>
                  Please select a customer from the Shopping Cart panel on the left to start adding items.
                </p>
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '16px 24px',
                  background: 'var(--gray-50)',
                  borderRadius: '12px',
                  border: '2px solid var(--border)'
                }}>
                  <span style={{ fontSize: '24px' }}>👈</span>
                  <span style={{
                    fontSize: 'var(--font-size-base)',
                    fontWeight: '600',
                    color: 'var(--dark)',
                    fontFamily: 'var(--font-family)'
                  }}>
                    Use the search box in Shopping Cart to select a customer
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Payment Modal */}
      {showPayment && (
        <PaymentModal
          cart={cart}
          customer={selectedCustomer}
          customerTaxPreference={customerTaxPreference}
          totals={calculateTotal}
          onClose={() => setShowPayment(false)}
          onComplete={handlePaymentComplete}
        />
      )}
    </div>
  );
};

export default POSScreen;
