import { createContext, useContext, useState, ReactNode, useCallback } from 'react';
import { AlertModal } from '../components/AlertModal';

interface AlertOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm?: () => void;
}

interface AlertState {
  isOpen: boolean;
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm?: () => void;
  resolve?: (value: boolean) => void;
}

interface AlertContextType {
  showAlert: (options: AlertOptions) => void;
  showConfirm: (options: AlertOptions) => Promise<boolean>;
}

const AlertContext = createContext<AlertContextType | undefined>(undefined);

export function AlertProvider({ children }: { children: ReactNode }) {
  const [alertState, setAlertState] = useState<AlertState>({
    isOpen: false,
    message: '',
  });

  const showAlert = useCallback((options: AlertOptions) => {
    setAlertState({
      isOpen: true,
      title: options.title,
      message: options.message,
      confirmText: options.confirmText,
      cancelText: options.cancelText,
      onConfirm: options.onConfirm,
    });
  }, []);

  const showConfirm = useCallback((options: AlertOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setAlertState({
        isOpen: true,
        title: options.title,
        message: options.message,
        confirmText: options.confirmText || 'OK',
        cancelText: options.cancelText || 'Cancel',
        onConfirm: options.onConfirm,
        resolve,
      });
    });
  }, []);

  const handleClose = useCallback(() => {
    if (alertState.resolve) {
      alertState.resolve(false);
    }
    setAlertState((prev) => ({ ...prev, isOpen: false, resolve: undefined }));
  }, [alertState.resolve]);

  const handleConfirm = useCallback(() => {
    if (alertState.onConfirm) {
      alertState.onConfirm();
    }
    if (alertState.resolve) {
      alertState.resolve(true);
    }
    setAlertState((prev) => ({ ...prev, isOpen: false, resolve: undefined }));
  }, [alertState.onConfirm, alertState.resolve]);

  return (
    <AlertContext.Provider value={{ showAlert, showConfirm }}>
      {children}
      <AlertModal
        isOpen={alertState.isOpen}
        title={alertState.title}
        message={alertState.message}
        onClose={handleClose}
        onConfirm={handleConfirm}
        confirmText={alertState.confirmText}
        cancelText={alertState.cancelText}
        showCancel={!!alertState.resolve}
      />
    </AlertContext.Provider>
  );
}

export function useAlert() {
  const context = useContext(AlertContext);
  if (context === undefined) {
    throw new Error('useAlert must be used within an AlertProvider');
  }
  return context;
}

