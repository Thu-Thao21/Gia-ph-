import React from 'react';
import logoImage from '../../../assets/logo.jpg';
import './AdminDashboard.css';
import BusinessRegistrationsChart from './BusinessRegistrationsChart';

export interface AdminDashboardProps {
  userName: string;
  onNavigateTab: (tabId: string) => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  userName,
  onNavigateTab,
}) => {
  const metricCards = [
    {
      title: 'Không Gian Dòng Họ (Business)',
      value: '0',
      unit: 'Dòng họ',
      subtext: '0 đang hoạt động • 0 chờ kích hoạt',
      tag: 'Họ tộc',
      accentColor: '#0284c7',
      tab: 'admin-businesses',
    },
    {
      title: 'Tài Khoản Toàn Hệ Thống',
      value: '0',
      unit: 'Tài khoản',
      subtext: '0 Trưởng tộc • 0 Người dùng',
      tag: 'Tài khoản',
      accentColor: '#0284c7',
      tab: 'admin-accounts',
    },
    {
      title: 'Hồ Sơ Thành Viên Phả Hệ',
      value: '0',
      unit: 'Cá nhân',
      subtext: 'Gia phả số hóa kết nối đa dòng họ',
      tag: 'Phả hệ',
      accentColor: '#0284c7',
      tab: 'admin-businesses',
    },
    {
      title: 'Doanh Thu Dịch Vụ (Năm nay)',
      value: '0',
      unit: 'VNĐ',
      subtext: 'Đang cập nhật...',
      tag: 'Tài chính',
      accentColor: '#0284c7',
      tab: 'admin-payments',
    },
    {
      title: 'Dung Lượng Lưu Trữ Đám Mây',
      value: '0',
      unit: 'GB / 1000 GB',
      subtext: 'Đang cập nhật...',
      tag: 'Hạ tầng',
      accentColor: '#0284c7',
      tab: 'admin-data-backup',
    },
    {
      title: 'Yêu Cầu & Báo Cáo Chờ Xử Lý',
      value: '0',
      unit: 'Mục chờ duyệt',
      subtext: '0 đơn mở Business • 0 báo cáo vi phạm',
      tag: 'Kiểm duyệt',
      accentColor: '#0284c7',
      tab: 'admin-business-requests',
    },
  ];

  const services = [
    { name: 'Cơ sở Dữ liệu Phả hệ Đa Dòng họ (PostgreSQL Cluster)', status: 'Trực tuyến 100%', sub: 'Độ trễ phản hồi: 18ms' },
    { name: 'Dịch vụ Xác thực Tài khoản & Phiên bảo mật (OAuth2/JWT)', status: 'Bảo mật an toàn', sub: 'Mã hóa WORM & 2FA sẵn sàng' },
    { name: 'Engine Phân tích Huyết thống & Quan hệ AI', status: 'Sẵn sàng xử lý', sub: 'Mô hình phả hệ 2026 v2.4' },
    { name: 'Hệ thống Lưu trữ Snapshot Sao lưu Đám mây', status: 'Bản gần nhất: 03:00', sub: 'Checksum toàn vẹn SHA-256' },
  ];

  return (
    <div className="admin-dash-container">
      {/* Welcome Banner */}
      <div className="admin-header-banner">
        <div 
          className="admin-header-banner-bg-logo"
          style={{ backgroundImage: `url(${logoImage})` }}
        />
        <div className="admin-header-banner-inner" style={{ position: 'relative', zIndex: 1 }}>
          <div className="admin-system-tag">HỆ THỐNG QUẢN TRỊ NỀN TẢNG TOÀN CỤC • SYSTEM ADMIN</div>
          <h1 className="admin-greeting">
            Xin chào {userName}, chúc bạn một ngày làm việc hiệu quả!
          </h1>
          <p className="admin-subtext">
            Nền tảng đang trực tuyến, kết nối <strong>0 dòng họ</strong> và <strong>0 nhân khẩu</strong> trên toàn quốc. Các dịch vụ lõi và sao lưu tự động đang vận hành mượt mà.
          </p>
        </div>
      </div>

      {/* Urgent Action Alert Banner */}
      <div className="admin-urgent-alert-card">
        <div className="urgent-alert-left">
          <span className="urgent-pulse-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0284c7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
          </span>
          <div>
            <strong className="urgent-title">Có 0 hồ sơ đăng ký Business và 0 báo cáo vi phạm mới cần thẩm định</strong>
            <p className="urgent-sub">
              Hiện tại không có tác vụ khẩn cấp nào cần phê duyệt.
            </p>
          </div>
        </div>
        <div className="urgent-alert-actions">
          <button
            className="btn-urgent-action"
            onClick={() => onNavigateTab('admin-business-requests')}
          >
            Duyệt Yêu Cầu Mở Business (3) →
          </button>
          <button
            className="btn-urgent-action secondary"
            onClick={() => onNavigateTab('admin-reports')}
          >
            Xử Lý Báo Cáo Vi Phạm (2)
          </button>
        </div>
      </div>

      {/* Metrics Grid (FR-SA-23) */}
      <div className="admin-stats-grid-6">
        {metricCards.map((card, index) => (
          <div
            key={index}
            className="admin-stat-card-clickable"
            onClick={() => onNavigateTab(card.tab)}
            title="Bấm để truy cập phân hệ chi tiết"
          >
            <div className="admin-stat-card-header">
              <span className="admin-stat-card-title">{card.title}</span>
              <span className="admin-stat-card-tag" style={{ color: card.accentColor }}>
                {card.tag}
              </span>
            </div>
            <div className="admin-stat-card-value-row">
              <span className="admin-stat-card-value">{card.value}</span>
              <span className="admin-stat-card-unit">{card.unit}</span>
            </div>
            <div className="admin-stat-card-footer">{card.subtext}</div>
          </div>
        ))}
      </div>

      <BusinessRegistrationsChart />

      {/* Centerpiece: Operational Center with 11 Modules */}
      <div className="admin-operations-section">
        <div className="admin-operations-header">
          <div>
            <span className="admin-operations-badge">TRUNG TÂM ĐIỀU HÀNH</span>
            <h3 className="admin-operations-title">
              Lối Tắt Vận Hành Nghiệp Vụ Quản Trị Hệ Thống
            </h3>
          </div>
          <p className="admin-operations-desc">
            Truy cập nhanh chóng vào các phân hệ quản lý hệ thống.
          </p>
        </div>

        <div className="admin-ops-groups-container">
          {/* Group 1 */}
          <div className="admin-op-group-box">
            <h4 className="op-group-title">Dòng Họ & Business</h4>
            <div className="op-group-btns">
              <button onClick={() => onNavigateTab('admin-business-requests')} className="admin-operations-btn">
                Xét duyệt yêu cầu Business
              </button>
              <button onClick={() => onNavigateTab('admin-businesses')} className="admin-operations-btn">
                Quản lý Business & Vòng đời
              </button>
              <button onClick={() => onNavigateTab('admin-manager-transfer')} className="admin-operations-btn">
                Chuyển Trưởng tộc đặc biệt
              </button>
            </div>
          </div>

          {/* Group 2 */}
          <div className="admin-op-group-box">
            <h4 className="op-group-title">Gói Dịch Vụ & Tài Chính</h4>
            <div className="op-group-btns">
              <button onClick={() => onNavigateTab('admin-plans')} className="admin-operations-btn">
                Gói dịch vụ & Hạn mức
              </button>
              <button onClick={() => onNavigateTab('admin-payments')} className="admin-operations-btn">
                Giao dịch & Hóa đơn điện tử
              </button>
            </div>
          </div>

          {/* Group 3 */}
          <div className="admin-op-group-box">
            <h4 className="op-group-title">Tài Khoản & Kiểm Duyệt</h4>
            <div className="op-group-btns">
              <button onClick={() => onNavigateTab('admin-accounts')} className="admin-operations-btn">
                Quản lý tài khoản & Người dùng
              </button>
              <button onClick={() => onNavigateTab('admin-reports')} className="admin-operations-btn">
                Kiểm duyệt báo cáo vi phạm
              </button>
            </div>
          </div>

          {/* Group 4 */}
          <div className="admin-op-group-box">
            <h4 className="op-group-title">Kỹ Thuật & Bảo Mật</h4>
            <div className="op-group-btns">
              <button onClick={() => onNavigateTab('admin-audit-logs')} className="admin-operations-btn">
                Nhật ký hệ thống (Audit)
              </button>
              <button onClick={() => onNavigateTab('admin-data-backup')} className="admin-operations-btn">
                Sao lưu & Khôi phục
              </button>
              <button onClick={() => onNavigateTab('admin-support-access')} className="admin-operations-btn">
                Hỗ trợ có kiểm soát
              </button>
              <button onClick={() => onNavigateTab('admin-security')} className="admin-operations-btn">
                Bảo mật & Đổi mật khẩu
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Services Health */}
      <div className="admin-services-section">
        <div className="dashboard-section-header">
          <h2 className="dashboard-section-title">Trạng Thái Hạ Tầng & Dịch Vụ Nền Tảng</h2>
          <p className="dashboard-section-subtitle">
            Giám sát thời gian thực tình trạng hoạt động của cơ sở dữ liệu và các vi dịch vụ phân tích gia phả.
          </p>
        </div>

        <div className="admin-services-grid">
          {services.map((srv, idx) => (
            <div key={idx} className="admin-service-card">
              <div className="service-card-top">
                <div className="service-dot-pulse" />
                <strong className="service-name-text">{srv.name}</strong>
              </div>
              <div className="service-card-status">
                <span className="status-badge status-approved">{srv.status}</span>
                <span className="service-latency-text">{srv.sub}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
