import React, { useState, useEffect } from 'react';
import { X, Wifi, Loader, CheckCircle2, XCircle, RefreshCw, AlertCircle } from 'lucide-react';
import { paxAPI } from '../../services/api';

interface Terminal {
  ip: string;
  port: number;
  model?: string;
  serialNumber?: string;
  firmware?: string;
}

interface TerminalDiscoveryDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTerminal: (terminal: Terminal) => void;
  currentTerminalIP?: string | null;
  currentTerminalPort?: number | string | null;
}

export function TerminalDiscoveryDialog({
  isOpen,
  onClose,
  onSelectTerminal,
  currentTerminalIP,
  currentTerminalPort
}: TerminalDiscoveryDialogProps) {
  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [error, setError] = useState('');
  const [selectedTerminal, setSelectedTerminal] = useState<Terminal | null>(null);
  const [manualIP, setManualIP] = useState(currentTerminalIP || '');
  const [manualPort, setManualPort] = useState(currentTerminalPort?.toString() || '10009');
  const [useManual, setUseManual] = useState(false);

  useEffect(() => {
    if (isOpen) {
      // Reset state when dialog opens
      setTerminals([]);
      setError('');
      setSelectedTerminal(null);
      setManualIP(currentTerminalIP || '');
      setManualPort(currentTerminalPort?.toString() || '10009');
      setUseManual(false);
      // Auto-discover when dialog opens
      handleDiscover();
    }
  }, [isOpen, currentTerminalIP, currentTerminalPort]);

  const handleDiscover = async () => {
    setIsDiscovering(true);
    setError('');
    setTerminals([]);
    setSelectedTerminal(null);

    try {
      const response = await paxAPI.discover();
      
      if (response.success && response.data?.terminals) {
        setTerminals(response.data.terminals);
        if (response.data.terminals.length === 0) {
          setError('No PAX terminals found on the network. You can enter the IP address manually.');
        }
      } else {
        setError(response.message || 'Failed to discover terminals');
      }
    } catch (err: any) {
      console.error('Terminal discovery error:', err);
      setError(err.message || 'Failed to discover terminals. Check your network connection.');
    } finally {
      setIsDiscovering(false);
    }
  };

  const handleSelectTerminal = (terminal: Terminal) => {
    setSelectedTerminal(terminal);
    setUseManual(false);
  };

  const handleUseManual = () => {
    setUseManual(true);
    setSelectedTerminal(null);
  };

  const handleConfirm = () => {
    if (useManual) {
      // Validate manual IP
      const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
      if (!manualIP || !ipRegex.test(manualIP)) {
        setError('Please enter a valid IP address (e.g., 192.168.1.100)');
        return;
      }
      
      const port = parseInt(manualPort, 10);
      if (isNaN(port) || port < 1 || port > 65535) {
        setError('Please enter a valid port number (1-65535)');
        return;
      }

      onSelectTerminal({
        ip: manualIP.trim(),
        port: port
      });
    } else if (selectedTerminal) {
      onSelectTerminal(selectedTerminal);
    } else {
      setError('Please select a terminal or enter IP address manually');
    }
  };

  const isValidIP = (ip: string): boolean => {
    if (ip === 'localhost' || ip === '127.0.0.1') return true;
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipRegex.test(ip)) return false;
    const parts = ip.split('.');
    return parts.every(part => {
      const num = parseInt(part, 10);
      return num >= 0 && num <= 255;
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center">
              <Wifi className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                Discover PAX WiFi Terminal
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Find and select your PAX VP100 terminal on the network
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Discovery Status */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white mb-1">
                Network Discovery
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Scanning network for PAX terminals...
              </p>
            </div>
            <button
              onClick={handleDiscover}
              disabled={isDiscovering}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
            >
              {isDiscovering ? (
                <>
                  <Loader className="w-4 h-4 animate-spin" />
                  <span>Discovering...</span>
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" />
                  <span>Refresh</span>
                </>
              )}
            </button>
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm text-red-800 dark:text-red-300 font-medium">{error}</p>
              </div>
            </div>
          )}

          {/* Discovered Terminals */}
          {terminals.length > 0 && (
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white mb-3">
                Found {terminals.length} Terminal{terminals.length !== 1 ? 's' : ''}
              </h3>
              <div className="space-y-2">
                {terminals.map((terminal, index) => (
                  <button
                    key={index}
                    onClick={() => handleSelectTerminal(terminal)}
                    className={`w-full p-4 border-2 rounded-lg text-left transition-all ${
                      selectedTerminal?.ip === terminal.ip && selectedTerminal?.port === terminal.port
                        ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                          selectedTerminal?.ip === terminal.ip && selectedTerminal?.port === terminal.port
                            ? 'bg-blue-600'
                            : 'bg-gray-200 dark:bg-gray-700'
                        }`}>
                          <Wifi className={`w-5 h-5 ${
                            selectedTerminal?.ip === terminal.ip && selectedTerminal?.port === terminal.port
                              ? 'text-white'
                              : 'text-gray-600 dark:text-gray-300'
                          }`} />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">
                            {terminal.model || 'PAX Terminal'}
                          </p>
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            {terminal.ip}:{terminal.port}
                          </p>
                          {terminal.serialNumber && (
                            <p className="text-xs text-gray-500 dark:text-gray-500">
                              Serial: {terminal.serialNumber}
                            </p>
                          )}
                        </div>
                      </div>
                      {selectedTerminal?.ip === terminal.ip && selectedTerminal?.port === terminal.port && (
                        <CheckCircle2 className="w-6 h-6 text-blue-600" />
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Manual Entry Option */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
            <button
              onClick={handleUseManual}
              className={`w-full p-4 border-2 rounded-lg text-left transition-all ${
                useManual
                  ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  useManual ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'
                }`}>
                  <Wifi className={`w-5 h-5 ${useManual ? 'text-white' : 'text-gray-600 dark:text-gray-300'}`} />
                </div>
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">
                    Enter IP Address Manually
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    If terminal not found, enter IP address directly
                  </p>
                </div>
              </div>
            </button>

            {useManual && (
              <div className="mt-4 space-y-3 p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Terminal IP Address
                  </label>
                  <input
                    type="text"
                    value={manualIP}
                    onChange={(e) => setManualIP(e.target.value)}
                    placeholder="192.168.1.100"
                    className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:border-gray-600 dark:text-white ${
                      manualIP && !isValidIP(manualIP) ? 'border-red-500' : 'border-gray-300'
                    }`}
                  />
                  {manualIP && !isValidIP(manualIP) && (
                    <p className="text-xs text-red-600 mt-1">
                      Invalid IP address format
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Port (default: 10009 for WiFi)
                  </label>
                  <input
                    type="number"
                    value={manualPort}
                    onChange={(e) => setManualPort(e.target.value)}
                    placeholder="10009"
                    min="1"
                    max="65535"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:border-gray-600 dark:text-white"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selectedTerminal && !useManual}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4" />
            Use Selected Terminal
          </button>
        </div>
      </div>
    </div>
  );
}
