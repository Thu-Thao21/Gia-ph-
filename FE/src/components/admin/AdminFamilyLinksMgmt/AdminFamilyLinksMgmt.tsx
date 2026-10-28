import React, { useState, useEffect, useMemo } from 'react';
import apiClient from '../../../api/axios';
import { fetchPublicClans, type PublicClanItem } from '../../../services/genealogy.service';
import { sendLinkRequest, reviewLinkRequest } from '../../../services/network.service';
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

const LINK_TYPES = [
  {
    key: 'paternal',
    title: 'Họ Nội',
    subtitle: 'Trực hệ chính dòng cha',
    badgeClass: 'type-paternal',
  },
  {
    key: 'maternal',
    title: 'Họ Ngoại',
    subtitle: 'Bên mẹ / ngoại tộc',
    badgeClass: 'type-maternal',
  },
  {
    key: 'in_law',
    title: 'Dâu & Rể',
    subtitle: 'Quan hệ qua hôn phối',
    badgeClass: 'type-in-law',
  },
  {
    key: 'affiliated',
    title: 'Thông Gia',
    subtitle: 'Giao hảo & liên kết thân tộc',
    badgeClass: 'type-affiliated',
  },
];

export const AdminFamilyLinksMgmt: React.FC = () => {
  const [requests, setRequests] = useState<LinkRequestItem[]>([]);
  const [availableClans, setAvailableClans] = useState<PublicClanItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const fetchLinkRequests = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<any[]>('/networks/link-requests');
      if (Array.isArray(res.data)) {
        const mapped: LinkRequestItem[] = res.data.map((item) => ({
          id: item.id,
          requester_family: item.sourceFamilyName || item.source_family_name || 'Dòng họ nguồn',
          target_family: item.targetFamilyName || item.target_family_name || 'Dòng họ đối tác',
          link_type: 'affiliated',
          status: (item.status || 'pending').toLowerCase(),
          notes: item.message || '',
          created_at: (item.createdAt || item.created_at || '').slice(0, 10),
        }));
        setRequests(mapped);
      } else {
        setRequests([]);
      }
    } catch {
      // Endpoint /networks/link-requests may be in development or unsupported; fallback silently without red console error
      setRequests([]);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    fetchLinkRequests();
    fetchPublicClans().then((clans) => {
      if (Array.isArray(clans)) {
        setAvailableClans(clans);
        if (clans.length > 0) setSendTargetFamily(clans[0].id);
      }
    });
  }, []);

  const [activeTypeTab, setActiveTypeTab] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('pending');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedRequest, setSelectedRequest] = useState<LinkRequestItem | null>(null);
  const [isSendModalOpen, setIsSendModalOpen] = useState<boolean>(false);
  const [sendTargetFamily, setSendTargetFamily] = useState<string>('');
  const [sendLinkType, setSendLinkType] = useState<string>('maternal');
  const [sendNotes, setSendNotes] = useState<string>('');
  const [inputMode, setInputMode] = useState<'select' | 'manual'>('select');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [msg, setMsg] = useState<string>('');

  const selectedClan = useMemo(() => {
    return availableClans.find((c) => c.id === sendTargetFamily);
  }, [availableClans, sendTargetFamily]);

  const handleReview = async (id: string, newStatus: 'approved' | 'rejected') => {
    try {
      await reviewLinkRequest(id, newStatus === 'approved' ? 'APPROVE' : 'REJECT');
      await fetchLinkRequests();
      setMsg(`Đã ${newStatus === 'approved' ? 'chấp nhận & phê duyệt' : 'từ chối'} liên kết thành công.`);
    } catch (err: any) {
      setMsg(err?.response?.data?.detail || 'Thao tác phê duyệt thất bại.');
    }
    setTimeout(() => setMsg(''), 4000);
  };

  const handleUnlink = async (id: string) => {
    if (window.confirm('Bạn có chắc chắn muốn hủy liên kết giữa 2 dòng họ này?')) {
      try {
        await reviewLinkRequest(id, 'REJECT');
        await fetchLinkRequests();
        setMsg('Đã hủy liên kết dòng họ trên cơ sở dữ liệu.');
      } catch {
        setMsg('Hủy liên kết thất bại.');
      }
      setTimeout(() => setMsg(''), 3000);
    }
  };

  const handleSendRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sendTargetFamily) return;

    setIsSubmitting(true);
    try {
      await sendLinkRequest(sendTargetFamily, sendLinkType, sendNotes);
      await fetchLinkRequests();
      setMsg('Đã gửi yêu cầu kết nối dòng họ thành công tới Neon DB!');
      setIsSendModalOpen(false);
      setSendNotes('');
    } catch (err: any) {
      setMsg(err?.response?.data?.detail || 'Gửi yêu cầu thất bại. Vui lòng thử lại.');
    } finally {
      setIsSubmitting(false);
    }

    setTimeout(() => setMsg(''), 4000);
  };

  const pendingCount = useMemo(() => requests.filter((r) => r.status === 'pending').length, [requests]);
  const approvedCount = useMemo(() => requests.filter((r) => r.status === 'approved').length, [requests]);

  const filteredRequests = requests.filter((r) => {
    const matchType = activeTypeTab ? r.link_type === activeTypeTab : true;
    const matchStatus = statusFilter ? r.status === statusFilter : true;
    const text = `${r.id} ${r.requester_family} ${r.target_family} ${r.notes || ''}`.toLowerCase();
    return matchType && matchStatus && text.includes(searchTerm.trim().toLowerCase());
  });

  return (
    <div className="admin-links-container">
      {/* Breadcrumb */}
      <div className="links-breadcrumb" aria-label="Đường dẫn">
        <span>Quản lý mạng lưới</span>
        <span className="links-breadcrumb-sep">/</span>
        <strong>Liên kết dòng họ</strong>
      </div>

      {/* Hero Banner (Màu xanh chuẩn nhận diện thương hiệu) */}
      <header className="links-hero-banner">
        <div className="links-hero-text">
          <span className="links-hero-eyebrow">MẠNG LƯỚI & PHÊ DUYỆT</span>
          <h1 className="links-hero-title">Mạng Lưới &amp; Phê Duyệt Liên Kết Nhiều Dòng Họ</h1>
          <p className="links-hero-desc">
            Gửi, tiếp nhận, chấp nhận, từ chối, phê duyệt hoặc hủy liên kết giữa các dòng họ (Nội, Ngoại, Dâu, Rể, Thông gia).
          </p>
        </div>
        <button
          type="button"
          className="links-hero-btn-primary"
          onClick={() => setIsSendModalOpen(true)}
        >
          + Gửi Yêu Cầu Liên Kết Mới
        </button>
      </header>

      {/* Stats Counter Bar (Nổi phía dưới banner) */}
      <div className="links-hero-stats" aria-label="Thống kê liên kết dòng họ">
        <div>
          <span>Tổng số yêu cầu</span>
          <strong>{requests.length}</strong>
        </div>
        <div>
          <span>Chờ phê duyệt</span>
          <strong>{pendingCount}</strong>
        </div>
        <div>
          <span>Đã liên kết</span>
          <strong>{approvedCount}</strong>
        </div>
      </div>

      {msg && <div className="admin-msg-box">{msg}</div>}

      {/* Toolbar Lọc và Tìm Kiếm */}
      <div className="links-list-toolbar">
        {/* Hàng 1: Tabs phân loại quan hệ */}
        <div className="links-type-tabs" role="tablist" aria-label="Phân loại liên kết">
          {[
            { id: '', label: 'Tất cả phân loại' },
            { id: 'paternal', label: 'Họ Nội' },
            { id: 'maternal', label: 'Họ Ngoại' },
            { id: 'in_law', label: 'Dâu & Rể' },
            { id: 'affiliated', label: 'Họ Thông Gia' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`links-type-tab ${activeTypeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTypeTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Hàng 2: Ô tìm kiếm + Bộ lọc trạng thái */}
        <div className="links-toolbar-bottom">
          <div className="links-search-field">
            <input
              type="search"
              className="links-search-input"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Tìm dòng họ hoặc mã yêu cầu..."
              aria-label="Tìm dòng họ hoặc mã yêu cầu"
            />
            {searchTerm && (
              <button
                type="button"
                className="links-search-clear-btn"
                onClick={() => setSearchTerm('')}
                aria-label="Xóa từ khóa tìm kiếm"
              >
                ✕
              </button>
            )}
          </div>

          <div className="links-status-filter" role="group" aria-label="Lọc theo trạng thái">
            <span className="links-status-filter-label">Trạng thái:</span>
            <button
              type="button"
              className={`links-status-btn ${statusFilter === 'pending' ? 'active' : ''}`}
              onClick={() => setStatusFilter('pending')}
            >
              Chờ duyệt <span className="links-status-count">{pendingCount}</span>
            </button>
            <button
              type="button"
              className={`links-status-btn ${statusFilter === 'approved' ? 'active' : ''}`}
              onClick={() => setStatusFilter('approved')}
            >
              Đã phê duyệt <span className="links-status-count">{approvedCount}</span>
            </button>
            <button
              type="button"
              className={`links-status-btn ${statusFilter === '' ? 'active' : ''}`}
              onClick={() => setStatusFilter('')}
            >
              Tất cả
            </button>
          </div>
        </div>
      </div>

      {/* Luxury Table Section */}
      <div className="links-table-card">
        {filteredRequests.length === 0 ? (
          <div className="links-table-empty">
            <h4>Không có yêu cầu liên kết nào</h4>
            <p>
              {searchTerm || activeTypeTab || statusFilter
                ? 'Không tìm thấy kết quả phù hợp với tiêu chí lọc.'
                : 'Chưa có yêu cầu liên kết nào được gửi giữa các dòng họ.'}
            </p>
          </div>
        ) : (
          <div className="links-table-scroll">
            <table className="links-table">
              <thead>
                <tr>
                  <th>Dòng họ gửi yêu cầu</th>
                  <th>Dòng họ nhận yêu cầu</th>
                  <th>Phân loại liên kết</th>
                  <th>Lý do &amp; Ghi chú</th>
                  <th>Trạng thái</th>
                  <th style={{ textAlign: 'right' }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {filteredRequests.map((req) => {
                  let typeKey = req.link_type || 'affiliated';
                  if (!['paternal', 'maternal', 'in_law', 'affiliated'].includes(typeKey)) {
                    typeKey = 'affiliated';
                  }

                  const isApproved = req.status === 'approved';
                  const isPending = req.status === 'pending';
                  const isRejected = req.status === 'rejected';

                  return (
                    <tr key={req.id} className="links-table-row">
                      {/* Requester Family */}
                      <td>
                        <div className="links-clan-cell">
                          <div className="links-clan-meta">
                            <strong className="links-clan-title">{req.requester_family}</strong>
                            <span className="links-clan-role-tag req">Khởi tạo yêu cầu</span>
                          </div>
                        </div>
                      </td>

                      {/* Target Family */}
                      <td>
                        <div className="links-clan-cell">
                          <div className="links-clan-meta">
                            <strong className="links-clan-title">{req.target_family}</strong>
                            <span className="links-clan-role-tag">Dòng họ nhận</span>
                          </div>
                        </div>
                      </td>

                      {/* Link Type Badge */}
                      <td>
                        <span className={`links-type-pill pill-${typeKey}`}>
                          {req.link_type === 'paternal'
                            ? 'Họ Nội'
                            : req.link_type === 'maternal'
                            ? 'Họ Ngoại'
                            : req.link_type === 'in_law'
                            ? 'Dâu & Rể'
                            : 'Thông Gia'}
                        </span>
                      </td>

                      {/* Notes */}
                      <td>
                        <div className="links-notes-cell" title={req.notes || ''}>
                          {req.notes ? req.notes : <span className="links-empty-dash">—</span>}
                        </div>
                      </td>

                      {/* Status Badge */}
                      <td>
                        <span
                          className={`links-status-tag ${
                            isApproved ? 'approved' : isRejected ? 'rejected' : 'pending'
                          }`}
                        >
                          {isPending ? 'Chờ duyệt' : isApproved ? 'Đã duyệt' : 'Từ chối'}
                        </span>
                      </td>

                      {/* Actions */}
                      <td style={{ textAlign: 'right' }}>
                        <div className="links-row-actions">
                          <button
                            type="button"
                            className="links-btn-action view"
                            onClick={() => setSelectedRequest(req)}
                            title="Xem chi tiết hồ sơ liên kết"
                          >
                            Chi tiết
                          </button>

                          {isPending ? (
                            <>
                              <button
                                type="button"
                                className="links-btn-action approve"
                                onClick={() => handleReview(req.id, 'approved')}
                                title="Phê duyệt liên kết này"
                              >
                                Duyệt
                              </button>
                              <button
                                type="button"
                                className="links-btn-action reject"
                                onClick={() => handleReview(req.id, 'rejected')}
                                title="Từ chối yêu cầu liên kết"
                              >
                                Từ chối
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              className="links-btn-action unlink"
                              onClick={() => handleUnlink(req.id)}
                              title="Hủy liên kết giữa hai dòng họ"
                            >
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
          </div>
        )}
      </div>

      {/* Send Link Modal */}
      {selectedRequest && (
        <div
          className="admin-modal-overlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelectedRequest(null);
          }}
        >
          <div className="link-modal-card" role="dialog" aria-modal="true">
            <div className="link-modal-header">
              <div className="link-modal-header-text">
                <span className="link-modal-eyebrow">
                  HỒ SƠ LIÊN KẾT
                </span>
                <h3 className="link-modal-title">Chi Tiết Yêu Cầu Liên Kết</h3>
                <p className="link-modal-subtitle">
                  Mã hệ thống: <code>#{selectedRequest.id}</code>
                </p>
              </div>
              <button
                type="button"
                className="link-modal-close-btn"
                onClick={() => setSelectedRequest(null)}
                aria-label="Đóng"
                title="Đóng (Esc)"
              >
                ✕
              </button>
            </div>

            <div className="link-detail-body">
              <div className="link-detail-grid">
                <div className="link-detail-cell">
                  <span className="link-detail-label">Dòng họ gửi yêu cầu</span>
                  <strong className="link-detail-value">{selectedRequest.requester_family}</strong>
                </div>
                <div className="link-detail-cell">
                  <span className="link-detail-label">Dòng họ nhận yêu cầu</span>
                  <strong className="link-detail-value">{selectedRequest.target_family}</strong>
                </div>
                <div className="link-detail-cell">
                  <span className="link-detail-label">Phân loại liên kết</span>
                  <span className={`admin-links-type-badge admin-links-type-${selectedRequest.link_type}`}>
                    {selectedRequest.link_type === 'paternal' ? 'Họ Nội' :
                     selectedRequest.link_type === 'maternal' ? 'Họ Ngoại' :
                     selectedRequest.link_type === 'in_law' ? 'Dâu & Rể' : 'Thông Gia'}
                  </span>
                </div>
                <div className="link-detail-cell">
                  <span className="link-detail-label">Ngày khởi tạo</span>
                  <strong className="link-detail-value">{selectedRequest.created_at || 'Mới cập nhật'}</strong>
                </div>
                <div className="link-detail-cell wide">
                  <span className="link-detail-label">Ghi chú &amp; Lý do quan hệ</span>
                  <p className="link-detail-notes">{selectedRequest.notes || 'Không có ghi chú thêm.'}</p>
                </div>
              </div>
            </div>

            <div className="link-modal-footer">
              <button
                type="button"
                className="link-btn-ghost"
                onClick={() => setSelectedRequest(null)}
              >
                Đóng
              </button>
              {selectedRequest.status === 'pending' && (
                <>
                  <button
                    type="button"
                    className="link-btn-danger"
                    onClick={() => {
                      handleReview(selectedRequest.id, 'rejected');
                      setSelectedRequest(null);
                    }}
                  >
                    Từ chối
                  </button>
                  <button
                    type="button"
                    className="link-btn-primary"
                    onClick={() => {
                      handleReview(selectedRequest.id, 'approved');
                      setSelectedRequest(null);
                    }}
                  >
                    Phê duyệt liên kết
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {isSendModalOpen && (
        <div
          className="admin-modal-overlay"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setIsSendModalOpen(false);
          }}
        >
          <div
            className="link-modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="send-link-title"
          >
            {/* Header */}
            <div className="link-modal-header">
              <div className="link-modal-header-text">
                <span className="link-modal-eyebrow">
                  KẾT NỐI MẠNG LƯỚI GIA TỘC
                </span>
                <h3 id="send-link-title" className="link-modal-title">
                  Gửi Yêu Cầu Liên Kết Dòng Họ
                </h3>
                <p className="link-modal-subtitle">
                  Kết nối với dòng họ khác để chia sẻ cây phả hệ, liên kết nhánh họ và thắt chặt quan hệ thân tộc.
                </p>
              </div>
              <button
                type="button"
                className="link-modal-close-btn"
                onClick={() => setIsSendModalOpen(false)}
                aria-label="Đóng"
                title="Đóng (Esc)"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSendRequest} className="link-modal-form">
              {/* Target Clan Selection */}
              <div className="form-group-admin">
                <div className="link-field-header">
                  <label className="form-label-admin">
                    Dòng Họ Muốn Liên Kết <span className="req-star">*</span>
                  </label>
                  {availableClans.length > 0 && (
                    <div className="link-mode-switch">
                      <button
                        type="button"
                        className={`link-mode-pill ${inputMode === 'select' ? 'active' : ''}`}
                        onClick={() => {
                          setInputMode('select');
                          if (availableClans[0] && !availableClans.some((c) => c.id === sendTargetFamily)) {
                            setSendTargetFamily(availableClans[0].id);
                          }
                        }}
                      >
                        Chọn danh sách ({availableClans.length})
                      </button>
                      <button
                        type="button"
                        className={`link-mode-pill ${inputMode === 'manual' ? 'active' : ''}`}
                        onClick={() => setInputMode('manual')}
                      >
                        Nhập mã ID
                      </button>
                    </div>
                  )}
                </div>

                {inputMode === 'select' && availableClans.length > 0 ? (
                  <>
                    <select
                      className="form-input-admin link-custom-select"
                      value={sendTargetFamily}
                      onChange={(e) => setSendTargetFamily(e.target.value)}
                      required
                    >
                      <option value="" disabled>-- Chọn dòng họ trong hệ thống --</option>
                      {availableClans.map((clan) => (
                        <option key={clan.id} value={clan.id}>
                          {clan.name} {clan.clan_code ? `(${clan.clan_code})` : ''}
                        </option>
                      ))}
                    </select>

                    {selectedClan && (
                      <div className="link-clan-card-preview">
                        <div className="link-clan-info">
                          <div className="link-clan-title-row">
                            <strong className="link-clan-name">{selectedClan.name}</strong>
                            {selectedClan.clan_code && (
                              <span className="fam-code-pill">{selectedClan.clan_code}</span>
                            )}
                            <span className="link-clan-status-badge">Đang hoạt động</span>
                          </div>
                          <span className="link-clan-id-code">
                            Mã hệ thống: <code>#{selectedClan.id}</code>
                          </span>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="link-manual-input-box">
                    <input
                      type="text"
                      className="form-input-admin"
                      value={sendTargetFamily}
                      onChange={(e) => setSendTargetFamily(e.target.value)}
                      placeholder="Dán mã ID dòng họ (ví dụ: CLAN-6B6K6QBU hoặc UUID)..."
                      required
                    />
                    <span className="link-input-subtext">
                      Nhập chính xác UUID hoặc mã dòng họ do Ban Quản trị đối tác cung cấp.
                    </span>
                  </div>
                )}
              </div>

              {/* Relationship Types Selection Grid */}
              <div className="form-group-admin">
                <label className="form-label-admin">
                  Phân Loại Quan Hệ Liên Kết <span className="req-star">*</span>
                </label>
                <div className="link-types-grid">
                  {LINK_TYPES.map((type) => {
                    const isSelected = sendLinkType === type.key;
                    return (
                      <div
                        key={type.key}
                        className={`link-type-card ${isSelected ? 'selected' : ''}`}
                        onClick={() => setSendLinkType(type.key)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') setSendLinkType(type.key);
                        }}
                      >
                        <div className="link-type-text">
                          <span className="link-type-title">{type.title}</span>
                          <span className="link-type-desc">{type.subtitle}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Notes & Reason */}
              <div className="form-group-admin">
                <label className="form-label-admin">
                  Ghi Chú &amp; Lý Do Liên Kết
                </label>
                <textarea
                  className="form-input-admin link-textarea"
                  rows={3}
                  value={sendNotes}
                  onChange={(e) => setSendNotes(e.target.value)}
                  placeholder="Nhập thông tin người đại diện, mối quan hệ hôn nhân hoặc nhắn gửi tới dòng họ đối tác..."
                />
                <span className="link-input-subtext">
                  Lời nhắn này sẽ được gửi kèm yêu cầu để Ban Quản trị dòng họ đối tác dễ dàng nhận diện và xét duyệt.
                </span>
              </div>

              {/* Footer */}
              <div className="link-modal-footer">
                <button
                  type="button"
                  className="link-btn-ghost"
                  onClick={() => setIsSendModalOpen(false)}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="link-btn-primary"
                  disabled={isSubmitting || !sendTargetFamily}
                >
                  {isSubmitting ? 'Đang gửi yêu cầu...' : 'Gửi yêu cầu ngay'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminFamilyLinksMgmt;
