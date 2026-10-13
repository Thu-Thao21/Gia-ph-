import React from 'react';
import './EmptyState.css';

interface EmptyStateProps {
  message?: string;
  subMessage?: string;
  icon?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ message, subMessage, icon }) => {
  return (
    <div className="empty-state-container">
      <div className="empty-state-icon">
        {icon || (
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <line x1="9" y1="3" x2="9" y2="21" />
          </svg>
        )}
      </div>
      <h3 className="empty-state-message">{message || 'Không có dữ liệu'}</h3>
      {subMessage && <p className="empty-state-submessage">{subMessage}</p>}
    </div>
  );
};

export default EmptyState;
