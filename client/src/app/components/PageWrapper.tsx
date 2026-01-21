import React from 'react';
import { TopNavigation } from './TopNavigation';

interface PageWrapperProps {
  storeName: string;
  userName: string;
  userRole?: 'admin' | 'cashier';
  userLocation?: string;
  onLogout: () => void;
  onNavigateToPOS: () => void;
  onNavigateToCustomers: () => void;
  onNavigateToReports: () => void;
  onNavigateToSettings: () => void;
  onNavigateToAdmin: () => void;
  children: React.ReactNode;
}

/**
 * Reusable wrapper component for pages that need TopNavigation
 * Reduces code duplication across different screen components
 */
export function PageWrapper({
  storeName,
  userName,
  userRole = 'cashier',
  userLocation = 'Store',
  onLogout,
  onNavigateToPOS,
  onNavigateToCustomers,
  onNavigateToReports,
  onNavigateToSettings,
  onNavigateToAdmin,
  children,
}: PageWrapperProps) {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <TopNavigation
        storeName={storeName}
        userName={userName}
        onLogout={onLogout}
        onNavigateToPOS={onNavigateToPOS}
        onNavigateToCustomers={onNavigateToCustomers}
        onNavigateToReports={onNavigateToReports}
        onNavigateToSettings={onNavigateToSettings}
        onNavigateToAdmin={onNavigateToAdmin}
        userRole={userRole}
        userLocation={userLocation}
      />
      <div className="pt-[73px]">
        {children}
      </div>
    </div>
  );
}
