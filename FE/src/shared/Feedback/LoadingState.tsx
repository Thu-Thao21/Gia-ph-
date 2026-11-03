import React from 'react';

export interface LoadingStateProps {
  message?: string;
  subMessage?: string;
  compact?: boolean;
}

export const LoadingState: React.FC<LoadingStateProps> = ({
  message = 'Đang đồng bộ dữ liệu phả hệ dòng tộc...',
  subMessage = 'Hệ thống đang truy xuất thông tin từ cơ sở dữ liệu gia phả, xin vui lòng chờ trong giây lát...',
  compact = false,
}) => {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: compact ? '24px 16px' : '48px 24px',
        color: '#475569',
      }}
    >
      <div style={{ position: 'relative', width: compact ? '32px' : '44px', height: compact ? '32px' : '44px', marginBottom: compact ? '10px' : '16px' }}>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            border: `${compact ? '2.5px' : '3px'} solid #dbeafe`,
            borderTopColor: '#2563eb',
            borderRadius: '50%',
            animation: 'genealogy-spin 0.9s cubic-bezier(0.5, 0, 0.5, 1) infinite',
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: compact ? '6px' : '8px',
            border: `${compact ? '2px' : '2.5px'} solid #eff6ff`,
            borderTopColor: '#3b82f6',
            borderRadius: '50%',
            animation: 'genealogy-spin-reverse 1.4s linear infinite',
          }}
        />
      </div>

      <div
        style={{
          fontSize: compact ? '13px' : '14.5px',
          fontWeight: 600,
          color: '#1e293b',
          marginBottom: subMessage && !compact ? '4px' : '0',
        }}
      >
        {message}
      </div>

      {subMessage && !compact && (
        <div
          style={{
            fontSize: '12.5px',
            color: '#64748b',
            maxWidth: '420px',
            lineHeight: 1.5,
          }}
        >
          {subMessage}
        </div>
      )}

      <style>
        {`
          @keyframes genealogy-spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          @keyframes genealogy-spin-reverse {
            0% { transform: rotate(360deg); }
            100% { transform: rotate(0deg); }
          }
        `}
      </style>
    </div>
  );
};

export default LoadingState;
