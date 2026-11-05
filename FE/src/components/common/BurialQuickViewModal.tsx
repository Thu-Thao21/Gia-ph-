import React, { useEffect, useState } from 'react';
import type { PersonBurial } from '../../types/location';
import { fetchPersonBurial, getGoogleMapsDirectionUrl, getGoogleMapsEmbedUrl } from '../../services/location.service';
import { useAuth } from '../../hooks/useAuth';
import { BurialEditModal } from './BurialEditModal';
import { LocationProposalModal } from './LocationProposalModal';
import './BurialEditModal.css';

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
        <div className="burial-modal-box" style={{ maxWidth: '620px' }} onClick={(e) => e.stopPropagation()}>
          <div className="burial-modal-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                background: '#eff6ff',
                color: '#2563eb',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
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
            <button className="burial-modal-close" onClick={onClose}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <div className="burial-modal-body">
            {loading ? (
              <div style={{ padding: '30px', textAlign: 'center', color: '#64748b' }}>
                Đang tra cứu dữ liệu mộ phần từ máy chủ gia tộc...
              </div>
            ) : burial && burial.latitude && burial.longitude ? (
              <>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '12px',
                  background: '#f8fafc',
                  padding: '14px 16px',
                  borderRadius: '10px',
                  border: '1px solid #e2e8f0',
                  fontSize: '13px',
                }}>
                  <div>
                    <span style={{ color: '#64748b', display: 'block', fontSize: '11px', textTransform: 'uppercase', fontWeight: 600 }}>Nghĩa trang / Khu mộ</span>
                    <strong style={{ color: '#1e293b' }}>{burial.cemeteryName || 'Chưa cập nhật'}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#64748b', display: 'block', fontSize: '11px', textTransform: 'uppercase', fontWeight: 600 }}>Số hiệu / Phân khu</span>
                    <strong style={{ color: '#1e293b' }}>{burial.graveCode || 'Chưa cập nhật'}</strong>
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <span style={{ color: '#64748b', display: 'block', fontSize: '11px', textTransform: 'uppercase', fontWeight: 600 }}>Địa chỉ</span>
                    <span style={{ color: '#334155' }}>{burial.address || 'Chưa cập nhật'}</span>
                  </div>
                  {burial.orientation && (
                    <div>
                      <span style={{ color: '#64748b', display: 'block', fontSize: '11px', textTransform: 'uppercase', fontWeight: 600 }}>Hướng phong thủy</span>
                      <span style={{ color: '#334155' }}>{burial.orientation}</span>
                    </div>
                  )}
                  <div>
                    <span style={{ color: '#64748b', display: 'block', fontSize: '11px', textTransform: 'uppercase', fontWeight: 600 }}>Tọa độ GPS</span>
                    <span style={{ fontFamily: 'monospace', color: '#1d4ed8', fontWeight: 600 }}>
                      {burial.latitude.toFixed(6)}, {burial.longitude.toFixed(6)}
                    </span>
                  </div>
                </div>

                {/* Map Preview */}
                <div style={{ height: '220px', borderRadius: '10px', overflow: 'hidden', border: '1px solid #cbd5e1' }}>
                  <iframe
                    title="Map Preview"
                    src={getGoogleMapsEmbedUrl(burial.latitude, burial.longitude)}
                    style={{ width: '100%', height: '100%', border: 'none' }}
                    loading="lazy"
                  />
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center', justifyContent: 'space-between', paddingTop: '8px' }}>
                  <a
                    href={getGoogleMapsDirectionUrl(burial.latitude, burial.longitude)}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      background: '#16a34a',
                      color: '#ffffff',
                      padding: '10px 18px',
                      borderRadius: '8px',
                      fontWeight: 700,
                      fontSize: '13.5px',
                      textDecoration: 'none',
                      boxShadow: '0 2px 4px rgba(22, 163, 74, 0.2)',
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <polygon points="3 11 22 2 13 21 11 13 3 11" />
                    </svg>
                    Chỉ đường bằng Google Maps
                  </a>

                  <div style={{ display: 'flex', gap: '8px' }}>
                    {canManage ? (
                      <button
                        type="button"
                        onClick={() => setIsEditOpen(true)}
                        style={{
                          background: '#f1f5f9',
                          border: '1px solid #cbd5e1',
                          padding: '8px 12px',
                          borderRadius: '8px',
                          fontSize: '13px',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        Sửa vị trí
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setIsProposalOpen(true)}
                        style={{
                          background: '#eff6ff',
                          color: '#2563eb',
                          border: '1px solid #bfdbfe',
                          padding: '8px 12px',
                          borderRadius: '8px',
                          fontSize: '13px',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
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
                        style={{
                          background: '#ffffff',
                          border: '1px solid #cbd5e1',
                          padding: '8px 12px',
                          borderRadius: '8px',
                          fontSize: '13px',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        Xem chi tiết hồ sơ →
                      </button>
                    )}
                  </div>
                </div>
              </>
            ) : (
              /* Missing Location */
              <div style={{ textAlign: 'center', padding: '24px 16px', background: '#fffbeb', borderRadius: '10px', border: '1px solid #fef3c7' }}>
                <p style={{ margin: '0 0 14px', color: '#92400e', fontSize: '13.5px', fontWeight: 500 }}>
                  Chưa có tọa độ vị trí mộ phần của cụ <strong>{personName}</strong> trên Google Maps.
                </p>
                {canManage ? (
                  <button
                    type="button"
                    onClick={() => setIsEditOpen(true)}
                    style={{
                      background: '#2563eb',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '9px 18px',
                      fontSize: '13px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    + Cập nhật vị trí mộ phần ngay
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsProposalOpen(true)}
                    style={{
                      background: '#eff6ff',
                      color: '#2563eb',
                      border: '1px solid #bfdbfe',
                      borderRadius: '8px',
                      padding: '9px 18px',
                      fontSize: '13px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
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

