import React, { useState, useEffect } from 'react';
import { Printer, Loader2, CreditCard, CheckCircle2, XCircle } from 'lucide-react';
import { useAlert } from '../contexts/AlertContext';
import { printerAPI, authAPI, paymentAPI } from '../../services/api';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';

type PrinterStatus = 'online' | 'checking' | 'offline';

interface SettingsProps {
  locationId: string;
  locationName: string;
  userName: string;
  userRole: string;
}

export function Settings({ locationId, locationName, userName, userRole }: SettingsProps) {
  const { showAlert } = useAlert();
  const { showToast } = useToast();
  const [printerStatus, setPrinterStatus] = useState<PrinterStatus>('checking');
  const [isTestingPrint, setIsTestingPrint] = useState(false);

  // Check printer status on mount
  useEffect(() => {
    const checkPrinter = async () => {
      setPrinterStatus('checking');
      try {
        const response = await printerAPI.test();
        setPrinterStatus(response.success ? 'online' : 'offline');
      } catch (error) {
        setPrinterStatus('offline');
      }
    };
    checkPrinter();
  }, []);

  const handleTestPrint = async () => {
    setIsTestingPrint(true);
    try {
      const response = await printerAPI.test();
      if (response.success) {
        showToast('Printer test successful. Check your printer.', 'success', 4000);
        setPrinterStatus('online');
      } else {
        showToast('Printer test failed. Check connection.', 'error', 4000);
        setPrinterStatus('offline');
      }
    } catch (error) {
      showToast('Printer test failed. Check connection.', 'error', 4000);
      setPrinterStatus('offline');
    } finally {
      setIsTestingPrint(false);
    }
  };

  const getPrinterStatusConfig = () => {
    switch (printerStatus) {
      case 'online':
        return {
          text: 'Printer Online',
          icon: '🟢',
          className: 'bg-green-100 dark:bg-green-900/30 border-green-300 dark:border-green-700 text-green-800 dark:text-green-400',
        };
      case 'checking':
        return {
          text: 'Printer Checking...',
          icon: '🟡',
          className: 'bg-yellow-100 dark:bg-yellow-900/30 border-yellow-300 dark:border-yellow-700 text-yellow-800 dark:text-yellow-400',
        };
      case 'offline':
        return {
          text: 'Printer Offline',
          icon: '🔴',
          className: 'bg-red-100 dark:bg-red-900/30 border-red-300 dark:border-red-700 text-red-800 dark:text-red-400',
        };
    }
  };

  const printerConfig = getPrinterStatusConfig();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-8">
      {/* Page Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-8 py-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          Settings
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Configure printer and payment gateway settings
        </p>
      </div>

      <div className="px-8 mt-8 space-y-8">
        {/* Printer Settings Section */}
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-8 shadow-sm">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
            Printer Settings
          </h2>

          {/* Printer Status Display */}
          <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg border-2 font-semibold mb-6 ${printerConfig.className}`}>
            <span>{printerConfig.icon}</span>
            <span>{printerConfig.text}</span>
          </div>

          {/* Printer Information */}
          <p className="text-gray-600 dark:text-gray-400 mb-2">
            Configure your WiFi receipt printer for this location. The printer should be on the same network and accessible via IP address (default port 9100).
          </p>
          <p className="font-semibold text-gray-900 dark:text-white mb-6">
            Location: {locationName}
          </p>

          {/* Test Print Button */}
          <button
            onClick={handleTestPrint}
            disabled={isTestingPrint || printerStatus !== 'online'}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-gray-900 dark:text-white bg-white dark:bg-gray-700"
          >
            {isTestingPrint ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Testing...</span>
              </>
            ) : (
              <>
                <Printer className="w-4 h-4" />
                <span>Test Print</span>
              </>
            )}
          </button>
        </div>

        {/* Payment Gateway Section */}
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-8 shadow-sm">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
            Payment Gateway
          </h2>

          {/* Authorize.Net Configuration */}
          <div className="mb-8 pb-8 border-b border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
              Authorize.Net
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-3">
              All card payments are processed through Authorize.Net. Configuration is handled on the backend.
            </p>
            <div className="bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg p-3">
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                Processing Fee: 3% for credit/debit cards
              </p>
            </div>
          </div>

          {/* Valor API Configuration */}
          <div className="mb-8 pb-8 border-b border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
              Valor API (Cloud-to-Connect)
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Direct cloud-to-connect payment integration via Valor API. Only Terminal serial number is required. IP and Port are not needed.
            </p>
            <ValorApiConfig />
          </div>

        </div>

        {/* System Information Section */}
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-8 shadow-sm">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
            System Information
          </h2>

          <div className="space-y-6">
            {/* Location */}
            <div>
              <label className="block text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                Location
              </label>
              <p className="font-bold text-gray-900 dark:text-white">
                {locationName}
              </p>
            </div>

            {/* User */}
            <div>
              <label className="block text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                User
              </label>
              <p className="font-bold text-gray-900 dark:text-white">
                {userName} ({userRole})
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Valor API Configuration Component
function ValorApiConfig() {
  const { user, refreshUser } = useAuth();
  const { showToast } = useToast();
  const [terminalNumber, setTerminalNumber] = useState(user?.terminalNumber || '');
  const [isSaving, setIsSaving] = useState(false);
  const [devices, setDevices] = useState<any[]>([]);
  const [isLoadingDevices, setIsLoadingDevices] = useState(false);

  useEffect(() => {
    if (user?.terminalNumber) {
      setTerminalNumber(user.terminalNumber);
    }
  }, [user?.terminalNumber]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const response = await authAPI.updateTerminalSettings(terminalNumber);
      
      if (response.success) {
        showToast('Valor API terminal settings saved successfully', 'success', 3000);
        if (refreshUser) {
          await refreshUser();
        }
      } else {
        showToast(response.message || 'Failed to save terminal settings', 'error', 4000);
      }
    } catch (error: any) {
      console.error('Error saving terminal settings:', error);
      showToast(error.message || 'Failed to save terminal settings', 'error', 4000);
    } finally {
      setIsSaving(false);
    }
  };

  const fetchDevices = async () => {
    setIsLoadingDevices(true);
    try {
      const { getValorDevices } = await import('../../services/valorApiService');
      const result = await getValorDevices();
      if (result.success && result.data?.devices) {
        setDevices(result.data.devices);
      } else {
        setDevices([]);
        showToast(result.error || 'Failed to fetch devices', 'error', 3000);
      }
    } catch (error: any) {
      console.error('Error fetching Valor devices:', error);
      showToast('Failed to fetch devices', 'error', 3000);
      setDevices([]);
    } finally {
      setIsLoadingDevices(false);
    }
  };

  const isValidTerminalNumber = (num: string) => {
    if (!num || num.trim() === '') return false;
    return /^[A-Za-z0-9\-_]+$/.test(num.trim());
  };

  const terminalNumberValid = isValidTerminalNumber(terminalNumber);
  const canSave = terminalNumberValid && terminalNumber.trim() !== '';

  return (
    <div className="space-y-4">
      {/* Terminal Serial Number - Required for Valor API */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Terminal Serial Number <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={terminalNumber}
          onChange={(e) => setTerminalNumber(e.target.value)}
          placeholder="VP100-123456"
          required
          className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 ${
            terminalNumber && terminalNumberValid
              ? 'border-gray-300 dark:border-gray-600 focus:ring-blue-500'
              : terminalNumber && !terminalNumberValid
              ? 'border-red-300 dark:border-red-600 focus:ring-red-500'
              : 'border-gray-300 dark:border-gray-600 focus:ring-blue-500'
          } bg-white dark:bg-gray-700 text-gray-900 dark:text-white`}
        />
        {!terminalNumberValid && terminalNumber !== '' && (
          <p className="text-sm text-red-600 dark:text-red-400 mt-1 flex items-center gap-1">
            <XCircle className="w-4 h-4" />
            Invalid format. Use alphanumeric characters, dashes, or underscores.
          </p>
        )}
        {!terminalNumber && (
          <p className="text-sm text-red-600 dark:text-red-400 mt-1">
            ⚠️ Terminal serial number is required for Valor API payments. Enter your VP100 serial number.
          </p>
        )}
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          Find it on the device label or in Valor Portal
        </p>
      </div>

      {/* Info Box - Valor API */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
        <p className="text-sm text-blue-900 dark:text-blue-200 font-medium mb-1">
          ℹ️ Valor API (Cloud-to-Connect)
        </p>
        <p className="text-xs text-blue-800 dark:text-blue-300">
          IP Address and Port are <strong>not required</strong> for Valor API. The terminal communicates through Valor's cloud infrastructure. Only Terminal serial number is needed.
        </p>
      </div>

      {/* Device List */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Registered Terminals
          </label>
          <button
            onClick={fetchDevices}
            disabled={isLoadingDevices}
            className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 disabled:opacity-50"
          >
            {isLoadingDevices ? 'Loading...' : 'Refresh'}
          </button>
        </div>
        {devices.length > 0 ? (
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 space-y-2">
            {devices.map((device, index) => (
              <div key={index} className="text-sm text-gray-700 dark:text-gray-300">
                {device.serialNumber || device.sn || device.id || `Device ${index + 1}`}
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-sm text-gray-500 dark:text-gray-400">
            No devices found. Click "Refresh" to fetch registered terminals from Valor API.
          </div>
        )}
      </div>

      {/* Action Button */}
      <div className="pt-2">
        <button
          onClick={handleSave}
          disabled={!canSave || isSaving}
          className={`w-full px-4 py-2 rounded-lg font-medium transition-colors ${
            canSave && !isSaving
              ? 'bg-blue-600 hover:bg-blue-700 text-white'
              : 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
          }`}
        >
          {isSaving ? 'Saving...' : 'Save Terminal Settings'}
        </button>
      </div>
    </div>
  );
}

