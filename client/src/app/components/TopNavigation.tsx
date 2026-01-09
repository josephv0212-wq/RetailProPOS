import { Store, Calendar, Clock, RefreshCw, Printer, LogOut, Users, BarChart3, Settings, ShoppingCart, ChevronDown, User, Shield, MapPin, Moon, Sun } from 'lucide-react';
import React, { useState, useRef, useEffect } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { printerAPI } from '../../services/api';

interface TopNavigationProps {
  storeName: string;
  userName: string;
  onLogout: () => void;
  onNavigateToPOS?: () => void;
  onNavigateToCustomers?: () => void;
  onNavigateToReports?: () => void;
  onNavigateToSettings?: () => void;
  onNavigateToAdmin?: () => void;
  userRole?: 'admin' | 'cashier';
  userLocation?: string;
}

export function TopNavigation({ storeName, userName, onLogout, onNavigateToPOS, onNavigateToCustomers, onNavigateToReports, onNavigateToSettings, onNavigateToAdmin, userRole, userLocation }: TopNavigationProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [printerStatus, setPrinterStatus] = useState<'online' | 'offline' | 'unknown'>('unknown');
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  // Update time every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    
    return () => clearInterval(timer);
  }, []);

  // Check printer status
  useEffect(() => {
    const checkPrinterStatus = async () => {
      try {
        const response = await printerAPI.test();
        setPrinterStatus(response.success ? 'online' : 'offline');
      } catch (err) {
        setPrinterStatus('offline');
      }
    };

    // Check immediately and then every 30 seconds
    checkPrinterStatus();
    const interval = setInterval(checkPrinterStatus, 30000);

    return () => clearInterval(interval);
  }, []);
  
  const formattedDate = currentTime.toLocaleDateString('en-US', { 
    weekday: 'short',
    month: 'short', 
    day: 'numeric', 
    year: 'numeric' 
  });
  
  const formattedTime = currentTime.toLocaleTimeString('en-US', { 
    hour: '2-digit', 
    minute: '2-digit',
    second: '2-digit'
  });

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const { theme, toggleTheme } = useTheme();

  return (
    <nav className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-3 md:px-6 py-3 md:py-4 fixed top-0 left-0 right-0 z-50">
      <div className="flex items-center justify-between">
        {/* Left Section */}
        <div className="flex items-center gap-2 md:gap-6">
          <div className="flex items-center gap-2">
            <img 
              src="/sz_logo-01-est2001-1.webp" 
              alt="RetailPro POS Logo" 
              className="h-8 md:h-10 w-auto object-contain"
            />
            <span className="font-bold text-blue-600 dark:text-blue-400 text-sm md:text-base hidden sm:inline">RetailPro POS</span>
          </div>
          
          <div className="hidden md:block h-6 w-px bg-gray-300 dark:bg-gray-600" />
          
          {/* Navigation Buttons */}
          <div className="hidden md:flex items-center gap-2">
            {onNavigateToPOS && (
              <button 
                onClick={onNavigateToPOS}
                className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-gray-700 dark:text-gray-300"
              >
                <ShoppingCart className="w-4 h-4" />
                <span>Sales</span>
              </button>
            )}
            
            {onNavigateToCustomers && (
              <button 
                onClick={onNavigateToCustomers}
                className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-gray-700 dark:text-gray-300"
              >
                <Users className="w-4 h-4" />
                <span>Customers</span>
              </button>
            )}
            
            {onNavigateToReports && (
              <button 
                onClick={onNavigateToReports}
                className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-gray-700 dark:text-gray-300"
              >
                <BarChart3 className="w-4 h-4" />
                <span>Reports</span>
              </button>
            )}
          </div>
        </div>

        {/* Right Section */}
        <div className="flex items-center gap-2 md:gap-3">
          {/* Date/Time and Location Section */}
          <div className="hidden lg:block bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg px-4 py-2">
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span className="font-medium text-gray-700 dark:text-gray-300">{userLocation}</span>
              </div>
              
              <div className="w-px h-4 bg-gray-300 dark:bg-gray-600" />
              
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                <span className="text-gray-600 dark:text-gray-400">{formattedDate}</span>
              </div>
              
              <div className="w-px h-4 bg-gray-300 dark:bg-gray-600" />
              
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                <span className="text-gray-600 dark:text-gray-400 font-mono">{formattedTime}</span>
              </div>
            </div>
          </div>
          
          <div className="h-6 w-px bg-gray-300 dark:bg-gray-600" />
          
          <button className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-gray-700 dark:text-gray-300">
            <RefreshCw className="w-4 h-4" />
          </button>
          
          <div className={`flex items-center gap-2 px-3 py-2 text-sm border rounded-lg ${
            printerStatus === 'online' 
              ? 'border-green-300 dark:border-green-600 bg-green-50 dark:bg-green-900 text-green-700 dark:text-green-300'
              : printerStatus === 'offline'
              ? 'border-red-300 dark:border-red-600 bg-red-50 dark:bg-red-900 text-red-700 dark:text-red-300'
              : 'border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
          }`}>
            <Printer className="w-4 h-4" />
          </div>
          
          <div className="h-6 w-px bg-gray-300 dark:bg-gray-600" />
          
          {/* Account Dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button 
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-gray-700 dark:text-gray-300"
            >
              <User className="w-4 h-4" />
              <span>{userName}</span>
              <ChevronDown className={`w-4 h-4 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
            </button>
            
            {isDropdownOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1">
                {/* Theme Toggle Section */}
                <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-700 dark:text-gray-300">Theme</span>
                    <button
                      onClick={toggleTheme}
                      className="relative inline-flex h-6 w-11 items-center rounded-full bg-gray-300 transition-colors hover:bg-gray-400"
                      style={{
                        backgroundColor: theme === 'dark' ? '#3B82F6' : '#D1D5DB'
                      }}
                    >
                      <span
                        className="inline-block h-4 w-4 transform rounded-full bg-white transition-transform flex items-center justify-center"
                        style={{
                          transform: theme === 'dark' ? 'translateX(1.5rem)' : 'translateX(0.25rem)'
                        }}
                      >
                        {theme === 'dark' ? (
                          <Moon className="w-3 h-3 text-blue-600" />
                        ) : (
                          <Sun className="w-3 h-3 text-gray-500" />
                        )}
                      </span>
                    </button>
                  </div>
                </div>
                
                {onNavigateToSettings && (
                  <button 
                    onClick={() => {
                      onNavigateToSettings();
                      setIsDropdownOpen(false);
                    }}
                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    <Settings className="w-4 h-4" />
                    <span>Settings</span>
                  </button>
                )}
                
                {userRole === 'admin' && onNavigateToAdmin && (
                  <button 
                    onClick={() => {
                      onNavigateToAdmin();
                      setIsDropdownOpen(false);
                    }}
                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    <Shield className="w-4 h-4" />
                    <span>Admin</span>
                  </button>
                )}
                
                <div className="h-px bg-gray-200 dark:bg-gray-700 my-1" />
                
                <button 
                  onClick={() => {
                    onLogout();
                    setIsDropdownOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Logout</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}