import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../../../config/routes';
import type { MemberDetail } from '../../../types/member';
import '../Profile.css';
import './AccountTab.css';

export interface AccountTabProps {
  member: MemberDetail;
}

export const AccountTab: React.FC<AccountTabProps> = ({ member }) => {
  const navigate = useNavigate();

  return (
    <div className="account-tab-container">
      <div className="profile-card">
        <h3 className="profile-card-title">Tài Khoản Người Dùng Liên Kết</h3>

        <div className="profile-info-grid">
          <div className="profile-info-item">
            <span className="profile-info-label">Mã tài khoản (User ID)</span>
            <span className="profile-info-value">{member.userId || 'Chưa liên kết tài khoản hệ thống'}</span>
          </div>

          <div className="profile-info-item">
            <span className="profile-info-label">Quyền hạn gia tộc</span>
            <span className="profile-info-value account-role-text">
              {member.isPrimary ? 'Chủ dòng họ / Quản trị gia phả' : 'Thành viên gia tộc'}
            </span>
          </div>

          <div className="profile-info-item">
            <span className="profile-info-label">Trạng thái tài khoản</span>
            <div>
              <span className="account-status-badge"> Đã kích hoạt</span>
            </div>
          </div>
        </div>
      </div>

      <div className="profile-card account-preferences-card">
        <div className="account-preferences-heading">
          <div>
            <span className="account-preferences-eyebrow">BẢO VỆ DỮ LIỆU</span>
            <h3 className="profile-card-title">Quyền riêng tư &amp; đồng thuận AI</h3>
            <p>Kiểm soát ai được xem hồ sơ và cách các tính năng AI được phép sử dụng dữ liệu gia phả.</p>
          </div>
          <span className="account-security-badge">Được bảo vệ</span>
        </div>

        <div className="account-preferences-actions">
          <button type="button" onClick={() => navigate(ROUTES.USER.PRIVACY_SETTINGS)}>
            <span className="account-action-icon">◉</span>
            <span><strong>Cài đặt quyền riêng tư</strong><small>Phạm vi hồ sơ, cây gia phả và dữ liệu nhạy cảm</small></span>
            <b>→</b>
          </button>
          <button type="button" onClick={() => navigate(ROUTES.USER.AI_CONSENT)}>
            <span className="account-action-icon ai">AI</span>
            <span><strong>Đồng thuận sử dụng AI</strong><small>Dữ liệu cá nhân, hình ảnh và tính năng hỗ trợ AI</small></span>
            <b>→</b>
          </button>
        </div>
      </div>
    </div>
  );
};

export default AccountTab;
