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
  hasClan?: boolean;
  onRequestRole?: () => void;
}

export const PersonalizedOverview: React.FC<PersonalizedOverviewProps> = ({
  userName,
  familyBranch = 'Chưa tham gia dòng họ',
  generationLevel = 'Đời thứ --',
  totalMembers = 0,
  linkedFamiliesCount = 0,
  userRole = 'Thành viên',
  lineageType,
  hasClan = true,
  onRequestRole,
}) => {
  const isMaternal = (lineageType || '').toUpperCase() === 'MATERNAL';
  const lineageLabel = lineageType ? (isMaternal ? 'Bên Ngoại' : 'Bên Nội') : null;
  const lineageTag = hasClan ? (lineageType ? (isMaternal ? 'Bên Ngoại' : 'Bên Nội') : 'Chính Tộc') : 'Chưa có';
  const lineageTitle = hasClan
    ? lineageType
      ? isMaternal
        ? 'Dòng họ bên Ngoại'
        : 'Dòng họ bên Nội'
      : 'Dòng họ chính của bạn'
    : 'Dòng họ chính của bạn';
  const lineageSubtext = hasClan
    ? lineageType
      ? isMaternal
        ? 'Chi hệ ngoại tộc'
        : 'Trực hệ nội tộc'
      : 'Trực hệ chính tộc'
    : 'Chưa liên kết dòng họ';

  const metricCards = [
    {
      id: 1,
      title: lineageTitle,
      value: hasClan ? familyBranch : 'Chưa tham gia',
      subtext: lineageSubtext,
      tag: lineageTag,
      tagClass: hasClan ? (isMaternal ? 'maternal' : 'paternal') : 'default',
    },
    {
      id: 2,
      title: 'Thế hệ / Đời thứ',
      value: hasClan ? generationLevel : '--',
      subtext: hasClan ? 'Vị trí trong cây trực hệ' : 'Chưa xác định vị trí',
      tag: 'Hiện tại',
      tagClass: 'default',
    },
    {
      id: 3,
      title: 'Tổng số thành viên',
      value: hasClan ? `${totalMembers} Thành viên` : '0 Thành viên',
      subtext: hasClan ? 'Thống kê theo dữ liệu thực' : 'Chưa có dữ liệu gia phả',
      tag: 'Gia phả',
      tagClass: 'default',
    },
    {
      id: 4,
      title: 'Số dòng họ đã liên kết',
      value: hasClan ? `${linkedFamiliesCount} Dòng họ` : '0 Dòng họ',
      subtext: hasClan ? 'Nội • Ngoại • Thông gia' : 'Chưa có mạng lưới',
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
            {hasClan ? (
              <>
                Chào mừng bạn quay trở lại với không gian gia tộc <strong>{familyBranch}</strong>
                {lineageLabel && (
                  <span className={`personalized-lineage-badge ${isMaternal ? 'maternal' : 'paternal'}`}>
                    {lineageLabel}
                  </span>
                )}{' '}
                thuộc <strong>{generationLevel}</strong>.
              </>
            ) : (
              <>
                Chào mừng bạn đến với Hệ thống Gia phả Liên họ. Bạn hiện chưa tham gia dòng họ nào, hãy liên hệ Trưởng tộc hoặc quản trị viên để được kết nối vào cây gia phả.
              </>
            )}
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
