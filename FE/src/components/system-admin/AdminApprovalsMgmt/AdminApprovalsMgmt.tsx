import React, { useState } from 'react';
import { useToast } from '../../../shared/common/Toast';
import './AdminApprovalsMgmt.css';

export interface ChangeProposalItem {
  id: string;
  requester_name: string;
  request_type: string;
  target_member: string;
  details: string;
  status: 'pending' | 'approved' | 'rejected';
  rejection_reason?: string;
  created_at: string;
}

const INITIAL_PROPOSALS: ChangeProposalItem[] = [];

export const AdminApprovalsMgmt: React.FC = () => {
  const [proposals, setProposals] = useState<ChangeProposalItem[]>([]);

  const [filter, setFilter] = useState<string>('pending');
  const [selectedProp, setSelectedProp] = useState<ChangeProposalItem | null>(null);
  const [rejectionNote, setRejectionNote] = useState<string>('');
  const [isRejectModalOpen, setIsRejectModalOpen] = useState<boolean>(false);
  const toast = useToast();

  const handleApprove = (prop: ChangeProposalItem) => {
    setProposals((prev) =>
      prev.map((item) => (item.id === prop.id ? { ...item, status: 'approved' } : item))
    );
    toast.success('Phê duyệt thành công!', `Đề xuất "${prop.request_type}" đã được phê duyệt.`);
  };

  const handleOpenRejectModal = (prop: ChangeProposalItem) => {
    setSelectedProp(prop);
    setRejectionNote('');
    setIsRejectModalOpen(true);
  };

  const handleConfirmReject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProp) return;

    setProposals((prev) =>
      prev.map((item) =>
        item.id === selectedProp.id
          ? { ...item, status: 'rejected', rejection_reason: rejectionNote }
          : item
      )
    );

    setIsRejectModalOpen(false);
    toast.error('Từ chối đề xuất', `Đã từ chối yêu cầu của "${selectedProp.requester_name}".`);
  };

  const filteredProposals = proposals.filter((p) => (filter ? p.status === filter : true));

  return (
    <div className="admin-approvals-container">
      {/* Header */}
      <div className="admin-account-header">
        <div>
          <h2 className="admin-account-title">Trung Tâm Phê Duyệt & Đề Xuất Thay Đổi Dữ Liệu</h2>
          <p className="admin-account-subtitle">
            Phê duyệt hoặc từ chối mọi đề xuất thay đổi hồ sơ, cây gia phả và thông tin thân tộc từ người dùng.
          </p>
        </div>

        <div className="admin-account-controls">
          <button
            className={`filter-btn ${filter === 'pending' ? 'active' : ''}`}
            onClick={() => setFilter('pending')}
          >
            Chờ duyệt ({proposals.filter((p) => p.status === 'pending').length})
          </button>
          <button
            className={`filter-btn ${filter === 'approved' ? 'active' : ''}`}
            onClick={() => setFilter('approved')}
          >
            Đã duyệt ({proposals.filter((p) => p.status === 'approved').length})
          </button>
          <button
            className={`filter-btn ${filter === 'rejected' ? 'active' : ''}`}
            onClick={() => setFilter('rejected')}
          >
            Đã từ chối ({proposals.filter((p) => p.status === 'rejected').length})
          </button>
          <button
            className={`filter-btn ${filter === '' ? 'active' : ''}`}
            onClick={() => setFilter('')}
          >
            Tất cả
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="admin-table-card">
        {filteredProposals.length === 0 ? (
          <p className="admin-table-empty">Không có đề xuất nào trong mục này.</p>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Người gửi đề xuất</th>
                <th>Loại đề xuất</th>
                <th>Đối tượng thành viên</th>
                <th>Chi tiết đề xuất thay đổi</th>
                <th>Thời gian</th>
                <th>Trạng thái & Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {filteredProposals.map((p) => (
                <tr key={p.id}>
                  <td className="admin-approval-req-name">{p.requester_name}</td>
                  <td>
                    <span className="admin-approval-type-badge">
                      {p.request_type}
                    </span>
                  </td>
                  <td className="admin-approval-target-name">{p.target_member}</td>
                  <td className="admin-approval-details">
                    <div>{p.details}</div>
                    {p.rejection_reason && (
                      <div className="admin-approval-reject-reason">
                        Lý do từ chối: {p.rejection_reason}
                      </div>
                    )}
                  </td>
                  <td className="admin-approval-time">{p.created_at}</td>
                  <td>
                    {p.status === 'pending' ? (
                      <div className="action-btn-row">
                        <button className="btn-icon-action unlock" onClick={() => handleApprove(p)}>
                          Phê duyệt
                        </button>
                        <button className="btn-icon-action lock" onClick={() => handleOpenRejectModal(p)}>
                          Từ chối
                        </button>
                      </div>
                    ) : (
                      <span className={p.status === 'approved' ? 'status-badge-active' : 'status-badge-locked'}>
                        {p.status === 'approved' ? 'Đã phê duyệt' : 'Đã từ chối'}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Reject Reason Modal */}
      {isRejectModalOpen && selectedProp && (
        <div className="admin-modal-overlay">
          <div className="admin-modal-box">
            <div className="admin-modal-header">
              <h3>Từ Chối Đề Xuất Thay Đổi</h3>
              <button className="admin-modal-close" onClick={() => setIsRejectModalOpen(false)}>✕</button>
            </div>

            <form onSubmit={handleConfirmReject}>
              <div className="form-group-admin">
                <label className="form-label-admin">Lý do từ chối phản hồi cho người dùng *</label>
                <textarea
                  className="form-input-admin"
                  rows={4}
                  value={rejectionNote}
                  onChange={(e) => setRejectionNote(e.target.value)}
                  placeholder="Nhập lý do từ chối (Ví dụ: Thông tin chưa chính xác, thiếu giấy tờ bằng chứng...)"
                  required
                />
              </div>

              <div className="admin-modal-footer">
                <button type="button" className="btn-icon-action" onClick={() => setIsRejectModalOpen(false)}>Hủy</button>
                <button type="submit" className="admin-btn-primary admin-btn-reject-confirm">Xác nhận từ chối</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminApprovalsMgmt;
