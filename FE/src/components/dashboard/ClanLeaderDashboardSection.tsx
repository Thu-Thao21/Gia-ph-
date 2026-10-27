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
              Bảng theo dõi và thống kê thông tin nhân khẩu trực hệ dòng tộc.
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

      {/* Sơ đồ cột phân bổ nhân khẩu theo từng thế hệ */}
      <div className="clan-chart-panel">
        <div className="clan-chart-panel-header">
          <div>
            <h3 className="clan-chart-title">Phân Bổ Nhân Khẩu Theo Thế Hệ</h3>
            <p className="clan-chart-subtitle">
              Số lượng Nam và Nữ qua các đời trong gia phả dòng tộc.
            </p>
          </div>
          {chartData.length > 0 && (
            <div className="clan-chart-badges">
              <span className="clan-badge-legend male">Nam: {totalMale}</span>
              <span className="clan-badge-legend female">Nữ: {totalFemale}</span>
            </div>
          )}
        </div>

        <div className="clan-chart-render-box">
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart
                data={chartData}
                margin={{ top: 15, right: 20, left: 0, bottom: 5 }}
              >
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
                  fill="#1e40af"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={40}
                />
                <Bar
                  dataKey="female"
                  name="female"
                  fill="#9333ea"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={40}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="clan-chart-empty">
              <p>Chưa có dữ liệu thành viên để lập sơ đồ thống kê.</p>
            </div>
          )}
        </div>
      </div>

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
