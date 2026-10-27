import React, { useState, useEffect, useCallback } from 'react';
import './AdminDashboard.css';
import { RecentActivitiesWidget } from '../RecentActivitiesWidget';
import apiClient from '../../../api/axios';
import { readApiError, withRequestId } from '../../../api/apiError';

/** GET /admin/stats (System Admin). Không có số liệu mặc định: chưa tải xong thì hiện "…". */
interface AdminStats {
  total_users: number;
  active_users: number;
  total_clans: number;
  active_clans: number;
  total_persons: number;
  pending_registrations: number;
  total_packages: number;
  total_documents: number;
  system_status: string;
}

function statsErrorMessage(err: unknown): string {
  const info = readApiError(err);
  if (info.isNetworkError) return 'Không thể kết nối đến máy chủ để lấy chỉ số hệ thống. Vui lòng thử lại.';
  if (info.status === 401) return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
  if (info.status === 403) return 'Bạn không có quyền xem chỉ số hệ thống.';
  return withRequestId('Không tải được chỉ số hệ thống. Vui lòng thử lại sau.', info);
}

const fmt = (value: number | undefined) => (value === undefined ? '…' : value.toLocaleString('vi-VN'));

export interface AdminDashboardProps {
  userName: string;
  onNavigateTab: (tabId: string) => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  userName,
  onNavigateTab,
}) => {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  const loadStats = useCallback((isMounted: () => boolean = () => true) => {
    setStatsLoading(true);
    setStatsError(null);
    apiClient
      .get<AdminStats>('/admin/stats')
      .then((res) => {
        if (isMounted()) setStats(res.data);
      })
      .catch((err) => {
        // Không nuốt lỗi và không hiện số giả: báo lỗi rõ ràng, cho thử lại.
        const info = readApiError(err);
        console.warn('GET /admin/stats thất bại:', info.status, info.code, info.requestId);
        if (isMounted()) setStatsError(statsErrorMessage(err));
      })
      .finally(() => {
        if (isMounted()) setStatsLoading(false);
      });
  }, []);

  useEffect(() => {
    let mounted = true;
    loadStats(() => mounted);
    return () => {
      mounted = false;
    };
  }, [loadStats]);

  const s: Partial<AdminStats> = stats ?? {};

  const services = [
    { name: 'Dịch vụ Hệ thống Xử lý Dữ liệu Lõi', status: 'Hoạt động mượt mà', sub: 'Thời gian phản hồi thời gian thực' },
    { name: 'Cơ sở Dữ liệu Dòng họ Toàn cục', status: 'Đồng bộ 100%', sub: 'Dữ liệu liên kết an toàn & toàn vẹn' },
    { name: 'Dịch vụ Xác thực & Bảo mật Tài khoản', status: 'Trực tuyến', sub: 'Mã hóa an toàn đa tầng' },
    { name: 'Cổng Giao diện Vận hành Nền tảng', status: 'Sẵn sàng', sub: 'Kết nối liên thông các dòng họ' },
  ];

  const metricCards = [
    {
      title: 'Tổng số tài khoản',
      value: fmt(s.total_users),
      subtext: s.active_users === undefined ? 'Đang tải…' : `${s.active_users} tài khoản đang hoạt động`,
      tag: 'Hệ thống',
    },
    {
      title: 'Tổng số dòng họ',
      value: fmt(s.total_clans),
      subtext: s.active_clans === undefined ? 'Đang tải…' : `${s.active_clans} dòng họ đã xác minh`,
      tag: 'Họ tộc',
    },
    {
      title: 'Yêu cầu cần duyệt',
      value: fmt(s.pending_registrations),
      subtext:
        s.pending_registrations === undefined
          ? 'Đang tải…'
          : s.pending_registrations > 0
            ? `${s.pending_registrations} đơn chờ phê duyệt`
            : 'Tất cả đơn đã được xử lý',
      tag: 'Phê duyệt',
    },
    {
      title: 'Trạng thái hệ thống',
      value: s.system_status ?? '…',
      subtext: 'Tất cả dịch vụ vận hành an toàn',
      tag: 'Bảo mật',
    },
    {
      title: 'Thành viên gia phả',
      value: fmt(s.total_persons),
      subtext: 'Hồ sơ nhân khẩu trong hệ thống',
      tag: 'Dữ liệu',
    },
    {
      title: 'Người dùng hoạt động',
      value: fmt(s.active_users),
      subtext:
        s.active_users === undefined || s.total_users === undefined
          ? 'Đang tải…'
          : `${Math.round((s.active_users / (s.total_users || 1)) * 100)}% tổng tài khoản`,
      tag: 'Tương tác',
    },
    {
      title: 'Gói dịch vụ',
      value: fmt(s.total_packages),
      subtext: 'Gói dịch vụ đang kích hoạt',
      tag: 'Thanh toán',
    },
    {
      title: 'Tư liệu số',
      value: fmt(s.total_documents),
      subtext: 'Tư liệu lưu trữ trong hệ thống',
      tag: 'Lưu trữ',
    },
  ];

  const adminActivities: Array<{ id: number; user: string; action: string; time: string }> = [];

  return (
    <div className="admin-dash-container">
      {/* Personalized Welcome Banner for Admin */}
      <div className="admin-header-banner">
        <div>
          <div className="admin-system-tag">BAN QUẢN TRỊ HỆ THỐNG GIA PHẢ TOÀN CỤC</div>
          <h1 className="admin-greeting">
            Xin chào {userName}, chúc bạn một ngày làm việc hiệu quả!
          </h1>
          <p className="admin-subtext">
            Bạn đang truy cập với vai trò <strong>Quản Trị Viên Toàn Cục</strong>. Nền tảng đang trực tuyến, sẵn sàng vận hành, hỗ trợ và kết nối các dòng họ trên toàn quốc.
          </p>
        </div>
      </div>

      {/* Admin Platform Stats Grid */}
      <div className="admin-stats-overview-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#334155', margin: 0 }}>Chỉ số Vận hành Hệ thống</h3>
        <span
          className="admin-live-badge"
          data-testid="badge-live-stats"
          style={{
            background: '#ecfdf5',
            color: '#065f46',
            border: '1px solid #a7f3d0',
            padding: '4px 12px',
            borderRadius: '999px',
            fontSize: '12px',
            fontWeight: 700,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }} />
          {statsLoading ? 'Đang tải dữ liệu…' : statsError ? 'Không có dữ liệu' : 'Dữ liệu thời gian thực'}
        </span>
      </div>
      {statsError ? (
        <div
          role="alert"
          data-testid="admin-stats-error"
          style={{
            background: '#fef2f2',
            color: '#991b1b',
            border: '1px solid #fecaca',
            borderRadius: '10px',
            padding: '10px 14px',
            marginBottom: '12px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '12px',
            fontSize: '13px',
          }}
        >
          <span>{statsError}</span>
          <button type="button" onClick={() => loadStats()} disabled={statsLoading}>
            Thử lại
          </button>
        </div>
      ) : null}
      <div className="admin-stats-grid">
        {metricCards.map((card, index) => (
          <div key={index} className="admin-stat-card">
            <div className="admin-stat-card-main">
              <div className="admin-stat-card-header">
                <span className="admin-stat-card-title">{card.title}</span>
                <span className="admin-stat-card-tag">{card.tag}</span>
              </div>
              <div className="admin-stat-card-value">{card.value}</div>
            </div>
            <div className="admin-stat-card-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>{card.subtext}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Centerpiece: Admin Operations */}
      <div className="admin-operations-section">
        <div className="admin-operations-header">
          <div className="admin-operations-title-row">
            <h3 className="admin-operations-title">
              Trung Tâm Vận Hành & Quản Trị Hệ Thống
            </h3>
          </div>
          <span className="admin-operations-badge">
            QUẢN TRỊ VIÊN TOÀN CỤC
          </span>
        </div>
        <p className="admin-operations-desc">
          Các lối tắt truy cập nhanh chức năng quản trị cấp cao. Vui lòng thao tác cẩn trọng khi thực hiện cập nhật cấu trúc dữ liệu nền tảng.
        </p>

        <div className="admin-operations-grid">
          <button
            onClick={() => onNavigateTab('admin-roles')}
            className="admin-operations-btn"
          >
            Phân quyền & Role
          </button>
          <button
            onClick={() => onNavigateTab('admin-packages')}
            className="admin-operations-btn"
          >
            Gói Dịch Vụ
          </button>
          <button
            onClick={() => onNavigateTab('admin-payments')}
            className="admin-operations-btn"
          >
            Thanh Toán
          </button>
          <button
            onClick={() => onNavigateTab('admin-moderation')}
            className="admin-operations-btn"
          >
            Kiểm Duyệt
          </button>
          <button
            onClick={() => onNavigateTab('admin-families-mgmt')}
            className="admin-operations-btn"
          >
            Quản lý dòng họ
          </button>
          <button
            onClick={() => onNavigateTab('admin-members-mgmt')}
            className="admin-operations-btn"
          >
            Quản lý thành viên
          </button>
          <button
            onClick={() => onNavigateTab('admin-family-links')}
            className="admin-operations-btn"
          >
            Liên kết dòng họ
          </button>
          <button
            onClick={() => onNavigateTab('admin-approval')}
            className="admin-operations-btn"
          >
            Phê duyệt đề xuất
          </button>
          <button
            onClick={() => onNavigateTab('admin-logs')}
            className="admin-operations-btn"
          >
            Nhật ký hệ thống
          </button>
          <button
            onClick={() => onNavigateTab('admin-data-backup')}
            className="admin-operations-btn"
          >
            Sao lưu & Phục hồi
          </button>
          <button onClick={() => onNavigateTab('admin-packages')} className="admin-operations-btn">Gói dịch vụ</button>
          <button onClick={() => onNavigateTab('admin-payments')} className="admin-operations-btn">Quản lý thanh toán</button>
          <button onClick={() => onNavigateTab('admin-moderation')} className="admin-operations-btn">Kiểm duyệt nội dung</button>
          <button onClick={() => onNavigateTab('admin-roles')} className="admin-operations-btn">Vai trò & Phân quyền</button>
        </div>
      </div>

      <div className="admin-analytics-grid">
        <section className="admin-analytics-card">
          <div className="admin-analytics-heading"><div><h3>Tăng trưởng người dùng & dòng họ</h3><p>Thống kê mô phỏng 6 tháng gần nhất</p></div><span>+18,4%</span></div>
          <div className="admin-growth-chart" aria-label="Biểu đồ tăng trưởng người dùng và dòng họ">
            {[{m:'T4',u:46,f:28},{m:'T5',u:55,f:34},{m:'T6',u:62,f:40},{m:'T7',u:71,f:49},{m:'T8',u:82,f:58},{m:'T9',u:94,f:66}].map((point) => <div key={point.m}><span style={{height:`${point.u}%`}} /><i style={{height:`${point.f}%`}} /><small>{point.m}</small></div>)}
          </div>
          <div className="admin-chart-legend"><span><i className="users" /> Người dùng</span><span><i className="families" /> Dòng họ</span></div>
        </section>
        <section className="admin-analytics-card usage">
          <div className="admin-analytics-heading"><div><h3>Mức sử dụng hệ thống</h3><p>Phân bổ theo module</p></div><span>30 ngày</span></div>
          <div className="admin-usage-list">{[
            ['Cây gia phả', 88], ['Hồ sơ thành viên', 74], ['Kho tư liệu', 61], ['Phòng thờ số', 48], ['Quỹ gia tộc', 36]
          ].map(([label,value]) => <div key={label as string}><div><span>{label}</span><strong>{value}%</strong></div><i><span style={{width:`${value}%`}} /></i></div>)}</div>
        </section>
      </div>

      {/* Lower Section: Infrastructure Health & Logs */}
      <div>
        <div className="dashboard-section-header">
          <h2 className="dashboard-section-title">Trạng Thái Vận Hành & Nhật Ký Hoạt Động</h2>
          <p className="dashboard-section-subtitle">
            Theo dõi tình trạng vận hành dịch vụ và lịch sử thao tác hệ thống thời gian thực.
          </p>
        </div>

        <div className="admin-widgets-grid">
          {/* Services Health */}
          <div className="admin-services-health-card">
            <div className="admin-services-health-header">
              <h3 className="admin-services-health-title">Tình Trạng Dịch Vụ Nền Tảng</h3>
              <span className="admin-service-stable-badge">Hệ thống ổn định</span>
            </div>

            <div className="admin-services-list">
              {services.map((srv, idx) => (
                <div key={idx} className="admin-service-row">
                  <div>
                    <div className="admin-service-name">{srv.name}</div>
                    <div className="admin-service-latency">{srv.sub}</div>
                  </div>
                  <span className="admin-service-status-online">{srv.status}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Admin Activity Logs widget */}
          <RecentActivitiesWidget activities={adminActivities} />
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
