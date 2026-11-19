import React, { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import './ClanLeaderDashboardSection.css';

export interface ClanLeaderDashboardSectionProps {
  clanName: string;
  totalMembers: number;
  membersList?: any[];
  onNavigateTab?: (tabId: string) => void;
}

export const ClanLeaderDashboardSection: React.FC<ClanLeaderDashboardSectionProps> = ({
  clanName,
  totalMembers,
  membersList = [],
  onNavigateTab,
}) => {
  // Tính toán dữ liệu phân bổ nhân khẩu thực tế từ danh sách thành viên (không mock)
  const chartData = useMemo(() => {
    if (!membersList || membersList.length === 0) {
      return [];
    }

    const genMap: Record<number, { male: number; female: number }> = {};
    membersList.forEach((m) => {
      const gen = m.generation || 1;
      if (!genMap[gen]) {
        genMap[gen] = { male: 0, female: 0 };
      }
      const g = (m.gender || '').toLowerCase();
      if (g === 'female' || g === 'nữ' || g === 'nu') {
        genMap[gen].female += 1;
      } else {
        genMap[gen].male += 1;
      }
    });

    return Object.keys(genMap)
      .map(Number)
      .sort((a, b) => a - b)
      .map((gen) => ({
        generationName: `Đời ${gen}`,
        male: genMap[gen].male,
        female: genMap[gen].female,
        total: genMap[gen].male + genMap[gen].female,
      }));
  }, [membersList]);

  // Thống kê nhân khẩu thực tế
  const totalMale = useMemo(() => {
    return membersList.filter((m) => {
      const g = (m.gender || '').toLowerCase();
      return g !== 'female' && g !== 'nữ' && g !== 'nu';
    }).length;
  }, [membersList]);

  const totalFemale = useMemo(() => {
    return membersList.filter((m) => {
      const g = (m.gender || '').toLowerCase();
      return g === 'female' || g === 'nữ' || g === 'nu';
    }).length;
  }, [membersList]);

  const genderPieData = useMemo(() => {
    if (totalMale === 0 && totalFemale === 0) return [];
    return [
      { name: 'Nam giới', value: totalMale, color: '#2563eb' },
      { name: 'Nữ giới', value: totalFemale, color: '#ec4899' },
    ].filter((item) => item.value > 0);
  }, [totalMale, totalFemale]);

  const uniqueBranchesCount = useMemo(() => {
    const branches = new Set(
      membersList
        .map((m) => m.branchId || m.branch_id || m.branchName)
        .filter(Boolean)
    );
    return branches.size;
  }, [membersList]);

  const generationsCount = chartData.length;

  return (
    <div className="clan-leader-section-wrapper">
      {/* Tiêu đề khu vực quản lý Trưởng tộc */}
      <div className="clan-heritage-card">
        <div className="clan-heritage-header">
          <div className="clan-heritage-titles">
            <span className="clan-heritage-badge">KHU VỰC QUẢN TRỊ TRƯỞNG TỘC</span>
            <h2 className="clan-heritage-name">{clanName || 'Không gian Dòng họ'}</h2>
            <p className="clan-heritage-desc">
              Bảng theo dõi và thống kê thông tin nhân khẩu trực hệ dòng tộc thời gian thực.
            </p>
          </div>
        </div>
      </div>

      {/* Thẻ chỉ số nhân khẩu dòng tộc thực tế */}
      <div className="clan-kpi-grid">
        <div className="clan-kpi-card">
          <div className="clan-kpi-info">
            <span className="clan-kpi-label">Tổng nhân khẩu</span>
            <div className="clan-kpi-value">{totalMembers || membersList.length} thành viên</div>
            <span className="clan-kpi-sub">{totalMale} Nam • {totalFemale} Nữ</span>
          </div>
        </div>

        <div className="clan-kpi-card">
          <div className="clan-kpi-info">
            <span className="clan-kpi-label">Số thế hệ ghi nhận</span>
            <div className="clan-kpi-value">{generationsCount > 0 ? `${generationsCount} thế hệ` : '--'}</div>
            <span className="clan-kpi-sub">Theo dữ liệu gia phả thực tế</span>
          </div>
        </div>

        <div className="clan-kpi-card">
          <div className="clan-kpi-info">
            <span className="clan-kpi-label">Chi nhánh ghi nhận</span>
            <div className="clan-kpi-value">{uniqueBranchesCount > 0 ? `${uniqueBranchesCount} chi nhánh` : 'Chưa phân chi'}</div>
            <span className="clan-kpi-sub">Dữ liệu phân bổ trong tộc</span>
          </div>
        </div>
      </div>

      {/* Sơ đồ trực quan nhân khẩu dòng tộc */}
      {chartData.length > 0 ? (
        <div className="clan-charts-grid">
          {/* Sơ đồ cột thế hệ */}
          <div className="clan-chart-panel">
            <div className="clan-chart-panel-header">
              <div>
                <h3 className="clan-chart-title">Phân Bổ Nhân Khẩu Theo Thế Hệ</h3>
                <p className="clan-chart-subtitle">
                  Số lượng Nam và Nữ qua các đời trong gia phả dòng tộc.
                </p>
              </div>
              <div className="clan-chart-badges">
                <span className="clan-badge-legend male">Nam: {totalMale}</span>
                <span className="clan-badge-legend female">Nữ: {totalFemale}</span>
              </div>
            </div>

            <div className="clan-chart-render-box">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart
                  data={chartData}
                  margin={{ top: 15, right: 15, left: -10, bottom: 5 }}
                >
                  <defs>
                    <linearGradient id="maleBarGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3b82f6" />
                      <stop offset="100%" stopColor="#1d4ed8" />
                    </linearGradient>
                    <linearGradient id="femaleBarGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f472b6" />
                      <stop offset="100%" stopColor="#db2777" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis
                    dataKey="generationName"
                    axisLine={{ stroke: '#e2e8f0' }}
                    tickLine={false}
                    tick={{ fill: '#475569', fontSize: 13 }}
                    dy={6}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                    tick={{ fill: '#64748b', fontSize: 12 }}
                    dx={-4}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#ffffff',
                      borderRadius: '8px',
                      border: '1px solid #e2e8f0',
                      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)',
                      padding: '10px 14px',
                    }}
                    formatter={(value: any, name: any) => [
                      `${value} người`,
                      name === 'male' ? 'Nam' : 'Nữ',
                    ]}
                    labelStyle={{ fontWeight: 600, color: '#0f172a', marginBottom: '4px' }}
                  />
                  <Legend
                    wrapperStyle={{ paddingTop: '12px', fontSize: '13px' }}
                    formatter={(value) => (value === 'male' ? 'Nam' : 'Nữ')}
                  />
                  <Bar
                    dataKey="male"
                    name="male"
                    fill="url(#maleBarGrad)"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={38}
                  />
                  <Bar
                    dataKey="female"
                    name="female"
                    fill="url(#femaleBarGrad)"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={38}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Sơ đồ tròn tỷ lệ nhân khẩu */}
          <div className="clan-chart-panel donut-panel">
            <div className="clan-chart-panel-header">
              <div>
                <h3 className="clan-chart-title">Cơ Cấu Giới Tính Dòng Tộc</h3>
                <p className="clan-chart-subtitle">
                  Tỷ lệ phân bổ Nam và Nữ trong gia phả
                </p>
              </div>
            </div>

            <div className="clan-chart-render-box">
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={genderPieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={65}
                    outerRadius={95}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {genderPieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#ffffff',
                      borderRadius: '8px',
                      border: '1px solid #e2e8f0',
                      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)',
                      padding: '8px 12px',
                    }}
                    formatter={(val: any, name: any) => [`${val} thành viên`, name]}
                  />
                  <Legend wrapperStyle={{ paddingTop: '10px', fontSize: '13px' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      ) : (
        <div className="clan-chart-panel empty-banner">
          <div className="clan-empty-onboarding">
            <div className="clan-empty-icon-wrap">
              <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
            <h3 className="clan-empty-title">Không gian dòng họ đã sẵn sàng khởi tạo phả hệ</h3>
            <p className="clan-empty-desc">
              Cơ sở dữ liệu phả hệ của dòng họ hiện đang trống sạch. Bạn có thể bắt đầu xây dựng cây gia phả bằng cách nạp danh sách từ tệp Excel hoặc thêm thành viên trực tiếp.
            </p>
            <div className="clan-empty-actions">
              <button
                type="button"
                className="clan-empty-btn primary"
                onClick={() => onNavigateTab && onNavigateTab('family-import-export')}
              >
                Nhập phả hệ từ file Excel
              </button>
              <button
                type="button"
                className="clan-empty-btn secondary"
                onClick={() => onNavigateTab && onNavigateTab('family-members')}
              >
                Thêm thành viên dòng họ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lối tắt quản trị Trưởng tộc tối giản */}
      <div className="clan-quick-actions-card">
        <div className="clan-quick-actions-header">
          <h4 className="clan-quick-actions-title">Chức Năng Quản Trị Trưởng Tộc</h4>
        </div>
        <div className="clan-quick-actions-grid">
          <button
            type="button"
            className="clan-action-btn"
            onClick={() => onNavigateTab && onNavigateTab('tree')}
          >
            <div className="btn-text">
              <strong>Cây Gia Phả</strong>
              <small>Sơ đồ phả hệ trực hệ</small>
            </div>
          </button>

          <button
            type="button"
            className="clan-action-btn"
            onClick={() => onNavigateTab && onNavigateTab('family-members')}
          >
            <div className="btn-text">
              <strong>Quản Lý Thành Viên</strong>
              <small>Danh sách và nhân khẩu</small>
            </div>
          </button>

          <button
            type="button"
            className="clan-action-btn"
            onClick={() => onNavigateTab && onNavigateTab('family-locations')}
          >
            <div className="btn-text">
              <strong>Bản Đồ & Địa Điểm</strong>
              <small>Nhà thờ họ, từ đường & mộ phần</small>
            </div>
          </button>

          <button
            type="button"
            className="clan-action-btn"
            onClick={() => onNavigateTab && onNavigateTab('family-accounts')}
          >
            <div className="btn-text">
              <strong>Phân Quyền Family Admin</strong>
              <small>Quản lý tài khoản quản trị</small>
            </div>
          </button>

          <button
            type="button"
            className="clan-action-btn"
            onClick={() => onNavigateTab && onNavigateTab('family-approvals')}
          >
            <div className="btn-text">
              <strong>Phê Duyệt Đề Xuất</strong>
              <small>Duyệt yêu cầu chỉnh sửa</small>
            </div>
          </button>

          <button
            type="button"
            className="clan-action-btn"
            onClick={() => onNavigateTab && onNavigateTab('family-branches')}
          >
            <div className="btn-text">
              <strong>Chi & Nhánh</strong>
              <small>Quản lý chi phái</small>
            </div>
          </button>

          <button
            type="button"
            className="clan-action-btn"
            onClick={() => onNavigateTab && onNavigateTab('family-import-export')}
          >
            <div className="btn-text">
              <strong>Nhập / Xuất Dữ Liệu</strong>
              <small>Tập tin Excel / CSV</small>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};

export default ClanLeaderDashboardSection;
