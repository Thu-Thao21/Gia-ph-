import React from 'react';
import type { MemberDetail } from '../../../types/member';
import '../Profile.css';
import './BiographyTab.css';

export interface BiographyTabProps {
  member: MemberDetail;
}

export const BiographyTab: React.FC<BiographyTabProps> = ({ member }) => {
  return (
    <div className="biography-tab-wrapper">
      <div className="profile-card">
        <h3 className="profile-card-title">Tiểu Sử & Tóm Tắt Cuộc Đời</h3>
        <p className="biography-text">
          {member.bio || 'Chưa có thông tin tiểu sử nào được ghi chép cho thành viên này.'}
        </p>
      </div>

      <div className="profile-card">
        <h3 className="profile-card-title">Dòng Thời Gian & Sự Kiện Quan Trọng</h3>
        {member.lifeEvents && member.lifeEvents.length > 0 ? (
          <div className="profile-timeline">
            {member.lifeEvents.map((evt) => (
              <div key={evt.id} className="profile-timeline-item">
                <div className="profile-timeline-year">{evt.eventDate || 'Thời gian chưa rõ'}</div>
                <div className="profile-timeline-title">{evt.title}</div>
                {evt.location && <div className="biography-location"> {evt.location}</div>}
                {evt.description && <div className="profile-timeline-desc">{evt.description}</div>}
              </div>
            ))}
          </div>
        ) : (
          <div className="profile-empty">Chưa có sự kiện đời sống nào được cập nhật.</div>
        )}
      </div>
    </div>
  );
};

export default BiographyTab;
