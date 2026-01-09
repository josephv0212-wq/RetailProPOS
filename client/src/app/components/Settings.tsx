import React, { useState, useEffect } from 'react';
import { Printer, Loader2, CreditCard, CheckCircle2, XCircle } from 'lucide-react';
import { useAlert } from '../contexts/AlertContext';
import { printerAPI, authAPI } from '../../services/api';
import { DatabaseSettings } from './DatabaseSettings';
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
            Location: {locationId}
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

          {/* PAX Terminal Support - Main Configuration */}
          <div className="mb-8 pb-8 border-b border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
              PAX VP100 Terminal (Valor Connect)
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Cloud-to-cloud payment integration. Only Terminal number is required. IP and Port are not needed for Valor Connect.
            </p>
            <PAXTerminalConfig />
          </div>

          {/* EBizCharge Terminal Configuration */}
          <div className="mb-8 pb-8 border-b border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
              EBizCharge WiFi Terminal
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Configure your EBizCharge terminal IP address and port.
            </p>
            <EBizChargeTerminalConfig />
          </div>

          {/* BBPOS Card Reader Support */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
              BBPOS Card Reader (USB)
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
              USB-connected card reader. No configuration needed.
            </p>
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <p className="text-sm text-gray-700 dark:text-gray-300">
                Simply connect the BBPOS CHIPPER™ 3X reader via USB. The device is automatically detected during payment. Select "USB Card Reader" option in the payment modal.
              </p>
            </div>
          </div>
        </div>

        {/* Database Settings Section */}
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-8 shadow-sm">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
            Database Settings
          </h2>
          <DatabaseSettings />
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
                {locationId} - {locationName}
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

// PAX Terminal Configuration Component (Valor Connect)
function PAXTerminalConfig() {
  const { user, refreshUser } = useAuth();
  const { showToast } = useToast();
  const [terminalNumber, setTerminalNumber] = useState(user?.terminalNumber || '');
  const [isSaving, setIsSaving] = useState(false);

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
        showToast('PAX terminal settings saved successfully', 'success', 3000);
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

  // Test connection removed - not applicable for Valor Connect (cloud-to-cloud)

  const isValidTerminalNumber = (num: string) => {
    if (!num || num.trim() === '') return false; // Terminal number is REQUIRED
    return /^[A-Za-z0-9\-_]+$/.test(num.trim());
  };

  const terminalNumberValid = isValidTerminalNumber(terminalNumber);
  const canSave = terminalNumberValid && terminalNumber.trim() !== '';

  return (
    <div className="space-y-4">
      {/* Terminal Number - Required for Valor Connect */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Terminal Number (Serial Number) <span className="text-red-500">*</span>
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
            ⚠️ Terminal number is required for Valor Connect payments. Enter your VP100 serial number.
          </p>
        )}
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          Find it on the device label or in Valor Portal/Authorize.Net
        </p>
      </div>

      {/* Info Box - IP/Port Not Needed */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
        <p className="text-sm text-blue-900 dark:text-blue-200 font-medium mb-1">
          ℹ️ Valor Connect (Cloud-to-Cloud)
        </p>
        <p className="text-xs text-blue-800 dark:text-blue-300">
          IP Address and Port are <strong>not required</strong> for Valor Connect. The terminal communicates through Authorize.Net's cloud infrastructure. Only Terminal number is needed.
        </p>
      </div>

      {/* Action Button */}
      <div className="pt-2">
        <button
          onClick={handleSave}
          disabled={isSaving || !terminalNumber || !terminalNumberValid}
          className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isSaving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Saving...</span>
            </>
          ) : (
            <>
              <CheckCircle2 className="w-4 h-4" />
              <span>Save Terminal Number</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}

// EBizCharge Terminal Configuration Component
function EBizChargeTerminalConfig() {
  const { user, refreshUser } = useAuth();
  const { showToast } = useToast();
  const [terminalIP, setTerminalIP] = useState(user?.terminalIP || '');
  const [terminalPort, setTerminalPort] = useState(user?.terminalPort?.toString() || '');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (user?.terminalIP) {
      setTerminalIP(user.terminalIP);
    }
    if (user?.terminalPort) {
      setTerminalPort(user.terminalPort.toString());
    }
  }, [user?.terminalIP, user?.terminalPort]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const response = await authAPI.updateTerminalSettings(null, terminalIP, terminalPort);
      
      if (response.success) {
        showToast('EBizCharge terminal settings saved successfully', 'success', 3000);
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

  const isValidIP = (ip: string) => {
    if (ip === 'localhost' || ip === '127.0.0.1') return true;
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipRegex.test(ip)) return false;
    const parts = ip.split('.');
    return parts.every(part => {
      const num = parseInt(part, 10);
      return num >= 0 && num <= 255;
    });
  };

  const isValidPort = (port: string) => {
    if (!port || port.trim() === '') return true;
    const portNum = parseInt(port, 10);
    return !isNaN(portNum) && portNum >= 1 && portNum <= 65535;
  };

  const ipValid = terminalIP === '' || isValidIP(terminalIP);
  const portValid = isValidPort(terminalPort);
  const canSave = ipValid && portValid;

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Terminal IP Address
        </label>
          <input
            type="text"
            value={terminalIP}
            onChange={(e) => setTerminalIP(e.target.value)}
            placeholder="192.168.1.100"
          className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 ${
              ipValid
                ? 'border-gray-300 dark:border-gray-600 focus:ring-blue-500'
                : 'border-red-300 dark:border-red-600 focus:ring-red-500'
            } bg-white dark:bg-gray-700 text-gray-900 dark:text-white`}
          />
        {!ipValid && terminalIP !== '' && (
          <p className="text-sm text-red-600 dark:text-red-400 mt-1 flex items-center gap-1">
            <XCircle className="w-4 h-4" />
            Invalid IP format
          </p>
        )}
      </div>
      
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Terminal Port
        </label>
        <input
          type="number"
          value={terminalPort}
          onChange={(e) => setTerminalPort(e.target.value)}
          placeholder="10009"
          min="1"
          max="65535"
          className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 ${
            portValid
              ? 'border-gray-300 dark:border-gray-600 focus:ring-blue-500'
              : 'border-red-300 dark:border-red-600 focus:ring-red-500'
          } bg-white dark:bg-gray-700 text-gray-900 dark:text-white`}
        />
        {!portValid && terminalPort !== '' && (
          <p className="text-sm text-red-600 dark:text-red-400 mt-1 flex items-center gap-1">
            <XCircle className="w-4 h-4" />
            Invalid port number
          </p>
        )}
      </div>

          <button
            onClick={handleSave}
        disabled={isSaving || !canSave}
        className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>Save</span>
              </>
            )}
          </button>
    </div>
  );
}
