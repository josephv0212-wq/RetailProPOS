import React, { useState, useEffect } from 'react';
import { X, CreditCard, Building2, Check, Loader2 } from 'lucide-react';
import { customersAPI } from '../../services/api';
import { logger } from '../../utils/logger';

interface PaymentProfile {
  paymentProfileId: string;
  type: 'card' | 'ach';
  cardNumber?: string;
  expirationDate?: string;
  accountNumber?: string;
  isDefault?: boolean;
  isStored?: boolean;
  customerProfileId?: string | null;
}

interface PaymentMethodSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (paymentProfileId: string, profileType?: 'card' | 'ach', customerProfileId?: string | null) => void;
  customerId: number;
  customerName: string;
  loading?: boolean;
  /** When set (e.g. invoice/sales order charge), show subtotal + 3% CC surcharge when a credit card is selected */
  totalAmount?: number;
}

export function PaymentMethodSelector({
  isOpen,
  onClose,
  onSelect,
  customerId,
  customerName,
  loading: externalLoading = false,
  totalAmount,
}: PaymentMethodSelectorProps) {
  const [paymentProfiles, setPaymentProfiles] = useState<PaymentProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zohoCards, setZohoCards] = useState<Array<{ last_four_digits?: string; last4?: string; card_type?: string }>>([]);
  const [zohoLastFour, setZohoLastFour] = useState<string | null>(null);
  const [zohoCardType, setZohoCardType] = useState<string | null>(null);
  const [zohoBankLast4, setZohoBankLast4] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && customerId) {
      loadPaymentProfiles();
    }
  }, [isOpen, customerId]);

  const loadPaymentProfiles = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await customersAPI.getPaymentProfiles(customerId);

      if (response.success && response.data) {
        const profiles = response.data.paymentProfiles || [];
        setPaymentProfiles(profiles);
        setZohoCards(response.data.zohoCards || []);
        setZohoLastFour(response.data.last_four_digits ?? null);
        setZohoCardType(response.data.card_type ?? null);
        setZohoBankLast4(response.data.bank_account_last4 ?? null);

        // Auto-select default or stored profile, or first one
        const defaultProfile = profiles.find((p: PaymentProfile) => p.isDefault || p.isStored) || profiles[0];
        if (defaultProfile) {
          setSelectedProfileId(defaultProfile.paymentProfileId);
        } else {
          setSelectedProfileId(null);
        }
      } else {
        setError(response.error || response.data?.message || 'Failed to load payment profiles');
      }
    } catch (err: any) {
      logger.error('Failed to load payment profiles', err);
      setError(err.message || 'Failed to load payment profiles');
    } finally {
      setLoading(false);
    }
  };

  const selectedProfile = selectedProfileId
    ? paymentProfiles.find((p) => p.paymentProfileId === selectedProfileId)
    : null;
  const showTotals = totalAmount != null && totalAmount > 0;
  // Invoice/SO: 3% processing fee for card only (not for ACH/bank account)
  const isCardProfile = selectedProfile?.type === 'card';
  const processingFee = showTotals && isCardProfile ? Math.round(totalAmount * 0.03 * 100) / 100 : 0;
  const totalWithFee = showTotals ? totalAmount + processingFee : 0;

  const handleSelect = () => {
    if (selectedProfileId && selectedProfile) {
      onSelect(selectedProfileId, selectedProfile.type, selectedProfile.customerProfileId ?? undefined);
      // Parent closes selector and opens receipt preview; do not call onClose() here so parent does not clear pendingChargeItems
    }
  };

  const formatCardNumber = (cardNumber: string) => {
    if (!cardNumber || cardNumber === 'XXXX') return 'XXXX';
    // If it's already masked (contains X), return as is
    if (cardNumber.includes('X')) return cardNumber;
    // Otherwise, show last 4 digits
    const digits = cardNumber.replace(/\D/g, '');
    return digits.length >= 4 ? `XXXX${digits.slice(-4)}` : 'XXXX';
  };

  const formatAccountNumber = (accountNumber: string) => {
    if (!accountNumber || accountNumber === 'XXXX') return 'XXXX';
    // If it's already masked (contains X), return as is
    if (accountNumber.includes('X')) return accountNumber;
    // Otherwise, show last 4 digits
    const digits = accountNumber.replace(/\D/g, '');
    return digits.length >= 4 ? `XXXX${digits.slice(-4)}` : 'XXXX';
  };

  if (!isOpen) return null;

  const isLoading = loading || externalLoading;
  const hasProfiles = paymentProfiles.length > 0;
  const hasZohoPaymentInfo = zohoCards.length > 0 || zohoLastFour || zohoBankLast4;
  const canProceed = selectedProfileId && !isLoading;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <CreditCard className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                Select Payment Method
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                {customerName}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-blue-600 dark:text-blue-400 animate-spin mb-4" />
              <p className="text-gray-500 dark:text-gray-400">Loading payment methods...</p>
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <p className="text-red-600 dark:text-red-400 mb-4">{error}</p>
              <button
                onClick={loadPaymentProfiles}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Retry
              </button>
            </div>
          ) : !hasProfiles ? (
            <div className="text-center py-8 space-y-4">
              {hasZohoPaymentInfo ? (
                <>
                  <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-4 text-left">
                    <p className="text-sm font-medium text-amber-800 dark:text-amber-200 mb-2">
                      Payment info on file (from Zoho)
                    </p>
                    <div className="text-sm text-amber-700 dark:text-amber-300 space-y-1">
                      {zohoLastFour && (
                        <div className="flex items-center gap-2">
                          <CreditCard className="w-4 h-4 flex-shrink-0" />
                          <span>
                            {zohoCardType || 'Card'}: xxxx xxxx xxxx {zohoLastFour}
                          </span>
                        </div>
                      )}
                      {zohoBankLast4 && (
                        <div className="flex items-center gap-2">
                          <Building2 className="w-4 h-4 flex-shrink-0" />
                          <span>Bank account: xxxx {zohoBankLast4}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    To pay invoices with stored payment, add this card by completing a sale with &quot;Save payment method&quot; checked.
                  </p>
                </>
              ) : (
                <>
                  <CreditCard className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto" />
                  <p className="text-gray-500 dark:text-gray-400">
                    No payment methods found
                  </p>
                  <p className="text-sm text-gray-400 dark:text-gray-500">
                    This customer does not have stored payment methods in Authorize.net. Add a card by completing a sale with &quot;Save payment method&quot; checked.
                  </p>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {paymentProfiles.map((profile) => {
                const isSelected = selectedProfileId === profile.paymentProfileId;
                return (
                  <button
                    key={profile.paymentProfileId}
                    onClick={() => setSelectedProfileId(profile.paymentProfileId)}
                    className={`w-full p-4 border rounded-lg transition-all text-left ${
                      isSelected
                        ? 'border-blue-500 dark:border-blue-400 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-gray-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`mt-1 flex-shrink-0 w-5 h-5 border-2 rounded flex items-center justify-center ${
                        isSelected
                          ? 'bg-blue-600 dark:bg-blue-500 border-blue-600 dark:border-blue-500'
                          : 'border-gray-300 dark:border-gray-600'
                      }`}>
                        {isSelected && <Check className="w-3 h-3 text-white" />}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          {(profile.type === 'card') ? (
                            <CreditCard className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                          ) : (
                            <Building2 className="w-5 h-5 text-green-600 dark:text-green-400" />
                          )}
                          <span className="font-semibold text-gray-900 dark:text-white">
                            {(profile.type === 'card') ? 'Card' : 'Bank Account'}
                            {profile.profileName ? ` (${profile.profileName})` : ''}
                          </span>
                          {(profile.isDefault || profile.isStored) && (
                            <span className="text-xs text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30 px-2 py-0.5 rounded">
                              {profile.isDefault ? 'Default' : 'Stored'}
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                          {(profile.type === 'card') ? (
                            <>
                              <div>Card: {formatCardNumber(profile.cardNumber || 'XXXX')}</div>
                              {profile.expirationDate && (
                                <div className="text-xs mt-1">Exp: {profile.expirationDate}</div>
                              )}
                            </>
                          ) : (
                            <div>Account: {formatAccountNumber(profile.accountNumber || 'XXXX')}</div>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Totals (invoice/sales order): 3% fee only when card is selected */}
          {showTotals && hasProfiles && (
            <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">Subtotal</span>
                <span className="font-medium text-gray-900 dark:text-white">${totalAmount!.toFixed(2)}</span>
              </div>
              {processingFee > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Processing fee 3%</span>
                  <span className="font-medium text-gray-900 dark:text-white">${processingFee.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between pt-2 border-t border-gray-200 dark:border-gray-600">
                <span className="font-semibold text-gray-900 dark:text-white">Total</span>
                <span className="font-semibold text-gray-900 dark:text-white">${totalWithFee.toFixed(2)}</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-gray-900 dark:text-white"
          >
            Cancel
          </button>
          <button
            onClick={handleSelect}
            disabled={!canProceed}
            className="flex-1 px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:from-gray-400 disabled:to-gray-400"
          >
            Use This Method
          </button>
        </div>
      </div>
    </div>
  );
}
