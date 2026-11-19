import { LoadingState } from '../../../shared/Feedback/LoadingState';
import { EmptyState } from '../../../shared/Feedback/EmptyState';
import React, { useEffect, useState } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import { fetchMemberDetail } from '../../../services/member.service';
import type { MemberDetail } from '../../../types/member';
import { AccountTab } from '../AccountTab';
import { BiographyTab } from '../BiographyTab';
import { ContactTab } from '../ContactTab';
import { ContributionsTab } from '../ContributionsTab';
import { PersonalInfoTab } from '../PersonalInfoTab';
import { PhotosTab } from '../PhotosTab';
import { StatusTab } from '../StatusTab';
import '../Profile.css';
import './ProfileLayout.css';

export interface ProfileLayoutProps {
  memberId: string;
  onBack?: () => void;
  onNavigateTab?: (tabId: string) => void;
}

export type ProfileTabKey = 'personal' | 'biography' | 'contact' | 'photos' | 'contributions' | 'status' | 'account';

export const ProfileLayout: React.FC<ProfileLayoutProps> = ({ memberId, onBack, onNavigateTab }) => {
  const { account } = useAuth();
  const [member, setMember] = useState<MemberDetail | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<ProfileTabKey>('personal');
  const [successToast, setSuccessToast] = useState<string | null>(null);

  const [isPrivate, setIsPrivate] = useState<boolean>(() => {
    const saved = localStorage.getItem(`privacy_setting_${memberId}`);
    return saved ? saved === 'private' : false;
  });

  useEffect(() => {
    setLoading(true);
    fetchMemberDetail(memberId).then((data) => {
      setMember(data);
      if (data) {
        const saved = localStorage.getItem(`privacy_setting_${memberId}`);
        const priv = saved ? saved === 'private' : Boolean((data as any).isPrivate || (data as any).is_private);
        setIsPrivate(priv);
      }
      setLoading(false);
    });
  }, [memberId]);

  const isSelf = Boolean(
    account && member && (
      ((member as any).userId && (member as any).userId === account.id) ||
      ((account as any)?.person_id && member.id === (account as any).person_id) ||
      (account.display_name && member.fullName && account.display_name.trim().toLowerCase() === member.fullName.trim().toLowerCase())
    )
  );

  const handleTogglePrivacy = () => {
    const nextVal = !isPrivate;
    setIsPrivate(nextVal);
    localStorage.setItem(`privacy_setting_${memberId}`, nextVal ? 'private' : 'public');
    const msg = nextVal
      ? `Đã chuyển hồ sơ của bạn sang chế độ Riêng tư (Ẩn SĐT và Email với thành viên khác).`
      : `Đã chuyển hồ sơ của bạn sang chế độ Công khai trong dòng họ.`;
    setSuccessToast(msg);
    setTimeout(() => setSuccessToast(null), 4000);
  };

  if (loading) {
    return (
      <LoadingState
        message="Đang tải thông tin chi tiết hồ sơ thành viên..."
        subMessage="Hệ thống đang truy xuất dữ liệu phả ký, thế hệ và lý lịch từ máy chủ gia tộc."
      />
    );
  }

  if (!member) {
    return (
      <div className="profile-empty-page-container">
        <div className="profile-empty-card">
          <div className="profile-empty-badge">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            Hồ sơ nhân khẩu
          </div>

          <EmptyState
            variant="members"
            title="Hồ sơ thành viên chưa có dữ liệu"
            subMessage="Thông tin chi tiết về thành viên này chưa được ghi nhận trong sổ gia phả hoặc tài khoản chưa được liên kết với hồ sơ nhân khẩu cụ thể."
            action={
              <div className="profile-empty-actions">
                {onBack && (
                  <button type="button" className="profile-empty-btn-primary" onClick={onBack}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="19" y1="12" x2="5" y2="12"></line>
                      <polyline points="12 19 5 12 12 5"></polyline>
                    </svg>
                    Quay lại danh sách
                  </button>
                )}
                {onNavigateTab && (
                  <button
                    type="button"
                    className="profile-empty-btn-secondary"
                    onClick={() => onNavigateTab('dashboard')}
                  >
                    Về trang chủ
                  </button>
                )}
              </div>
            }
          />

          <div className="profile-empty-guide-box">
            <div className="profile-empty-guide-item">
              <span className="profile-empty-guide-dot" />
              <span>
                <strong>Dành cho Ban quản trị / Trưởng tộc:</strong> Bạn có thể bổ sung thông tin nhân khẩu mới hoặc liên kết tài khoản tại mục Danh sách thành viên.
              </span>
            </div>
            <div className="profile-empty-guide-item">
              <span className="profile-empty-guide-dot" />
              <span>
                <strong>Dành cho Thành viên:</strong> Vui lòng liên hệ Trưởng tộc hoặc Quản trị viên để được cập nhật và liên kết thông tin vào cây gia phả dòng họ.
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const tabs: Array<{ key: ProfileTabKey; label: string; icon?: string }> = [
    { key: 'personal', label: 'Thông tin cá nhân' },
    { key: 'biography', label: 'Tiểu sử & Dòng thời gian' },
    { key: 'contact', label: 'Thông tin liên hệ' },
    { key: 'photos', label: 'Thư viện hình ảnh' },
    { key: 'contributions', label: 'Đóng góp & Năng lực' },
    { key: 'status', label: 'Trạng thái & An táng' },
    { key: 'account', label: 'Tài khoản hệ thống' },
  ];

  return (
    <div className="profile-layout">
      {/* Header Banner */}
      <div className="profile-header-card">
        <div className="profile-header-top">
          <div className="profile-avatar-wrapper">
            {member.avatarUrl ? (
              <img src={member.avatarUrl} alt={member.fullName} className="profile-avatar-img" />
            ) : (
              <div className="profile-avatar-placeholder">{member.fullName.charAt(0)}</div>
            )}
          </div>

          <div className="profile-header-info">
            <h1 className="profile-name">
              {member.fullName}
              <span className="profile-generation-badge">Đời {member.generation}</span>
              {isSelf && (
                <span
                  className="profile-self-badge">
                  Hồ sơ của bạn
                </span>
              )}
            </h1>

            <div className="profile-subtext">
              <span>{member.familyName || account?.clan_name || 'Dòng họ'}</span>
              {member.branch && <span>• {member.branch}</span>}
              {member.subBranch && <span>• {member.subBranch}</span>}
            </div>

            <div className="profile-header-meta">
              <div className="profile-meta-item">
                <strong>{member.occupation || 'Chưa cập nhật nghề nghiệp'}</strong>
              </div>
              <div className="profile-meta-item">
                <strong>{member.education || 'Chưa cập nhật học vấn'}</strong>
              </div>
              <div className="profile-meta-item">
                {member.isAlive ? 'Còn sống' : 'Đã mất'}
              </div>
            </div>

            {/* Privacy Control Bar */}
            <div className="profile-privacy-control-box">
              <div className="profile-privacy-status-group">
                <span className="profile-privacy-label">
                  Quyền riêng tư hồ sơ:
                </span>
                <span className={`profile-privacy-badge ${isPrivate ? 'private' : 'public'}`}>
                  {isPrivate ? 'Riêng tư (Ẩn SĐT & Email)' : 'Công khai dòng họ'}
                </span>
              </div>

              {isSelf && (
                <button
                  type="button"
                  className="profile-privacy-toggle-btn"
                  onClick={handleTogglePrivacy}
                >
                  {isPrivate ? 'Chuyển sang Công khai' : 'Thiết lập Riêng tư (Ẩn liên hệ)'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="profile-tabs-bar">
        {tabs.map((t) => (
          <button
            key={t.key}
            className={`profile-tab-btn ${activeTab === t.key ? 'active' : ''}`}
            onClick={() => setActiveTab(t.key)}
          >
            {t.icon && <span>{t.icon}</span>}
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* Tab Contents */}
      <div>
        {activeTab === 'personal' && <PersonalInfoTab member={member} />}
        {activeTab === 'biography' && <BiographyTab member={member} />}
        {activeTab === 'contact' && <ContactTab member={member} isPrivate={isPrivate} isSelf={isSelf} />}
        {activeTab === 'photos' && <PhotosTab member={member} />}
        {activeTab === 'contributions' && <ContributionsTab member={member} />}
        {activeTab === 'status' && <StatusTab member={member} />}
        {activeTab === 'account' && <AccountTab member={member} />}
      </div>

      {/* Success Notification */}
      {successToast && (
        <div
          style={{
            position: 'fixed',
            top: '24px',
            right: '24px',
            background: 'linear-gradient(135deg, #15803d, #16a34a)',
            color: '#ffffff',
            padding: '14px 22px',
            borderRadius: '12px',
            boxShadow: '0 10px 25px -5px rgba(22, 163, 74, 0.4)',
            fontSize: '14px',
            fontWeight: 600,
            zIndex: 10000,
          }}
        >
          {successToast}
        </div>
      )}
    </div>
  );
};

export default ProfileLayout;
