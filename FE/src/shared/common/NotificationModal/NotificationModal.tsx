import React, { useEffect } from 'react';
import './NotificationModal.css';

export interface NotificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  icon?: string;
}

export const NotificationModal: React.FC<NotificationModalProps> = ({
  isOpen,
  onClose,
  icon = '',
}) => {
  useEffect(() => {
    if (!isOpen) return;

    // Auto dismiss after 2 seconds
    const timer = setTimeout(() => {
      onClose();
    }, 2000);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="processing-toast-backdrop" onClick={onClose}>
      <div className="processing-toast-card" onClick={(e) => e.stopPropagation()}>
        <div className="processing-toast-logo-wrap">
          <div className="processing-toast-ring-outer"></div>
          <div className="processing-toast-ring"></div>
          <span className="processing-toast-icon-inner">{icon}</span>
        </div>
        <div className="processing-toast-text">
          Đang xử lý
          <span className="processing-dots">
            <span>.</span>
            <span>.</span>
            <span>.</span>
          </span>
        </div>
      </div>
    </div>
  );
};

export default NotificationModal;
