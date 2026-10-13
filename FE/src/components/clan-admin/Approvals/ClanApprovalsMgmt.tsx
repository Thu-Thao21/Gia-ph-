import './ClanApprovalsMgmt.css';
import React, { useState } from 'react';
import PageHeader from '../../../shared/Layout/PageHeader';
import DataTable, { type Column } from '../../../shared/DataTable/DataTable';

interface ApprovalRequest {
  id: string;
  requester: string;
  type: string;
  target: string;
  date: string;
  status: 'pending' | 'approved' | 'rejected';
}

export const ClanApprovalsMgmt: React.FC = () => {
  const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [selectedReq, setSelectedReq] = useState<ApprovalRequest | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);

  const data: ApprovalRequest[] = [
    { id: '1', requester: 'Nguyễn Văn A', type: 'Sửa hồ sơ', target: 'Nguyễn Văn B (Con)', date: '11/09/2026', status: 'pending' },
    { id: '2', requester: 'Trần Thị Hoa', type: 'Thêm quan hệ', target: 'Bản thân (Thêm chồng)', date: '10/09/2026', status: 'pending' },
    { id: '3', requester: 'Nguyễn Văn Nam', type: 'Sửa ngày mất', target: 'Nguyễn Văn Cụ (Ông nội)', date: '08/09/2026', status: 'approved' },
  ];

  const filteredData = data.filter(d => d.status === filter);

  const columns: Column<ApprovalRequest>[] = [
    { key: 'requester', header: 'Người gửi', render: (item) => <strong className="approvals-requester-name">{item.requester}</strong> },
    { key: 'type', header: 'Loại yêu cầu', render: (item) => <span className="approvals-type-badge">{item.type}</span> },
    { key: 'target', header: 'Đối tượng thay đổi', render: (item) => item.target },
    { key: 'date', header: 'Thời gian', render: (item) => item.date },
    { key: 'actions', header: 'Thao tác', render: (item) => (
      <button 
        className="approvals-action-btn"
        onClick={() => { setSelectedReq(item); setShowRejectInput(false); }}
      >
        {item.status === 'pending' ? 'Xem & Duyệt' : 'Xem chi tiết'}
      </button>
    )},
  ];

  return (
    <div className="admin-account-container">
      
      <div className="admin-account-header">
        <div>
          <h2 className="admin-account-title">Phê duyệt Đề xuất</h2>
          <p className="admin-account-subtitle">So sánh và phê duyệt các yêu cầu thay đổi dữ liệu gia phả từ thành viên.</p>
        </div>
      </div>
      
      <div className="approvals-filter-container">
        <button 
          className={`approvals-filter-btn ${filter === 'pending' ? 'approvals-filter-btn-active-pending' : 'approvals-filter-btn-inactive'}`}
          onClick={() => setFilter('pending')}
        >
          Chờ duyệt ({data.filter(d => d.status === 'pending').length})
        </button>
        <button 
          className={`approvals-filter-btn ${filter === 'approved' ? 'approvals-filter-btn-active' : 'approvals-filter-btn-inactive'}`}
          onClick={() => setFilter('approved')}
        >
          Đã duyệt
        </button>
        <button 
          className={`approvals-filter-btn ${filter === 'rejected' ? 'approvals-filter-btn-active' : 'approvals-filter-btn-inactive'}`}
          onClick={() => setFilter('rejected')}
        >
          Đã từ chối
        </button>
      </div>

      <div className="approvals-table-container">
        <DataTable 
          columns={columns} 
          data={filteredData} 
          keyExtractor={(item) => item.id} 
          emptyMessage="Không có yêu cầu nào trong trạng thái này."
        />
      </div>

      {/* Comparison Modal */}
      {selectedReq && (
        <div className="approvals-modal-overlay">
          <div className="approvals-modal-backdrop" onClick={() => setSelectedReq(null)}></div>
          
          <div className="approvals-modal-content">
            <div className="approvals-modal-header">
              <div>
                <h2 className="approvals-modal-title">Chi tiết Đề xuất: {selectedReq.type}</h2>
                <p className="approvals-modal-subtitle">Từ: <strong>{selectedReq.requester}</strong> • {selectedReq.date}</p>
              </div>
              <button 
                className="approvals-modal-close-btn"
                onClick={() => setSelectedReq(null)}
              >
                ✕
              </button>
            </div>

            <div className="approvals-modal-body">
              <div className="approvals-compare-card">
                <div className="approvals-compare-grid">
                  <div className="approvals-compare-left">
                    <h3 className="approvals-compare-left-title">
                      <span className="approvals-compare-left-icon">-</span>
                      Dữ liệu hiện tại
                    </h3>
                    <div className="approvals-compare-item-list">
                      <div>
                        <p className="approvals-compare-label">Học vấn</p>
                        <p className="approvals-compare-old-value">Cử nhân CNTT</p>
                      </div>
                      <div>
                        <p className="approvals-compare-label">Nghề nghiệp</p>
                        <p className="approvals-compare-old-value">Lập trình viên</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="approvals-compare-right">
                    <h3 className="approvals-compare-right-title">
                      <span className="approvals-compare-right-icon">+</span>
                      Dữ liệu đề xuất
                    </h3>
                    <div className="approvals-compare-item-list">
                      <div>
                        <p className="approvals-compare-label">Học vấn</p>
                        <p className="approvals-compare-new-value">Thạc sĩ Kỹ thuật Phần mềm</p>
                      </div>
                      <div>
                        <p className="approvals-compare-label">Nghề nghiệp</p>
                        <p className="approvals-compare-new-value">Trưởng phòng Kỹ thuật (Technical Lead)</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="approvals-modal-footer">
              {showRejectInput ? (
                <div className="approvals-reject-container animate-fade-in">
                  <label className="approvals-reject-label">Lý do từ chối (Bắt buộc)</label>
                  <textarea 
                    className="approvals-reject-input form-input-admin w-full mb-4" 
                    rows={3} 
                    placeholder="Nhập lý do để gửi lại cho người yêu cầu..."
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                  ></textarea>
                  <div className="approvals-reject-actions">
                    <button className="admin-btn-secondary" onClick={() => setShowRejectInput(false)}>Hủy bỏ</button>
                    <button 
                      className="approvals-reject-confirm-btn admin-btn-primary bg-red-600 border-blue-600 hover:bg-red-700 disabled:opacity-50"
                      disabled={!rejectReason.trim()}
                      onClick={() => {
                        alert('Đã từ chối đề xuất');
                        setSelectedReq(null);
                      }}
                    >
                      Xác nhận Từ chối
                    </button>
                  </div>
                </div>
              ) : selectedReq.status === 'pending' ? (
                <div className="approvals-pending-actions-wrapper">
                  <p className="approvals-pending-note">Sau khi phê duyệt, dữ liệu sẽ được tự động cập nhật vào cây gia phả.</p>
                  <div className="approvals-pending-btns">
                    <button className="approvals-reject-btn admin-btn-secondary border-blue-200 text-red-600 hover:bg-red-50" onClick={() => setShowRejectInput(true)}>
                      Từ chối
                    </button>
                    <button className="approvals-approve-btn admin-btn-primary bg-green-600 border-blue-600 hover:bg-green-700" onClick={() => {
                      alert('Đã phê duyệt thành công');
                      setSelectedReq(null);
                    }}>
                      Phê duyệt thay đổi
                    </button>
                  </div>
                </div>
              ) : (
                <div className="approvals-close-actions">
                  <button className="admin-btn-secondary" onClick={() => setSelectedReq(null)}>Đóng</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClanApprovalsMgmt;
