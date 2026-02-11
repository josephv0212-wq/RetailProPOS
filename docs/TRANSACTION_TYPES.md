# RetailProPOS - All Possible Transactions

This document lists all transaction types users can create in the application.

---

## 1. POS Sale (Point-of-Sale)

**Endpoint:** `POST /sales`  
**Controller:** `createSale`  
**Creates:** Sale record, SaleItem records, transaction row in `transactions` table

| # | Payment Method | Card Flow Variant | How to Test |
|---|----------------|-------------------|-------------|
| 1a | **Cash** | — | Add items to cart → Pay → Cash → Confirm |
| 1b | **Card** | Valor API (integrated terminal) | Pay → Card → Process on terminal (Valor) → Confirm |
| 1c | **Card** | Manual entry (Accept.js encrypted) | Pay → Card → Manual Entry → Enter card details → Confirm |
| 1d | **Card** | USB/Bluetooth reader | Pay → Card → Use USB reader → Confirm |
| 1e | **Card** | Stored payment method | Select customer → Pay → Stored Payment Method → Pick profile → Confirm |
| 1f | **Card** | Standalone mode | Pay → Card → Use external reader (manual) → Confirm |
| 1g | **Zelle** | — | Add items → Pay → Zelle → Confirm |
| 1h | **ACH** | Manual entry | Pay → ACH → Enter bank details → Confirm |
| 1i | **ACH** | Stored payment method | Select customer → Pay → Stored Payment Method (ACH profile) → Confirm |

**POS Sale Options:**
- Customer: optional (with or without customer selected)
- Tax preference: `STANDARD` or `SALES TAX EXCEPTION CERTIFICATE`
- Save payment method: optional (when customer selected, can save card/ACH for future use)

---

## 2. Invoice Charge

**Endpoint:** `POST /sales/charge-invoices`  
**Controller:** `chargeInvoicesSalesOrders`  
**Creates:** `InvoicePayment` records in `invoice_payments` table (not in `transactions` table)

| # | Document Type | Payment Type | How to Test |
|---|---------------|--------------|-------------|
| 2a | **Invoice** | Card (stored profile) | Zoho Documents tab → Select invoices → Charge with Card |
| 2b | **Invoice** | ACH (stored profile) | Zoho Documents tab → Select invoices → Charge with ACH |

**Requirements:** Customer must have stored payment profile (card or ACH).

---

## 3. Cancel Transaction in Zoho

**Endpoint:** `POST /sales/:id/cancel-zoho`  
**Controller:** `cancelZohoTransaction`  
**Action:** Voids/cancels an existing synced transaction in Zoho (does not create a new transaction)

| Action | How to Test |
|--------|-------------|
| Cancel in Zoho | Reports → Find synced transaction → Click "Cancel in Zoho" |

---

## Summary Table

| Flow | Endpoint | Creates |
|------|----------|---------|
| POS Sale | `POST /sales` | Sale, SaleItem, transaction row |
| Invoice/Sales Order Charge | `POST /sales/charge-invoices` | `InvoicePayment` row |
| Cancel in Zoho | `POST /sales/:id/cancel-zoho` | Update only (voids in Zoho) |

---

## Recommended Test Order

1. **1a** – POS Cash (simplest)
2. **1b–1f** – POS Card variants
3. **1g** – POS Zelle
4. **1h–1i** – POS ACH
5. **2a–2b** – Invoice charges
6. **3** – Cancel in Zoho

---

*Generated for RetailProPOS*
