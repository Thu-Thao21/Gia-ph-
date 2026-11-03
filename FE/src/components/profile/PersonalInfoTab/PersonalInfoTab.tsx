import React from 'react';
import type { MemberDetail } from '../../../types/member';
import '../Profile.css';
import './PersonalInfoTab.css';

export interface PersonalInfoTabProps {
  member: MemberDetail;
}

export const PersonalInfoTab: React.FC<PersonalInfoTabProps> = ({ member }) => {
  return (
    <div className="personal-info-tab-wrapper">
      <div className="profile-card">
        <h3 className="profile-card-title">Thông Tin Cơ Bản Gia Tộc</h3>
        <div className="profile-info-grid">
          <div className="profile-info-item">
            <span className="profile-info-label">Họ và tên</span>
            <span className="profile-info-value">{member.fullName}</span>
          </div>

          <div className="profile-info-item">
            <span className="profile-info-label">Tên gọi khác / Tự</span>
            <span className="profile-info-value">{member.otherName || 'Không có'}</span>
          </div>

          <div className="profile-info-item">
            <span className="profile-info-label">Giới tính</span>
            <span className="profile-info-value">{member.gender === 'male' ? 'Nam' : 'Nữ'}</span>
          </div>

          <div className="profile-info-item">
            <span className="profile-info-label">Ngày sinh</span>
            <span className="profile-info-value">{member.birthDate || 'Chưa cập nhật'}</span>
          </div>

          <div className="profile-info-item">
            <span className="profile-info-label">Dòng họ</span>
            <span className="profile-info-value">{member.familyName || 'Chưa cập nhật'}</span>
          </div>

          <div className="profile-info-item">
            <span className="profile-info-label">Chi / Phân nhánh</span>
            <span className="profile-info-value">{member.branch || 'Chưa cập nhật'}</span>
          </div>

          <div className="profile-info-item">
            <span className="profile-info-label">Thế hệ (Đời)</span>
            <span className="profile-info-value">Đời thứ {member.generation}</span>
          </div>

          <div className="profile-info-item">
            <span className="profile-info-label">Nghề nghiệp</span>
            <span className="profile-info-value">{member.occupation || 'Chưa cập nhật'}</span>
          </div>

          <div className="profile-info-item">
            <span className="profile-info-label">Học vấn / Bằng cấp</span>
            <span className="profile-info-value">{member.education || 'Chưa cập nhật'}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PersonalInfoTab;
