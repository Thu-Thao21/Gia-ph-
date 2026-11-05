import React, { useEffect, useState } from 'react';
import type { MemberDetail } from '../../../types/member';
import type { PersonBurial } from '../../../types/location';
import { useAuth } from '../../../hooks/useAuth';
import { fetchPersonBurial, getGoogleMapsDirectionUrl, getGoogleMapsEmbedUrl } from '../../../services/location.service';
import { BurialEditModal } from '../../common/BurialEditModal';
import { LocationProposalModal } from '../../common/LocationProposalModal';
import '../Profile.css';
import './StatusTab.css';

export interface StatusTabProps {
  member: MemberDetail;
}

export const StatusTab: React.FC<StatusTabProps> = ({ member }) => {
  const { userRole } = useAuth();
  const [burial, setBurial] = useState<PersonBurial | null>(null);
  const [loadingBurial, setLoadingBurial] = useState<boolean>(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);
  const [isProposalModalOpen, setIsProposalModalOpen] = useState<boolean>(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const roleLower = (userRole || '').toLowerCase();
  const canManage = [
    'admin', 'trưởng tộc', 'chủ dòng họ', 'clan admin', 'clan_admin', 
    'family_head', 'family admin', 'family_admin', 'manager'
  ].includes(roleLower);

  const loadBurial = () => {
    if (member && !member.isAlive) {
      setLoadingBurial(true);
      fetchPersonBurial(member.id)
        .then((data) => setBurial(data))
        .finally(() => setLoadingBurial(false));
    }
  };

  useEffect(() => {
    loadBurial();
  }, [member.id, member.isAlive]);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 4000);
  };

  return (
    <div className="status-tab-wrapper">
      {toastMsg && (
        <div style={{
          padding: '12px 18px',
          background: '#f0fdf4',
          border: '1px solid #bbf7d0',
          color: '#166534',
          borderRadius: '10px',
          fontSize: '14px',
          fontWeight: 600,
        }}>
          {toastMsg}
        </div>
      )}

      {/* Main Status Card */}
      <div className={`profile-card ${member.isAlive ? 'status-alive-card' : 'status-deceased-card'}`}>
        <h3 className="profile-card-title">
          {member.isAlive ? 'Trạng Thái: Đang Sinh Sống' : 'Trạng Thái: Đã Tạ Thế (Tưởng Niệm)'}
        </h3>

        <div className="profile-info-grid">
          <div className="profile-info-item">
            <span className="profile-info-label">Trạng thái sinh tử</span>
            <span className="profile-info-value status-bold-value">
              {member.isAlive ? 'Còn sống' : 'Đã tạ thế'}
            </span>
          </div>

          {!member.isAlive && (
            <>
              <div className="profile-info-item">
                <span className="profile-info-label">Ngày mất (Dương lịch)</span>
                <span className="profile-info-value">{member.deathDate || 'Chưa cập nhật'}</span>
              </div>

              <div className="profile-info-item">
                <span className="profile-info-label">Ngày giỗ (Âm lịch)</span>
                <span className="profile-info-value status-lunar-date">
                  {member.lunarDeathDate || 'Chưa cập nhật'}
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Burial & Google Maps Section (For Deceased) */}
      {!member.isAlive && (
        <div className="burial-section-card">
          <div className="burial-section-header">
            <div className="burial-title-wrapper">
              <div className="burial-title-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
              </div>
              <div>
                <h4 className="burial-section-title">Vị trí Mộ phần & Bản đồ số Google Maps</h4>
                <p className="burial-section-subtitle">Lưu giữ tọa độ nơi an nghỉ của tổ tiên và dẫn đường viếng mộ</p>
              </div>
            </div>

            {burial && (
              <div className="burial-action-secondary-btns">
                {canManage ? (
                  <button
                    type="button"
                    className="burial-edit-btn"
                    onClick={() => setIsEditModalOpen(true)}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 20h9" />
                      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                    </svg>
                    Chỉnh sửa tọa độ
                  </button>
                ) : (
                  <button
                    type="button"
                    className="burial-propose-btn"
                    onClick={() => setIsProposalModalOpen(true)}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                    Đề xuất điều chỉnh vị trí
                  </button>
                )}
              </div>
            )}
          </div>

          {loadingBurial ? (
            <div style={{ padding: '24px', textAlign: 'center', color: '#64748b' }}>
              Đang tải dữ liệu vị trí mộ phần...
            </div>
          ) : burial && burial.latitude && burial.longitude ? (
            <>
              {/* Burial Details Grid */}
              <div className="profile-info-grid">
                <div className="profile-info-item">
                  <span className="profile-info-label">Nghĩa trang / Khu mộ</span>
                  <span className="profile-info-value">{burial.cemeteryName || 'Chưa đặt tên'}</span>
                </div>

                <div className="profile-info-item">
                  <span className="profile-info-label">Số hiệu mộ / Phân khu</span>
                  <span className="profile-info-value">{burial.graveCode || 'Chưa cập nhật'}</span>
                </div>

                <div className="profile-info-item">
                  <span className="profile-info-label">Tọa độ vệ tinh GPS</span>
                  <span className="profile-info-value" style={{ fontFamily: 'monospace', color: '#1d4ed8' }}>
                    {burial.latitude.toFixed(6)}, {burial.longitude.toFixed(6)}
                  </span>
                </div>

                <div className="profile-info-item">
                  <span className="profile-info-label">Hướng phong thủy</span>
                  <span className="profile-info-value">{burial.orientation || 'Chưa cập nhật'}</span>
                </div>

                <div className="profile-info-item status-full-width">
                  <span className="profile-info-label">Địa chỉ an táng</span>
                  <span className="profile-info-value">{burial.address || 'Chưa cập nhật địa chỉ'}</span>
                </div>

                {burial.notes && (
                  <div className="profile-info-item status-full-width">
                    <span className="profile-info-label">Ghi chú di chỉ / Trùng tu</span>
                    <span className="profile-info-value">{burial.notes}</span>
                  </div>
                )}
              </div>

              {/* Embedded Google Maps Preview */}
              <div className="burial-map-preview-container">
                <iframe
                  title="Google Maps Preview"
                  className="burial-map-iframe"
                  loading="lazy"
                  src={getGoogleMapsEmbedUrl(burial.latitude, burial.longitude)}
                  allowFullScreen
                />
              </div>

              {/* Direct Navigation Button */}
              <div className="burial-action-bar">
                <a
                  href={getGoogleMapsDirectionUrl(burial.latitude, burial.longitude)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="burial-direction-btn"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="3 11 22 2 13 21 11 13 3 11" />
                  </svg>
                  Chỉ đường bằng Google Maps đến mộ phần
                </a>

                <span style={{ fontSize: '13px', color: '#64748b' }}>
                  Tự động điều hướng từ GPS vị trí hiện tại của bạn đến nơi an nghỉ của cụ
                </span>
              </div>
            </>
          ) : (
            /* Empty State: Missing Burial Coordinates */
            <div className="burial-empty-state">
              <div style={{
                width: '44px',
                height: '44px',
                borderRadius: '50%',
                background: '#fef3c7',
                color: '#d97706',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
              </div>

              <div className="burial-empty-text">
                Chưa cập nhật tọa độ vị trí mộ phần của cụ trên bản đồ số Google Maps.
              </div>

              {canManage ? (
                <button
                  type="button"
                  className="burial-direction-btn"
                  style={{ background: '#2563eb' }}
                  onClick={() => setIsEditModalOpen(true)}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  Cập nhật vị trí mộ phần ngay
                </button>
              ) : (
                <button
                  type="button"
                  className="burial-propose-btn"
                  onClick={() => setIsProposalModalOpen(true)}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                  Gửi đề xuất tọa độ mộ phần
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Edit Modal (Admin / Clan Leader) */}
      {isEditModalOpen && (
        <BurialEditModal
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          personId={member.id}
          personName={member.fullName}
          initialData={burial}
          onSuccess={(saved) => {
            setBurial(saved);
            showToast(`Đã lưu vị trí mộ phần của cụ '${member.fullName}' thành công.`);
          }}
        />
      )}

      {/* Proposal Modal (Members) */}
      {isProposalModalOpen && (
        <LocationProposalModal
          isOpen={isProposalModalOpen}
          onClose={() => setIsProposalModalOpen(false)}
          clanId={member.familyId}
          targetType="PERSON_BURIAL"
          personId={member.id}
          personName={member.fullName}
          currentLat={burial?.latitude}
          currentLng={burial?.longitude}
          currentAddress={burial?.address || ''}
          onSuccess={() => {
            showToast('Đã gửi đề xuất điều chỉnh vị trí mộ phần. Trưởng tộc sẽ kiểm tra và phê duyệt.');
          }}
        />
      )}
    </div>
  );
};

export default StatusTab;
