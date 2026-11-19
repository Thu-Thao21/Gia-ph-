import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Sidebar } from '../dashboard/Sidebar';
import './MobileNav.css';

export interface MobileMoreSheetProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: string;
  userName: string;
  userRole: string;
  onSelectTab: (tabId: string) => void;
  onLogout: () => void;
}

/** Kéo xuống quá ngưỡng này (px) thì đóng sheet. */
const SWIPE_CLOSE_THRESHOLD = 80;

/**
 * Bottom sheet "Thêm": tái dùng <Sidebar> để giữ nguyên menu và phân quyền.
 * Đóng bằng Esc, chạm nền, hoặc vuốt xuống ở phần tay cầm/tiêu đề.
 */
export const MobileMoreSheet: React.FC<MobileMoreSheetProps> = ({
  isOpen,
  onClose,
  activeTab,
  userName,
  userRole,
  onSelectTab,
  onLogout,
}) => {
  const [dragY, setDragY] = useState(0);
  const dragStartY = useRef<number | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Esc để đóng + khoá cuộn trang phía sau
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) setDragY(0);
  }, [isOpen]);

  if (!isOpen || typeof document === 'undefined') return null;

  const handlePointerDown = (e: React.PointerEvent) => {
    dragStartY.current = e.clientY;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (dragStartY.current === null) return;
    setDragY(Math.max(0, e.clientY - dragStartY.current));
  };

  const handlePointerEnd = () => {
    if (dragStartY.current === null) return;
    dragStartY.current = null;
    if (dragY > SWIPE_CLOSE_THRESHOLD) {
      onClose();
    } else {
      setDragY(0);
    }
  };

  const handleSelect = (tabId: string) => {
    onClose();
    onSelectTab(tabId);
  };

  const isDragging = dragStartY.current !== null;

  return createPortal(
    <div className="mobile-sheet-root" role="presentation">
      <div className="mobile-sheet-scrim" onClick={onClose} />
      <div
        ref={panelRef}
        className="mobile-sheet-panel mobile-more-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        tabIndex={-1}
        style={{
          transform: dragY ? `translateY(${dragY}px)` : undefined,
          transition: isDragging ? 'none' : undefined,
        }}
      >
        <div
          className="mobile-sheet-drag-area"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
        >
          <div className="mobile-sheet-handle" aria-hidden="true" />
          <div className="mobile-sheet-user">
            <div className="mobile-sheet-avatar">{(userName || '?').charAt(0).toUpperCase()}</div>
            <div className="mobile-sheet-user-text">
              <div className="mobile-sheet-user-name">{userName}</div>
              <div className="mobile-sheet-user-role">{userRole}</div>
            </div>
            <button
              type="button"
              className="mobile-sheet-close"
              onClick={onClose}
              onPointerDown={(e) => e.stopPropagation()}
              aria-label="Đóng menu"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="mobile-sheet-body">
          <Sidebar
            activeTab={activeTab}
            onSelectTab={handleSelect}
            isCollapsed={false}
            userRole={userRole}
          />
        </div>

        <div className="mobile-sheet-footer">
          <button
            type="button"
            className="mobile-sheet-logout"
            onClick={() => {
              onClose();
              onLogout();
            }}
          >
            Đăng xuất
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default MobileMoreSheet;
