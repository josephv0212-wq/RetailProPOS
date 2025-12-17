import React, { useState, useEffect } from 'react';
import Toast from './Toast';

let toastIdCounter = 0;
let addToastFunction = null;

export const showToast = (message, type = 'info', duration = 5000) => {
  if (addToastFunction) {
    addToastFunction(message, type, duration);
  }
};

const ToastContainer = () => {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    addToastFunction = (message, type, duration) => {
      const id = toastIdCounter++;
      setToasts(prev => [...prev, { id, message, type, duration }]);
    };

    return () => {
      addToastFunction = null;
    };
  }, []);

  const removeToast = (id) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  };

  return (
    <>
      {toasts.map((toast, index) => (
        <Toast
          key={toast.id}
          message={toast.message}
          type={toast.type}
          duration={toast.duration}
          index={index}
          onClose={() => removeToast(toast.id)}
        />
      ))}
    </>
  );
};

export default ToastContainer;
