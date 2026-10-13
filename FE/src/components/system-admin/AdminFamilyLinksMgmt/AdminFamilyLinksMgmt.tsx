import React, { useState } from 'react';
import apiClient from '../../../api/axios';
import { useToast } from '../../../shared/common/Toast';
import './AdminFamilyLinksMgmt.css';

export interface LinkRequestItem {
  id: string;
  requester_family: string;
  target_family: string;
  link_type: 'paternal' | 'maternal' | 'in_law' | 'affiliated' | string;
  status: 'pending' | 'approved' | 'rejected' | string;
  notes?: string;
  created_at: string;
}

const INITIAL_LINK_REQUESTS: LinkRequestItem[] = [];

export const AdminFamilyLinksMgmt: React.FC = () => {
  const [requests, setRequests] = useState<LinkRequestItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  const fetchLinkRequests = async () => {
    try {
      const res = await apiClient.get<LinkRequestItem[]>('/networks/link-requests');
      if (Array.isArray(res.data) && res.data.length > 0) {
        setRequests(res.data);
      }
    } catch (err) {
      console.warn('Fetch link requests failed, using mock data:', err);
    }
  };

  React.useEffect(() => {
    fetchLinkRequests();
  }, []);

  const [activeTypeTab, setActiveTypeTab] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('pending');
  const [isSendModalOpen, setIsSendModalOpen] = useState<boolean>(false);
  const [sendTargetFamily, setSendTargetFamily] = useState<string>('');
  const [sendLinkType, setSendLinkType] = useState<string>('maternal');
  const [sendNotes, setSendNotes] = useState<string>('');

  const toast = useToast();

  const handleReview = (id: string, newStatus: 'approved' | 'rejected') => {
    setRequests((prev) =>
      prev.map((item) => (item.id === id ? { ...item, status: newStatus } : item))
    );
    if (newStatus === 'approved') {
      toast.success('Chấp nhận liên kết!', 'Liên kết dòng họ đã được phê duyệt thành công.');
    } else {
      toast.error('Từ chối liên kết', 'Yêu cầu kết nối dòng họ đã bị từ chối.');
    }
  };

  const handleUnlink = (id: string) => {
    if (window.confirm('Bạn có chắc chắn muốn hủy liên kết giữa 2 dòng họ này?')) {
      setRequests((prev) => prev.filter((item) => item.id !== id));
      toast.warning('Đã hủy liên kết', 'Liên kết giữa 2 dòng họ đã bị hủy bỏ.');
    }
  };

  const handleSendRequest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!sendTargetFamily) return;

    const newReq: LinkRequestItem = {
      id: `req_${Date.now()}`,
      requester_family: 'Dòng Họ Nguyễn Văn (Gốc)',
      target_family: sendTargetFamily,
      link_type: sendLinkType,
      status: 'pending',
      notes: sendNotes,
      created_at: new Date().toISOString().split('T')[0],
    };

    setRequests((prev) => [newReq, ...prev]);
    setIsSendModalOpen(false);
    setSendTargetFamily('');
    setSendNotes('');
    toast.success('Gửi yêu cầu thành công!', `Yêu cầu kết nối tới "${sendTargetFamily}" đã được gửi.`);
  };

  const filteredRequests = requests.filter((r) => {
    const matchType = activeTypeTab ? r.link_type === activeTypeTab : true;
    const matchStatus = statusFilter ? r.status === statusFilter : true;
    return matchType && matchStatus;
  });

  return (
    <div className="admin-links-container">
      {/* Header */}
      <div className="admin-account-header">
        <div>
          <h2 className="admin-account-title">Mạng Lưới & Phê Duyệt Liên Kết Nhiều Dòng Họ</h2>
          <p className="admin-account-subtitle">
            Gửi, tiếp nhận, chấp nhận, từ chối, phê duyệt hoặc hủy liên kết giữa các dòng họ (Nội, Ngoại, Dâu, Rể, Thông gia).
          </p>
        </div>

        <div className="admin-account-controls">
          <button className="admin-btn-primary" onClick={() => setIsSendModalOpen(true)}>
            Gửi Yêu Cầu Liên Kết Mới
          </button>
        </div>
      </div>

      {/* Type Classification Tabs */}
      <div className="admin-links-tabs-wrap">
        <button
          className={`filter-btn ${activeTypeTab === '' ? 'active' : ''}`}
          onClick={() => setActiveTypeTab('')}
        >
          Tất cả phân loại
        </button>
        <button
          className={`filter-btn ${activeTypeTab === 'paternal' ? 'active' : ''}`}
          onClick={() => setActiveTypeTab('paternal')}
        >
          Họ Nội
        </button>
        <button
          className={`filter-btn ${activeTypeTab === 'maternal' ? 'active' : ''}`}
          onClick={() => setActiveTypeTab('maternal')}
        >
          Họ Ngoại
        </button>
        <button
          className={`filter-btn ${activeTypeTab === 'in_law' ? 'active' : ''}`}
          onClick={() => setActiveTypeTab('in_law')}
        >
          Dâu & Rể
        </button>
        <button
          className={`filter-btn ${activeTypeTab === 'affiliated' ? 'active' : ''}`}
          onClick={() => setActiveTypeTab('affiliated')}
        >
          Họ Thông Gia
        </button>
      </div>

      {/* Filter Status */}
      <div className="admin-links-filter-row">
        <span className="admin-links-filter-label">Trạng thái yêu cầu:</span>
        <button
          className={`filter-btn ${statusFilter === 'pending' ? 'active' : ''}`}
          onClick={() => setStatusFilter('pending')}
        >
          Chờ duyệt ({requests.filter((r) => r.status === 'pending').length})
        </button>
        <button
          className={`filter-btn ${statusFilter === 'approved' ? 'active' : ''}`}
          onClick={() => setStatusFilter('approved')}
        >
          Đã phê duyệt ({requests.filter((r) => r.status === 'approved').length})
        </button>
        <button
          className={`filter-btn ${statusFilter === '' ? 'active' : ''}`}
          onClick={() => setStatusFilter('')}
        >
          Tất cả
        </button>
      </div>

      {/* Table */}
      <div className="admin-table-card">
        {filteredRequests.length === 0 ? (
          <p className="admin-table-empty">Không có yêu cầu liên kết nào.</p>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Dòng họ gửi yêu cầu</th>
                <th>Dòng họ nhận yêu cầu</th>
                <th>Phân loại liên kết</th>
                <th>Lý do & Ghi chú</th>
                <th>Trạng thái</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {filteredRequests.map((req) => {
                let typeClass = '';
                if (req.link_type === 'paternal') typeClass = 'admin-links-type-paternal';
                else if (req.link_type === 'maternal') typeClass = 'admin-links-type-maternal';
                else if (req.link_type === 'in_law') typeClass = 'admin-links-type-in-law';
                else typeClass = 'admin-links-type-affiliated';

                return (
                  <tr key={req.id}>
                    <td className="admin-links-family-req">{req.requester_family}</td>
                    <td className="admin-links-family-tgt">{req.target_family}</td>
                    <td>
                      <span className={`admin-links-type-badge ${typeClass}`}>
                        {req.link_type === 'paternal'
                          ? 'Họ Nội'
                          : req.link_type === 'maternal'
                          ? 'Họ Ngoại'
                          : req.link_type === 'in_law'
                          ? 'Dâu & Rể'
                          : 'Thông Gia'}
                      </span>
                    </td>
                    <td className="admin-links-notes">{req.notes || '—'}</td>
                    <td>
                    <span
                      className={
                        req.status === 'approved'
                          ? 'status-badge-active'
                          : req.status === 'rejected'
                          ? 'status-badge-locked'
                          : 'badge-role-head'
                      }
                    >
                      {req.status === 'pending'
                        ? 'Chờ duyệt'
                        : req.status === 'approved'
                        ? 'Đã duyệt'
                        : 'Từ chối'}
                    </span>
                  </td>
                  <td>
                    <div className="action-btn-row">
                      {req.status === 'pending' ? (
                        <>
                          <button
                            className="btn-icon-action unlock"
                            onClick={() => handleReview(req.id, 'approved')}
                          >
                            Duyệt
                          </button>
                          <button
                            className="btn-icon-action lock"
                            onClick={() => handleReview(req.id, 'rejected')}
                          >
                            Từ chối
                          </button>
                        </>
                      ) : (
                        <button className="btn-icon-action lock" onClick={() => handleUnlink(req.id)}>
                          Hủy liên kết
                        </button>
                      )}
                    </div>
                  </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Send Link Modal */}
      {isSendModalOpen && (
        <div className="admin-modal-overlay">
          <div className="admin-modal-box">
            <div className="admin-modal-header">
              <h3>Gửi Yêu Cầu Liên Kết Dòng Họ</h3>
              <button className="admin-modal-close" onClick={() => setIsSendModalOpen(false)}>✕</button>
            </div>

            <form onSubmit={handleSendRequest}>
              <div className="form-group-admin">
                <label className="form-label-admin">Tên dòng họ muốn liên kết *</label>
                <input
                  type="text"
                  className="form-input-admin"
                  value={sendTargetFamily}
                  onChange={(e) => setSendTargetFamily(e.target.value)}
                  placeholder="Ví dụ: Dòng Họ Trần Nam Định"
                  required
                />
              </div>

              <div className="form-group-admin">
                <label className="form-label-admin">Phân loại quan hệ liên kết</label>
                <select
                  className="form-input-admin"
                  value={sendLinkType}
                  onChange={(e) => setSendLinkType(e.target.value)}
                >
                  <option value="paternal">Họ Nội (Trực hệ chính)</option>
                  <option value="maternal">Họ Ngoại (Bên mẹ / ngoại tộc)</option>
                  <option value="in_law">Dâu & Rể (Hôn nhân)</option>
                  <option value="affiliated">Họ Thông Gia (Liên kết kết nghĩa)</option>
                </select>
              </div>

              <div className="form-group-admin">
                <label className="form-label-admin">Ghi chú & Lý do liên kết</label>
                <textarea
                  className="form-input-admin"
                  rows={3}
                  value={sendNotes}
                  onChange={(e) => setSendNotes(e.target.value)}
                  placeholder="Nhập thông tin người đại diện hoặc mối quan hệ hôn nhân..."
                />
              </div>

              <div className="admin-modal-footer">
                <button type="button" className="btn-icon-action" onClick={() => setIsSendModalOpen(false)}>Hủy</button>
                <button type="submit" className="admin-btn-primary">Gửi yêu cầu ngay</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminFamilyLinksMgmt;
