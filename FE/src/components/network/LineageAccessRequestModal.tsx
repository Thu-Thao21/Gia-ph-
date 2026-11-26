import React, { useState } from 'react';
import { requestLineageAccess } from '../../services/network.service';
import './LinkRequestModal/LinkRequestModal.css';
import './LineageAccessRequestModal.css';

export interface LineageAccessRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  ownerClanId: string;
  ownerClanName: string;
  anchorPersonId: string;
  anchorPersonName: string;
  onSuccess?: () => void;
}

export const LineageAccessRequestModal: React.FC<LineageAccessRequestModalProps> = ({
  isOpen,
  onClose,
  ownerClanId,
  ownerClanName,
  anchorPersonId,
  anchorPersonName,
  onSuccess,
}) => {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    setSubmitting(true);
    setErrorMessage(null);
    try {
      await requestLineageAccess(ownerClanId, anchorPersonId, reason.trim() || undefined);
      setReason('');
      onSuccess?.();
      onClose();
    } catch (err: any) {
      console.error('Request lineage access failed:', err);
      const detail = err?.response?.data?.detail || 'Không thể gửi yêu cầu xin cấp quyền. Vui lòng thử lại sau.';
      setErrorMessage(detail);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="link-modal-backdrop" onClick={onClose}>
      <div
        className="link-modal-card lineage-access-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="link-modal-header lineage-access-header">
          <div>
            <h2 className="link-modal-title lineage-access-title">
              Xin Cấp Quyền Xem Gia Phả Liên Họ
            </h2>
            <p className="lineage-access-subtitle">
              Mạng lưới gia phả hai bên họ nội - ngoại (Phạm vi 4 thế hệ)
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="lineage-access-close-btn"
            aria-label="Đóng"
          >
            ✕
          </button>
        </div>

        <div className="link-modal-body lineage-access-body">
          {errorMessage && (
            <div className="lineage-access-error">
              {errorMessage}
            </div>
          )}

          <div className="lineage-access-info-box">
            <div className="lineage-access-info-row">
              <span className="lineage-access-info-label">Dòng họ sở hữu:</span>
              <strong className="lineage-access-info-val">{ownerClanName}</strong>
            </div>
            <div className="lineage-access-info-row">
              <span className="lineage-access-info-label">Người phối ngẫu làm trung tâm:</span>
              <strong className="lineage-access-info-val">{anchorPersonName}</strong>
            </div>
            <div className="lineage-access-info-row">
              <span className="lineage-access-info-label">Phạm vi chia sẻ:</span>
              <span className="lineage-access-scope-val">Tối đa 4 thế hệ (Ông bà, cha mẹ, vợ/chồng, con cái)</span>
            </div>
            <div className="lineage-access-info-row">
              <span className="lineage-access-info-label">Quyền hạn:</span>
              <span className="lineage-access-perm-val">Chỉ xem (Read-only, bảo vệ thông tin người còn sống)</span>
            </div>
          </div>

          <div className="lineage-access-notice">
            Yêu cầu sẽ được chuyển tới Trưởng tộc hoặc Family Admin có thẩm quyền của dòng tộc{' '}
            <strong>{ownerClanName}</strong> xét duyệt. Hai chiều chia sẻ hoàn toàn độc lập, tuân thủ phạm vi bảo mật 4 thế hệ và bảo vệ thông tin cá nhân.
          </div>

          <div>
            <label className="link-modal-label lineage-access-field-label">
              Lý do gửi Trưởng tộc phê duyệt chia sẻ:
            </label>
            <textarea
              className="link-modal-textarea lineage-access-textarea"
              placeholder={`Kính gửi Trưởng tộc, tôi xin đề xuất cấp quyền xem nhánh gia phả 4 thế hệ cho người phối ngẫu (${anchorPersonName}) để tìm hiểu cội nguồn và gắn kết tình thân giữa hai dòng họ...`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        </div>

        <div className="link-modal-footer lineage-access-footer">
          <button
            type="button"
            className="link-modal-btn link-modal-btn-cancel lineage-access-btn-cancel"
            onClick={onClose}
            disabled={submitting}
          >
            Đóng
          </button>
          <button
            type="button"
            className="link-modal-btn link-modal-btn-submit lineage-access-btn-submit"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? 'Đang gửi...' : 'Gửi yêu cầu tới Trưởng tộc'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default LineageAccessRequestModal;
