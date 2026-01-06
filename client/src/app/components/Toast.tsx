import { useEffect, useState, MouseEvent } from 'react';
import { X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastData {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
}

interface ToastProps {
  toast: ToastData;
  index: number;
  onClose: (id: string) => void;
}

const toastStyles: Record<ToastType, { bg: string; icon: string }> = {
  success: { bg: 'bg-green-500', icon: '✅' },
  error: { bg: 'bg-red-500', icon: '❌' },
  warning: { bg: 'bg-amber-500', icon: '⚠️' },
  info: { bg: 'bg-blue-500', icon: 'ℹ️' }
};

export function Toast({ toast, index, onClose }: ToastProps) {
  const [isExiting, setIsExiting] = useState(false);
  const { bg, icon } = toastStyles[toast.type];
  const duration = toast.duration || 5000;

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsExiting(true);
      setTimeout(() => onClose(toast.id), 300);
    }, duration);

    return () => clearTimeout(timer);
  }, [toast.id, duration, onClose]);

  const handleClose = (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsExiting(true);
    setTimeout(() => onClose(toast.id), 300);
  };

  return (
    <div
      className={`fixed right-5 ${bg} text-white px-5 py-4 rounded-lg shadow-lg max-w-md flex items-center gap-3 transition-all duration-300 ease-out z-[9999] ${
        isExiting 
          ? 'opacity-0 -translate-y-24' 
          : 'opacity-100 translate-x-0'
      }`}
      style={{ 
        top: `${20 + index * 80}px`,
        animation: isExiting ? 'none' : 'slideInRight 0.3s ease-out'
      }}
    >
      <span className="text-xl flex-shrink-0">{icon}</span>
      <span className="flex-1 text-sm font-medium">{toast.message}</span>
      <button
        type="button"
        onClick={handleClose}
        className="flex-shrink-0 text-white opacity-80 hover:opacity-100 transition-opacity"
        aria-label="Close"
      >
        <X className="w-5 h-5" />
      </button>
      
      <style>{`
        @keyframes slideInRight {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}
