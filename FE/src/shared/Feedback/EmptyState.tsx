import React from 'react';
import './EmptyState.css';

export type EmptyStateVariant =
  | 'calendar'
  | 'history'
  | 'tree'
  | 'members'
  | 'requests'
  | 'files'
  | 'chart'
  | 'default';

export interface EmptyStateProps {
  variant?: EmptyStateVariant;
  title?: string;
  message?: string;
  subMessage?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  compact?: boolean;
}

const DEFAULT_CONFIGS: Record<EmptyStateVariant, { title: string; subMessage: string }> = {
  calendar: {
    title: 'Sổ gia phả chưa ghi nhận ngày giỗ hoặc sự kiện sắp tới',
    subMessage: 'Các ngày giỗ tổ, lễ hội, lễ mừng thọ và việc họ sẽ hiển thị trang trọng tại đây khi được Trưởng tộc cập nhật.',
  },
  history: {
    title: 'Chưa có hoạt động mới nào được ghi nhận gần đây',
    subMessage: 'Nhật ký các thao tác chỉnh sửa phả hệ, phê duyệt thành viên và kết nối dòng họ sẽ được lưu vết trang trọng tại đây.',
  },
  tree: {
    title: 'Chưa thiết lập mối liên kết quan hệ phả hệ',
    subMessage: 'Vui lòng kết nối các thế hệ (cha mẹ, vợ chồng hoặc con cái) để hệ thống tự động dệt nên cây gia phả hoàn chỉnh.',
  },
  members: {
    title: 'Chưa có thông tin nhân khẩu trong danh mục này',
    subMessage: 'Dòng họ hiện chưa có hồ sơ thành viên nào phù hợp với điều kiện tìm kiếm hoặc bộ lọc hiện tại.',
  },
  requests: {
    title: 'Không có yêu cầu hay đề xuất nào đang chờ xử lý',
    subMessage: 'Tất cả các hồ sơ xin gia nhập dòng họ và đề xuất chỉnh sửa thông tin phả hệ hiện đã được duyệt trọn vẹn.',
  },
  files: {
    title: 'Chưa có tệp tài liệu hay dữ liệu trích xuất',
    subMessage: 'Bạn có thể tải lên tệp gia phả mẫu (Excel/CSV) hoặc tạo bản sao lưu dữ liệu dòng tộc.',
  },
  chart: {
    title: 'Chưa đủ dữ liệu thành viên để lập đồ thị thống kê',
    subMessage: 'Đồ thị phân bổ thế hệ, độ tuổi và giới tính sẽ tự động hình thành khi có thêm dữ liệu thành viên trong gia tộc.',
  },
  default: {
    title: 'Chưa có dữ liệu ghi nhận',
    subMessage: 'Hệ thống hiện chưa tìm thấy thông tin phù hợp với mục bạn đang xem.',
  },
};

export const EmptyState: React.FC<EmptyStateProps> = ({
  variant = 'default',
  title,
  message,
  subMessage,
  action,
  icon,
  compact = false,
}) => {
  const config = DEFAULT_CONFIGS[variant] || DEFAULT_CONFIGS.default;
  const displayTitle = title || message || config.title;
  const displaySub = subMessage !== undefined ? subMessage : config.subMessage;

  const renderDefaultIcon = () => {
    switch (variant) {
      case 'calendar':
        return (
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
            <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01" />
          </svg>
        );
      case 'history':
        return (
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            <line x1="9" y1="7" x2="15" y2="7" />
            <line x1="9" y1="11" x2="13" y2="11" />
          </svg>
        );
      case 'tree':
        return (
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="3" width="6" height="5" rx="1.5" />
            <rect x="3" y="16" width="6" height="5" rx="1.5" />
            <rect x="15" y="16" width="6" height="5" rx="1.5" />
            <path d="M12 8v4M6 16v-2a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2" />
          </svg>
        );
      case 'members':
        return (
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
        );
      case 'requests':
        return (
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
        );
      case 'files':
        return (
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="12" y1="18" x2="12" y2="12" />
            <line x1="9" y1="15" x2="15" y2="15" />
          </svg>
        );
      case 'chart':
        return (
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="20" x2="18" y2="10" />
            <line x1="12" y1="20" x2="12" y2="4" />
            <line x1="6" y1="20" x2="6" y2="14" />
            <line x1="2" y1="20" x2="22" y2="20" />
          </svg>
        );
      default:
        return (
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        );
    }
  };

  return (
    <div className={`genealogy-empty-state ${compact ? 'is-compact' : ''}`}>
      <div className="genealogy-empty-icon-wrap">
        {icon || renderDefaultIcon()}
      </div>
      <h4 className="genealogy-empty-title">{displayTitle}</h4>
      {displaySub && <p className="genealogy-empty-desc">{displaySub}</p>}
      {action && <div className="genealogy-empty-action">{action}</div>}
    </div>
  );
};

export default EmptyState;
