import React, { useEffect, useState } from 'react';
import type { PersonBurial } from '../../types/location';
import { fetchPersonBurial, getGoogleMapsDirectionUrl } from '../../services/location.service';
import { LocationPreviewMap } from '../worldmap/LocationPreviewMap';
import { useAuth } from '../../hooks/useAuth';
import { BurialEditModal } from './BurialEditModal';
import { LocationProposalModal } from './LocationProposalModal';
import './BurialEditModal.css';
import './BurialQuickViewModal.css';

export interface BurialQuickViewModalProps {
  isOpen: boolean;
  onClose: () => void;
  personId: string;
  personName: string;
  deathDate?: string;
  clanId?: string;
  onViewFullProfile?: () => void;
}

export const BurialQuickViewModal: React.FC<BurialQuickViewModalProps> = ({
  isOpen,
  onClose,
  personId,
  personName,
  deathDate,
  clanId,
  onViewFullProfile,
}) => {
  const { userRole } = useAuth();
  const [burial, setBurial] = useState<PersonBurial | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isEditOpen, setIsEditOpen] = useState<boolean>(false);
  const [isProposalOpen, setIsProposalOpen] = useState<boolean>(false);

  const roleLower = (userRole || '').toLowerCase();
  const canManage = [
    'admin', 'trưởng tộc', 'chủ dòng họ', 'clan admin', 'clan_admin', 
    'family_head', 'family admin', 'family_admin', 'manager'
  ].includes(roleLower);

  const loadData = () => {
    if (isOpen && personId) {
      setLoading(true);
      fetchPersonBurial(personId)
        .then((data) => setBurial(data))
        .finally(() => setLoading(false));
    }
  };

  useEffect(() => {
    loadData();
  }, [isOpen, personId]);

  if (!isOpen) return null;

  return (
    <>
      <div className="burial-modal-overlay" onClick={onClose}>
        <div className="burial-modal-box burial-quickview-box" onClick={(e) => e.stopPropagation()}>
          <div className="burial-modal-header">
            <div className="burial-quickview-header-left">
              <div className="burial-quickview-icon-wrap">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
              </div>
              <div>
                <h3 className="burial-modal-title">Thông tin Mộ phần & Chỉ đường</h3>
                <p className="burial-modal-subtitle">
                  {personName} {deathDate ? `(Năm mất: ${deathDate})` : ''}
                </p>
              </div>
            </div>
            <button className="burial-modal-close" onClick={onClose} aria-label="Đóng">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <div className="burial-modal-body">
            {loading ? (
              <div className="burial-quickview-loading">
                Đang tra cứu dữ liệu mộ phần từ máy chủ gia tộc...
              </div>
            ) : burial && burial.latitude && burial.longitude ? (
              <>
                <div className="burial-quickview-grid">
                  <div>
                    <span className="burial-quickview-field-label">Nghĩa trang / Khu mộ</span>
                    <strong className="burial-quickview-field-val">{burial.cemeteryName || 'Chưa cập nhật'}</strong>
                  </div>
                  <div>
                    <span className="burial-quickview-field-label">Số hiệu / Phân khu</span>
                    <strong className="burial-quickview-field-val">{burial.graveCode || 'Chưa cập nhật'}</strong>
                  </div>
                  <div className="burial-quickview-field-full">
                    <span className="burial-quickview-field-label">Địa chỉ</span>
                    <span className="burial-quickview-field-text">{burial.address || 'Chưa cập nhật'}</span>
                  </div>
                  {burial.orientation && (
                    <div>
                      <span className="burial-quickview-field-label">Hướng phong thủy</span>
                      <span className="burial-quickview-field-text">{burial.orientation}</span>
                    </div>
                  )}
                  <div>
                    <span className="burial-quickview-field-label">Tọa độ GPS</span>
                    <span className="burial-quickview-gps">
                      {burial.latitude.toFixed(6)}, {burial.longitude.toFixed(6)}
                    </span>
                  </div>
                </div>

                {/* Map Preview */}
                <div className="burial-quickview-map-wrap">
                  <LocationPreviewMap
                    latitude={burial.latitude}
                    longitude={burial.longitude}
                    label={`Vị trí mộ phần của ${personName}`}
                  />
                </div>

                {/* Actions */}
                <div className="burial-quickview-actions">
                  <a
                    href={getGoogleMapsDirectionUrl(burial.latitude, burial.longitude)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="burial-quickview-btn-maps"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <polygon points="3 11 22 2 13 21 11 13 3 11" />
                    </svg>
                    Chỉ đường bằng Google Maps
                  </a>

                  <div className="burial-quickview-action-group">
                    {canManage ? (
                      <button
                        type="button"
                        onClick={() => setIsEditOpen(true)}
                        className="burial-quickview-btn-edit"
                      >
                        Sửa vị trí
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setIsProposalOpen(true)}
                        className="burial-quickview-btn-propose"
                      >
                        Đề xuất sửa
                      </button>
                    )}

                    {onViewFullProfile && (
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onViewFullProfile();
                        }}
                        className="burial-quickview-btn-profile"
                      >
                        Xem chi tiết hồ sơ →
                      </button>
                    )}
                  </div>
                </div>
              </>
            ) : (
              /* Missing Location */
              <div className="burial-quickview-missing-box">
                <p className="burial-quickview-missing-msg">
                  Chưa có tọa độ vị trí mộ phần của cụ <strong>{personName}</strong> trên Google Maps.
                </p>
                {canManage ? (
                  <button
                    type="button"
                    onClick={() => setIsEditOpen(true)}
                    className="burial-quickview-btn-update-now"
                  >
                    + Cập nhật vị trí mộ phần ngay
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsProposalOpen(true)}
                    className="burial-quickview-btn-propose-lg"
                  >
                    Gửi đề xuất tọa độ mộ phần
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {isEditOpen && (
        <BurialEditModal
          isOpen={isEditOpen}
          onClose={() => setIsEditOpen(false)}
          personId={personId}
          personName={personName}
          initialData={burial}
          onSuccess={(saved) => {
            setBurial(saved);
          }}
        />
      )}

      {isProposalOpen && (
        <LocationProposalModal
          isOpen={isProposalOpen}
          onClose={() => setIsProposalOpen(false)}
          clanId={clanId || burial?.clanId || ''}
          targetType="PERSON_BURIAL"
          personId={personId}
          personName={personName}
          currentLat={burial?.latitude}
          currentLng={burial?.longitude}
          currentAddress={burial?.address || ''}
          onSuccess={() => {
            alert('Đã gửi đề xuất thành công. Trưởng tộc sẽ kiểm tra và xác nhận.');
          }}
        />
      )}
    </>
  );
};

export default BurialQuickViewModal;
