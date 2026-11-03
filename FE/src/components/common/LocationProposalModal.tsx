import React, { useState } from 'react';
import { submitLocationProposal } from '../../services/location.service';
import { LocationPickerModal } from './LocationPickerModal';
import './BurialEditModal.css';

export interface LocationProposalModalProps {
  isOpen: boolean;
  onClose: () => void;
  clanId: string;
  targetType: 'PERSON_BURIAL' | 'CLAN_LOCATION';
  personId?: string;
  personName?: string;
  locationId?: string;
  locationName?: string;
  currentLat?: number | null;
  currentLng?: number | null;
  currentAddress?: string;
  onSuccess?: () => void;
}

export const LocationProposalModal: React.FC<LocationProposalModalProps> = ({
  isOpen,
  onClose,
  clanId,
  targetType,
  personId,
  personName,
  locationId,
  locationName,
  currentLat,
  currentLng,
  currentAddress,
  onSuccess,
}) => {
  const [proposedName, setProposedName] = useState<string>(personName || locationName || '');
  const [proposedAddress, setProposedAddress] = useState<string>(currentAddress || '');
  const [proposedLat, setProposedLat] = useState<number>(currentLat || 15.8893);
  const [proposedLng, setProposedLng] = useState<number>(currentLng || 108.2392);
  const [reason, setReason] = useState<string>('');
  const [evidencePhotoUrl, setEvidencePhotoUrl] = useState<string>('');
  const [isMapPickerOpen, setIsMapPickerOpen] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      setErrorMsg('Vui lòng nêu rõ lý do hoặc căn cứ đề xuất điều chỉnh vị trí.');
      return;
    }
    if (!proposedLat || !proposedLng) {
      setErrorMsg('Vui lòng chọn tọa độ vị trí chính xác trên bản đồ.');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);
    try {
      await submitLocationProposal(clanId, {
        targetType,
        personId: personId || undefined,
        locationId: locationId || undefined,
        proposedName: proposedName.trim() || undefined,
        proposedAddress: proposedAddress.trim() || undefined,
        proposedLat,
        proposedLng,
        reason: reason.trim(),
        evidencePhotos: evidencePhotoUrl.trim() ? [evidencePhotoUrl.trim()] : [],
      });
      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Lỗi khi gửi đề xuất điều chỉnh vị trí:', err);
      setErrorMsg(err?.response?.data?.detail || 'Không thể gửi đề xuất. Vui lòng thử lại sau.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="burial-modal-overlay" onClick={onClose}>
        <div className="burial-modal-box" onClick={(e) => e.stopPropagation()}>
          <div className="burial-modal-header">
            <div>
              <h3 className="burial-modal-title">Gửi đề xuất điều chỉnh vị trí</h3>
              <p className="burial-modal-subtitle">
                {targetType === 'PERSON_BURIAL' ? `Mộ phần: ${personName}` : `Địa điểm: ${locationName}`}
              </p>
            </div>
            <button className="burial-modal-close" onClick={onClose}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <form onSubmit={handleSubmit} className="burial-modal-body">
            {errorMsg && <div className="burial-modal-error">{errorMsg}</div>}

            <div style={{ background: '#f8fafc', padding: '12px 16px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', color: '#475569' }}>
              Đề xuất của bạn sẽ được gửi tới <strong>Trưởng tộc</strong> hoặc <strong>Family Admin</strong> phụ trách để kiểm tra, xác minh và phê duyệt trước khi cập nhật chính thức.
            </div>

            {/* Current vs Proposed Coords Banner */}
            <div className="burial-map-picker-banner">
              <div className="burial-coords-info">
                <span className="burial-coords-label">Tọa độ đề xuất mới:</span>
                <span className="burial-coords-val">{proposedLat.toFixed(6)}, {proposedLng.toFixed(6)}</span>
              </div>
              <button
                type="button"
                className="burial-open-map-btn"
                onClick={() => setIsMapPickerOpen(true)}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
                  <line x1="8" y1="2" x2="8" y2="18" />
                  <line x1="16" y1="6" x2="16" y2="22" />
                </svg>
                Chọn vị trí mới trên bản đồ
              </button>
            </div>

            <div className="burial-form-group">
              <label>Tên địa điểm / Tên bia mộ</label>
              <input
                type="text"
                value={proposedName}
                onChange={(e) => setProposedName(e.target.value)}
              />
            </div>

            <div className="burial-form-group">
              <label>Địa chỉ mô tả mới</label>
              <input
                type="text"
                placeholder="Ví dụ: Thôn Điện Thắng Bắc, Thị xã Điện Bàn, Quảng Nam"
                value={proposedAddress}
                onChange={(e) => setProposedAddress(e.target.value)}
              />
            </div>

            <div className="burial-form-group">
              <label>Lý do đề xuất điều chỉnh (*)</label>
              <textarea
                rows={3}
                required
                placeholder="Ví dụ: Tọa độ cũ lệch 50m về phía Tây, tôi vừa đi viếng mộ và đo lại GPS chuẩn tại bia mộ..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>

            <div className="burial-form-group">
              <label>Đường dẫn hình ảnh xác minh / Chụp bia mộ (tùy chọn)</label>
              <input
                type="url"
                placeholder="https://example.com/anh-bia-mo.jpg"
                value={evidencePhotoUrl}
                onChange={(e) => setEvidencePhotoUrl(e.target.value)}
              />
            </div>

            <div className="burial-modal-actions">
              <button type="button" className="burial-btn cancel" onClick={onClose} disabled={submitting}>
                Hủy bỏ
              </button>
              <button type="submit" className="burial-btn save" disabled={submitting}>
                {submitting ? 'Đang gửi...' : 'Gửi đề xuất'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Map Picker Submodal */}
      <LocationPickerModal
        isOpen={isMapPickerOpen}
        onClose={() => setIsMapPickerOpen(false)}
        initialLat={proposedLat}
        initialLng={proposedLng}
        initialAddress={proposedAddress}
        title="Chọn tọa độ đề xuất mới"
        subtitle="Di chuyển bản đồ và kéo ghim đỏ đến vị trí bạn muốn đề xuất"
        onSave={(newLat, newLng, newAddr) => {
          setProposedLat(newLat);
          setProposedLng(newLng);
          if (newAddr && !proposedAddress) setProposedAddress(newAddr);
        }}
      />
    </>
  );
};

