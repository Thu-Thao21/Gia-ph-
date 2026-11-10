import React from 'react';
import './LoadingState.css';

export interface LoadingStateProps {
  message?: string;
  subMessage?: string;
  compact?: boolean;
  card?: boolean;
  fullPage?: boolean;
  minHeight?: string | number;
}

export const LoadingState: React.FC<LoadingStateProps> = ({
  message = 'Đang đồng bộ dữ liệu phả hệ dòng tộc...',
  subMessage = 'Hệ thống đang truy xuất thông tin từ cơ sở dữ liệu gia phả, xin vui lòng chờ trong giây lát...',
  compact = false,
  card = !compact,
  fullPage = false,
  minHeight,
}) => {
  const containerClasses = [
    'mfg-loading-container',
    compact ? 'compact-mode' : '',
    card && !compact ? 'card-mode' : '',
    fullPage ? 'full-page-mode' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={containerClasses} style={minHeight ? { minHeight } : undefined}>
      {/* Visual Centerpiece Orbit & Pulse */}
      <div className={`mfg-loading-visual-wrap ${compact ? 'compact' : ''}`}>
        {!compact && <div className="mfg-loading-pulse-ring" />}
        <div className={`mfg-loading-outer-ring ${compact ? 'compact' : 'normal'}`} />
        <div className={`mfg-loading-inner-ring ${compact ? 'compact' : 'normal'}`} />
        <div className={`mfg-loading-core-node ${compact ? 'compact' : 'normal'}`} />
      </div>

      {/* Title */}
      <h4 className={`mfg-loading-title ${compact ? 'compact' : 'normal'}`}>{message}</h4>

      {/* Subtitle */}
      {subMessage && !compact && <p className="mfg-loading-subtitle">{subMessage}</p>}

      {/* Shimmer Stream Bar (Normal mode only) */}
      {!compact && (
        <div className="mfg-loading-progress-track">
          <div className="mfg-loading-progress-beam" />
        </div>
      )}
    </div>
  );
};

export default LoadingState;
