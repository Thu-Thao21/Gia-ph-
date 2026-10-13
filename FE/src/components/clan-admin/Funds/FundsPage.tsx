import './FundsPage.css';
import React, { useState } from 'react';
import PageHeader from '../../../shared/Layout/PageHeader';
import DataTable, { type Column } from '../../../shared/DataTable/DataTable';

interface FundTransaction {
  id: string;
  type: 'in' | 'out';
  amount: number;
  description: string;
  date: string;
  personName: string;
}

export const FundsPage: React.FC = () => {
  const [search, setSearch] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  
  const data: FundTransaction[] = [];

  const columns: Column<FundTransaction>[] = [
    { key: 'date', header: 'Ngày', render: (item) => item.date },
    { key: 'description', header: 'Nội dung', render: (item) => <span className="fund-desc-col">{item.description}</span> },
    { key: 'personName', header: 'Người thực hiện / Đóng góp', render: (item) => item.personName },
    { key: 'amount', header: 'Số tiền', render: (item) => (
      <span className={`fund-amount-text ${item.type === 'in' ? 'amount-in' : 'amount-out'}`}>
        {item.type === 'in' ? '+' : '-'}{item.amount.toLocaleString()} đ
      </span>
    )},
  ];

  const headerActions = (
    <div className="fund-header-actions">
      <button className="admin-btn-secondary">
        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
        Xuất Báo cáo
      </button>
      <button className="admin-btn-primary" onClick={() => setIsAddModalOpen(true)}>
        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        Thêm Giao dịch
      </button>
    </div>
  );

  return (
    <div className="admin-account-container">
      
      <div className="admin-account-header">
        <div>
          <h2 className="admin-account-title">Quản lý Quỹ dòng họ</h2>
          <p className="admin-account-subtitle">Kiểm soát thu chi, đóng góp tự nguyện và lập báo cáo tài chính minh bạch.</p>
        </div>
        <div className="admin-account-controls">
          {headerActions}
        </div>
      </div>

      <div className="fund-page-content">
        <div className="fund-stats-grid">
          <div className="fund-stat-card">
            <div className="fund-stat-info">
              <p className="fund-stat-title">Tổng Quỹ Khuyến học</p>
              <h3 className="fund-stat-amount">0 đ</h3>
              <p className="fund-stat-trend">Chưa có dữ liệu</p>
            </div>
            <div className="fund-stat-icon">
              <svg width="120" height="120" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.31-8.86c-1.77-.45-2.34-.94-2.34-1.67 0-.84.79-1.43 2.1-1.43 1.38 0 1.9.66 1.94 1.64h1.71c-.05-1.34-.87-2.57-2.49-2.97V5H10.9v1.69c-1.51.32-2.72 1.3-2.72 2.81 0 1.79 1.49 2.69 3.66 3.21 1.95.46 2.34 1.15 2.34 1.87 0 .53-.39 1.64-2.25 1.64-1.74 0-2.1-.96-2.17-1.92H8c.11 1.71 1.31 2.86 2.9 3.22V19h2.33v-1.64c1.72-.3 2.87-1.35 2.87-2.92-.01-1.79-1.5-2.7-3.79-3.3z"></path></svg>
            </div>
          </div>
          <div className="fund-stat-card">
            <div className="fund-stat-info">
              <p className="fund-stat-title">Tổng Quỹ Xây dựng</p>
              <h3 className="fund-stat-amount">0 đ</h3>
              <p className="fund-stat-trend">Chưa có dữ liệu</p>
            </div>
            <div className="fund-stat-icon">
              <svg width="120" height="120" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2L2 22h20L12 2zm0 3.84L18.4 19H5.6L12 5.84zM11 10h2v5h-2zm0 6h2v2h-2z"></path></svg>
            </div>
          </div>
          <div className="fund-stat-card">
            <div className="fund-stat-info">
              <p className="fund-stat-title">Tổng Chi (Tháng này)</p>
              <h3 className="fund-stat-amount">0 đ</h3>
              <p className="fund-stat-trend">Chưa có dữ liệu</p>
            </div>
            <div className="fund-stat-icon">
              <svg width="120" height="120" fill="currentColor" viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-2 10h-4v4h-2v-4H7v-2h4V7h2v4h4v2z"></path></svg>
            </div>
          </div>
        </div>

        {/* Mock Chart Section */}
        <div className="fund-dashboard-main">
          <div className="flex-1">
            <h4 className="fund-chart-title">Biểu đồ Thu/Chi 6 tháng gần nhất</h4>
            <div className="fund-chart-container">
              <div className="fund-chart-y-axis">10M</div>
              <div className="fund-chart-y-axis">20M</div>
              <div className="fund-chart-y-axis">30M</div>

              {/* T4 */}
              <div className="fund-chart-column flex-1 flex justify-center gap-1 group relative flex-1 flex justify-center gap-1 group relative flex-1 flex justify-center gap-1 group relative flex-1 flex justify-center gap-1 group relative flex-1 flex justify-center gap-1 group relative flex-1 flex justify-center gap-1 group relative">
                <div className="fund-chart-bar-in"></div>
                <div className="fund-chart-bar-out"></div>
                <div className="fund-chart-x-axis">T4</div>
              </div>
              {/* T5 */}
              <div className="fund-chart-column flex-1 flex justify-center gap-1 group relative flex-1 flex justify-center gap-1 group relative flex-1 flex justify-center gap-1 group relative flex-1 flex justify-center gap-1 group relative flex-1 flex justify-center gap-1 group relative flex-1 flex justify-center gap-1 group relative">
                <div className="fund-chart-bar-in"></div>
                <div className="fund-chart-bar-out"></div>
                <div className="fund-chart-x-axis">T5</div>
              </div>
              {/* T6 */}
              <div className="fund-chart-column flex-1 flex justify-center gap-1 group relative flex-1 flex justify-center gap-1 group relative flex-1 flex justify-center gap-1 group relative flex-1 flex justify-center gap-1 group relative flex-1 flex justify-center gap-1 group relative flex-1 flex justify-center gap-1 group relative">
                <div className="fund-chart-bar-in"></div>
                <div className="fund-chart-bar-out"></div>
                <div className="fund-chart-x-axis">T6</div>
              </div>
              {/* T7 */}
              <div className="fund-chart-column flex-1 flex justify-center gap-1 group relative flex-1 flex justify-center gap-1 group relative flex-1 flex justify-center gap-1 group relative flex-1 flex justify-center gap-1 group relative flex-1 flex justify-center gap-1 group relative flex-1 flex justify-center gap-1 group relative">
                <div className="fund-chart-bar-in"></div>
                <div className="fund-chart-bar-out"></div>
                <div className="fund-chart-x-axis">T7</div>
              </div>
              {/* T8 */}
              <div className="fund-chart-column flex-1 flex justify-center gap-1 group relative flex-1 flex justify-center gap-1 group relative flex-1 flex justify-center gap-1 group relative flex-1 flex justify-center gap-1 group relative flex-1 flex justify-center gap-1 group relative flex-1 flex justify-center gap-1 group relative">
                <div className="fund-chart-bar-in"></div>
                <div className="fund-chart-bar-out"></div>
                <div className="fund-chart-x-axis">T8</div>
              </div>
              {/* T9 */}
              <div className="fund-chart-column flex-1 flex justify-center gap-1 group relative flex-1 flex justify-center gap-1 group relative flex-1 flex justify-center gap-1 group relative flex-1 flex justify-center gap-1 group relative flex-1 flex justify-center gap-1 group relative flex-1 flex justify-center gap-1 group relative">
                <div className="fund-chart-bar-in"></div>
                <div className="fund-chart-bar-out"></div>
                <div className="fund-chart-x-axis">T9</div>
              </div>
            </div>
            <div className="fund-chart-legend">
              <div className="fund-chart-legend-item"><div className="fund-chart-legend-color-in"></div><span className="fund-chart-legend-text">Thu</span></div>
              <div className="fund-chart-legend-item"><div className="fund-chart-legend-color-out"></div><span className="fund-chart-legend-text">Chi</span></div>
            </div>
          </div>
          
          <div className="fund-pending-list">
            <h4 className="fund-pending-title">Giao dịch chờ duyệt</h4>
            <div className="space-y-3">
              <div className="fund-pending-empty text-gray-500 text-sm">
                Không có giao dịch nào đang chờ duyệt.
              </div>
            </div>
          </div>
        </div>
        
        <div className="fund-filter-bar">
          <input 
            type="text" 
            placeholder="Tìm kiếm giao dịch..." 
            className="fund-search-input form-input-admin flex-1"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select className="fund-filter-select form-input-admin w-48 form-input-admin w-48">
            <option value="">Tất cả quỹ</option>
            <option value="1">Quỹ Khuyến học</option>
            <option value="2">Quỹ Xây dựng</option>
          </select>
          <select className="fund-filter-select form-input-admin w-48 form-input-admin w-48">
            <option value="">Tất cả loại giao dịch</option>
            <option value="in">Thu / Đóng góp</option>
            <option value="out">Chi</option>
          </select>
        </div>

        <div className="fund-table-container">
          <DataTable columns={columns} data={data} keyExtractor={(item) => item.id} emptyMessage="Chưa có giao dịch quỹ nào." />
        </div>
      </div>

      {/* Add Transaction Modal */}
      {isAddModalOpen && (
        <div className="fund-modal-overlay">
          <div className="fund-modal-backdrop" onClick={() => setIsAddModalOpen(false)}></div>
          <div className="fund-modal-content relative bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-fade-in">
            <div className="fund-modal-header">
              <h3 className="fund-modal-title">Ghi nhận Giao dịch Quỹ</h3>
              <button className="fund-modal-close-btn" onClick={() => setIsAddModalOpen(false)}>✕</button>
            </div>
            <div className="fund-modal-body">
              <div className="fund-modal-grid-2">
                <div>
                  <label className="fund-modal-label">Loại giao dịch <span className="text-red-500">*</span></label>
                  <select className="fund-modal-select form-input-admin w-full form-input-admin w-full">
                    <option value="in">Thu / Đóng góp (+)</option>
                    <option value="out">Chi / Tiêu dùng (-)</option>
                  </select>
                </div>
                <div>
                  <label className="fund-modal-label">Số tiền (VNĐ) <span className="text-red-500">*</span></label>
                  <input type="number" className="fund-modal-input-number form-input-admin w-full" placeholder="VD: 500000" />
                </div>
              </div>
              
              <div>
                <label className="fund-modal-label">Thuộc quỹ <span className="text-red-500">*</span></label>
                <select className="fund-modal-select form-input-admin w-full form-input-admin w-full">
                  <option value="1">Quỹ Khuyến học</option>
                  <option value="2">Quỹ Xây dựng</option>
                  <option value="3">Quỹ Chung</option>
                </select>
              </div>

              <div>
                <label className="fund-modal-label">Nội dung chi tiết <span className="text-red-500">*</span></label>
                <input type="text" className="fund-modal-input-text form-input-admin w-full" placeholder="Ví dụ: Đóng góp quỹ khuyến học năm 2026..." />
              </div>
              
              <div>
                <label className="fund-modal-label">Người thực hiện / Người đóng góp</label>
                <div className="fund-modal-search-group">
                  <input type="text" className="fund-modal-search-input form-input-admin flex-1" placeholder="Tên hoặc ID thành viên..." />
                  <button className="admin-btn-secondary">Tìm kiếm</button>
                </div>
              </div>

              <div>
                <label className="fund-modal-label">Minh chứng (Hình ảnh/Hoá đơn)</label>
                <input type="file" className="fund-modal-input-file" />
              </div>
            </div>
            <div className="fund-modal-footer">
              <button className="admin-btn-secondary" onClick={() => setIsAddModalOpen(false)}>Huỷ</button>
              <button className="admin-btn-primary" onClick={() => { alert('Ghi nhận giao dịch thành công!'); setIsAddModalOpen(false); }}>Lưu giao dịch</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FundsPage;
