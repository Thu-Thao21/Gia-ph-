import './EventsPage.css';
import React, { useState } from 'react';
import PageHeader from '../../../shared/Layout/PageHeader';
import DataTable, { type Column } from '../../../shared/DataTable/DataTable';

interface Event {
  id: string;
  title: string;
  date: string;
  location: string;
  attendees: number;
  status: 'planning' | 'ongoing' | 'completed';
}

export const EventsPage: React.FC = () => {
  const [search, setSearch] = useState('');
  
  const data: Event[] = [
    { id: '1', title: 'Họp mặt dòng họ thường niên 2026', date: '01/01/2026', location: 'Nhà thờ họ', attendees: 250, status: 'completed' },
    { id: '2', title: 'Lễ khánh thành cổng làng', date: '20/11/2026', location: 'Cổng làng', attendees: 100, status: 'planning' },
  ];

  const columns: Column<Event>[] = [
    { key: 'title', header: 'Tên Sự kiện', render: (item) => <strong className="text-slate-800">{item.title}</strong> },
    { key: 'date', header: 'Thời gian', render: (item) => item.date },
    { key: 'location', header: 'Địa điểm', render: (item) => item.location },
    { key: 'attendees', header: 'Người tham gia', render: (item) => `${item.attendees} người` },
    { key: 'status', header: 'Trạng thái', render: (item) => (
      <span className={`event-status-badge ${
        item.status === 'completed' ? 'status-completed' :
        item.status === 'ongoing' ? 'status-ongoing' : 'status-planning'
      }`}>
        {item.status === 'completed' ? 'Đã kết thúc' : item.status === 'ongoing' ? 'Đang diễn ra' : 'Lên kế hoạch'}
      </span>
    )},
    { key: 'actions', header: 'Thao tác', render: () => (
      <div className="event-actions">
        <button className="event-btn-edit">Sửa</button>
      </div>
    )},
  ];

  const headerActions = (
    <button className="admin-btn-primary">
      <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
      Tạo Sự kiện
    </button>
  );

  return (
    <div className="admin-account-container">
      
      <div className="admin-account-header">
        <div>
          <h2 className="admin-account-title">Quản lý Sự kiện</h2>
          <p className="admin-account-subtitle">Tạo và quản lý các sự kiện, cuộc họp họ, lễ hội và ghi nhận người tham gia.</p>
        </div>
        <div className="admin-account-controls">
          {headerActions}
        </div>
      </div>
      
      <div className="event-filter-bar">
        <input 
          type="text" 
          placeholder="Tìm kiếm sự kiện..." 
          className="event-search-input form-input-admin flex-1"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="event-status-select form-input-admin w-48">
          <option value="">Tất cả trạng thái</option>
          <option value="planning">Lên kế hoạch</option>
          <option value="completed">Đã kết thúc</option>
        </select>
      </div>

      <DataTable columns={columns} data={data} keyExtractor={(item) => item.id} emptyMessage="Chưa có sự kiện nào." />
    </div>
  );
};

export default EventsPage;
