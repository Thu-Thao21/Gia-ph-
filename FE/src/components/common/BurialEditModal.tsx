import React, { useState } from 'react';
import type { PersonBurial, LocationPrivacyLevel } from '../../types/location';
import { savePersonBurial } from '../../services/location.service';
import { LocationPickerModal } from './LocationPickerModal';
import './BurialEditModal.css';

export interface BurialEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  personId: string;
  personName: string;
  initialData?: PersonBurial | null;
  onSuccess?: (savedBurial: PersonBurial) => void;
}

export const BurialEditModal: React.FC<BurialEditModalProps> = ({
  isOpen,
  onClose,
  personId,
  personName,
  initialData,
  onSuccess,
}) => {
  const [cemeteryName, setCemeteryName] = useState<string>(initialData?.cemeteryName || '');
  const [graveCode, setGraveCode] = useState<string>(initialData?.graveCode || '');
  const [address, setAddress] = useState<string>(initialData?.address || '');
  const [latitude, setLatitude] = useState<number>(initialData?.latitude || 15.8893);
  const [longitude, setLongitude] = useState<number>(initialData?.longitude || 108.2392);
  const [burialDate, setBurialDate] = useState<string>(initialData?.burialDate || '');
  const [orientation, setOrientation] = useState<string>(initialData?.orientation || '');
  const [notes, setNotes] = useState<string>(initialData?.notes || '');
  const [privacyLevel, setPrivacyLevel] = useState<LocationPrivacyLevel>(initialData?.privacyLevel || 'CLAN_ONLY');
  
  const [isMapPickerOpen, setIsMapPickerOpen] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!latitude || !longitude) {
      setErrorMsg('Vui lòng chọn tọa độ vị trí mộ phần trên bản đồ.');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);
    try {
      const payload: Partial<PersonBurial> = {
        cemeteryName: cemeteryName.trim() || undefined,
        graveCode: graveCode.trim() || undefined,
        address: address.trim() || undefined,
        latitude,
        longitude,
        burialDate: burialDate || undefined,
        orientation: orientation.trim() || undefined,
        notes: notes.trim() || undefined,
        privacyLevel,
      };

      const saved = await savePersonBurial(personId, payload);
      if (onSuccess) onSuccess(saved);
      onClose();
    } catch (err: any) {
      console.error('Lỗi khi lưu vị trí mộ phần:', err);
      setErrorMsg(err?.response?.data?.detail || 'Không thể lưu thông tin mộ phần. Vui lòng kiểm tra lại kết nối.');
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
              <h3 className="burial-modal-title">Cập nhật vị trí mộ phần</h3>
              <p className="burial-modal-subtitle">Hồ sơ: <strong>{personName}</strong></p>
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

            <div className="burial-form-row">
              <div className="burial-form-group">
                <label>Tên nghĩa trang / Khu mộ gia tộc</label>
                <input
                  type="text"
                  placeholder="Ví dụ: Nghĩa trang Tiên tổ Dòng họ Dương"
                  value={cemeteryName}
                  onChange={(e) => setCemeteryName(e.target.value)}
                />
              </div>
              <div className="burial-form-group">
                <label>Số hiệu / Mã mộ</label>
                <input
                  type="text"
                  placeholder="Ví dụ: Khu A - Hàng 2 - Mộ #03"
                  value={graveCode}
                  onChange={(e) => setGraveCode(e.target.value)}
                />
              </div>
            </div>

            {/* Map Picker Trigger Banner */}
            <div className="burial-map-picker-banner">
              <div className="burial-coords-info">
                <span className="burial-coords-label">Tọa độ GPS đã chọn:</span>
                <span className="burial-coords-val">{latitude.toFixed(6)}, {longitude.toFixed(6)}</span>
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
                Mở bản đồ định vị ghim
              </button>
            </div>

            <div className="burial-form-group">
              <label>Địa chỉ cụ thể / Đường đi vào</label>
              <input
                type="text"
                placeholder="Ví dụ: Thôn Điện Thắng Bắc, Thị xã Điện Bàn, Quảng Nam"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </div>

            <div className="burial-form-row">
              <div className="burial-form-group">
                <label>Ngày an táng</label>
                <input
                  type="date"
                  value={burialDate}
                  onChange={(e) => setBurialDate(e.target.value)}
                />
              </div>
              <div className="burial-form-group">
                <label>Hướng mộ phong thủy</label>
                <input
                  type="text"
                  placeholder="Ví dụ: Tọa Càn hướng Tốn, Hướng Đông Nam"
                  value={orientation}
                  onChange={(e) => setOrientation(e.target.value)}
                />
              </div>
            </div>

            <div className="burial-form-group">
              <label>Quyền xem vị trí mộ phần</label>
              <select
                value={privacyLevel}
                onChange={(e) => setPrivacyLevel(e.target.value as LocationPrivacyLevel)}
              >
                <option value="PUBLIC">Công khai toàn bộ (Mọi người đều xem được)</option>
                <option value="CLAN_ONLY">Nội bộ dòng họ (Chỉ thành viên trong dòng họ xem được)</option>
                <option value="BRANCH_ONLY">Nội bộ chi phái (Chỉ thành viên cùng chi nhánh xem được)</option>
                <option value="PRIVATE">Riêng tư (Chỉ Trưởng tộc và Family Admin)</option>
              </select>
            </div>

            <div className="burial-form-group">
              <label>Ghi chú di chỉ / Lịch sử trùng tu</label>
              <textarea
                rows={3}
                placeholder="Ghi chú về đặc điểm nhận dạng, chất liệu bia mộ, cây cối xung quanh..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            <div className="burial-modal-actions">
              <button type="button" className="burial-btn cancel" onClick={onClose} disabled={submitting}>
                Hủy bỏ
              </button>
              <button type="submit" className="burial-btn save" disabled={submitting}>
                {submitting ? 'Đang lưu...' : 'Lưu vị trí mộ phần'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Map Picker Submodal */}
      <LocationPickerModal
        isOpen={isMapPickerOpen}
        onClose={() => setIsMapPickerOpen(false)}
        initialLat={latitude}
        initialLng={longitude}
        initialAddress={address}
        title={`Chọn vị trí mộ phần - ${personName}`}
        subtitle="Di chuyển bản đồ hoặc kéo ghim đỏ đến vị trí ngôi mộ chính xác"
        onSave={(newLat, newLng, newAddr) => {
          setLatitude(newLat);
          setLongitude(newLng);
          if (newAddr && !address) setAddress(newAddr);
        }}
      />
    </>
  );
};

