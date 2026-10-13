import './MemorialDaysPage.css';
import React, { useState } from 'react';
import PageHeader from '../../../shared/Layout/PageHeader';
import DataTable, { type Column } from '../../../shared/DataTable/DataTable';

interface MemorialDay {
  id: string;
  name: string;
  lunarDate: string;
  solarDate: string;
  location: string;
  status: 'upcoming' | 'passed';
}

export const MemorialDaysPage: React.FC = () => {
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  
  const data: MemorialDay[] = [];

  const columns: Column<MemorialDay>[] = [
    { key: 'name', header: 'Ngày Giỗ', render: (item) => <strong className="memorial-strong-text">{item.name}</strong> },
    { key: 'lunarDate', header: 'Ngày Âm lịch', render: (item) => <span className="memorial-lunar-date">{item.lunarDate}</span> },
    { key: 'solarDate', header: 'Ngày Dương lịch (năm nay)', render: (item) => item.solarDate },
    { key: 'location', header: 'Địa điểm tổ chức', render: (item) => item.location },
    { key: 'status', header: 'Trạng thái', render: (item) => (
      <span className={`memorial-status-badge ${item.status === 'upcoming' ? 'status-upcoming' : 'status-passed'}`}>
        {item.status === 'upcoming' ? 'Sắp tới' : 'Đã qua'}
      </span>
    )},
    { key: 'actions', header: 'Thao tác', render: () => (
      <div className="memorial-actions">
        <button className="memorial-btn-edit">Sửa</button>
        <button className="memorial-btn-delete">Xoá</button>
      </div>
    )},
  ];

  const headerActions = (
    <div className="memorial-header-actions">
      <div className="memorial-view-toggle">
        <button 
          className={`memorial-view-btn ${viewMode === 'list' ? 'active' : ''}`}
          onClick={() => setViewMode('list')}
        >Danh sách</button>
        <button 
          className={`memorial-view-btn ${viewMode === 'calendar' ? 'active' : ''}`}
          onClick={() => setViewMode('calendar')}
        >Lịch biểu</button>
      </div>
      <button className="admin-btn-primary" onClick={() => setIsAddModalOpen(true)}>
        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        Thêm Ngày Giỗ
      </button>
    </div>
  );

  return (
    <div className="admin-account-container">
      
      <div className="admin-account-header">
        <div>
          <h2 className="admin-account-title">Quản lý Ngày Giỗ</h2>
          <p className="admin-account-subtitle">Quản lý danh sách ngày giỗ, lịch cúng tế và hệ thống tự động nhắc nhở.</p>
        </div>
        <div className="admin-account-controls">
          {headerActions}
        </div>
      </div>
      
      <div className="memorial-filter-bar">
        <input 
          type="text" 
          placeholder="Tìm kiếm tên..." 
          className="memorial-search-input form-input-admin flex-1"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="memorial-month-select form-input-admin w-48">
          <option value="">Tháng Âm lịch</option>
          <option value="1">Tháng 1</option>
          <option value="8">Tháng 8</option>
        </select>
      </div>

      <div className="memorial-content-wrapper">
        {viewMode === 'list' ? (
          <DataTable columns={columns} data={data} keyExtractor={(item) => item.id} emptyMessage="Chưa có thông tin ngày giỗ." />
        ) : (
          <div className="memorial-calendar-wrapper">
            {/* Calendar Mock */}
            <div className="memorial-calendar-card">
              <div className="memorial-calendar-header">
                <h3 className="memorial-calendar-title">Tháng 8 / 2026 (Âm lịch)</h3>
                <div className="memorial-calendar-nav">
                  <button className="admin-btn-secondary">Tháng trước</button>
                  <button className="admin-btn-secondary">Tháng sau</button>
                </div>
              </div>
              <div className="memorial-calendar-grid">
                {['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map(d => (
                  <div key={d} className="memorial-calendar-day-header">{d}</div>
                ))}
                {Array.from({length: 30}).map((_, i) => {
                  const day = i + 1;
                  return (
                    <div key={day} className={`memorial-calendar-day`}>
                      <span className={`memorial-calendar-date`}>{day}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Add Modal */}
      {isAddModalOpen && (
        <div className="memorial-modal-overlay">
          <div className="memorial-modal-backdrop" onClick={() => setIsAddModalOpen(false)}></div>
          <div className="memorial-modal-content relative bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-fade-in">
            <div className="memorial-modal-header">
              <h3 className="memorial-modal-title">Thêm Lịch Ngày Giỗ</h3>
              <button className="memorial-modal-close" onClick={() => setIsAddModalOpen(false)}>✕</button>
            </div>
            <div className="memorial-modal-body">
              <div>
                <label className="memorial-modal-label">Tiêu đề (Tên người được giỗ) <span className="memorial-required-star">*</span></label>
                <input type="text" className="memorial-modal-input-text form-input-admin w-full form-input-admin w-full" placeholder="Ví dụ: Giỗ Ông Nội..." />
              </div>
              <div className="memorial-modal-grid-2">
                <div>
                  <label className="memorial-modal-label">Ngày (Âm lịch) <span className="memorial-required-star">*</span></label>
                  <select className="memorial-modal-select form-input-admin w-full form-input-admin w-full">
                    {Array.from({length: 30}).map((_, i) => <option key={i+1} value={i+1}>Mùng {i+1}</option>)}
                  </select>
                </div>
                <div>
                  <label className="memorial-modal-label">Tháng (Âm lịch) <span className="memorial-required-star">*</span></label>
                  <select className="memorial-modal-select form-input-admin w-full form-input-admin w-full">
                    {Array.from({length: 12}).map((_, i) => <option key={i+1} value={i+1}>Tháng {i+1}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="memorial-modal-label">Địa điểm tổ chức</label>
                <input type="text" className="memorial-modal-input-text form-input-admin w-full form-input-admin w-full" placeholder="Ví dụ: Nhà thờ tổ Chi 1..." />
              </div>
              <div>
                <label className="memorial-modal-label">Ghi chú thêm</label>
                <textarea className="memorial-modal-textarea form-input-admin w-full" rows={3} placeholder="Người chịu trách nhiệm, vật phẩm..."></textarea>
              </div>
              <div className="memorial-modal-checkbox-group">
                <input type="checkbox" id="notify" className="memorial-modal-checkbox" defaultChecked />
                <label htmlFor="notify" className="memorial-modal-checkbox-label">Tự động gửi thông báo cho các thành viên liên quan trước 3 ngày</label>
              </div>
            </div>
            <div className="memorial-modal-footer">
              <button className="admin-btn-secondary" onClick={() => setIsAddModalOpen(false)}>Huỷ</button>
              <button className="admin-btn-primary" onClick={() => { alert('Lưu thành công!'); setIsAddModalOpen(false); }}>Lưu lịch giỗ</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MemorialDaysPage;
