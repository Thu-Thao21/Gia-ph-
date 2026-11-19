import React, { useEffect } from 'react';
import './FeatureUI.css';

export type FeatureIconName = 'search' | 'plus' | 'eye' | 'edit' | 'delete' | 'download' | 'upload' | 'check' | 'close' | 'chevron-left' | 'chevron-right' | 'calendar' | 'filter' | 'more' | 'lock' | 'info';

export const FeatureIcon = ({ name, size = 18 }: { name: FeatureIconName; size?: number }) => {
  const paths: Record<FeatureIconName, React.ReactNode> = {
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" /></>,
    plus: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
    eye: <><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" /><circle cx="12" cy="12" r="2.5" /></>,
    edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" /></>,
    delete: <><path d="M4 7h16" /><path d="M9 7V4h6v3" /><path d="m7 7 1 13h8l1-13" /><path d="M10 11v5M14 11v5" /></>,
    download: <><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></>,
    upload: <><path d="M12 16V4" /><path d="m7 9 5-5 5 5" /><path d="M5 20h14" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    close: <><path d="m6 6 12 12" /><path d="m18 6-12 12" /></>,
    'chevron-left': <path d="m15 18-6-6 6-6" />,
    'chevron-right': <path d="m9 18 6-6-6-6" />,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
    filter: <path d="M4 5h16l-6 7v6l-4 2v-8Z" />,
    more: <><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" /></>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 8h.01" /></>,
  };
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
};

export const FeatureModal = ({ title, eyebrow, onClose, children, footer, wide = false }: { title: string; eyebrow?: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean }) => {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return <div className="feature-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className={`feature-modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
      <header className="feature-modal-header"><div>{eyebrow && <span>{eyebrow}</span>}<h2>{title}</h2></div><button type="button" onClick={onClose} aria-label="Đóng"><FeatureIcon name="close" /></button></header>
      <div className="feature-modal-body">{children}</div>
      {footer && <footer className="feature-modal-footer">{footer}</footer>}
    </section>
  </div>;
};

export const ConfirmDialog = ({ title, description, confirmLabel = 'Xác nhận', cancelLabel = 'Hủy', danger = false, onConfirm, onCancel }: { title: string; description: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean; onConfirm: () => void; onCancel: () => void }) => <FeatureModal title={title} eyebrow="XÁC NHẬN THAO TÁC" onClose={onCancel} footer={<><button type="button" className="feature-button secondary" onClick={onCancel}>{cancelLabel}</button><button type="button" className={`feature-button ${danger ? 'danger' : 'primary'}`} onClick={onConfirm}>{confirmLabel}</button></>}><p className="feature-confirm-copy">{description}</p></FeatureModal>;

export const FeatureToast = ({ message, tone = 'success', onClose }: { message: string; tone?: 'success' | 'error' | 'info'; onClose?: () => void }) => {
  useEffect(() => {
    if (!onClose) return;
    const timer = window.setTimeout(onClose, 2800);
    return () => window.clearTimeout(timer);
  }, [message, onClose]);
  return <div className={`feature-toast ${tone}`} role="status"><span className="feature-toast-icon">{tone === 'success' ? <FeatureIcon name="check" /> : <FeatureIcon name="info" />}</span><span>{message}</span>{onClose && <button type="button" onClick={onClose} aria-label="Đóng thông báo"><FeatureIcon name="close" size={15} /></button>}</div>;
};

export const FeaturePagination = ({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (page: number) => void }) => {
  if (totalPages <= 1) return null;
  return <nav className="feature-pagination" aria-label="Phân trang">
    <button type="button" aria-label="Trang trước" disabled={page <= 1} onClick={() => onChange(page - 1)}><FeatureIcon name="chevron-left" /></button>
    {Array.from({ length: totalPages }, (_, index) => index + 1).map((item) => <button type="button" key={item} aria-current={item === page ? 'page' : undefined} className={item === page ? 'active' : ''} onClick={() => onChange(item)}>{item}</button>)}
    <button type="button" aria-label="Trang sau" disabled={page >= totalPages} onClick={() => onChange(page + 1)}><FeatureIcon name="chevron-right" /></button>
  </nav>;
};

export const FeatureEmptyState = ({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) => <div className="feature-empty-state"><div className="feature-empty-icon"><FeatureIcon name="search" size={24} /></div><strong>{title}</strong><p>{description}</p>{action}</div>;
