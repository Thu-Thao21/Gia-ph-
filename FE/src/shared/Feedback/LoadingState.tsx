import React from 'react';

interface LoadingStateProps {
  message?: string;
}

export const LoadingState: React.FC<LoadingStateProps> = ({ message }) => {
  return (
    <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
      <div style={{ 
        display: 'inline-block', 
        width: '32px', 
        height: '32px', 
        border: '3px solid #e2e8f0', 
        borderTopColor: '#3b82f6', 
        borderRadius: '50%', 
        animation: 'spin 1s linear infinite',
        marginBottom: '16px'
      }} />
      <div style={{ fontWeight: 500 }}>{message || 'Đang tải...'}</div>
      <style>
        {`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}
      </style>
    </div>
  );
};

export default LoadingState;
