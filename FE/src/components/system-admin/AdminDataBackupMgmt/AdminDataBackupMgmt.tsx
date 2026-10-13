import React, { useState } from 'react';
import { useToast } from '../../../shared/common/Toast';
import './AdminDataBackupMgmt.css';

export interface BackupSnapshotItem {
  id: string;
  file_name: string;
  scope: 'FULL_PLATFORM' | 'SINGLE_FAMILY';
  family_name?: string;
  size_mb: number;
  tables_count: number;
  records_count: number;
  integrity_status: 'VALID' | 'CORRUPTED';
  checksum_sha256: string;
  created_by: string;
  created_at: string;
}

export interface BackupJobItem {
  id: string;
  type: 'BACKUP_CREATE' | 'RESTORE_EXECUTE';
  scope: string;
  status: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';
  progress_percent: number;
  started_at: string;
  completed_at?: string;
  logs?: string[];
}

const INITIAL_SNAPSHOTS: BackupSnapshotItem[] = [];

const INITIAL_JOBS: BackupJobItem[] = [];

export const AdminDataBackupMgmt: React.FC = () => {
  const [snapshots, setSnapshots] = useState<BackupSnapshotItem[]>(INITIAL_SNAPSHOTS);
  const [jobs, setJobs] = useState<BackupJobItem[]>(INITIAL_JOBS);
  
  // Create Backup Modal
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newScope, setNewScope] = useState<'FULL_PLATFORM' | 'SINGLE_FAMILY'>('FULL_PLATFORM');
  const [newNote, setNewNote] = useState('');

  // Restore Preview Modal
  const [selectedSnapshot, setSelectedSnapshot] = useState<BackupSnapshotItem | null>(null);
  const [isRestoreModalOpen, setIsRestoreModalOpen] = useState(false);
  const [restoreConfirmChecked, setRestoreConfirmChecked] = useState(false);

  const toast = useToast();

  const handleStartBackup = (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreateModalOpen(false);

    const newJobId = `JOB-${Math.floor(1000 + Math.random() * 9000)}`;
    const newJob: BackupJobItem = {
      id: newJobId,
      type: 'BACKUP_CREATE',
      scope: newScope,
      status: 'RUNNING',
      progress_percent: 25,
      started_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
      logs: ['Khởi động worker sao lưu...', 'Đang đọc metadata các dòng họ...'],
    };

    setJobs([newJob, ...jobs]);
    toast.loading('Đang sao lưu...', 'Tác vụ chạy nền đã được khởi tạo. Đang nén dữ liệu.');

    // Simulate progress
    setTimeout(() => {
      setJobs((prev) =>
        prev.map((j) => (j.id === newJobId ? { ...j, progress_percent: 65, logs: [...(j.logs || []), 'Đang nén dữ liệu và mã hóa AES-256...'] } : j))
      );
    }, 1200);

    setTimeout(() => {
      setJobs((prev) =>
        prev.map((j) =>
          j.id === newJobId
            ? {
                ...j,
                progress_percent: 100,
                status: 'SUCCEEDED',
                completed_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
                logs: [...(j.logs || []), 'Hoàn thành tạo snapshot.', 'Kiểm tra Checksum sha256: VALID'],
              }
            : j
        )
      );

      const newSnapshot: BackupSnapshotItem = {
        id: `SNP-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(10 + Math.random() * 90)}`,
        file_name: `mfgms_manual_${newScope.toLowerCase()}_${Date.now()}.sql.enc`,
        scope: newScope,
        size_mb: newScope === 'FULL_PLATFORM' ? 4310 : 210,
        tables_count: 48,
        records_count: 185600,
        integrity_status: 'VALID',
        checksum_sha256: 'a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0',
        created_by: 'Admin Hệ Thống (Thao tác thủ công)',
        created_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
      };

      setSnapshots([newSnapshot, ...snapshots]);
      toast.success('Sao lưu hoàn tất!', `Bản sao lưu "${newSnapshot.id}" đã được tạo thành công.`);
    }, 2500);
  };

  const handleOpenRestore = (snp: BackupSnapshotItem) => {
    setSelectedSnapshot(snp);
    setRestoreConfirmChecked(false);
    setIsRestoreModalOpen(true);
  };

  const handleConfirmRestore = () => {
    if (!selectedSnapshot || !restoreConfirmChecked) return;
    setIsRestoreModalOpen(false);

    const restoreJobId = `JOB-RESTORE-${Math.floor(1000 + Math.random() * 9000)}`;
    const restoreJob: BackupJobItem = {
      id: restoreJobId,
      type: 'RESTORE_EXECUTE',
      scope: selectedSnapshot.scope,
      status: 'RUNNING',
      progress_percent: 30,
      started_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
      logs: ['Bật chế độ bảo trì nền tảng...', 'Kiểm tra checksum snapshot: HỢP LỆ', 'Khôi phục cấu trúc bảng...'],
    };

    setJobs([restoreJob, ...jobs]);
    toast.loading('Đang khôi phục...', 'Đang nạp snapshot vào cơ sở dữ liệu hệ thống.');

    setTimeout(() => {
      setJobs((prev) =>
        prev.map((j) =>
          j.id === restoreJobId
            ? {
                ...j,
                progress_percent: 100,
                status: 'SUCCEEDED',
                completed_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
                logs: [...(j.logs || []), 'Đồng bộ quan hệ phả hệ thành công', 'Mở lại quyền truy cập cho người dùng'],
              }
            : j
        )
      );
      toast.success('Khôi phục hoàn tất!', `Dữ liệu hệ thống đã được phục hồi chính xác từ bản snapshot "${selectedSnapshot.id}".`);
    }, 2800);
  };

  return (
    <div className="admin-backup-container">
      {/* Header */}
      <div className="admin-account-header">
        <div>
          <h2 className="admin-account-title">Sao Lưu & Khôi Phục Hệ Thống (Snapshots & Recovery)</h2>
          <p className="admin-account-subtitle">
            Quản lý các bản sao lưu cơ sở dữ liệu toàn nền tảng, kiểm tra tính toàn vẹn checksum và thực thi khôi phục an toàn.
          </p>
        </div>

        <div className="admin-account-controls">
          <button className="btn-create-backup" onClick={() => setIsCreateModalOpen(true)}>
            + Tạo Bản Sao Lưu Mới
          </button>
        </div>
      </div>

      {/* Live Job Progress Panel */}
      {jobs.length > 0 && (
        <div className="admin-jobs-panel">
          <div className="admin-jobs-panel-header">
            <h4 className="admin-jobs-title">Tiến Trình Công Việc Chạy Ngầm (Background Jobs)</h4>
            <span className="jobs-count-tag">{jobs.length} tác vụ</span>
          </div>

          <div className="admin-jobs-list">
            {jobs.map((job) => (
              <div key={job.id} className={`admin-job-card ${job.status.toLowerCase()}`}>
                <div className="job-card-top">
                  <div>
                    <span className="job-id-text">{job.id}</span>
                    <strong className="job-type-text">
                      {job.type === 'BACKUP_CREATE' ? 'Tạo bản sao lưu Snapshot' : 'Khôi phục dữ liệu hệ thống'}
                    </strong>
                    <span className="job-scope-pill">Phạm vi: {job.scope}</span>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span className={`status-badge ${job.status === 'SUCCEEDED' ? 'status-approved' : job.status === 'RUNNING' ? 'status-pending' : 'status-rejected'}`}>
                      {job.status === 'RUNNING' ? 'Đang thực thi' : job.status === 'SUCCEEDED' ? 'Hoàn tất' : 'Thất bại'}
                    </span>
                    <div className="job-time-sub">Bắt đầu: {job.started_at}</div>
                  </div>
                </div>

                <div className="job-progress-wrapper">
                  <div className="job-progress-bar" style={{ width: `${job.progress_percent}%` }} />
                </div>
                <div className="job-progress-percent">{job.progress_percent}%</div>

                {job.logs && job.logs.length > 0 && (
                  <div className="job-logs-box">
                    {job.logs.map((log, idx) => (
                      <div key={idx} className="job-log-line">› {log}</div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Snapshots Table */}
      <div className="admin-table-card">
        <div className="admin-table-card-header">
          <h3 className="admin-card-header-title">Danh Sách Bản Sao Lưu Snapshot Hệ Thống</h3>
          <span className="admin-card-header-sub">
            Tất cả bản sao lưu được mã hóa AES-256 an toàn và kiểm tra tính toàn vẹn (Integrity Check) trước khi khôi phục.
          </span>
        </div>

        <table className="admin-table">
          <thead>
            <tr>
              <th>Mã Snapshot</th>
              <th>Tên Tệp Sao Lưu</th>
              <th>Phạm Vi</th>
              <th>Dung Lượng</th>
              <th>Số Bảng / Bản Ghi</th>
              <th>Tính Toàn Vẹn</th>
              <th>Thời Gian Tạo</th>
              <th style={{ textAlign: 'right' }}>Khôi Phục</th>
            </tr>
          </thead>
          <tbody>
            {snapshots.map((snp) => (
              <tr key={snp.id} className="admin-table-row">
                <td>
                  <span className="admin-code-tag">{snp.id}</span>
                </td>
                <td>
                  <div className="admin-strong-text" style={{ fontSize: 13, fontFamily: 'monospace' }}>{snp.file_name}</div>
                  <div className="admin-sub-info">Tạo bởi: {snp.created_by}</div>
                </td>
                <td>
                  <span className={`scope-pill ${snp.scope.toLowerCase()}`}>
                    {snp.scope === 'FULL_PLATFORM' ? 'Toàn nền tảng' : snp.family_name || 'Dòng họ'}
                  </span>
                </td>
                <td>
                  <strong>{(snp.size_mb / 1024).toFixed(2)} GB</strong>
                </td>
                <td>
                  <div style={{ fontSize: 13 }}>{snp.tables_count} bảng</div>
                  <div className="admin-sub-info">~{snp.records_count.toLocaleString('vi-VN')} dòng</div>
                </td>
                <td>
                  <span className="integrity-tag valid">✓ Checksum Hợp Lệ</span>
                </td>
                <td>{snp.created_at}</td>
                <td style={{ textAlign: 'right' }}>
                  <button
                    className="btn-action-restore"
                    onClick={() => handleOpenRestore(snp)}
                  >
                    ↺ Khôi Phục
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create Backup Modal */}
      {isCreateModalOpen && (
        <div className="admin-modal-backdrop" onClick={() => setIsCreateModalOpen(false)}>
          <div className="admin-modal-card modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <div>
                <span className="admin-modal-tag">KHỞI TẠO BẢN SAO LƯU</span>
                <h3 className="admin-modal-title">Tạo Snapshot Hệ Thống Mới</h3>
              </div>
              <button className="admin-modal-close" onClick={() => setIsCreateModalOpen(false)}>×</button>
            </div>

            <form onSubmit={handleStartBackup}>
              <div className="admin-modal-body">
                <div className="form-group">
                  <label className="form-label required">Phạm vi sao lưu:</label>
                  <select
                    className="admin-search-input-field"
                    value={newScope}
                    onChange={(e) => setNewScope(e.target.value as any)}
                  >
                    <option value="FULL_PLATFORM">Toàn bộ nền tảng (Toàn bộ CSDL và không gian các dòng họ)</option>
                    <option value="SINGLE_FAMILY">Chỉ sao lưu dòng họ cụ thể</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Ghi chú mục đích sao lưu:</label>
                  <input
                    type="text"
                    className="admin-search-input-field"
                    placeholder="Ví dụ: Sao lưu định kỳ trước bảo trì nâng cấp hệ thống..."
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                  />
                </div>

                <div className="admin-backup-tip-box">
                  💡 <strong>Thông tin kỹ thuật:</strong> Quá trình snapshot được thực hiện ở chế độ Non-blocking read lock. Người dùng vẫn xem dữ liệu bình thường mà không bị gián đoạn.
                </div>
              </div>

              <div className="admin-modal-footer">
                <button type="button" className="btn-modal-cancel" onClick={() => setIsCreateModalOpen(false)}>
                  Hủy bỏ
                </button>
                <button type="submit" className="btn-modal-approve">
                  Bắt Đầu Tiến Trình Sao Lưu
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Restore Preview & Confirmation Dialog */}
      {isRestoreModalOpen && selectedSnapshot && (
        <div className="admin-modal-backdrop" onClick={() => setIsRestoreModalOpen(false)}>
          <div className="admin-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <div>
                <span className="admin-modal-tag tag-danger">CẢNH BÁO PHỤC HỒI DỮ LIỆU</span>
                <h3 className="admin-modal-title">Xác Nhận Khôi Phục Dữ Liệu</h3>
              </div>
              <button className="admin-modal-close" onClick={() => setIsRestoreModalOpen(false)}>×</button>
            </div>

            <div className="admin-modal-body">
              <div className="admin-restore-alert-box">
                <strong>Cảnh báo rủi ro ghi đè dữ liệu:</strong>
                <p>
                  Khôi phục hệ thống từ bản snapshot <strong>{selectedSnapshot.id}</strong> (Tạo lúc {selectedSnapshot.created_at}) sẽ đưa toàn bộ dữ liệu trở về thời điểm đó.
                  Mọi thay đổi được tạo sau thời điểm này có thể sẽ bị ghi đè.
                </p>
              </div>

              <div className="admin-dossier-grid">
                <div>
                  <label>Mã tệp sao lưu:</label>
                  <strong className="admin-strong-text">{selectedSnapshot.file_name}</strong>
                </div>
                <div>
                  <label>Dung lượng & Quy mô:</label>
                  <strong className="admin-strong-text">{(selectedSnapshot.size_mb / 1024).toFixed(2)} GB ({selectedSnapshot.records_count} bản ghi)</strong>
                </div>
              </div>

              <div className="admin-integrity-check-box">
                <span className="check-icon">✓</span>
                <div>
                  <strong>Tính toàn vẹn (Integrity Check): ĐẠT CHUẨN</strong>
                  <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#64748b' }}>
                    SHA-256: {selectedSnapshot.checksum_sha256}
                  </div>
                </div>
              </div>

              <div className="admin-verification-check-card" style={{ marginTop: 14 }}>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={restoreConfirmChecked}
                    onChange={(e) => setRestoreConfirmChecked(e.target.checked)}
                  />
                  <span>
                    Tôi hiểu rõ hệ quả ghi đè dữ liệu và xác nhận tiến hành khôi phục hệ thống từ bản sao lưu này.
                  </span>
                </label>
              </div>
            </div>

            <div className="admin-modal-footer">
              <button className="btn-modal-cancel" onClick={() => setIsRestoreModalOpen(false)}>
                Hủy bỏ
              </button>
              <button
                className="btn-modal-reject-confirm"
                style={{ background: '#b91c1c' }}
                disabled={!restoreConfirmChecked}
                onClick={handleConfirmRestore}
              >
                Xác Nhận & Bắt Đầu Khôi Phục (Restore)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDataBackupMgmt;
