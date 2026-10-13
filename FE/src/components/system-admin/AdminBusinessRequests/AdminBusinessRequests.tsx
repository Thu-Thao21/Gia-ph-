import React, { useState } from 'react';
import { useToast } from '../../../shared/common/Toast';
import './AdminBusinessRequests.css';

export interface BusinessRegistrationRequest {
  id: string;
  family_name: string;
  representative_name: string;
  representative_phone: string;
  representative_email: string;
  province: string;
  registered_plan: string;
  plan_price: string;
  estimated_members: number;
  notes: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  rejection_reason?: string;
  processed_by?: string;
  processed_at?: string;
  created_at: string;
}

const INITIAL_REQUESTS: BusinessRegistrationRequest[] = [];

export interface AdminBusinessRequestsProps {
  onNavigateToCreateBusiness?: (request: BusinessRegistrationRequest) => void;
}

export const AdminBusinessRequests: React.FC<AdminBusinessRequestsProps> = ({
  onNavigateToCreateBusiness,
}) => {
  const [requests, setRequests] = useState<BusinessRegistrationRequest[]>(INITIAL_REQUESTS);
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedReq, setSelectedReq] = useState<BusinessRegistrationRequest | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const toast = useToast();

  const handleOpenDetail = (req: BusinessRegistrationRequest) => {
    setSelectedReq(req);
    setIsDetailModalOpen(true);
  };

  const handleApprove = (req: BusinessRegistrationRequest) => {
    setRequests((prev) =>
      prev.map((r) =>
        r.id === req.id
          ? {
              ...r,
              status: 'APPROVED',
              processed_by: 'Admin Hệ Thống',
              processed_at: new Date().toISOString().slice(0, 16).replace('T', ' '),
            }
          : r
      )
    );
    if (selectedReq && selectedReq.id === req.id) {
      setSelectedReq((prev) =>
        prev
          ? {
              ...prev,
              status: 'APPROVED',
              processed_by: 'Admin Hệ Thống',
              processed_at: new Date().toISOString().slice(0, 16).replace('T', ' '),
            }
          : null
      );
    }
    toast.success('Phê duyệt thành công!', `Đã phê duyệt yêu cầu mở Business của "${req.family_name}". Bạn có thể tạo không gian ngay.`);
  };

  const handleOpenReject = (req: BusinessRegistrationRequest) => {
    setSelectedReq(req);
    setRejectionReason('');
    setIsRejectModalOpen(true);
  };

  const handleConfirmReject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReq) return;
    if (!rejectionReason.trim()) {
      toast.error('Lỗi nhập liệu', 'Vui lòng nhập lý do từ chối để thông báo tới người đăng ký.');
      return;
    }

    setRequests((prev) =>
      prev.map((r) =>
        r.id === selectedReq.id
          ? {
              ...r,
              status: 'REJECTED',
              rejection_reason: rejectionReason.trim(),
              processed_by: 'Admin Hệ Thống',
              processed_at: new Date().toISOString().slice(0, 16).replace('T', ' '),
            }
          : r
      )
    );

    if (selectedReq) {
      setSelectedReq((prev) =>
        prev
          ? {
              ...prev,
              status: 'REJECTED',
              rejection_reason: rejectionReason.trim(),
              processed_by: 'Admin Hệ Thống',
              processed_at: new Date().toISOString().slice(0, 16).replace('T', ' '),
            }
          : null
      );
    }

    setIsRejectModalOpen(false);
    toast.error('Đã từ chối yêu cầu', `Đã từ chối yêu cầu của "${selectedReq.family_name}" kèm lý do đã lưu.`);
  };

  // Filtered list
  const filtered = requests.filter((r) => {
    const matchStatus = filterStatus === 'ALL' || r.status === filterStatus;
    const matchSearch =
      r.family_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.representative_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.province.toLowerCase().includes(searchTerm.toLowerCase());
    return matchStatus && matchSearch;
  });

  const pendingCount = requests.filter((r) => r.status === 'PENDING').length;
  const approvedCount = requests.filter((r) => r.status === 'APPROVED').length;
  const rejectedCount = requests.filter((r) => r.status === 'REJECTED').length;

  return (
    <div className="admin-req-container">
      {/* Header Banner */}
      <div className="admin-account-header">
        <div>
          <h2 className="admin-account-title">Xét Duyệt Yêu Cầu Mở Không Gian Dòng Họ</h2>
          <p className="admin-account-subtitle">
            Tiếp nhận, thẩm định và phê duyệt các đề xuất đăng ký tài khoản Business cho Trưởng tộc và Hội đồng gia phả.
          </p>
        </div>

        <div className="admin-req-stats-pills">
          <button
            className={`admin-pill-btn ${filterStatus === 'ALL' ? 'active' : ''}`}
            onClick={() => setFilterStatus('ALL')}
          >
            Tất cả ({requests.length})
          </button>
          <button
            className={`admin-pill-btn pending ${filterStatus === 'PENDING' ? 'active' : ''}`}
            onClick={() => setFilterStatus('PENDING')}
          >
            Chờ xét duyệt ({pendingCount})
          </button>
          <button
            className={`admin-pill-btn approved ${filterStatus === 'APPROVED' ? 'active' : ''}`}
            onClick={() => setFilterStatus('APPROVED')}
          >
            Đã duyệt ({approvedCount})
          </button>
          <button
            className={`admin-pill-btn rejected ${filterStatus === 'REJECTED' ? 'active' : ''}`}
            onClick={() => setFilterStatus('REJECTED')}
          >
            Đã từ chối ({rejectedCount})
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="admin-req-controls-row">
        <div className="admin-search-wrapper">
          <svg className="admin-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            className="admin-search-input-field"
            placeholder="Tìm theo tên dòng họ, người đại diện, mã yêu cầu, tỉnh thành..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <button className="admin-search-clear" onClick={() => setSearchTerm('')}>×</button>
          )}
        </div>
      </div>

      {/* Main Table */}
      <div className="admin-table-card">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Mã Yêu Cầu</th>
              <th>Dòng Họ Đăng Ký</th>
              <th>Người Đại Diện</th>
              <th>Gói Đăng Ký</th>
              <th>Tỉnh / Thành</th>
              <th>Thời Gian Gửi</th>
              <th>Trạng Thái</th>
              <th style={{ textAlign: 'right' }}>Thao Tác</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="admin-table-empty">
                  Không tìm thấy hồ sơ yêu cầu nào phù hợp điều kiện tìm kiếm.
                </td>
              </tr>
            ) : (
              filtered.map((req) => (
                <tr key={req.id} className="admin-table-row">
                  <td>
                    <span className="admin-code-tag">{req.id}</span>
                  </td>
                  <td>
                    <div className="admin-strong-text">{req.family_name}</div>
                    <div className="admin-sub-info">Quy mô: ~{req.estimated_members} thành viên</div>
                  </td>
                  <td>
                    <div className="admin-strong-text">{req.representative_name}</div>
                    <div className="admin-sub-info">{req.representative_phone}</div>
                  </td>
                  <td>
                    <span className="admin-plan-badge">{req.registered_plan}</span>
                    <div className="admin-sub-info">{req.plan_price}</div>
                  </td>
                  <td>{req.province}</td>
                  <td>{req.created_at}</td>
                  <td>
                    {req.status === 'PENDING' && <span className="status-badge status-pending">Chờ phê duyệt</span>}
                    {req.status === 'APPROVED' && <span className="status-badge status-approved">Đã duyệt</span>}
                    {req.status === 'REJECTED' && <span className="status-badge status-rejected">Bị từ chối</span>}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div className="admin-action-btn-group">
                      <button
                        className="btn-action-view"
                        title="Xem chi tiết hồ sơ"
                        onClick={() => handleOpenDetail(req)}
                      >
                        Chi tiết
                      </button>

                      {req.status === 'PENDING' && (
                        <>
                          <button
                            className="btn-action-approve"
                            title="Phê duyệt yêu cầu này"
                            onClick={() => handleApprove(req)}
                          >
                            Duyệt
                          </button>
                          <button
                            className="btn-action-reject"
                            title="Từ chối yêu cầu"
                            onClick={() => handleOpenReject(req)}
                          >
                            Từ chối
                          </button>
                        </>
                      )}

                      {req.status === 'APPROVED' && onNavigateToCreateBusiness && (
                        <button
                          className="btn-action-create-space"
                          title="Tiến hành tạo không gian dòng họ"
                          onClick={() => onNavigateToCreateBusiness(req)}
                        >
                          Tạo Không Gian →
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Detail Dossier Modal */}
      {isDetailModalOpen && selectedReq && (
        <div className="admin-modal-backdrop" onClick={() => setIsDetailModalOpen(false)}>
          <div className="admin-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <div>
                <span className="admin-modal-tag">HỒ SƠ ĐĂNG KÝ BUSINESS • {selectedReq.id}</span>
                <h3 className="admin-modal-title">{selectedReq.family_name}</h3>
              </div>
              <button className="admin-modal-close" onClick={() => setIsDetailModalOpen(false)}>×</button>
            </div>

            <div className="admin-modal-body">
              <div className="admin-dossier-grid">
                <div className="admin-dossier-col">
                  <h4 className="admin-dossier-sec-title">Thông Tin Dòng Họ</h4>
                  <div className="admin-dossier-item">
                    <label>Tên dòng họ:</label>
                    <span>{selectedReq.family_name}</span>
                  </div>
                  <div className="admin-dossier-item">
                    <label>Tỉnh / Thành phố:</label>
                    <span>{selectedReq.province}</span>
                  </div>
                  <div className="admin-dossier-item">
                    <label>Quy mô ước tính:</label>
                    <span>{selectedReq.estimated_members} thành viên</span>
                  </div>
                  <div className="admin-dossier-item">
                    <label>Gói dịch vụ đăng ký:</label>
                    <span className="admin-plan-highlight">{selectedReq.registered_plan} ({selectedReq.plan_price})</span>
                  </div>
                </div>

                <div className="admin-dossier-col">
                  <h4 className="admin-dossier-sec-title">Người Đại Diện (Trưởng Tộc)</h4>
                  <div className="admin-dossier-item">
                    <label>Họ và tên:</label>
                    <span>{selectedReq.representative_name}</span>
                  </div>
                  <div className="admin-dossier-item">
                    <label>Số điện thoại:</label>
                    <span>{selectedReq.representative_phone}</span>
                  </div>
                  <div className="admin-dossier-item">
                    <label>Email liên hệ:</label>
                    <span>{selectedReq.representative_email}</span>
                  </div>
                  <div className="admin-dossier-item">
                    <label>Thời điểm nộp đơn:</label>
                    <span>{selectedReq.created_at}</span>
                  </div>
                </div>
              </div>

              <div className="admin-dossier-notes-box">
                <label className="admin-notes-label">Ghi chú & Nhu cầu số hóa của gia tộc:</label>
                <p className="admin-notes-content">{selectedReq.notes || 'Không có ghi chú thêm.'}</p>
              </div>

              {selectedReq.status === 'REJECTED' && (
                <div className="admin-rejection-box">
                  <strong>Lý do từ chối thẩm định:</strong>
                  <p>{selectedReq.rejection_reason}</p>
                  <small>Bởi: {selectedReq.processed_by} vào lúc {selectedReq.processed_at}</small>
                </div>
              )}

              {selectedReq.status === 'APPROVED' && (
                <div className="admin-approved-box">
                  <strong>Trạng thái: Đã thẩm định & phê duyệt</strong>
                  <p>Hồ sơ đã đủ điều kiện để khởi tạo không gian Business và cấp tài khoản Trưởng tộc.</p>
                  <small>Phê duyệt bởi: {selectedReq.processed_by} ({selectedReq.processed_at})</small>
                </div>
              )}
            </div>

            <div className="admin-modal-footer">
              <button className="btn-modal-cancel" onClick={() => setIsDetailModalOpen(false)}>
                Đóng
              </button>

              {selectedReq.status === 'PENDING' && (
                <>
                  <button
                    className="btn-modal-reject"
                    onClick={() => {
                      setIsDetailModalOpen(false);
                      handleOpenReject(selectedReq);
                    }}
                  >
                    Từ chối hồ sơ
                  </button>
                  <button
                    className="btn-modal-approve"
                    onClick={() => handleApprove(selectedReq)}
                  >
                    Phê duyệt ngay
                  </button>
                </>
              )}

              {selectedReq.status === 'APPROVED' && onNavigateToCreateBusiness && (
                <button
                  className="btn-modal-create"
                  onClick={() => {
                    setIsDetailModalOpen(false);
                    onNavigateToCreateBusiness(selectedReq);
                  }}
                >
                  Tạo Không Gian & Cấp Account →
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Rejection Reason Modal */}
      {isRejectModalOpen && selectedReq && (
        <div className="admin-modal-backdrop" onClick={() => setIsRejectModalOpen(false)}>
          <div className="admin-modal-card modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <div>
                <span className="admin-modal-tag tag-danger">TỪ CHỐI HỒ SƠ YÊU CẦU</span>
                <h3 className="admin-modal-title">Xác Nhận Lý Do Từ Chối</h3>
              </div>
              <button className="admin-modal-close" onClick={() => setIsRejectModalOpen(false)}>×</button>
            </div>

            <form onSubmit={handleConfirmReject}>
              <div className="admin-modal-body">
                <p className="admin-confirm-desc">
                  Bạn đang từ chối yêu cầu đăng ký mở Business của dòng họ <strong>{selectedReq.family_name}</strong> (Người đại diện: {selectedReq.representative_name}).
                </p>
                <div className="form-group">
                  <label className="form-label required">Lý do từ chối (Ghi rõ để phản hồi cho người đăng ký):</label>
                  <textarea
                    rows={4}
                    className="form-textarea"
                    placeholder="Ví dụ: Chưa cung cấp đủ giấy tờ ủy quyền của Hội đồng gia tộc, không xác minh được số điện thoại người đại diện..."
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="admin-modal-footer">
                <button type="button" className="btn-modal-cancel" onClick={() => setIsRejectModalOpen(false)}>
                  Hủy bỏ
                </button>
                <button type="submit" className="btn-modal-reject-confirm">
                  Xác nhận từ chối
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminBusinessRequests;
