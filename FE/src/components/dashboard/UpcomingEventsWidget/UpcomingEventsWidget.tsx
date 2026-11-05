import React from 'react';
import './UpcomingEventsWidget.css';
import { EmptyState } from '../../../shared/Feedback/EmptyState';

export interface UpcomingEventItem {
  id: number | string;
  title: string;
  date: string;
  countdown: string;
  location: string;
  family: string;
  latitude?: number;
  longitude?: number;
}

export interface UpcomingEventsWidgetProps {
  events?: UpcomingEventItem[];
}

export const UpcomingEventsWidget: React.FC<UpcomingEventsWidgetProps> = ({ events = [] }) => {
  return (
    <div className="upcoming-events-card">
      <div className="upcoming-events-header">
        <h3 className="upcoming-events-title">Sự Kiện & Ngày Giỗ Sắp Tới</h3>
        <span className="upcoming-events-subtitle">Lịch gia tộc</span>
      </div>

      <div className="upcoming-events-list">
        {events.length === 0 ? (
          <EmptyState
            variant="calendar"
            compact
            title="Chưa ghi nhận ngày giỗ hoặc sự kiện sắp tới"
            subMessage="Các ngày giỗ tổ, lễ hội và việc họ sẽ hiển thị trang trọng tại đây khi được cập nhật."
          />
        ) : (
          events.map((event) => (
            <div key={event.id} className="upcoming-events-item">
              <div className="upcoming-events-item-top">
                <span className="upcoming-events-family-badge">{event.family}</span>
                <span className="upcoming-events-countdown-badge">{event.countdown}</span>
              </div>

              <div className="upcoming-events-item-title">{event.title}</div>

              <div className="upcoming-events-item-meta">
                <span>Ngày: {event.date}</span>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px' }}>
                  <span>Địa điểm: {event.location}</span>
                  {event.location && event.location !== 'Chưa cập nhật' && (
                    <a
                      href={
                        event.latitude && event.longitude
                          ? `https://www.google.com/maps/dir/?api=1&destination=${event.latitude},${event.longitude}`
                          : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(event.location)}`
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        color: '#16a34a',
                        fontWeight: 700,
                        fontSize: '12px',
                        textDecoration: 'none',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <polygon points="3 11 22 2 13 21 11 13 3 11" />
                      </svg>
                      Chỉ đường
                    </a>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default UpcomingEventsWidget;
