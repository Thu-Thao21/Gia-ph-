import React, { useEffect, useState } from 'react';
import './Toast.css';

export type ToastType = 'success' | 'error' | 'warning' | 'info' | 'loading';

export interface ToastData {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number; // ms, 0 = permanent
}

interface ToastItemProps {
  toast: ToastData;
  onClose: (id: string) => void;
}

const TOAST_ICONS: Record<ToastType, string> = {
  success: '✓',
  error: '✕',
  warning: '⚠',
  info: 'ℹ',
  loading: '',
};

const TOAST_TITLES: Record<ToastType, string> = {
  success: 'Thành công',
  error: 'Có lỗi xảy ra',
  warning: 'Cảnh báo',
  info: 'Thông tin',
  loading: 'Đang xử lý',
};

const ToastItem: React.FC<ToastItemProps> = ({ toast, onClose }) => {
  const [exiting, setExiting] = useState(false);
  const duration = toast.duration ?? (toast.type === 'loading' ? 0 : 4000);

  const close = () => {
    setExiting(true);
    setTimeout(() => onClose(toast.id), 340);
  };

  useEffect(() => {
    if (duration === 0) return;
    const t = setTimeout(close, duration);
    return () => clearTimeout(t);
  }, [duration]);

  return (
    <div
      className={`toast-item toast-${toast.type}${exiting ? ' toast-exit' : ''}`}
      style={{ '--toast-duration': `${duration / 1000}s` } as React.CSSProperties}
      onClick={close}
    >
      {/* Icon */}
      <div className="toast-icon-wrap">
        {toast.type === 'loading' ? (
          <div className="toast-spinner" />
        ) : (
          <span style={{ fontWeight: 900 }}>{TOAST_ICONS[toast.type]}</span>
        )}
      </div>

      {/* Body */}
      <div className="toast-body">
        <div className="toast-title">
          {toast.title || TOAST_TITLES[toast.type]}
        </div>
        {toast.message && (
          <div className="toast-message">{toast.message}</div>
        )}
      </div>

      {/* Close */}
      {toast.type !== 'loading' && (
        <button
          className="toast-close-btn"
          onClick={(e) => { e.stopPropagation(); close(); }}
          aria-label="Đóng thông báo"
        >
          ✕
        </button>
      )}
    </div>
  );
};

interface ToastContainerProps {
  toasts: ToastData[];
  onClose: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onClose }) => {
  if (toasts.length === 0) return null;
  return (
    <div className="toast-container" role="region" aria-label="Thông báo">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onClose={onClose} />
      ))}
    </div>
  );
};

export default ToastContainer;
