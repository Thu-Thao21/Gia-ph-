import React from 'react';
import type { MemberDetail } from '../../../types/member';
import './PersonalInfoTab.css';

export interface PersonalInfoTabProps {
  member: MemberDetail;
}

export const PersonalInfoTab: React.FC<PersonalInfoTabProps> = ({ member }) => {
  const isAlive = member.isAlive !== false;

  const infoList = [
    {
      label: 'Họ và tên',
      value: member.fullName,
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      ),
      isPrimary: true,
    },
    {
      label: 'Tên gọi khác / Tự',
      value: member.otherName || 'Không có',
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
          <line x1="7" y1="7" x2="7.01" y2="7" />
        </svg>
      ),
      isEmpty: !member.otherName,
    },
    {
      label: 'Giới tính',
      value: member.gender?.toLowerCase() === 'male' || member.gender?.toLowerCase() === 'nam' ? 'Nam' : 'Nữ',
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v8M8 12h8" />
        </svg>
      ),
    },
    {
      label: 'Ngày sinh',
      value: member.birthDate || 'Chưa cập nhật',
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      ),
      isEmpty: !member.birthDate,
    },
    {
      label: 'Dòng họ',
      value: member.familyName || 'Chưa cập nhật',
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
      ),
      isEmpty: !member.familyName,
    },
    {
      label: 'Chi / Phân nhánh',
      value: member.branch || 'Chưa phân chi',
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="6" y1="3" x2="6" y2="15" />
          <circle cx="18" cy="6" r="3" />
          <circle cx="6" cy="18" r="3" />
          <path d="M18 9a9 9 0 0 1-9 9" />
        </svg>
      ),
      isEmpty: !member.branch,
    },
    {
      label: 'Thế hệ (Đời)',
      value: `Đời thứ ${member.generation}`,
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      ),
    },
    {
      label: 'Nghề nghiệp',
      value: member.occupation || 'Chưa cập nhật',
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
          <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
        </svg>
      ),
      isEmpty: !member.occupation,
    },
    {
      label: 'Học vấn / Bằng cấp',
      value: member.education || 'Chưa cập nhật',
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
          <path d="M6 12v5c3 3 9 3 12 0v-5" />
        </svg>
      ),
      isEmpty: !member.education,
    },
  ];

  if (!isAlive && member.deathDate) {
    infoList.push({
      label: 'Ngày mất',
      value: member.deathDate,
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="2" x2="12" y2="22" />
          <line x1="7" y1="7" x2="17" y2="7" />
        </svg>
      ),
      isEmpty: false,
    });
  }

  if (member.subBranch) {
    infoList.push({
      label: 'Phân chi phụ',
      value: member.subBranch,
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
        </svg>
      ),
      isEmpty: false,
    });
  }

  if (member.burialPlace) {
    infoList.push({
      label: 'Nơi an táng',
      value: member.burialPlace,
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
          <circle cx="12" cy="10" r="3" />
        </svg>
      ),
      isEmpty: false,
    });
  }

  return (
    <div className="personal-info-tab-wrapper">
      <div className="personal-info-card">
        {/* Header */}
        <div className="personal-info-header">
          <div className="header-title-box">
            <h3 className="personal-info-title">Thông Tin Cơ Bản Gia Tộc</h3>
            <span className="personal-info-status">
              {isAlive ? 'Thành viên đang sinh sống' : 'Thành viên đã khuất'}
            </span>
          </div>
          <span className="personal-info-gen-tag">Đời thứ {member.generation}</span>
        </div>

        {/* Clean Info Grid */}
        <div className="personal-info-grid">
          {infoList.map((item, idx) => (
            <div key={idx} className="personal-info-cell">
              <div className="cell-label-row">
                <span className="cell-icon">{item.icon}</span>
                <span className="cell-label">{item.label}</span>
              </div>
              <div className={`cell-value ${item.isEmpty ? 'is-empty' : ''} ${item.isPrimary ? 'is-primary' : ''}`}>
                {item.value}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default PersonalInfoTab;
