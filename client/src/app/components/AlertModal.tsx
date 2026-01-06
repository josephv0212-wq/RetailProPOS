import React from 'react';
import { X, Check } from 'lucide-react';

interface AlertModalProps {
  isOpen: boolean;
  title?: string;
  message: string;
  onClose: () => void;
  onConfirm?: () => void;
  confirmText?: string;
  cancelText?: string;
  showCancel?: boolean;
}

export function AlertModal({
  isOpen,
  title,
  message,
  onClose,
  onConfirm,
  confirmText = 'OK',
  cancelText = 'Cancel',
  showCancel = false,
}: AlertModalProps) {
  if (!isOpen) return null;

  const handleConfirm = () => {
    if (onConfirm) {
      onConfirm();
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-[60] p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
        {/* Message and Actions */}
        <div className="px-6 py-6 flex items-center justify-between gap-4">
          <p className="text-gray-700 dark:text-gray-300 flex-1">{message}</p>
          
          {/* Actions */}
          <div className="flex gap-3 flex-shrink-0">
            <button
              onClick={handleConfirm}
              className="p-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
              title={confirmText}
            >
              <Check className="w-5 h-5" />
            </button>
            {showCancel && (
              <button
                onClick={onClose}
                className="p-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
                title={cancelText}
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

