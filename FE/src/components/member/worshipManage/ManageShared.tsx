import React, { useEffect, useId, useState } from 'react';
import {
  fetchWorshipImageObjectUrl,
  type HallResponse,
  type TabletItem,
  type TierBrief,
} from '../../../services/worshipHall.service';
import { initialsOf, isApiRelativePath } from './manageLogic';

/** Trạng thái và hành động dùng chung giữa các tab của panel quản lý bàn thờ. */
export interface ManageCtx {
  clanId: string;
  /** Ảnh chụp mới nhất của GET hall (cập nhật sau mỗi thao tác). */
  hall: HallResponse;
  /** Các tầng, đã sắp theo số tầng. */
  tiers: TierBrief[];
  /** TOÀN BỘ bài vị (mọi tầng, kể cả đang ẩn), sắp theo tầng rồi thứ tự. */
  tablets: TabletItem[];
  tabletsLoading: boolean;
  busyKey: string | null;
  /** Thông báo lỗi tiếng Việt gần nhất (null nếu không có). */
  errorMessage: string | null;
  clearError: () => void;
  /**
   * Chạy một thao tác ghi: khóa nút, bắt lỗi (hiện thông báo tiếng Việt), thành công thì tải lại hall + danh sách.
   * `light`: chỉ tải lại hall của trang (không tải lại danh sách bài vị), dùng cho lời viếng.
   * Trả về kết quả của thao tác, hoặc undefined nếu lỗi.
   */
  run: <T,>(
    key: string,
    action: () => Promise<T>,
    okMessage: string | ((result: T) => string),
    options?: { light?: boolean }
  ) => Promise<T | undefined>;
  reportError: (err: unknown) => void;
  notify: (message: string) => void;
  /** Báo cho khung ngoài biết đang có hộp thoại con (cắt ảnh): Esc / bấm nền không đóng panel. */
  lockClose: (locked: boolean) => void;
}

/** Ảnh bài vị: đường dẫn BE cần token nên tải bằng apiClient (blob URL); URL khác dùng thẳng. Không có ảnh thì hiện chữ viết tắt. */
export const AuthImage: React.FC<{
  src: string | null | undefined;
  alt: string;
  fallbackText: string;
  className?: string;
}> = ({ src, alt, fallbackText, className }) => {
  const [resolved, setResolved] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const raw = src ? src.trim() : '';

  useEffect(() => {
    setFailed(false);
    if (!raw) {
      setResolved(null);
      return undefined;
    }
    if (!isApiRelativePath(raw)) {
      setResolved(raw);
      return undefined;
    }
    let cancelled = false;
    setResolved(null);
    fetchWorshipImageObjectUrl(raw)
      .then((url) => {
        if (!cancelled) setResolved(url);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [raw]);

  if (!raw || failed || !resolved) {
    return (
      <span className={`wm-thumb wm-thumb-empty ${className || ''}`} role="img" aria-label={alt}>
        {fallbackText}
      </span>
    );
  }
  return <img className={`wm-thumb ${className || ''}`} src={resolved} alt={alt} loading="lazy" onError={() => setFailed(true)} />;
};

export const TabletThumb: React.FC<{ tablet: TabletItem }> = ({ tablet }) => (
  <AuthImage
    src={tablet.thumbnailUrl || tablet.portraitUrl}
    alt={`Ảnh của ${tablet.fullName}`}
    fallbackText={initialsOf(tablet.fullName)}
  />
);

/** Nút bật/tắt dạng công tắc, đọc được bằng trình đọc màn hình. */
export const Switch: React.FC<{
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
}> = ({ checked, onChange, label, hint, disabled }) => {
  const labelId = useId();
  return (
    <div className="wm-switch-row">
      <div>
        <strong id={labelId}>{label}</strong>
        {hint && <small>{hint}</small>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={labelId}
        className={`wm-switch ${checked ? 'is-on' : ''}`}
        disabled={disabled}
        onClick={() => onChange(!checked)}
      >
        <span aria-hidden="true" />
      </button>
    </div>
  );
};

/** Hộp xác nhận ngay trong trang (không dùng hộp thoại xác nhận của trình duyệt). */
export const InlineConfirm: React.FC<{
  message: string;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: React.ReactNode;
}> = ({ message, confirmLabel, busy, onConfirm, onCancel, children }) => (
  <div className="wm-confirm" role="alertdialog" aria-label={message}>
    <p>{message}</p>
    {children}
    <div className="wm-confirm-actions">
      <button type="button" className="wm-btn wm-btn-danger" onClick={onConfirm} disabled={busy}>
        {busy ? 'Đang xử lý…' : confirmLabel}
      </button>
      <button type="button" className="wm-btn" onClick={onCancel} disabled={busy}>
        Hủy
      </button>
    </div>
  </div>
);
