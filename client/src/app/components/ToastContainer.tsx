import React from 'react';
import { Toast, ToastData } from './Toast';

interface ToastContainerProps {
  toasts: ToastData[];
  onRemoveToast: (id: string) => void;
}

export function ToastContainer({ toasts, onRemoveToast }: ToastContainerProps) {
  return (
    <>
      {toasts.map((toast, index) => (
        <Toast
          key={toast.id}
          toast={toast}
          index={index}
          onClose={onRemoveToast}
        />
      ))}
    </>
  );
}
