import React, { useState } from 'react';
import { useToast } from '../../../shared/common/Toast';
import './AdminReportsMgmt.css';

export interface ViolationReportItem {
  id: string;
  target_type: 'ACCOUNT' | 'MEMORIAL_POST' | 'DOCUMENT_IMAGE' | 'FALSE_GENEALOGY';
  target_name: string;
  target_id: string;
  reporter_name: string;
  reporter_email: string;
  reason_category: string;
  evidence_summary: string;
  evidence_media_url?: string;
  status: 'PENDING' | 'RESOLVED' | 'DISMISSED';
  action_taken?: string;
  resolution_note?: string;
  resolved_by?: string;
  resolved_at?: string;
  created_at: string;
}

const INITIAL_REPORTS: ViolationReportItem[] = [];

export const AdminReportsMgmt: React.FC = () => {
  const [reports, setReports] = useState<ViolationReportItem[]>(INITIAL_REPORTS);
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [filterTarget, setFilterTarget] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');

  const [selectedReport, setSelectedReport] = useState<ViolationReportItem | null>(null);
  const [isDecisionModalOpen, setIsDecisionModalOpen] = useState(false);
  const [decisionAction, setDecisionAction] = useState<'WARNING' | 'HIDE_CONTENT' | 'LOCK_TARGET' | 'DISMISS'>('HIDE_CONTENT');
  const [decisionReason, setDecisionReason] = useState('');

  const toast = useToast();

  const handleOpenDecisionModal = (report: ViolationReportItem) => {
    setSelectedReport(report);
    setDecisionAction('HIDE_CONTENT');
    setDecisionReason('');
    setIsDecisionModalOpen(true);
  };

  const handleConfirmDecision = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReport) return;
    if (!decisionReason.trim()) {
      toast.error('Lỗi', 'Vui lòng nhập lý do quyết định kiểm duyệt.');
      return;
    }

    const actionTextMap = {
      WARNING: 'Cảnh cáo người dùng vi phạm',
      HIDE_CONTENT: 'Ẩn nội dung vi phạm khỏi hệ thống',
      LOCK_TARGET: 'Khóa tài khoản đối tượng vi phạm',
      DISMISS: 'Bác bỏ báo cáo (Không vi phạm)',
    };

    const newStatus = decisionAction === 'DISMISS' ? 'DISMISSED' : 'RESOLVED';

    setReports((prev) =>
      prev.map((r) =>
        r.id === selectedReport.id
          ? {
              ...r,
              status: newStatus,
              action_taken: actionTextMap[decisionAction],
              resolution_note: decisionReason.trim(),
              resolved_by: 'Admin Hệ Thống',
              resolved_at: new Date().toISOString().slice(0, 16).replace('T', ' '),
            }
          : r
      )
    );

    setIsDecisionModalOpen(false);
    toast.success(
      'Quyết định kiểm duyệt đã lưu',
      `Đã xử lý báo cáo "${selectedReport.id}" với quyết định: ${actionTextMap[decisionAction]}.`
    );
  };

  // Filter
  const filtered = reports.filter((r) => {
    const matchStatus = filterStatus === 'ALL' || r.status === filterStatus;
    const matchTarget = filterTarget === 'ALL' || r.target_type === filterTarget;
    const matchSearch =
      r.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.target_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.reporter_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.reason_category.toLowerCase().includes(searchTerm.toLowerCase());
    return matchStatus && matchTarget && matchSearch;
  });

  return (
    <div className="admin-reports-container">
      {/* Header */}
      <div className="admin-account-header">
        <div>
          <h2 className="admin-account-title">Kiểm Duyệt & Xử Lý Báo Cáo Vi Phạm</h2>
          <p className="admin-account-subtitle">
            Tiếp nhận tố cáo nội dung không phù hợp, hình ảnh vi phạm bản quyền và đưa ra quyết định xử lý (Ẩn, Cảnh cáo, Khóa tài khoản).
          </p>
        </div>

        <div className="admin-biz-pills">
          <button
            className={`admin-pill-btn ${filterStatus === 'ALL' ? 'active' : ''}`}
            onClick={() => setFilterStatus('ALL')}
          >
            Tất cả ({reports.length})
          </button>
          <button
            className={`admin-pill-btn pending ${filterStatus === 'PENDING' ? 'active' : ''}`}
            onClick={() => setFilterStatus('PENDING')}
          >
            Chờ xử lý ({reports.filter((r) => r.status === 'PENDING').length})
          </button>
          <button
            className={`admin-pill-btn approved ${filterStatus === 'RESOLVED' ? 'active' : ''}`}
            onClick={() => setFilterStatus('RESOLVED')}
          >
            Đã giải quyết ({reports.filter((r) => r.status === 'RESOLVED').length})
          </button>
          <button
            className={`admin-pill-btn ${filterStatus === 'DISMISSED' ? 'active' : ''}`}
            onClick={() => setFilterStatus('DISMISSED')}
          >
            Bác bỏ ({reports.filter((r) => r.status === 'DISMISSED').length})
          </button>
        </div>
      </div>

      {/* Filter Row */}
      <div className="admin-biz-bar">
        <div className="admin-search-wrapper" style={{ maxWidth: 400 }}>
          <svg className="admin-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            className="admin-search-input-field"
            placeholder="Tìm theo mã báo cáo, đối tượng, người gửi..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <select
          className="admin-select-filter"
          value={filterTarget}
          onChange={(e) => setFilterTarget(e.target.value)}
        >
          <option value="ALL">Tất cả loại đối tượng</option>
          <option value="ACCOUNT">Tài khoản cá nhân</option>
          <option value="MEMORIAL_POST">Bài viết / Lời tưởng niệm</option>
          <option value="DOCUMENT_IMAGE">Hình ảnh / Tư liệu</option>
          <option value="FALSE_GENEALOGY">Dữ liệu quan hệ thân tộc</option>
        </select>
      </div>

      {/* Main Table */}
      <div className="admin-table-card">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Mã Báo Cáo</th>
              <th>Đối Tượng Vi Phạm</th>
              <th>Người Báo Cáo</th>
              <th>Lý Do Vi Phạm</th>
              <th>Thời Gian Gửi</th>
              <th>Trạng Thái</th>
              <th style={{ textAlign: 'right' }}>Thao Tác</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="admin-table-empty">
                  Không có báo cáo vi phạm nào trong danh mục này.
                </td>
              </tr>
            ) : (
              filtered.map((rpt) => (
                <tr key={rpt.id} className="admin-table-row">
                  <td>
                    <span className="admin-code-tag">{rpt.id}</span>
                  </td>
                  <td>
                    <div className="admin-strong-text">{rpt.target_name}</div>
                    <span className="target-type-pill">{rpt.target_type}</span>
                  </td>
                  <td>
                    <div className="admin-strong-text">{rpt.reporter_name}</div>
                    <div className="admin-sub-info">{rpt.reporter_email}</div>
                  </td>
                  <td style={{ maxWidth: 280 }}>
                    <strong style={{ color: '#b91c1c', fontSize: 13 }}>{rpt.reason_category}</strong>
                    <div className="admin-sub-info">{rpt.evidence_summary}</div>
                  </td>
                  <td>{rpt.created_at}</td>
                  <td>
                    {rpt.status === 'PENDING' && <span className="status-badge status-pending">Chờ kiểm duyệt</span>}
                    {rpt.status === 'RESOLVED' && <span className="status-badge status-approved">Đã xử lý</span>}
                    {rpt.status === 'DISMISSED' && <span className="status-badge" style={{ background: '#f1f5f9', color: '#64748b' }}>Đã bác bỏ</span>}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      className="btn-action-view"
                      onClick={() => handleOpenDecisionModal(rpt)}
                    >
                      {rpt.status === 'PENDING' ? '⚖️ Xử Lý' : 'Chi Tiết'}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Decision / Dossier Modal */}
      {isDecisionModalOpen && selectedReport && (
        <div className="admin-modal-backdrop" onClick={() => setIsDecisionModalOpen(false)}>
          <div className="admin-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <div>
                <span className="admin-modal-tag tag-danger">HỒ SƠ KIỂM DUYỆT • {selectedReport.id}</span>
                <h3 className="admin-modal-title">{selectedReport.reason_category}</h3>
              </div>
              <button className="admin-modal-close" onClick={() => setIsDecisionModalOpen(false)}>×</button>
            </div>

            <form onSubmit={handleConfirmDecision}>
              <div className="admin-modal-body">
                <div className="admin-report-dossier-box">
                  <div className="admin-dossier-grid">
                    <div>
                      <label>Đối tượng bị báo cáo:</label>
                      <strong className="admin-strong-text">{selectedReport.target_name} ({selectedReport.target_type})</strong>
                    </div>
                    <div>
                      <label>Người gửi báo cáo:</label>
                      <strong className="admin-strong-text">{selectedReport.reporter_name} ({selectedReport.reporter_email})</strong>
                    </div>
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <label>Chi tiết chứng cứ vi phạm:</label>
                    <p className="admin-evidence-desc">{selectedReport.evidence_summary}</p>
                  </div>
                </div>

                {selectedReport.status === 'PENDING' ? (
                  <>
                    <h4 className="admin-dossier-sec-title">Biện Pháp Xử Lý Kiểm Duyệt</h4>
                    <div className="admin-decision-actions-grid">
                      <label className="decision-radio-label">
                        <input
                          type="radio"
                          name="decision"
                          value="HIDE_CONTENT"
                          checked={decisionAction === 'HIDE_CONTENT'}
                          onChange={() => setDecisionAction('HIDE_CONTENT')}
                        />
                        <div>
                          <strong>Ẩn nội dung vi phạm</strong>
                          <small>Nội dung sẽ bị vô hiệu hóa khỏi không gian gia phả công khai.</small>
                        </div>
                      </label>

                      <label className="decision-radio-label">
                        <input
                          type="radio"
                          name="decision"
                          value="WARNING"
                          checked={decisionAction === 'WARNING'}
                          onChange={() => setDecisionAction('WARNING')}
                        />
                        <div>
                          <strong>Gửi cảnh cáo chính thức</strong>
                          <small>Gửi thông báo nhắc nhở quy chuẩn văn hóa gia phả tới người đăng tải.</small>
                        </div>
                      </label>

                      <label className="decision-radio-label">
                        <input
                          type="radio"
                          name="decision"
                          value="LOCK_TARGET"
                          checked={decisionAction === 'LOCK_TARGET'}
                          onChange={() => setDecisionAction('LOCK_TARGET')}
                        />
                        <div>
                          <strong>Khóa tài khoản đối tượng</strong>
                          <small>Áp dụng khi tái phạm nghiêm trọng hoặc cố ý phá hoại dữ liệu gia tộc.</small>
                        </div>
                      </label>

                      <label className="decision-radio-label">
                        <input
                          type="radio"
                          name="decision"
                          value="DISMISS"
                          checked={decisionAction === 'DISMISS'}
                          onChange={() => setDecisionAction('DISMISS')}
                        />
                        <div>
                          <strong>Bác bỏ báo cáo (Không vi phạm)</strong>
                          <small>Nội dung hợp lệ hoặc đây là tranh chấp nội bộ gia đình cần tự hòa giải.</small>
                        </div>
                      </label>
                    </div>

                    <div className="form-group" style={{ marginTop: 16 }}>
                      <label className="form-label required">Lý do & Căn cứ xử lý (Lưu vết AuditLog):</label>
                      <textarea
                        rows={3}
                        className="form-textarea"
                        placeholder="Ghi rõ lý do đưa ra quyết định kiểm duyệt này..."
                        value={decisionReason}
                        onChange={(e) => setDecisionReason(e.target.value)}
                        required
                      />
                    </div>
                  </>
                ) : (
                  <div className="admin-resolved-record-box">
                    <strong>Kết quả xử lý trước đây:</strong>
                    <p style={{ margin: '6px 0', fontWeight: 700, color: '#166534' }}>
                      {selectedReport.action_taken}
                    </p>
                    <p style={{ margin: '4px 0', fontSize: 13 }}>{selectedReport.resolution_note}</p>
                    <small style={{ color: '#64748b' }}>
                      Bởi: {selectedReport.resolved_by} vào lúc {selectedReport.resolved_at}
                    </small>
                  </div>
                )}
              </div>

              <div className="admin-modal-footer">
                <button type="button" className="btn-modal-cancel" onClick={() => setIsDecisionModalOpen(false)}>
                  Đóng
                </button>
                {selectedReport.status === 'PENDING' && (
                  <button type="submit" className="btn-modal-reject-confirm" style={{ background: '#b91c1c' }}>
                    Áp Dụng Quyết Định Kiểm Duyệt
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminReportsMgmt;
