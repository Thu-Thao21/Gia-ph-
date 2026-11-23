import React from 'react';
import type { MemberDetail } from '../../../types/member';
import '../Profile.css';
import './ContributionsTab.css';

export interface ContributionsTabProps {
  member: MemberDetail;
}

export const ContributionsTab: React.FC<ContributionsTabProps> = ({ member }) => {
  const skills = member.skills || [];
  const contrib = member.contribution;

  return (
    <div className="contributions-tab-wrapper">
      <div className="profile-card">
        <h3 className="profile-card-title">Năng Lực & Chuyên Môn Nổi Bật</h3>
        {skills.length > 0 ? (
          <div className="contributions-skills-grid">
            {skills.map((s) => (
              <div key={s.id} className="contribution-badge-chip">
                <span></span>
                <span>{s.skillName}</span>
                <span className="contribution-level-text">({s.proficiencyLevel})</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="profile-empty">Chưa có kỹ năng nổi bật được ghi nhận.</div>
        )}
      </div>

      <div className="profile-card">
        <h3 className="profile-card-title">Đóng Góp Với Dòng Họ & Xã Hội</h3>
        {contrib ? (
          <div className="profile-info-grid">
            <div className="profile-info-item">
              <span className="profile-info-label">Khả năng đóng góp</span>
              <span className="profile-info-value">{contrib.ability || '—'}</span>
            </div>
            <div className="profile-info-item">
              <span className="profile-info-label">Chuyên môn hỗ trợ</span>
              <span className="profile-info-value">{contrib.specialty || '—'}</span>
            </div>
            <div className="profile-info-item">
              <span className="profile-info-label">Lĩnh vực hoạt động</span>
              <span className="profile-info-value">{contrib.field || '—'}</span>
            </div>
          </div>
        ) : (
          <div className="profile-empty">Chưa có ghi nhận đóng góp đặc thù.</div>
        )}
      </div>
    </div>
  );
};

export default ContributionsTab;
