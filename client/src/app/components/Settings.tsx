import React, { useState, useEffect } from 'react';
import { Printer, Loader2, CreditCard, CheckCircle2, XCircle } from 'lucide-react';
import { useAlert } from '../contexts/AlertContext';
import { printerAPI } from '../../services/api';
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
          <div className="mb-6">
            <h3 className="font-bold text-gray-900 dark:text-white mb-2">
              Authorize.Net Configuration
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Payment gateway is configured on the backend. Card and mobile payments will be processed through Authorize.Net with a 3% processing fee.
            </p>
            <div className="bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg p-4">
              <p className="font-bold text-gray-900 dark:text-white mb-2">
                Payment Processing Fees:
              </p>
              <ul className="list-disc list-inside text-gray-700 dark:text-gray-300">
                <li>Credit Card: 3% fee</li>
              </ul>
            </div>
          </div>

          {/* EBizCharge WiFi Terminal Configuration */}
          <div className="mt-6">
            <h3 className="font-bold text-gray-900 dark:text-white mb-2">
              EBizCharge WiFi Terminal
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Configure your EBizCharge WiFi terminal IP address. This will be used automatically when processing card payments.
            </p>
            <TerminalIPConfig />
          </div>

          {/* PAX Terminal Support */}
          <div className="mt-6">
            <h3 className="font-bold text-gray-900 dark:text-white mb-2">
              PAX Terminal Support (VP100)
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              PAX Valor VP100 terminal integration with Authorize.Net via WiFi is available. Configure terminal IP address below or during payment processing to use the physical terminal for card payments.
            </p>
            <TerminalIPConfig />
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

// Terminal IP and Port Configuration Component
function TerminalIPConfig() {
  const { user, refreshUser } = useAuth();
  const { showToast } = useToast();
  const [terminalIP, setTerminalIP] = useState(user?.terminalIP || '');
  const [terminalPort, setTerminalPort] = useState(user?.terminalPort?.toString() || '');
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

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
      const token = localStorage.getItem('token') || sessionStorage.getItem('token');
      const response = await fetch('/api/auth/me/terminal', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ 
          terminalIP: terminalIP.trim() || null,
          terminalPort: terminalPort.trim() || null
        })
      });

      const data = await response.json();
      
      if (data.success) {
        showToast('Terminal IP and Port saved successfully', 'success', 3000);
        if (refreshUser) {
          await refreshUser();
        }
      } else {
        showToast(data.message || 'Failed to save terminal settings', 'error', 4000);
      }
    } catch (error) {
      console.error('Error saving terminal settings:', error);
      showToast('Failed to save terminal settings', 'error', 4000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async () => {
    if (!terminalIP || terminalIP.trim() === '') {
      showToast('Please enter a terminal IP address first', 'warning', 3000);
      return;
    }

    setIsTesting(true);
    try {
      const token = localStorage.getItem('token') || sessionStorage.getItem('token');
      // Test PAX terminal connection
      const response = await fetch('/api/pax/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ 
          terminalIP: terminalIP.trim(),
          terminalPort: terminalPort.trim() || undefined
        })
      });

      const data = await response.json();
      
      if (data.success) {
        showToast('PAX terminal connection test successful!', 'success', 4000);
      } else {
        showToast(data.message || 'PAX terminal connection test failed', 'error', 4000);
      }
    } catch (error) {
      console.error('Error testing terminal:', error);
      showToast('Failed to test terminal connection', 'error', 4000);
    } finally {
      setIsTesting(false);
    }
  };

  const isValidIP = (ip: string) => {
    // Allow localhost for USB connections
    if (ip === 'localhost' || ip === '127.0.0.1') {
      return true;
    }
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipRegex.test(ip)) return false;
    const parts = ip.split('.');
    return parts.every(part => {
      const num = parseInt(part, 10);
      return num >= 0 && num <= 255;
    });
  };

  const isValidPort = (port: string) => {
    if (!port || port.trim() === '') return true; // Port is optional
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
          placeholder="192.168.1.100 or localhost"
          className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 ${
            ipValid
              ? 'border-gray-300 dark:border-gray-600 focus:ring-blue-500'
              : 'border-red-300 dark:border-red-600 focus:ring-red-500'
          } bg-white dark:bg-gray-700 text-gray-900 dark:text-white`}
        />
        {!ipValid && terminalIP !== '' && (
          <p className="text-sm text-red-600 dark:text-red-400 mt-1 flex items-center gap-1">
            <XCircle className="w-4 h-4" />
            Invalid IP address format. Use format like 192.168.1.100 or localhost
          </p>
        )}
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          For WiFi: Use terminal IP (e.g., 192.168.1.100). For USB: Use localhost or 127.0.0.1
        </p>
      </div>
      
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Terminal Port
        </label>
        <input
          type="number"
          value={terminalPort}
          onChange={(e) => setTerminalPort(e.target.value)}
          placeholder="4430 (USB) or 10009 (WiFi)"
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
            Invalid port number. Port must be between 1 and 65535
          </p>
        )}
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          Default: 4430 for USB, 10009 for WiFi. Leave empty to use default.
        </p>
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleTest}
          disabled={isTesting || !terminalIP || !canSave}
          className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-gray-900 dark:text-white bg-white dark:bg-gray-700 flex items-center justify-center gap-2"
        >
          {isTesting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Testing...</span>
            </>
          ) : (
            <>
              <CreditCard className="w-4 h-4" />
              <span>Test Connection</span>
            </>
          )}
        </button>
        <button
          onClick={handleSave}
          disabled={isSaving || !canSave}
          className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
      
      {terminalIP && ipValid && (
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Your terminal settings will be used automatically when processing payments.
        </p>
      )}
    </div>
  );
}