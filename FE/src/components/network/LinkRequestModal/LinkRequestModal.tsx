import React, { useEffect, useState } from 'react';
import { fetchFamilyNetwork, sendLinkRequest } from '../../../services/network.service';
import type { FamilyNetwork } from '../../../types/network';
import './LinkRequestModal.css';

export interface LinkRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const LinkRequestModal: React.FC<LinkRequestModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [families, setFamilies] = useState<FamilyNetwork[]>([]);
  const [targetFamilyId, setTargetFamilyId] = useState('');
  const [requestType, setRequestType] = useState('marriage');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchFamilyNetwork('all').then(setFamilies);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (!targetFamilyId) return;
    setSubmitting(true);
    const result = await sendLinkRequest(targetFamilyId, requestType, message || undefined);
    setSubmitting(false);
    if (result) {
      onSuccess?.();
      onClose();
      setTargetFamilyId('');
      setMessage('');
    }
  };

  return (
    <div className="link-modal-backdrop" onClick={onClose}>
      <div className="link-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="link-modal-header">
          <h2 className="link-modal-title">Gửi Yêu Cầu Liên Kết Gia Phả</h2>
        </div>

        <div className="link-modal-body">
          <div>
            <label className="link-modal-label">Chọn dòng họ muốn liên kết</label>
            <select
              className="link-modal-select"
              value={targetFamilyId}
              onChange={(e) => setTargetFamilyId(e.target.value)}
            >
              <option value="">-- Chọn dòng họ --</option>
              {families.map((f) => (
                <option key={f.id} value={f.id}>{f.name} ({f.memberCount} thành viên)</option>
              ))}
            </select>
          </div>

          <div>
            <label className="link-modal-label">Loại liên kết</label>
            <select
              className="link-modal-select"
              value={requestType}
              onChange={(e) => setRequestType(e.target.value)}
            >
              <option value="marriage">Hôn nhân (Dâu & Rể)</option>
              <option value="paternal">Họ hàng bên Nội</option>
              <option value="maternal">Họ hàng bên Ngoại</option>
              <option value="alliance">Thông gia / Liên minh</option>
            </select>
          </div>

          <div>
            <label className="link-modal-label">Lời nhắn (Tùy chọn)</label>
            <textarea
              className="link-modal-textarea"
              placeholder="Ghi chú lý do hoặc thông tin bổ sung cho yêu cầu liên kết..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>
        </div>

        <div className="link-modal-footer">
          <button className="link-modal-btn cancel" onClick={onClose}>Hủy bỏ</button>
          <button
            className="link-modal-btn submit"
            onClick={handleSubmit}
            disabled={!targetFamilyId || submitting}
          >
            {submitting ? 'Đang gửi...' : 'Gửi yêu cầu liên kết'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default LinkRequestModal;
