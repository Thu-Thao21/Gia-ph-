import React, { useState } from 'react';
import { requestLineageAccess } from '../../services/network.service';
import './LinkRequestModal/LinkRequestModal.css';

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
        className="link-modal-card"
        style={{ width: '540px', maxWidth: '95vw' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="link-modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 className="link-modal-title" style={{ color: '#1e293b' }}>
              Xin Cấp Quyền Xem Gia Phả Liên Họ
            </h2>
            <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#64748b' }}>
              Mạng lưới gia phả hai bên họ nội - ngoại (Phạm vi 4 thế hệ)
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#94a3b8',
              fontSize: '20px',
              fontWeight: 700,
            }}
          >
            ✕
          </button>
        </div>

        <div className="link-modal-body" style={{ gap: '14px', padding: '16px 24px' }}>
          {errorMessage && (
            <div
              style={{
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '8px',
                padding: '10px 12px',
                fontSize: '13px',
                color: '#dc2626',
              }}
            >
              {errorMessage}
            </div>
          )}

          <div
            style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '10px',
              padding: '12px 14px',
              fontSize: '13px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span style={{ color: '#64748b' }}>Dòng họ sở hữu:</span>
              <strong style={{ color: '#0f172a' }}>{ownerClanName}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span style={{ color: '#64748b' }}>Người phối ngẫu làm trung tâm:</span>
              <strong style={{ color: '#0f172a' }}>{anchorPersonName}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span style={{ color: '#64748b' }}>Phạm vi chia sẻ:</span>
              <span style={{ color: '#047857', fontWeight: 600 }}>Tối đa 4 thế hệ (Ông bà, cha mẹ, vợ/chồng, con cái)</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b' }}>Quyền hạn:</span>
              <span style={{ color: '#4338ca', fontWeight: 600 }}>Chỉ xem (Read-only, bảo vệ thông tin người còn sống)</span>
            </div>
          </div>

          <div
            style={{
              background: '#eff6ff',
              border: '1px solid #bfdbfe',
              borderRadius: '8px',
              padding: '10px 12px',
              fontSize: '12px',
              color: '#1e40af',
              lineHeight: 1.5,
            }}
          >
            Yêu cầu sẽ được chuyển tới Trưởng tộc hoặc Family Admin có thẩm quyền của dòng tộc{' '}
            <strong>{ownerClanName}</strong> xét duyệt. Hai chiều chia sẻ hoàn toàn độc lập, tuân thủ phạm vi bảo mật 4 thế hệ và bảo vệ thông tin cá nhân.
          </div>

          <div>
            <label className="link-modal-label" style={{ display: 'block', marginBottom: '6px' }}>
              Lý do gửi Trưởng tộc phê duyệt chia sẻ:
            </label>
            <textarea
              className="link-modal-textarea"
              style={{
                width: '100%',
                minHeight: '80px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                padding: '8px 10px',
                fontSize: '13px',
                fontFamily: 'inherit',
                boxSizing: 'border-box',
              }}
              placeholder={`Kính gửi Trưởng tộc, tôi xin đề xuất cấp quyền xem nhánh gia phả 4 thế hệ cho người phối ngẫu (${anchorPersonName}) để tìm hiểu cội nguồn và gắn kết tình thân giữa hai dòng họ...`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        </div>

        <div
          className="link-modal-footer"
          style={{
            padding: '14px 24px 20px',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '10px',
            borderTop: '1px solid #f1f5f9',
          }}
        >
          <button
            type="button"
            className="link-modal-btn link-modal-btn-cancel"
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              background: '#ffffff',
              color: '#475569',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '13px',
            }}
            onClick={onClose}
            disabled={submitting}
          >
            Đóng
          </button>
          <button
            type="button"
            className="link-modal-btn link-modal-btn-submit"
            style={{
              padding: '8px 18px',
              borderRadius: '8px',
              border: 'none',
              background: '#4f46e5',
              color: '#ffffff',
              cursor: submitting ? 'not-allowed' : 'pointer',
              fontWeight: 600,
              fontSize: '13px',
              opacity: submitting ? 0.7 : 1,
            }}
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

