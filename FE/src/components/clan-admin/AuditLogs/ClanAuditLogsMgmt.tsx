import './ClanAuditLogsMgmt.css';
import React, { useState } from 'react';
import PageHeader from '../../../shared/Layout/PageHeader';
import DataTable, { type Column } from '../../../shared/DataTable/DataTable';

export interface AuditLogItem {
  id: string;
  actor_name: string;
  action: string;
  target_table: string;
  target_id: string;
  ip_address: string;
  created_at: string;
  details?: string;
}

export const ClanAuditLogsMgmt: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedLog, setSelectedLog] = useState<AuditLogItem | null>(null);

  const logs: AuditLogItem[] = [
    { id: 'AL-10024', actor_name: 'Nguyễn Văn A (Admin)', action: 'UPDATE', target_table: 'members', target_id: 'MEM-0012', ip_address: '113.190.12.34', created_at: '10/09/2026 14:32:05', details: '{"old": {"status": "alive"}, "new": {"status": "deceased"}}' },
    { id: 'AL-10023', actor_name: 'Hệ thống (Cron)', action: 'BACKUP', target_table: 'database', target_id: 'DB-FULL', ip_address: '127.0.0.1', created_at: '10/09/2026 02:00:00', details: '{"type": "auto_full", "size": "15.2MB"}' },
    { id: 'AL-10022', actor_name: 'Trần Thị B', action: 'CREATE', target_table: 'funds_transactions', target_id: 'TRX-9892', ip_address: '118.69.25.10', created_at: '09/09/2026 09:15:22', details: '{"amount": 500000, "fund_id": 1, "type": "in"}' },
    { id: 'AL-10021', actor_name: 'Nguyễn Văn A (Admin)', action: 'DELETE', target_table: 'library_3d', target_id: 'LIB-005', ip_address: '113.190.12.34', created_at: '08/09/2026 16:45:10', details: '{"deleted_file": "old_model.obj"}' },
  ];

  const filteredLogs = logs.filter(
    (l) =>
      l.actor_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.target_table.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const columns: Column<AuditLogItem>[] = [
    { key: 'id', header: 'Mã Nhật Ký', render: (item) => <code className="audit-log-id-code">{item.id}</code> },
    { key: 'actor_name', header: 'Tài khoản thực hiện', render: (item) => <span className="audit-log-actor">{item.actor_name}</span> },
    { key: 'action', header: 'Hành động', render: (item) => (
      <span className={`audit-log-badge ${item.action === 'UPDATE' ? 'badge-update' : item.action === 'CREATE' ? 'badge-create' : item.action === 'DELETE' ? 'badge-delete' : 'badge-default'}`}>
        {item.action}
      </span>
    )},
    { key: 'target_table', header: 'Bảng / Đối tượng', render: (item) => (
      <div>
        <div className="font-medium">{item.target_table}</div>
        <div className="audit-log-target-id">ID: {item.target_id}</div>
      </div>
    )},
    { key: 'ip_address', header: 'Địa chỉ IP', render: (item) => <span className="audit-log-ip">{item.ip_address}</span> },
    { key: 'created_at', header: 'Thời gian', render: (item) => <span className="audit-log-time">{item.created_at}</span> },
    { key: 'actions', header: 'Thao tác', render: (item) => (
      <button className="audit-log-action-btn" onClick={() => setSelectedLog(item)}>
        Chi tiết
      </button>
    )},
  ];

  const headerActions = (
    <div className="audit-log-header-actions">
      <button className="admin-btn-secondary">
        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
        Xuất file CSV
      </button>
      <button className="audit-log-warn-btn admin-btn-primary bg-blue-600 hover:bg-blue-700 border-blue-600">
        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
        Cảnh báo bảo mật (0)
      </button>
    </div>
  );

  return (
    <div className="admin-account-container">
      
      <div className="admin-account-header">
        <div>
          <h2 className="admin-account-title">Nhật Ký Hệ Thống & Audit Logs Bảo Mật</h2>
          <p className="admin-account-subtitle">Giám sát toàn bộ lịch sử chỉnh sửa, thao tác đăng nhập, phân quyền và bảo vệ dữ liệu nhạy cảm.</p>
        </div>
        <div className="admin-account-controls">
          {headerActions}
        </div>
      </div>

      <div className="audit-log-filter-bar">
        <input 
          type="text" 
          placeholder="Tìm theo thao tác, tài khoản, bảng..." 
          className="audit-log-search-input form-input-admin flex-1"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <select className="audit-log-select-action form-input-admin w-48">
          <option value="">Tất cả hành động</option>
          <option value="CREATE">CREATE (Thêm)</option>
          <option value="UPDATE">UPDATE (Sửa)</option>
          <option value="DELETE">DELETE (Xoá)</option>
        </select>
        <select className="audit-log-select-time form-input-admin w-48">
          <option value="">Hôm nay</option>
          <option value="7days">7 ngày qua</option>
          <option value="30days">30 ngày qua</option>
        </select>
      </div>

      <div className="audit-log-table-container">
        <DataTable columns={columns} data={filteredLogs} keyExtractor={(item) => item.id} />
      </div>

      {/* JSON Viewer Modal */}
      {selectedLog && (
        <div className="audit-log-modal-overlay">
          <div className="audit-log-modal-backdrop" onClick={() => setSelectedLog(null)} />
          <div className="audit-log-modal-content relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl flex flex-col max-h-[90vh] animate-zoom-in overflow-hidden">
            <div className="audit-log-modal-header">
              <div>
                <h2 className="audit-log-modal-title">Chi tiết Audit Log</h2>
                <p className="audit-log-modal-subtitle">{selectedLog.id}</p>
              </div>
              <button 
                className="audit-log-modal-close-btn"
                onClick={() => setSelectedLog(null)}
              >
                ✕
              </button>
            </div>
            
            <div className="audit-log-modal-body">
              <div className="space-y-6">
                <div className="audit-log-detail-grid">
                  <div>
                    <div className="audit-log-detail-label">Thời gian</div>
                    <div className="audit-log-detail-value">{selectedLog.created_at}</div>
                  </div>
                  <div>
                    <div className="audit-log-detail-label">IP Address</div>
                    <div className="audit-log-detail-value">{selectedLog.ip_address}</div>
                  </div>
                  <div>
                    <div className="audit-log-detail-label">Tài khoản</div>
                    <div className="audit-log-detail-value">{selectedLog.actor_name}</div>
                  </div>
                  <div>
                    <div className="audit-log-detail-label">Hành động</div>
                    <span className={`audit-log-badge ${selectedLog.action === 'UPDATE' ? 'badge-update' : selectedLog.action === 'CREATE' ? 'badge-create' : selectedLog.action === 'DELETE' ? 'badge-delete' : 'badge-default'}`}>
                      {selectedLog.action}
                    </span>
                  </div>
                  <div>
                    <div className="audit-log-detail-label">Bảng dữ liệu</div>
                    <div className="audit-log-detail-value">{selectedLog.target_table}</div>
                  </div>
                  <div>
                    <div className="audit-log-detail-label">ID Bản ghi</div>
                    <div className="audit-log-detail-value">{selectedLog.target_id}</div>
                  </div>
                </div>

                <div>
                  <div className="audit-log-json-label">Dữ liệu thay đổi (JSON Payload)</div>
                  <div className="audit-log-json-container">
                    <pre className="audit-log-json-text">
                      {selectedLog.details ? JSON.stringify(JSON.parse(selectedLog.details), null, 2) : 'No payload details available.'}
                    </pre>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="audit-log-modal-footer">
              <button className="audit-log-modal-close-action admin-btn-secondary w-full" onClick={() => setSelectedLog(null)}>Đóng</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClanAuditLogsMgmt;
