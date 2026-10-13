import './AIPage.css';
import React, { useState } from 'react';
import PageHeader from '../../../shared/Layout/PageHeader';
import DataTable, { type Column } from '../../../shared/DataTable/DataTable';

interface AISuggestion {
  id: string;
  type: 'relationship' | 'correction' | 'duplicate';
  description: string;
  confidence: number;
  date: string;
  status: 'pending' | 'approved' | 'rejected';
}

export const AIPage: React.FC = () => {
  const [search, setSearch] = useState('');
  const [selectedAIReq, setSelectedAIReq] = useState<AISuggestion | null>(null);
  
  const data: AISuggestion[] = [
    { id: '1', type: 'duplicate', description: 'Có thể Nguyễn Văn A và Nguyễn Văn Â là cùng 1 người', confidence: 95, date: '11/09/2026', status: 'pending' },
    { id: '2', type: 'relationship', description: 'Dữ liệu cho thấy Trần Thị B có khả năng là vợ của Nguyễn Văn C', confidence: 82, date: '10/09/2026', status: 'pending' },
  ];

  const columns: Column<AISuggestion>[] = [
    { key: 'type', header: 'Loại phân tích', render: (item) => (
      <span className="ai-badge-type">{item.type}</span>
    )},
    { key: 'description', header: 'Gợi ý từ AI', render: (item) => item.description },
    { key: 'confidence', header: 'Độ tin cậy', render: (item) => (
      <div className="ai-confidence-wrapper">
        <div className="ai-confidence-bar-bg">
          <div className="ai-confidence-bar-fill" style={{ width: `${item.confidence}%` }}></div>
        </div>
        <span className="ai-confidence-text">{item.confidence}%</span>
      </div>
    )},
    { key: 'date', header: 'Ngày tạo', render: (item) => item.date },
    { key: 'actions', header: 'Thao tác', render: (item) => (
      <div className="ai-action-wrapper">
        <button 
          className="ai-review-btn"
          onClick={() => setSelectedAIReq(item)}
        >
          Review & Quyết định
        </button>
      </div>
    )},
  ];

  const headerActions = (
    <button className="ai-header-btn admin-btn-primary">
      <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
      Chạy AI Quét dữ liệu
    </button>
  );

  return (
    <div className="admin-account-container">
      
      <div className="admin-account-header">
        <div>
          <h2 className="admin-account-title">AI Phân tích & Gợi ý</h2>
          <p className="admin-account-subtitle">Hệ thống AI thông minh giúp tự động phát hiện mâu thuẫn, gợi ý ghép nối người trùng lặp.</p>
        </div>
        <div className="admin-account-controls">
          {headerActions}
        </div>
      </div>
      
      <div className="ai-filter-bar">
        <input 
          type="text" 
          placeholder="Tìm kiếm nội dung gợi ý..." 
          className="ai-search-input form-input-admin flex-1"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="ai-filter-select form-input-admin w-48">
          <option value="">Tất cả loại phân tích</option>
          <option value="duplicate">Trùng lặp</option>
          <option value="relationship">Quan hệ</option>
        </select>
      </div>

      <div className="ai-table-container">
        <DataTable columns={columns} data={data} keyExtractor={(item) => item.id} emptyMessage="Tuyệt vời! Dữ liệu của bạn rất chuẩn xác, AI chưa tìm thấy lỗi nào." />
      </div>

      {/* AI Review Modal */}
      {selectedAIReq && (
        <div className="ai-modal-overlay">
          <div className="ai-modal-backdrop" onClick={() => setSelectedAIReq(null)}></div>
          
          <div className="ai-modal-content">
            <div className="ai-modal-header">
              <div className="ai-modal-header-left">
                <div className="ai-modal-icon-wrapper">
                  <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
                </div>
                <div>
                  <h2 className="ai-modal-title">Review Gợi ý AI</h2>
                  <p className="ai-modal-subtitle">Độ tin cậy: <strong className="ai-confidence-percent">{selectedAIReq.confidence}%</strong></p>
                </div>
              </div>
              <button 
                className="ai-modal-close-btn"
                onClick={() => setSelectedAIReq(null)}
              >
                ✕
              </button>
            </div>

            <div className="ai-modal-body">
              <p className="ai-suggestion-desc">{selectedAIReq.description}</p>
              
              <div className="ai-compare-card">
                <div className="ai-compare-grid">
                  <div className="ai-profile-card-left">
                    <h3 className="ai-profile-title">Hồ sơ 1</h3>
                    <div className="ai-profile-details-left">
                      <div>
                        <p className="ai-profile-label">Họ và tên</p>
                        <p className="ai-profile-value">Nguyễn Văn A</p>
                      </div>
                      <div>
                        <p className="ai-profile-label">Ngày sinh</p>
                        <p className="ai-profile-value">01/01/1980</p>
                      </div>
                      <div>
                        <p className="ai-profile-label">Nhánh/Đời</p>
                        <p className="ai-profile-value">Chi Trưởng • Đời 15</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="ai-profile-card-right">
                    <h3 className="ai-profile-title">Hồ sơ 2</h3>
                    <div className="ai-profile-details-right">
                      <div>
                        <p className="ai-profile-label">Họ và tên</p>
                        <p className="ai-profile-value-warn">Nguyễn Văn Â</p>
                      </div>
                      <div>
                        <p className="ai-profile-label">Ngày sinh</p>
                        <p className="ai-profile-value">01/01/1980</p>
                      </div>
                      <div>
                        <p className="ai-profile-label">Nhánh/Đời</p>
                        <p className="ai-profile-value-warn">Không xác định</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="ai-explanation-box">
                <strong>Giải thích AI:</strong> Tên gọi có phát âm tương tự (Â và A), ngày sinh trùng khớp hoàn toàn, cả hai đều có chung cha là Nguyễn Văn Cha. Khả năng cao đây là lỗi nhập liệu đánh máy 2 lần.
              </div>
            </div>

            <div className="ai-modal-footer">
              <button className="ai-btn-ignore admin-btn-secondary border-blue-200 text-red-600 hover:bg-red-50" onClick={() => {
                alert('Đã bỏ qua gợi ý');
                setSelectedAIReq(null);
              }}>Bỏ qua (AI Sai)</button>
              <button className="ai-btn-merge admin-btn-primary bg-purple-600 border-blue-600 hover:bg-purple-700" onClick={() => {
                alert('Đã áp dụng và gộp dữ liệu');
                setSelectedAIReq(null);
              }}>Áp dụng Gợi ý (Merge)</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AIPage;
