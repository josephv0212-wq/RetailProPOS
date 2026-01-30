import React, { useState, useEffect } from 'react';
import { 
  Printer, 
  Loader2, 
  CreditCard, 
  CheckCircle2, 
  XCircle, 
  Settings as SettingsIcon,
  Wifi,
  WifiOff,
  AlertCircle,
  Save,
  RefreshCw,
  Building2,
  User,
  Radio,
  Edit2,
  MapPin,
  Lock,
  UserCircle,
  X,
  ChevronDown,
  Percent,
  Shield,
  Mail
} from 'lucide-react';
import { printerAPI, authAPI, paymentAPI, zohoAPI } from '../../services/api';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { logger } from '../../utils/logger';

type PrinterStatus = 'online' | 'checking' | 'offline';

interface SettingsProps {
  locationId: string;
  locationName: string;
  userName: string;
  userRole: string;
}

interface Location {
  locationId: string;
  locationName: string;
  status: string;
  isPrimary?: boolean;
}

export function Settings({ locationId, locationName, userName, userRole }: SettingsProps) {
  const { showToast } = useToast();
  const { user } = useAuth();
  const [printerStatus, setPrinterStatus] = useState<PrinterStatus>('checking');
  const [isTestingPrint, setIsTestingPrint] = useState(false);
  const [activeTab, setActiveTab] = useState<'profile' | 'printer' | 'cardReader' | 'valorApi'>('profile');

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
          text: 'Online',
          icon: Wifi,
          className: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-300 dark:border-green-700',
        };
      case 'checking':
        return {
          text: 'Checking...',
          icon: Loader2,
          className: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 border-yellow-300 dark:border-yellow-700',
        };
      case 'offline':
        return {
          text: 'Offline',
          icon: WifiOff,
          className: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-300 dark:border-red-700',
        };
    }
  };

  const printerConfig = getPrinterStatusConfig();
  const StatusIcon = printerConfig.icon;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pt-20 px-6 pb-12">
      <div className="max-w-7xl mx-auto">
        {/* Page Header */}
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Settings</h1>
        </div>

        {/* Tabs */}
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-2 shadow-sm flex gap-2 mb-6">
          <button
            onClick={() => setActiveTab('profile')}
            className={`flex-1 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              activeTab === 'profile'
                ? 'bg-blue-600 text-white'
                : 'bg-transparent text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            Profile
          </button>
          <button
            onClick={() => setActiveTab('printer')}
            className={`flex-1 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              activeTab === 'printer'
                ? 'bg-blue-600 text-white'
                : 'bg-transparent text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            Printer
          </button>
          <button
            onClick={() => setActiveTab('cardReader')}
            className={`flex-1 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              activeTab === 'cardReader'
                ? 'bg-blue-600 text-white'
                : 'bg-transparent text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            Card Reader Mode
          </button>
          <button
            onClick={() => setActiveTab('valorApi')}
            className={`flex-1 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              activeTab === 'valorApi'
                ? 'bg-blue-600 text-white'
                : 'bg-transparent text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            Valor API
          </button>
        </div>

        {/* Profile Tab */}
        {activeTab === 'profile' && (
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <User className="w-5 h-5 text-gray-900 dark:text-white" />
                <h2 className="font-semibold text-gray-900 dark:text-white">User Information</h2>
              </div>
              <SystemInfoEditButton locationName={locationName} userName={userName} userRole={userRole} />
            </div>

            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
                {/* Username */}
                <div>
                  <div className="flex items-center gap-2 text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                    <User className="w-4 h-4" />
                    Username
                  </div>
                  <p className="text-xs text-gray-900 dark:text-white">
                    {userName || 'N/A'}
                  </p>
                </div>

                {/* Email */}
                <div>
                  <div className="flex items-center gap-2 text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                    <Mail className="w-4 h-4" />
                    Email
                  </div>
                  <p className="text-xs text-gray-900 dark:text-white">
                    {user?.useremail || 'N/A'}
                  </p>
                </div>

                {/* User Role */}
                <div>
                  <div className="flex items-center gap-2 text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                    <Shield className="w-4 h-4" />
                    User Role
                  </div>
                  <p className="text-xs text-gray-900 dark:text-white capitalize">
                    {userRole}
                  </p>
                </div>

                {/* Location */}
                <div>
                  <div className="flex items-center gap-2 text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                    <Building2 className="w-4 h-4" />
                    Location
                  </div>
                  <p className="text-xs text-gray-900 dark:text-white">
                    {locationName}
                  </p>
                </div>

                {/* Tax Rate */}
                <div>
                  <div className="flex items-center gap-2 text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                    <Percent className="w-4 h-4" />
                    Tax Rate
                  </div>
                  <p className="text-xs text-gray-900 dark:text-white">
                    {user?.taxPercentage ? `${user.taxPercentage}%` : 'N/A'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Printer Tab */}
        {activeTab === 'printer' && (
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Printer className="w-5 h-5 text-gray-900 dark:text-white" />
                <h2 className="font-semibold text-gray-900 dark:text-white">Printer Settings</h2>
              </div>
              {/* Status Badge */}
              <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg border font-medium ${printerConfig.className}`}>
                <StatusIcon className={`w-4 h-4 ${printerStatus === 'checking' ? 'animate-spin' : ''}`} />
                <span>{printerConfig.text}</span>
              </div>
            </div>

            <div className="p-6">
              {/* Info and Test Button */}
              <div className="flex items-center justify-between gap-4">
                <p className="text-sm text-gray-600 dark:text-gray-400 flex-1">
                  Configure your WiFi receipt printer for <span className="font-semibold text-gray-900 dark:text-white">{locationName}</span>. 
                  The printer should be on the same network and accessible via IP address (default port 9100).
                </p>

                {/* Test Button */}
                <button
                  onClick={handleTestPrint}
                  disabled={isTestingPrint || printerStatus === 'checking'}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-900 dark:bg-gray-700 text-white rounded-lg hover:bg-gray-800 dark:hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  {isTestingPrint ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Testing...</span>
                    </>
                  ) : (
                    <>
                      <Printer className="w-4 h-4" />
                      <span>Test Printer Connection</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Card Reader Mode Tab */}
        {activeTab === 'cardReader' && (
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2">
                <Radio className="w-5 h-5 text-gray-900 dark:text-white" />
                <h2 className="font-semibold text-gray-900 dark:text-white">Card Reader Mode</h2>
              </div>
            </div>

            <div className="p-6">
              <CardReaderModeConfig />
            </div>
          </div>
        )}

        {/* Valor API Tab */}
        {activeTab === 'valorApi' && (
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-gray-900 dark:text-white" />
                <h2 className="font-semibold text-gray-900 dark:text-white">Valor API</h2>
              </div>
            </div>

            <div className="p-6">
              <ValorApiConfig />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// System Info Edit Button Component
function SystemInfoEditButton({ locationName, userName, userRole }: { locationName: string; userName: string; userRole: string }) {
  const { user, refreshUser } = useAuth();
  const { showToast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(user?.name || '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [locationId, setLocationId] = useState(user?.locationId || '');
  const [editLocationName, setEditLocationName] = useState(user?.locationName || '');
  const [isSaving, setIsSaving] = useState(false);
  const [showPasswordFields, setShowPasswordFields] = useState(false);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loadingLocations, setLoadingLocations] = useState(false);

  // Load locations when editing
  useEffect(() => {
    if (isEditing && locations.length === 0) {
      loadLocations();
    }
  }, [isEditing]);

  // Update location name when locationId changes
  useEffect(() => {
    if (locationId && locations.length > 0) {
      const selectedLocation = locations.find(loc => loc.locationId === locationId);
      if (selectedLocation) {
        setEditLocationName(selectedLocation.locationName);
      }
    }
  }, [locationId, locations]);

  useEffect(() => {
    if (user) {
      setName(user.name || '');
      setLocationId(user.locationId || '');
      setEditLocationName(user.locationName || '');
    }
  }, [user]);

  const loadLocations = async () => {
    setLoadingLocations(true);
    try {
      const response = await zohoAPI.getLocations();
      if (response.success && response.data?.locations) {
        setLocations(response.data.locations);
      } else {
        showToast('Failed to load locations', 'error', 3000);
      }
    } catch (error: any) {
      logger.error('Failed to load locations', error);
      showToast('Failed to load locations', 'error', 3000);
    } finally {
      setLoadingLocations(false);
    }
  };

  const handleEdit = () => {
    setIsEditing(true);
    if (user) {
      setName(user.name || '');
      setLocationId(user.locationId || '');
      setEditLocationName(user.locationName || '');
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setPassword('');
    setConfirmPassword('');
    setShowPasswordFields(false);
    if (user) {
      setName(user.name || '');
      setLocationId(user.locationId || '');
      setEditLocationName(user.locationName || '');
    }
  };

  const handleSave = async () => {
    // Validate password if changing
    if (showPasswordFields && password) {
      if (password.length < 6) {
        showToast('Password must be at least 6 characters long', 'error', 4000);
        return;
      }
      if (password !== confirmPassword) {
        showToast('Passwords do not match', 'error', 4000);
        return;
      }
    }

    setIsSaving(true);
    try {
      const updateData: any = {
        name: name.trim() || null,
        locationId: locationId.trim(),
        locationName: editLocationName.trim()
      };

      if (showPasswordFields && password) {
        updateData.password = password;
      }

      const response = await authAPI.updateMyProfile(updateData);
      
      if (response.success) {
        showToast('Profile updated successfully', 'success', 3000);
        if (refreshUser) {
          await refreshUser();
        }
        setPassword('');
        setConfirmPassword('');
        setShowPasswordFields(false);
        setIsEditing(false);
      } else {
        showToast(response.message || 'Failed to update profile', 'error', 4000);
      }
    } catch (error: any) {
      console.error('Error updating profile:', error);
      showToast(error.message || 'Failed to update profile', 'error', 4000);
    } finally {
      setIsSaving(false);
    }
  };

  if (!isEditing) {
    return (
      <button
        onClick={handleEdit}
        className="flex items-center gap-2 px-3 py-1.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm rounded hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors bg-white dark:bg-gray-700"
        title="Edit profile"
      >
        <Edit2 className="w-4 h-4" />
        Edit
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 dark:bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Edit Profile</h2>
            <button
              onClick={handleCancel}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              title="Cancel editing"
            >
              <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
            </button>
          </div>

          <div className="space-y-5">
            {/* Display Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                <UserCircle className="w-4 h-4 inline mr-1" />
                Display Name <span className="text-gray-500 dark:text-gray-400 text-xs">(shown in topbar)</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter your display name"
                className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white dark:focus:bg-gray-600 transition-colors text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 text-sm"
              />
            </div>

            {/* Location */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                <MapPin className="w-4 h-4 inline mr-1" />
                Store Location
              </label>
              <div className="relative">
                {loadingLocations ? (
                  <div className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-500 dark:text-gray-400">
                    Loading locations...
                  </div>
                ) : (
                  <>
                    <select
                      value={locationId}
                      onChange={(e) => setLocationId(e.target.value)}
                      className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white dark:focus:bg-gray-600 appearance-none text-gray-900 dark:text-white text-sm"
                      disabled={isSaving}
                    >
                      <option value="">Select store location</option>
                      {locations.map((loc) => (
                        <option key={loc.locationId} value={loc.locationId}>
                          {loc.locationName} {loc.isPrimary ? '(Primary)' : ''}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500 pointer-events-none" />
                  </>
                )}
              </div>
              {locationId && editLocationName && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  Selected: {editLocationName}
                </p>
              )}
            </div>

            {/* Password Change */}
            <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
              <div className="flex items-center justify-between mb-3">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  <Lock className="w-4 h-4 inline mr-1" />
                  Password
                </label>
                <button
                  onClick={() => setShowPasswordFields(!showPasswordFields)}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium"
                >
                  {showPasswordFields ? 'Cancel' : 'Change'}
                </button>
              </div>

              {showPasswordFields && (
                <div className="space-y-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 border border-gray-200 dark:border-gray-600">
                  <div>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="New password"
                      className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 text-sm"
                    />
                  </div>
                  <div>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirm password"
                      className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 text-sm"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={handleCancel}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm rounded hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors bg-white dark:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="px-4 py-2 bg-gray-900 dark:bg-gray-700 text-white text-sm rounded hover:bg-gray-800 dark:hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>Save</span>
                  </>
                )}
              </button>
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
      logger.error('Error saving terminal settings', error);
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
      <div>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Direct cloud-to-connect payment integration via Valor API. Only Terminal serial number is required. (Find it on the device label or in Valor Portal)
        </p>
      </div>

      {/* Terminal Serial Number */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Terminal Serial Number <span className="text-red-500 dark:text-red-400">*</span>
        </label>
        <input
          type="text"
          value={terminalNumber}
          onChange={(e) => setTerminalNumber(e.target.value)}
          placeholder="VP100-123456"
          required
          className={`w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-700 border rounded-lg focus:outline-none focus:ring-2 transition-all ${
            terminalNumber && terminalNumberValid
              ? 'border-gray-300 dark:border-gray-600 focus:ring-blue-500 focus:bg-white dark:focus:bg-gray-600'
              : terminalNumber && !terminalNumberValid
              ? 'border-red-300 dark:border-red-600 focus:ring-red-500'
              : 'border-gray-300 dark:border-gray-600 focus:ring-blue-500 focus:bg-white dark:focus:bg-gray-600'
          } text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 text-sm`}
        />
        {!terminalNumberValid && terminalNumber !== '' && (
          <p className="text-sm text-red-600 dark:text-red-400 mt-2 flex items-center gap-1">
            <XCircle className="w-4 h-4" />
            Invalid format. Use alphanumeric characters, dashes, or underscores.
          </p>
        )}
      </div>

      {/* Save Button */}
      <button
        onClick={handleSave}
        disabled={!canSave || isSaving}
        className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-colors text-sm ${
          canSave && !isSaving
            ? 'bg-gray-900 dark:bg-gray-700 text-white hover:bg-gray-800 dark:hover:bg-gray-600'
            : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
        }`}
      >
        {isSaving ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Saving...</span>
          </>
        ) : (
          <>
            <Save className="w-4 h-4" />
            <span>Save Terminal Settings</span>
          </>
        )}
      </button>
    </div>
  );
}

// Card Reader Mode Configuration Component
function CardReaderModeConfig() {
  const { user, refreshUser } = useAuth();
  const { showToast } = useToast();
  const [cardReaderMode, setCardReaderMode] = useState<'integrated' | 'standalone'>(user?.cardReaderMode || 'integrated');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (user?.cardReaderMode) {
      setCardReaderMode(user.cardReaderMode);
    }
  }, [user?.cardReaderMode]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const response = await authAPI.updateTerminalSettings(
        user?.terminalNumber || null,
        user?.terminalIP || null,
        user?.terminalPort || null,
        cardReaderMode
      );
      
      if (response.success) {
        showToast('Card reader mode saved successfully', 'success', 3000);
        if (refreshUser) {
          await refreshUser();
        }
      } else {
        showToast(response.message || 'Failed to save card reader mode', 'error', 4000);
      }
    } catch (error: any) {
      logger.error('Error saving card reader mode', error);
      showToast(error.message || 'Failed to save card reader mode', 'error', 4000);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600 dark:text-gray-400">
        Choose how card payments are processed. In standalone mode, the cashier manually types the amount into the external card reader.
      </p>

      {/* Mode Selection */}
      <div className="grid grid-cols-2 gap-4">
        <button
          onClick={() => setCardReaderMode('integrated')}
          className={`p-4 border-2 rounded-lg text-left transition-all ${
            cardReaderMode === 'integrated'
              ? 'border-blue-500 dark:border-blue-500 bg-blue-50 dark:bg-blue-900/20'
              : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700/50'
          }`}
        >
          <div className="flex items-start gap-3">
            <div className={`w-5 h-5 border-2 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 transition-all ${
              cardReaderMode === 'integrated'
                ? 'bg-blue-600 dark:bg-blue-500 border-blue-600 dark:border-blue-500'
                : 'border-gray-300 dark:border-gray-600'
            }`}>
              {cardReaderMode === 'integrated' && <CheckCircle2 className="w-3 h-3 text-white" />}
            </div>
            <div className="flex-1">
              <div className="font-semibold text-gray-900 dark:text-white mb-1">Integrated Mode</div>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                POS automatically sends payment information to the card reader. Payment is processed through the integrated system seamlessly.
              </div>
            </div>
          </div>
        </button>

        <button
          onClick={() => setCardReaderMode('standalone')}
          className={`p-4 border-2 rounded-lg text-left transition-all ${
            cardReaderMode === 'standalone'
              ? 'border-blue-500 dark:border-blue-500 bg-blue-50 dark:bg-blue-900/20'
              : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700/50'
          }`}
        >
          <div className="flex items-start gap-3">
            <div className={`w-5 h-5 border-2 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 transition-all ${
              cardReaderMode === 'standalone'
                ? 'bg-blue-600 dark:bg-blue-500 border-blue-600 dark:border-blue-500'
                : 'border-gray-300 dark:border-gray-600'
            }`}>
              {cardReaderMode === 'standalone' && <CheckCircle2 className="w-3 h-3 text-white" />}
            </div>
            <div className="flex-1">
              <div className="font-semibold text-gray-900 dark:text-white mb-1">Standalone Mode</div>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                POS prints receipt only. Cashier manually types the amount into the external card reader. No payment information is sent from POS.
              </div>
            </div>
          </div>
        </button>
      </div>

      {/* Info Box */}
      <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
        <p className="text-sm text-yellow-900 dark:text-yellow-200 font-medium mb-2 flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          Standalone Mode Instructions
        </p>
        <ol className="text-xs text-yellow-800 dark:text-yellow-300 space-y-1 list-decimal list-inside">
          <li>Complete the sale in POS</li>
          <li>Show the printed receipt to the customer</li>
          <li>Take the customer's card and insert it into the external card reader</li>
          <li>Manually type the amount from the receipt into the card reader</li>
        </ol>
      </div>

      {/* Save Button */}
      <button
        onClick={handleSave}
        disabled={isSaving}
        className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-colors text-sm ${
          !isSaving
            ? 'bg-gray-900 dark:bg-gray-700 text-white hover:bg-gray-800 dark:hover:bg-gray-600'
            : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
        }`}
      >
        {isSaving ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Saving...</span>
          </>
        ) : (
          <>
            <Save className="w-4 h-4" />
            <span>Save Card Reader Mode</span>
          </>
        )}
      </button>
    </div>
  );
}
