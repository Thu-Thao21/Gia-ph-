import React from 'react';
import './RecentActivitiesWidget.css';
import { EmptyState } from '../../../shared/Feedback/EmptyState';

export interface RecentActivitiesWidgetProps {
  activities?: Array<{ id: number; user: string; action: string; time: string }>;
}

export const RecentActivitiesWidget: React.FC<RecentActivitiesWidgetProps> = ({ activities = [] }) => {
  return (
    <div className="recent-activities-card">
      <div className="recent-activities-header">
        <h3 className="recent-activities-title">Hoạt Động Gần Đây</h3>
        <span className="recent-activities-subtitle">Nhật ký hệ thống</span>
      </div>

      <div className="recent-activities-list">
        {activities.length === 0 ? (
          <EmptyState
            variant="history"
            compact
            title="Chưa có hoạt động mới được ghi nhận"
            subMessage="Nhật ký các thao tác chỉnh sửa phả hệ và sự kiện dòng tộc sẽ lưu lại trang trọng tại đây."
          />
        ) : (
          activities.map((act) => (
            <div key={act.id} className="recent-activities-item">
              <div className="recent-activities-text">
                <strong className="recent-activities-user">{act.user}</strong> {act.action}
              </div>
              <div className="recent-activities-time">{act.time}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default RecentActivitiesWidget;
