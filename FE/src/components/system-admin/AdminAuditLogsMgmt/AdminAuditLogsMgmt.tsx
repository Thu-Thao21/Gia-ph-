import React, { useState } from 'react';
import './AdminAuditLogsMgmt.css';

export interface AuditLogItem {
  id: string;
  actor_name: string;
  actor_role: string;
  action_type: 'CREATE' | 'UPDATE' | 'DELETE' | 'SUSPEND' | 'RESUME' | 'TRANSFER' | 'BACKUP' | 'MODERATE';
  action_description: string;
  target_type: string;
  target_id: string;
  family_code?: string;
  ip_address: string;
  user_agent: string;
  reason?: string;
  diff_before?: Record<string, any>;
  diff_after?: Record<string, any>;
  created_at: string;
}

const INITIAL_AUDIT_LOGS: AuditLogItem[] = [];

export const AdminAuditLogsMgmt: React.FC = () => {
  const [logs] = useState<AuditLogItem[]>(INITIAL_AUDIT_LOGS);
  const [actionFilter, setActionFilter] = useState<string>('ALL');
  const [targetFilter, setTargetFilter] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedLog, setSelectedLog] = useState<AuditLogItem | null>(null);

  const filteredLogs = logs.filter((l) => {
    const matchAction = actionFilter === 'ALL' || l.action_type === actionFilter;
    const matchTarget = targetFilter === 'ALL' || l.target_type === targetFilter;
    const matchSearch =
      l.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.actor_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.action_description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.target_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (l.family_code && l.family_code.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchAction && matchTarget && matchSearch;
  });

  return (
    <div className="admin-audit-container">
      {/* Header */}
      <div className="admin-account-header">
        <div>
          <h2 className="admin-account-title">Nhật Ký Kiểm Toán Hệ Thống (Audit Logs)</h2>
          <p className="admin-account-subtitle">
            Bản ghi bất biến chỉ đọc (Read-Only) giám sát mọi thao tác cấp cao: duyệt Business, phân quyền, chuyển Trưởng tộc, sao lưu và kiểm duyệt.
          </p>
        </div>

        <div className="admin-audit-secure-badge">
          <span className="secure-dot" />
          <span>Bảo mật chống can thiệp (WORM Immutable)</span>
        </div>
      </div>

      {/* Filter Row */}
      <div className="admin-biz-bar">
        <div className="admin-search-wrapper" style={{ maxWidth: 380 }}>
          <svg className="admin-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            className="admin-search-input-field"
            placeholder="Tìm theo mã log, người thực hiện, đối tượng..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="admin-audit-selects">
          <select
            className="admin-select-filter"
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
          >
            <option value="ALL">Tất cả loại hành động</option>
            <option value="CREATE">CREATE (Tạo mới)</option>
            <option value="UPDATE">UPDATE (Cập nhật)</option>
            <option value="TRANSFER">TRANSFER (Chuyển giao)</option>
            <option value="BACKUP">BACKUP (Sao lưu)</option>
            <option value="MODERATE">MODERATE (Kiểm duyệt)</option>
            <option value="SUSPEND">SUSPEND (Tạm ngưng)</option>
          </select>

          <select
            className="admin-select-filter"
            value={targetFilter}
            onChange={(e) => setTargetFilter(e.target.value)}
          >
            <option value="ALL">Tất cả đối tượng</option>
            <option value="FAMILY_BUSINESS">Không gian Dòng họ</option>
            <option value="BUSINESS_REQUEST">Yêu cầu đăng ký</option>
            <option value="USER_ACCOUNT">Tài khoản người dùng</option>
            <option value="SYSTEM_BACKUP">Sao lưu hệ thống</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="admin-table-card">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Mã Nhật Ký</th>
              <th>Thời Gian</th>
              <th>Người Thao Tác (Actor)</th>
              <th>Loại Hành Động</th>
              <th>Diễn Giải Tác Vụ</th>
              <th>Đối Tượng (Target)</th>
              <th>IP Truy Cập</th>
              <th style={{ textAlign: 'right' }}>Chi Tiết</th>
            </tr>
          </thead>
          <tbody>
            {filteredLogs.length === 0 ? (
              <tr>
                <td colSpan={8} className="admin-table-empty">
                  Không tìm thấy bản ghi nhật ký nào phù hợp.
                </td>
              </tr>
            ) : (
              filteredLogs.map((log) => (
                <tr key={log.id} className="admin-table-row">
                  <td>
                    <span className="admin-code-tag">{log.id}</span>
                  </td>
                  <td>
                    <div className="admin-strong-text" style={{ fontSize: 13 }}>{log.created_at}</div>
                  </td>
                  <td>
                    <div className="admin-strong-text">{log.actor_name}</div>
                    <span className="role-badge role-admin" style={{ fontSize: 10 }}>{log.actor_role}</span>
                  </td>
                  <td>
                    <span className={`action-type-badge action-${log.action_type.toLowerCase()}`}>
                      {log.action_type}
                    </span>
                  </td>
                  <td style={{ maxWidth: 280 }}>
                    <div className="admin-strong-text" style={{ fontSize: 13 }}>{log.action_description}</div>
                    {log.reason && (
                      <div className="admin-sub-info" style={{ color: '#0369a1' }}>Lý do: {log.reason}</div>
                    )}
                  </td>
                  <td>
                    <span className="admin-code-tag">{log.target_id}</span>
                    <div className="admin-sub-info">{log.target_type}</div>
                  </td>
                  <td>
                    <span className="ip-text">{log.ip_address}</span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      className="btn-action-view"
                      onClick={() => setSelectedLog(log)}
                    >
                      🔍 Xem Diff
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Read-only Diff Drawer / Modal */}
      {selectedLog && (
        <div className="admin-modal-backdrop" onClick={() => setSelectedLog(null)}>
          <div className="admin-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <div>
                <span className="admin-modal-tag">CHI TIẾT KIỂM TOÁN CHỈ ĐỌC • {selectedLog.id}</span>
                <h3 className="admin-modal-title">{selectedLog.action_description}</h3>
              </div>
              <button className="admin-modal-close" onClick={() => setSelectedLog(null)}>×</button>
            </div>

            <div className="admin-modal-body">
              <div className="admin-dossier-grid">
                <div>
                  <label className="admin-notes-label">Người thực hiện (Actor):</label>
                  <strong className="admin-strong-text">{selectedLog.actor_name} ({selectedLog.actor_role})</strong>
                  <div className="admin-sub-info">IP: {selectedLog.ip_address}</div>
                  <div className="admin-sub-info">{selectedLog.user_agent}</div>
                </div>
                <div>
                  <label className="admin-notes-label">Thời gian & Đối tượng:</label>
                  <strong className="admin-strong-text">{selectedLog.created_at}</strong>
                  <div className="admin-sub-info">Đối tượng: {selectedLog.target_id} ({selectedLog.target_type})</div>
                  {selectedLog.family_code && (
                    <div className="admin-sub-info">Dòng họ liên đới: {selectedLog.family_code}</div>
                  )}
                </div>
              </div>

              {selectedLog.reason && (
                <div className="admin-dossier-notes-box">
                  <label className="admin-notes-label">Căn cứ & Lý do nghiệp vụ đã lưu:</label>
                  <p className="admin-notes-content">{selectedLog.reason}</p>
                </div>
              )}

              <h4 className="admin-dossier-sec-title">Biến Động Dữ Liệu Cũ - Mới (State Diff)</h4>
              <div className="admin-diff-json-grid">
                <div className="admin-diff-box">
                  <span className="diff-box-title before">Dữ liệu Trước Thao Tác (Before):</span>
                  <pre className="diff-pre">
                    {selectedLog.diff_before && Object.keys(selectedLog.diff_before).length > 0
                      ? JSON.stringify(selectedLog.diff_before, null, 2)
                      : '// Không có dữ liệu trạng thái trước (Tạo mới)'}
                  </pre>
                </div>

                <div className="admin-diff-box">
                  <span className="diff-box-title after">Dữ liệu Sau Thao Tác (After):</span>
                  <pre className="diff-pre">
                    {selectedLog.diff_after && Object.keys(selectedLog.diff_after).length > 0
                      ? JSON.stringify(selectedLog.diff_after, null, 2)
                      : '// Dữ liệu đã bị xóa'}
                  </pre>
                </div>
              </div>

              <div className="admin-masking-note">
                <strong>Chính sách bảo mật:</strong> Mọi mã hóa mật khẩu, token xác thực phiên hoặc thông tin bí mật thẻ thanh toán đã được tự động che dấu / loại bỏ khỏi bản ghi nhật ký.
              </div>
            </div>

            <div className="admin-modal-footer">
              <button className="btn-modal-cancel" onClick={() => setSelectedLog(null)}>
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminAuditLogsMgmt;
