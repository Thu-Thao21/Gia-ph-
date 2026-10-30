import React from 'react';
import './PersonalizedOverview.css';

export interface PersonalizedOverviewProps {
  userName: string;
  familyBranch?: string;
  generationLevel?: string;
  totalMembers?: number;
  linkedFamiliesCount?: number;
  userRole?: string;
  lineageType?: string | null;
  onRequestRole?: () => void;
}

export const PersonalizedOverview: React.FC<PersonalizedOverviewProps> = ({
  userName,
  familyBranch = 'Chưa chọn dòng họ',
  generationLevel = 'Đời thứ --',
  totalMembers = 0,
  linkedFamiliesCount = 0,
  userRole = 'Thành viên',
  lineageType,
  onRequestRole,
}) => {
  const isMaternal = (lineageType || '').toUpperCase() === 'MATERNAL';
  const lineageLabel = lineageType ? (isMaternal ? 'Bên Ngoại' : 'Bên Nội') : null;
  const lineageTag = lineageType ? (isMaternal ? 'Bên Ngoại' : 'Bên Nội') : 'Chính Tộc';
  const lineageTitle = lineageType
    ? isMaternal
      ? 'Dòng họ bên Ngoại'
      : 'Dòng họ bên Nội'
    : 'Dòng họ chính của bạn';
  const lineageSubtext = lineageType
    ? isMaternal
      ? 'Chi hệ ngoại tộc'
      : 'Trực hệ nội tộc'
    : 'Trực hệ chính tộc';

  const metricCards = [
    {
      id: 1,
      title: lineageTitle,
      value: familyBranch,
      subtext: lineageSubtext,
      tag: lineageTag,
      tagClass: isMaternal ? 'maternal' : 'paternal',
    },
    {
      id: 2,
      title: 'Thế hệ / Đời thứ',
      value: generationLevel,
      subtext: 'Vị trí trong cây trực hệ',
      tag: 'Hiện tại',
      tagClass: 'default',
    },
    {
      id: 3,
      title: 'Tổng số thành viên',
      value: `${totalMembers} Thành viên`,
      subtext: 'Thống kê theo dữ liệu thực',
      tag: 'Gia phả',
      tagClass: 'default',
    },
    {
      id: 4,
      title: 'Số dòng họ đã liên kết',
      value: `${linkedFamiliesCount} Dòng họ`,
      subtext: 'Nội • Ngoại • Thông gia',
      tag: 'Mạng lưới',
      tagClass: 'default',
    },
  ];

  return (
    <div className="personalized-overview-wrapper">
      <div className="personalized-overview-banner">
        <div>
          <div className="personalized-overview-system-tag">HỆ THỐNG GIA PHẢ LIÊN HỌ</div>
          <h1 className="personalized-overview-greeting">
            Xin chào {userName}, chúc bạn một ngày an lành!
          </h1>
          <p className="personalized-overview-subtext">
            Chào mừng bạn quay trở lại với không gian gia tộc <strong>{familyBranch}</strong>
            {lineageLabel && (
              <span className={`personalized-lineage-badge ${isMaternal ? 'maternal' : 'paternal'}`}>
                {lineageLabel}
              </span>
            )}{' '}
            thuộc <strong>{generationLevel}</strong>.
          </p>
        </div>
      </div>

      <div className="personalized-overview-cards-grid">
        {metricCards.map((card) => (
          <div key={card.id} className="personalized-overview-card">
            <div>
              <div className="personalized-overview-card-header">
                <span className="personalized-overview-card-title">{card.title}</span>
                <span className={`personalized-overview-card-tag ${card.tagClass}`}>{card.tag}</span>
              </div>
              <div className="personalized-overview-card-value">{card.value}</div>
            </div>

            <div className="personalized-overview-card-footer">{card.subtext}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PersonalizedOverview;
