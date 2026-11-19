import React from 'react';
import { SmartExcelImportWorkflow } from './SmartExcelImportWorkflow';
import type { AISmartExcelCommitResponse } from '../../types/ai';
import '../../features/familyAdmin/FamilyAdminModule.css';
import './GenealogyExcelImportModal.css';

export interface GenealogyExcelImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  clanId: string;
  clanName?: string;
  onSuccess: (result: AISmartExcelCommitResponse) => void;
}

export const GenealogyExcelImportModal: React.FC<GenealogyExcelImportModalProps> = ({
  isOpen,
  onClose,
  clanId,
  clanName = 'Dòng họ',
  onSuccess,
}) => {
  if (!isOpen) return null;

  return (
    <div className="clan-modal-overlay" style={{ zIndex: 1200 }}>
      <div
        className="clan-modal-box clan-modal-box-lg"
        style={{ maxWidth: '980px', maxHeight: '90vh', overflowY: 'auto' }}
      >
        {/* Header */}
        <div
          className="clan-modal-header"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderBottom: '1px solid #e2e8f0',
            padding: '18px 24px',
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>
              Nhập Cây Gia Phả Bằng AI Từ File Excel
            </h3>
            <span style={{ fontSize: '13px', color: '#64748b' }}>
              {clanName} • Tự động nhận diện cấu trúc và ráp nối phả hệ (không cần file mẫu)
            </span>
          </div>
          <button
            type="button"
            className="clan-modal-close"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#64748b"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '24px' }}>
          <SmartExcelImportWorkflow
            clanId={clanId}
            clanName={clanName}
            onSuccess={onSuccess}
            onCancel={onClose}
          />
        </div>
      </div>
    </div>
  );
};
