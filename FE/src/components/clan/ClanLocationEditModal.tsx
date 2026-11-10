import React, { useState } from 'react';
import type { ClanLocation, LocationType, LocationPrivacyLevel } from '../../types/location';
import { createClanLocation, updateClanLocation } from '../../services/location.service';
import { LocationPickerModal } from '../common/LocationPickerModal';
import '../common/BurialEditModal.css';

export interface ClanLocationEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  clanId: string;
  initialData?: ClanLocation | null;
  onSuccess: (saved: ClanLocation) => void;
}

export const ClanLocationEditModal: React.FC<ClanLocationEditModalProps> = ({
  isOpen,
  onClose,
  clanId,
  initialData,
  onSuccess,
}) => {
  const [name, setName] = useState<string>(initialData?.name || '');
  const [locationType, setLocationType] = useState<LocationType>(initialData?.locationType || 'ANCESTRAL_HALL');
  const [address, setAddress] = useState<string>(initialData?.address || '');
  const [latitude, setLatitude] = useState<number>(initialData?.latitude || 15.8893);
  const [longitude, setLongitude] = useState<number>(initialData?.longitude || 108.2392);
  const [description, setDescription] = useState<string>(initialData?.description || '');
  const [privacyLevel, setPrivacyLevel] = useState<LocationPrivacyLevel>(initialData?.privacyLevel || 'PUBLIC');
  const [isMapPickerOpen, setIsMapPickerOpen] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMsg('Vui lòng nhập tên địa điểm dòng họ.');
      return;
    }
    if (!address.trim()) {
      setErrorMsg('Vui lòng nhập địa chỉ cụ thể.');
      return;
    }
    if (!latitude || !longitude) {
      setErrorMsg('Vui lòng chọn tọa độ trên bản đồ số.');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);
    try {
      const payload: Partial<ClanLocation> = {
        name: name.trim(),
        locationType,
        address: address.trim(),
        latitude,
        longitude,
        description: description.trim() || undefined,
        privacyLevel,
      };

      let saved: ClanLocation;
      if (initialData?.id) {
        saved = await updateClanLocation(clanId, initialData.id, payload);
      } else {
        saved = await createClanLocation(clanId, payload);
      }
      onSuccess(saved);
      onClose();
    } catch (err: any) {
      console.error('Lỗi lưu địa điểm:', err);
      setErrorMsg(err?.response?.data?.detail || 'Không thể lưu địa điểm. Vui lòng kiểm tra lại kết nối.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="burial-modal-overlay" onClick={onClose}>
        <div className="burial-modal-box" style={{ maxWidth: '640px' }} onClick={(e) => e.stopPropagation()}>
          <div className="burial-modal-header">
            <div>
              <h3 className="burial-modal-title">
                {initialData ? 'Chỉnh sửa địa điểm dòng họ' : 'Thêm địa điểm dòng họ mới'}
              </h3>
              <p className="burial-modal-subtitle">
                Đánh dấu nhà thờ họ, từ đường, khu mộ tổ hoặc nơi sinh hoạt gia tộc
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

            <div className="burial-form-row">
              <div className="burial-form-group">
                <label>Tên địa điểm (*)</label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Nhà thờ đại tộc Dòng Họ Dương"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="burial-form-group">
                <label>Phân loại địa điểm (*)</label>
                <select
                  value={locationType}
                  onChange={(e) => setLocationType(e.target.value as LocationType)}
                >
                  <option value="ANCESTRAL_HALL">Nhà thờ tổ / Đại từ đường</option>
                  <option value="BRANCH_HALL">Từ đường chi phái / Nhà thờ nhánh</option>
                  <option value="HISTORIC_SITE">Di tích lịch sử dòng tộc</option>
                  <option value="HOMELAND">Đất tổ / Cội nguồn quê hương</option>
                  <option value="EVENT_VENUE">Nơi tổ chức giỗ tổ / Lễ hội</option>
                  <option value="OTHER">Địa điểm quan trọng khác</option>
                </select>
              </div>
            </div>

            {/* Map Picker Trigger Banner */}
            <div className="burial-map-picker-banner">
              <div className="burial-coords-info">
                <span className="burial-coords-label">Tọa độ GPS bản đồ:</span>
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
                Chọn vị trí trên bản đồ
              </button>
            </div>

            <div className="burial-form-group">
              <label>Địa chỉ cụ thể (*)</label>
              <input
                type="text"
                required
                placeholder="Ví dụ: Thôn Điện Thắng Bắc, Thị xã Điện Bàn, Quảng Nam"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </div>

            <div className="burial-form-group">
              <label>Quyền riêng tư hiển thị</label>
              <select
                value={privacyLevel}
                onChange={(e) => setPrivacyLevel(e.target.value as LocationPrivacyLevel)}
              >
                <option value="PUBLIC">Công khai (Mọi người và khách vãng lai đều xem được)</option>
                <option value="CLAN_ONLY">Nội bộ dòng họ (Chỉ thành viên đã duyệt của dòng họ)</option>
                <option value="BRANCH_ONLY">Nội bộ chi nhánh (Chỉ thành viên chi phái)</option>
                <option value="PRIVATE">Riêng tư (Chỉ Trưởng tộc và Family Admin)</option>
              </select>
            </div>

            <div className="burial-form-group">
              <label>Thông tin mô tả & Lịch sử</label>
              <textarea
                rows={3}
                placeholder="Giới thiệu về năm xây dựng, kiến trúc, sự kiện giỗ chạp thường niên..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div className="burial-modal-actions">
              <button type="button" className="burial-btn cancel" onClick={onClose} disabled={submitting}>
                Hủy bỏ
              </button>
              <button type="submit" className="burial-btn save" disabled={submitting}>
                {submitting ? 'Đang lưu...' : initialData ? 'Cập nhật địa điểm' : 'Thêm địa điểm'}
              </button>
            </div>
          </form>
        </div>
      </div>

      <LocationPickerModal
        isOpen={isMapPickerOpen}
        onClose={() => setIsMapPickerOpen(false)}
        initialLat={latitude}
        initialLng={longitude}
        initialAddress={address}
        title={`Chọn vị trí: ${name || 'Địa điểm dòng họ'}`}
        subtitle="Di chuyển bản đồ hoặc ghim để chọn tọa độ chính xác"
        onSave={(newLat, newLng, newAddr) => {
          setLatitude(newLat);
          setLongitude(newLng);
          if (newAddr && !address) setAddress(newAddr);
        }}
      />
    </>
  );
};

