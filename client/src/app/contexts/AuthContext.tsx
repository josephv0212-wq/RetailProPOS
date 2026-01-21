import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { authAPI } from '../../services/api';
import { logger } from '../../utils/logger';

interface User {
  id: number;
  useremail: string;
  name?: string | null;
  role: 'cashier' | 'admin';
  locationId: string;
  locationName: string;
  taxPercentage: number;
  isActive?: boolean;
  terminalIP?: string | null;
  terminalPort?: number | string | null;
  terminalNumber?: string | null;
  cardReaderMode?: 'integrated' | 'standalone';
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (useremail: string, password: string, rememberDevice?: boolean) => Promise<{ success: boolean; message?: string }>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check for existing token and load user on mount
  useEffect(() => {
    const loadUser = async () => {
      // Check both localStorage and sessionStorage for token
      const token = localStorage.getItem('token') || sessionStorage.getItem('token');
      if (token) {
        try {
          const response = await authAPI.getCurrentUser();
          if (response.success && response.data?.user) {
            setUser(response.data.user);
          } else {
            // Token might be invalid, clear it
            authAPI.logout();
          }
        } catch (error) {
          logger.error('Failed to load user', error);
          authAPI.logout();
        }
      }
      setIsLoading(false);
    };

    loadUser();
  }, []);

  const login = async (useremail: string, password: string, rememberDevice: boolean = true) => {
    try {
      const response = await authAPI.login(useremail, password, rememberDevice);
      if (response.success && response.data?.user) {
        setUser(response.data.user);
        return { success: true };
      } else {
        return { success: false, message: response.message || 'Login failed' };
      }
    } catch (error: any) {
      return { success: false, message: error.message || 'Login failed' };
    }
  };

  const logout = () => {
    authAPI.logout();
    setUser(null);
  };

  const refreshUser = async () => {
    try {
      const response = await authAPI.getCurrentUser();
      if (response.success && response.data?.user) {
        setUser(response.data.user);
      }
    } catch (error) {
      console.error('Failed to refresh user:', error);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

