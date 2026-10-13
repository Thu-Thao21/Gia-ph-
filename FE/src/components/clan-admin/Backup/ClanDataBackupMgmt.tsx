import './ClanDataBackupMgmt.css';
import React, { useState } from 'react';
import PageHeader from '../../../shared/Layout/PageHeader';
import DataTable, { type Column } from '../../../shared/DataTable/DataTable';

interface BackupRecord {
  id: string;
  fileName: string;
  size: string;
  type: 'full' | 'partial' | 'auto';
  status: 'success' | 'failed' | 'in_progress';
  date: string;
  createdBy: string;
}

export const ClanDataBackupMgmt: React.FC = () => {
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [backupProgress, setBackupProgress] = useState(0);

  const [data, setData] = useState<BackupRecord[]>([
    { id: '1', fileName: 'backup_auto_20260910.zip', size: '15.2 MB', type: 'auto', status: 'success', date: '10/09/2026 02:00', createdBy: 'Hệ thống' },
    { id: '2', fileName: 'backup_full_20260901.zip', size: '45.8 MB', type: 'full', status: 'success', date: '01/09/2026 15:30', createdBy: 'Admin' },
    { id: '3', fileName: 'backup_partial_20260815.zip', size: '5.1 MB', type: 'partial', status: 'success', date: '15/08/2026 09:15', createdBy: 'Admin' },
  ]);

  const handleStartBackup = () => {
    setIsBackingUp(true);
    setBackupProgress(0);
    
    // Mock progress
    const interval = setInterval(() => {
      setBackupProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setTimeout(() => {
            setIsBackingUp(false);
            const newBackup: BackupRecord = {
              id: Date.now().toString(),
              fileName: `backup_manual_${new Date().toISOString().split('T')[0].replace(/-/g, '')}.zip`,
              size: '46.1 MB',
              type: 'full',
              status: 'success',
              date: new Date().toLocaleString('vi-VN'),
              createdBy: 'Quản trị viên'
            };
            setData([newBackup, ...data]);
          }, 500);
          return 100;
        }
        return prev + Math.floor(Math.random() * 15) + 5;
      });
    }, 400);
  };

  const columns: Column<BackupRecord>[] = [
    { key: 'fileName', header: 'Tên File', render: (item) => <strong className="text-slate-800">{item.fileName}</strong> },
    { key: 'size', header: 'Dung lượng', render: (item) => item.size },
    { key: 'type', header: 'Loại sao lưu', render: (item) => {
      const types = { full: 'Toàn bộ', partial: 'Một phần', auto: 'Tự động' };
      return types[item.type];
    }},
    { key: 'date', header: 'Thời gian', render: (item) => item.date },
    { key: 'createdBy', header: 'Người thực hiện', render: (item) => item.createdBy },
    { key: 'status', header: 'Trạng thái', render: (item) => (
      <span className={`backup-status-badge ${item.status === 'success' ? 'status-success' : item.status === 'in_progress' ? 'status-progress' : 'status-error'}`}>
        {item.status === 'success' ? 'Thành công' : item.status === 'in_progress' ? 'Đang xử lý' : 'Thất bại'}
      </span>
    )},
    { key: 'actions', header: 'Thao tác', render: () => (
      <div className="backup-actions">
        <button className="backup-btn-download" title="Tải xuống">⬇️ Tải về</button>
        <button className="backup-btn-restore" title="Khôi phục">🔄 Phục hồi</button>
      </div>
    )},
  ];

  return (
    <div className="admin-account-container">
      
      <div className="admin-account-header">
        <div>
          <h2 className="admin-account-title">Sao Lưu & Khôi Phục Hệ Thống</h2>
          <p className="admin-account-subtitle">Bảo vệ an toàn dữ liệu gia phả bằng cách tạo bản sao lưu định kỳ và khôi phục khi cần thiết.</p>
        </div>
      </div>

      <div className="backup-container-main">
        <div className="backup-grid-cards">
          <div className="backup-card-create">
            <div className="backup-create-icon">
              <svg width="32" height="32" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2"></path></svg>
            </div>
            <h3 className="backup-create-title">Tạo Bản Sao Lưu Mới</h3>
            <p className="backup-create-desc">Tạo một bản sao lưu toàn bộ cơ sở dữ liệu hiện tại (bao gồm cây gia phả, quỹ, hình ảnh).</p>
            
            {isBackingUp ? (
              <div className="backup-progress-wrapper">
                <div className="backup-progress-text">
                  <span>Đang nén dữ liệu...</span>
                  <span>{backupProgress}%</span>
                </div>
                <div className="backup-progress-bar-bg">
                  <div className="backup-progress-bar-fill" style={{ width: `${backupProgress}%` }}></div>
                </div>
              </div>
            ) : (
              <button className="backup-btn-start admin-btn-primary px-8" onClick={handleStartBackup}>Sao Lưu Ngay</button>
            )}
          </div>

          <div className="backup-card-info">
            <h3 className="backup-info-title">Thông tin lưu trữ</h3>
            <ul className="space-y-4">
              <li className="backup-info-list-item">
                <span className="text-slate-600">Tự động sao lưu</span>
                <span className="backup-info-value-green">Đang bật (Hàng tuần)</span>
              </li>
              <li className="backup-info-list-item">
                <span className="text-slate-600">Dung lượng đã dùng</span>
                <span className="backup-info-value-text">4.2 GB / 10 GB</span>
              </li>
              <li className="backup-info-list-item">
                <span className="text-slate-600">Bản sao lưu gần nhất</span>
                <span className="backup-info-value-text">10/09/2026 02:00</span>
              </li>
              <li className="backup-info-list-item">
                <span className="text-slate-600">Tổng số bản sao lưu</span>
                <span className="backup-info-value-text">{data.length} bản</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="backup-history-card">
          <div className="backup-history-header">
            <h3 className="backup-history-title">Lịch sử Sao lưu</h3>
            <div className="backup-history-search-wrapper">
              <input type="text" placeholder="Tìm kiếm file..." className="backup-history-search-input form-input-admin text-sm py-1" />
            </div>
          </div>
          <DataTable columns={columns} data={data} keyExtractor={(item) => item.id} />
        </div>
      </div>
    </div>
  );
};

export default ClanDataBackupMgmt;
