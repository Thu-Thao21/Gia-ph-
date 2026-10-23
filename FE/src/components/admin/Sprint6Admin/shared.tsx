import React, { useCallback, useEffect, useMemo, useState } from 'react';
import './Sprint6Admin.css';

export type ToastTone = 'success' | 'error' | 'info';

export interface ToastMessage {
  id: number;
  message: string;
  tone: ToastTone;
}

export function useAdminToast() {
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const showToast = useCallback((message: string, tone: ToastTone = 'success') => {
    setToast({ id: Date.now(), message, tone });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  return { toast, showToast, dismissToast: () => setToast(null) };
}

export const AdminToast: React.FC<{
  toast: ToastMessage | null;
  onDismiss: () => void;
}> = ({ toast, onDismiss }) => {
  if (!toast) return null;

  return (
    <div className={`s6a-toast ${toast.tone}`} role="status" aria-live="polite">
      <span className="s6a-toast-icon" aria-hidden="true">
        {toast.tone === 'success' ? '✓' : toast.tone === 'error' ? '!' : 'i'}
      </span>
      <span>{toast.message}</span>
      <button type="button" onClick={onDismiss} aria-label="Đóng thông báo">×</button>
    </div>
  );
};

export const AdminPageHeader: React.FC<{
  eyebrow: string;
  title: React.ReactNode;
  description: string;
  actions?: React.ReactNode;
}> = ({ eyebrow, title, description, actions }) => (
  <header className="s6a-page-header">
    <div>
      <span className="s6a-eyebrow">{eyebrow}</span>
      <h1>{title}</h1>
      <p>{description}</p>
    </div>
    {actions && <div className="s6a-header-actions">{actions}</div>}
  </header>
);

export const AdminStatusBadge: React.FC<{ status: string; label?: string }> = ({ status, label }) => {
  const normalized = status.toLowerCase().replace(/\s+/g, '-');
  const defaultLabels: Record<string, string> = {
    active: 'Đang hoạt động',
    draft: 'Bản nháp',
    disabled: 'Đã tắt',
    pending: 'Đang chờ',
    success: 'Thành công',
    failed: 'Thất bại',
    refunded: 'Đã hoàn tiền',
    reviewing: 'Đang xử lý',
    resolved: 'Đã giải quyết',
    rejected: 'Đã từ chối',
    high: 'Ưu tiên cao',
    medium: 'Ưu tiên vừa',
    low: 'Ưu tiên thấp',
    hidden: 'Đã ẩn',
  };

  return <span className={`s6a-status s6a-status-${normalized}`}>{label || defaultLabels[normalized] || status}</span>;
};

export const AdminStatePanel: React.FC<{
  kind: 'loading' | 'empty' | 'error';
  title?: string;
  message: string;
  action?: React.ReactNode;
}> = ({ kind, title, message, action }) => (
  <div className={`s6a-state-panel ${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
    {kind === 'loading' && <span className="s6a-spinner" aria-hidden="true" />}
    <div>
      {title && <strong>{title}</strong>}
      <p>{message}</p>
    </div>
    {action}
  </div>
);

export interface AdminModalProps {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

export const AdminModal: React.FC<AdminModalProps> = ({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  size = 'md',
}) => {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="s6a-modal-backdrop" onMouseDown={onClose}>
      <section
        className={`s6a-modal s6a-modal-${size}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="s6a-modal-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="s6a-modal-header">
          <div>
            <h2 id="s6a-modal-title">{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <button type="button" className="s6a-icon-button" onClick={onClose} aria-label="Đóng hộp thoại">×</button>
        </div>
        <div className="s6a-modal-body">{children}</div>
        {footer && <div className="s6a-modal-footer">{footer}</div>}
      </section>
    </div>
  );
};

export const AdminConfirmDialog: React.FC<{
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  tone?: 'primary' | 'danger';
  disabled?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}> = ({ open, title, message, confirmLabel, tone = 'primary', disabled = false, onCancel, onConfirm }) => (
  <AdminModal
    open={open}
    title={title}
    description="Hãy kiểm tra kỹ trước khi tiếp tục."
    onClose={disabled ? () => {} : onCancel}
    size="sm"
    footer={
      <>
        <button type="button" className="s6a-button secondary" onClick={onCancel} disabled={disabled}>Hủy</button>
        <button
          type="button"
          className={`s6a-button ${tone}`}
          onClick={onConfirm}
          disabled={disabled}
          data-testid="btn-confirm-dialog"
        >
          {disabled ? 'Đang xử lý...' : confirmLabel}
        </button>
      </>
    }
  >
    <div className={`s6a-confirm-message ${tone}`}>{message}</div>
  </AdminModal>
);

export const AdminPagination: React.FC<{
  page: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}> = ({ page, totalItems, pageSize, onPageChange }) => {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const pages = useMemo(() => Array.from({ length: totalPages }, (_, index) => index + 1), [totalPages]);
  const first = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, totalItems);

  return (
    <div className="s6a-pagination">
      <span>Hiển thị {first}–{last} trong {totalItems} mục</span>
      <div className="s6a-page-buttons" aria-label="Phân trang">
        <button type="button" onClick={() => onPageChange(page - 1)} disabled={page <= 1} aria-label="Trang trước">‹</button>
        {pages.map((pageNumber) => (
          <button
            type="button"
            key={pageNumber}
            className={pageNumber === page ? 'active' : ''}
            onClick={() => onPageChange(pageNumber)}
            aria-current={pageNumber === page ? 'page' : undefined}
          >
            {pageNumber}
          </button>
        ))}
        <button type="button" onClick={() => onPageChange(page + 1)} disabled={page >= totalPages} aria-label="Trang sau">›</button>
      </div>
    </div>
  );
};

export function formatVnd(amount: number): string {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(amount);
}

export function formatAdminDate(value: string, includeTime = false): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    ...(includeTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(date);
}
