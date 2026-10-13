import React from 'react';
import './MembersGrowthChart.css';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

const membersGrowthData: any[] = [];

const MembersGrowthChart: React.FC = () => {
  return (
    <div className="admin-chart-container">
      <div className="admin-chart-header">
        <h3 className="admin-chart-title">Biểu đồ Tăng trưởng Nhân khẩu</h3>
        <p className="admin-chart-subtitle">
          Thống kê số lượng nhân khẩu (thành viên) mới được thêm vào Gia phả qua các tháng.
        </p>
      </div>
      <div className="admin-chart-split-layout">
        <div className="admin-chart-body">
          <ResponsiveContainer width="100%" height={320}>
            <LineChart
              data={membersGrowthData}
              margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis
                dataKey="month"
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#64748b', fontSize: 12 }}
                dy={10}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#64748b', fontSize: 12 }}
                dx={-10}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#ffffff',
                  borderRadius: '12px',
                  border: '1px solid #e0f2fe',
                  boxShadow: '0 4px 20px rgba(14, 165, 233, 0.08)',
                  padding: '12px 16px',
                }}
                itemStyle={{ fontWeight: 600 }}
                labelStyle={{ color: '#0f172a', fontWeight: 800, marginBottom: '8px' }}
              />
              <Legend
                iconType="circle"
                wrapperStyle={{ paddingTop: '20px', fontSize: '13px', fontWeight: 600 }}
              />
              <Line
                name="Nhân khẩu mới"
                type="monotone"
                dataKey="newMembers"
                stroke="#0284c7"
                strokeWidth={3}
                dot={{ r: 4, strokeWidth: 2, fill: '#ffffff' }}
                activeDot={{ r: 6, strokeWidth: 0, fill: '#0284c7' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        
        <div className="admin-chart-stats">
          <div className="admin-chart-stat-card">
            <h4 className="stat-card-title">Tổng Nhân Khẩu</h4>
            <p className="stat-card-value">
              {membersGrowthData.length > 0 ? membersGrowthData[membersGrowthData.length - 1].totalMembers : 0}
            </p>
            <span className="stat-card-trend trend-neutral">
              Chưa có dữ liệu
            </span>
          </div>
          
          <div className="admin-chart-stat-card">
            <h4 className="stat-card-title">Thành viên mới (YTD)</h4>
            <p className="stat-card-value approved-value">
              {membersGrowthData.reduce((acc, curr) => acc + (curr.newMembers || 0), 0)}
            </p>
            <span className="stat-card-trend trend-neutral">
              Chưa có dữ liệu
            </span>
          </div>
          
          <div className="admin-chart-stat-card">
            <h4 className="stat-card-title">Tháng cao điểm</h4>
            <p className="stat-card-value pending-value">
              --
            </p>
            <span className="stat-card-trend trend-neutral">
              Chưa có dữ liệu
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MembersGrowthChart;
