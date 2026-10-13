import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { ToastContainer, ToastData, ToastType } from './Toast';

interface ToastContextValue {
  showToast: (options: Omit<ToastData, 'id'>) => string;
  dismissToast: (id: string) => void;
  success: (title: string, message?: string) => string;
  error: (title: string, message?: string) => string;
  warning: (title: string, message?: string) => string;
  info: (title: string, message?: string) => string;
  loading: (title: string, message?: string) => string;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let _counter = 0;
const genId = () => `toast-${++_counter}-${Date.now()}`;

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastData[]>([]);

  const showToast = useCallback((options: Omit<ToastData, 'id'>): string => {
    const id = genId();
    setToasts((prev) => [...prev, { ...options, id }]);
    return id;
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const make = (type: ToastType) => (title: string, message?: string): string =>
    showToast({ type, title, message });

  const ctx: ToastContextValue = {
    showToast,
    dismissToast,
    success: make('success'),
    error: make('error'),
    warning: make('warning'),
    info: make('info'),
    loading: make('loading'),
  };

  return (
    <ToastContext.Provider value={ctx}>
      {children}
      <ToastContainer toasts={toasts} onClose={dismissToast} />
    </ToastContext.Provider>
  );
};

export const useToast = (): ToastContextValue => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
};
