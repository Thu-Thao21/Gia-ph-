import React, { useState, useEffect } from 'react';
import { useToast } from '../../../shared/common/Toast';
import './AdminSupportAccess.css';

export interface SupportGrantSession {
  id: string;
  ticket_id: string;
  family_code: string;
  family_name: string;
  requested_by_admin: string;
  scope: 'ACCOUNT_CONFIG' | 'TREE_SYNC_DEBUG' | 'NETWORK_REPAIR';
  reason: string;
  status: 'ACTIVE' | 'EXPIRED' | 'TERMINATED';
  duration_minutes: number;
  remaining_seconds: number;
  granted_at: string;
  expires_at: string;
}

const INITIAL_SESSIONS: SupportGrantSession[] = [];

export const AdminSupportAccess: React.FC = () => {
  const [sessions, setSessions] = useState<SupportGrantSession[]>(INITIAL_SESSIONS);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    familyCode: 'FAM-LE-003',
    familyName: 'Tộc Lê Khắc (Thủy Tổ Tràng Kênh)',
    ticketId: 'TCK-',
    scope: 'TREE_SYNC_DEBUG' as 'ACCOUNT_CONFIG' | 'TREE_SYNC_DEBUG' | 'NETWORK_REPAIR',
    durationMinutes: 30,
    reason: '',
  });

  const toast = useToast();

  // Countdown timer for active session
  useEffect(() => {
    const timer = setInterval(() => {
      setSessions((prev) =>
        prev.map((s) => {
          if (s.status === 'ACTIVE' && s.remaining_seconds > 0) {
            const nextSec = s.remaining_seconds - 1;
            return {
              ...s,
              remaining_seconds: nextSec,
              status: nextSec <= 0 ? 'EXPIRED' : 'ACTIVE',
            };
          }
          return s;
        })
      );
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const handleOpenModal = () => {
    setFormData({
      familyCode: 'FAM-LE-003',
      familyName: 'Tộc Lê Khắc (Thủy Tổ Tràng Kênh)',
      ticketId: `TCK-${Math.floor(10000 + Math.random() * 90000)}`,
      scope: 'TREE_SYNC_DEBUG',
      durationMinutes: 30,
      reason: '',
    });
    setIsModalOpen(true);
  };

  const handleCreateGrant = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.reason.trim()) {
      toast.error('Lỗi', 'Vui lòng nhập lý do yêu cầu cấp quyền hỗ trợ.');
      return;
    }

    const now = new Date();
    const exp = new Date(now.getTime() + formData.durationMinutes * 60000);

    const newGrant: SupportGrantSession = {
      id: `GRT-2026-0${sessions.length + 82}`,
      ticket_id: formData.ticketId,
      family_code: formData.familyCode,
      family_name: formData.familyName,
      requested_by_admin: 'Admin Hệ Thống',
      scope: formData.scope,
      reason: formData.reason.trim(),
      status: 'ACTIVE',
      duration_minutes: formData.durationMinutes,
      remaining_seconds: formData.durationMinutes * 60,
      granted_at: now.toISOString().slice(0, 16).replace('T', ' '),
      expires_at: exp.toISOString().slice(0, 16).replace('T', ' '),
    };

    setSessions([newGrant, ...sessions]);
    setIsModalOpen(false);
    toast.success(
      'Cấp quyền hỗ trợ thành công!',
      `Phiên hỗ trợ cho "${formData.familyName}" đã bắt đầu (${formData.durationMinutes} phút). Mọi truy cập được giám sát qua Audit.`
    );
  };

  const handleTerminateSession = (grantId: string) => {
    setSessions((prev) =>
      prev.map((s) => (s.id === grantId ? { ...s, status: 'TERMINATED', remaining_seconds: 0 } : s))
    );
    toast.warning('Đã chấm dứt phiên hỗ trợ', `Quyền truy cập dữ liệu hỗ trợ của phiên "${grantId}" đã bị thu hồi ngay lập tức.`);
  };

  const activeSession = sessions.find((s) => s.status === 'ACTIVE');

  const formatTimer = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="admin-support-container">
      {/* Header */}
      <div className="admin-account-header">
        <div>
          <h2 className="admin-account-title">Hỗ Trợ Dữ Liệu Có Kiểm Soát (Support Grants)</h2>
          <p className="admin-account-subtitle">
            Cơ chế bảo vệ quyền riêng tư: Quản trị viên chỉ được cấp quyền xem dữ liệu kỹ thuật có giới hạn thời gian khi có Ticket hỗ trợ từ dòng họ.
          </p>
        </div>

        <div className="admin-account-controls">
          <button className="btn-create-grant" onClick={handleOpenModal}>
            + Yêu Cầu Cấp Quyền Hỗ Trợ Mới
          </button>
        </div>
      </div>

      {/* Active Live Session Alert */}
      {activeSession && (
        <div className="admin-active-session-banner">
          <div className="active-session-left">
            <div className="live-pulse-dot" />
            <div>
              <span className="live-session-tag">PHIÊN HỖ TRỢ ĐANG KÍCH HOẠT • {activeSession.id}</span>
              <h3 className="live-session-family">{activeSession.family_name}</h3>
              <p className="live-session-sub">
                Ticket: <strong>{activeSession.ticket_id}</strong> • Phạm vi: <strong>{activeSession.scope}</strong> • Lý do: {activeSession.reason}
              </p>
            </div>
          </div>

          <div className="active-session-right">
            <div className="countdown-box">
              <span className="countdown-label">Thời gian còn lại:</span>
              <div className="countdown-timer">{formatTimer(activeSession.remaining_seconds)}</div>
            </div>
            <button
              className="btn-terminate-session"
              onClick={() => handleTerminateSession(activeSession.id)}
            >
              Chấm Dứt Phiên Ngay
            </button>
          </div>
        </div>
      )}

      {/* Authorized Read-only Data Preview when active */}
      {activeSession && (
        <div className="admin-support-data-preview">
          <div className="data-preview-header">
            <h4>Dữ Liệu Kỹ Thuật Được Phép Truy Cập (Chỉ Đọc Trong Phiên Hỗ Trợ)</h4>
            <span className="data-preview-badge">Read-Only Scope Active</span>
          </div>

          <div className="data-preview-grid">
            <div className="preview-card">
              <label>Mã Dòng Họ & CSDL:</label>
              <strong>{activeSession.family_code} (Node ID: #88219)</strong>
            </div>
            <div className="preview-card">
              <label>Trạng Thái Đồng Bộ Cây Gia Phả:</label>
              <strong style={{ color: '#16a34a' }}>Đồng bộ 100% (Cấu trúc phả hệ hoàn chỉnh)</strong>
            </div>
            <div className="preview-card">
              <label>Thành Viên Trực Hệ / Dâu Rể:</label>
              <strong>350 trực hệ / 112 dâu rể</strong>
            </div>
            <div className="preview-card">
              <label>Trạng Thái Kiểm Tra Phả Hệ:</label>
              <strong style={{ color: '#16a34a' }}>Bình thường (Đã xác minh liên kết Node #4412)</strong>
            </div>
          </div>
        </div>
      )}

      {/* History Table */}
      <div className="admin-table-card">
        <div className="admin-table-card-header">
          <h3 className="admin-card-header-title">Lịch Sử Cấp Quyền Hỗ Trợ Kỹ Thuật</h3>
          <span className="admin-card-header-sub">
            Tất cả phiên hỗ trợ đều được giới hạn thời gian tự động đóng và ghi vết kiểm toán toàn diện.
          </span>
        </div>

        <table className="admin-table">
          <thead>
            <tr>
              <th>Mã Grant</th>
              <th>Ticket ID</th>
              <th>Dòng Họ Được Hỗ Trợ</th>
              <th>Admin Thao Tác</th>
              <th>Phạm Vi (Scope)</th>
              <th>Thời Gian Hiệu Lực</th>
              <th>Trạng Thái</th>
              <th style={{ textAlign: 'right' }}>Hành Động</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => (
              <tr key={s.id} className="admin-table-row">
                <td>
                  <span className="admin-code-tag">{s.id}</span>
                </td>
                <td>
                  <strong style={{ fontFamily: 'monospace' }}>{s.ticket_id}</strong>
                </td>
                <td>
                  <div className="admin-strong-text">{s.family_name}</div>
                  <div className="admin-sub-info">{s.family_code}</div>
                </td>
                <td>{s.requested_by_admin}</td>
                <td>
                  <span className="scope-pill full_platform">{s.scope}</span>
                </td>
                <td>
                  <div>{s.granted_at} → {s.expires_at}</div>
                  <div className="admin-sub-info">({s.duration_minutes} phút)</div>
                </td>
                <td>
                  {s.status === 'ACTIVE' && <span className="status-badge status-approved">Đang mở</span>}
                  {s.status === 'EXPIRED' && <span className="status-badge" style={{ background: '#f1f5f9', color: '#64748b' }}>Hết hạn</span>}
                  {s.status === 'TERMINATED' && <span className="status-badge status-rejected">Đã đóng sớm</span>}
                </td>
                <td style={{ textAlign: 'right' }}>
                  {s.status === 'ACTIVE' ? (
                    <button
                      className="btn-action-reject"
                      style={{ fontSize: 11, padding: '4px 10px' }}
                      onClick={() => handleTerminateSession(s.id)}
                    >
                      Đóng phiên
                    </button>
                  ) : (
                    <span className="admin-sub-info">Đã lưu log</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Request Modal */}
      {isModalOpen && (
        <div className="admin-modal-backdrop" onClick={() => setIsModalOpen(false)}>
          <div className="admin-modal-card modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <div>
                <span className="admin-modal-tag">YÊU CẦU CẤP QUYỀN HỖ TRỢ</span>
                <h3 className="admin-modal-title">Khởi Tạo Phiên Hỗ Trợ Kỹ Thuật</h3>
              </div>
              <button className="admin-modal-close" onClick={() => setIsModalOpen(false)}>×</button>
            </div>

            <form onSubmit={handleCreateGrant}>
              <div className="admin-modal-body">
                <div className="form-group">
                  <label className="form-label required">Chọn Dòng Họ Cần Hỗ Trợ:</label>
                  <select
                    className="admin-search-input-field"
                    value={formData.familyCode}
                    onChange={(e) => {
                      const c = e.target.value;
                      const n = c === 'FAM-NGUYEN-001' ? 'Dòng Họ Nguyễn Văn (Đại Tôn)' : c === 'FAM-TRAN-002' ? 'Dòng Họ Trần Đình (Văn Chỉ)' : 'Tộc Lê Khắc (Thủy Tổ Tràng Kênh)';
                      setFormData({ ...formData, familyCode: c, familyName: n });
                    }}
                  >
                    <option value="FAM-LE-003">Tộc Lê Khắc (Thủy Tổ Tràng Kênh)</option>
                    <option value="FAM-TRAN-002">Dòng Họ Trần Đình (Văn Chỉ)</option>
                    <option value="FAM-NGUYEN-001">Dòng Họ Nguyễn Văn (Đại Tôn)</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label required">Mã Ticket Yêu Cầu Hỗ Trợ Từ Dòng Họ:</label>
                  <input
                    type="text"
                    className="admin-search-input-field"
                    value={formData.ticketId}
                    onChange={(e) => setFormData({ ...formData, ticketId: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label required">Phạm Vi Quyền Xem (Scope):</label>
                  <select
                    className="admin-search-input-field"
                    value={formData.scope}
                    onChange={(e) => setFormData({ ...formData, scope: e.target.value as any })}
                  >
                    <option value="TREE_SYNC_DEBUG">Kiểm tra lỗi đồng bộ Cây gia phả (Tree Sync)</option>
                    <option value="ACCOUNT_CONFIG">Cấu hình lại tài khoản Trưởng tộc</option>
                    <option value="NETWORK_REPAIR">Khắc phục sự cố mạng lưới liên họ</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label required">Thời Hạn Phiên Hỗ Trợ:</label>
                  <select
                    className="admin-search-input-field"
                    value={formData.durationMinutes}
                    onChange={(e) => setFormData({ ...formData, durationMinutes: Number(e.target.value) })}
                  >
                    <option value={15}>15 phút (Khắc phục nhanh)</option>
                    <option value={30}>30 phút (Tiêu chuẩn)</option>
                    <option value={60}>60 phút (Xử lý chuyên sâu)</option>
                    <option value={120}>120 phút (Bảo trì cơ sở dữ liệu phả hệ)</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label required">Lý do chi tiết cần truy cập dữ liệu:</label>
                  <textarea
                    rows={3}
                    className="form-textarea"
                    placeholder="Mô tả sự cố kỹ thuật theo ticket của khách hàng..."
                    value={formData.reason}
                    onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="admin-modal-footer">
                <button type="button" className="btn-modal-cancel" onClick={() => setIsModalOpen(false)}>
                  Hủy bỏ
                </button>
                <button type="submit" className="btn-modal-approve">
                  Kích Hoạt Phiên Hỗ Trợ
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminSupportAccess;
