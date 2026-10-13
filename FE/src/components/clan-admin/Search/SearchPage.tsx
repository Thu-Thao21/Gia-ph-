import './SearchPage.css';
import React, { useState } from 'react';
import PageHeader from '../../../shared/Layout/PageHeader';

export const SearchPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'finder' | 'path'>('finder');
  const [showResult, setShowResult] = useState(false);
  const [isCalculating, setIsCalculating] = useState(false);
  
  const [showPathResult, setShowPathResult] = useState(false);
  const [isCalculatingPath, setIsCalculatingPath] = useState(false);

  const handleAnalyze = () => {
    setIsCalculating(true);
    setShowResult(false);
    setTimeout(() => {
      setIsCalculating(false);
      setShowResult(true);
    }, 800);
  };

  const handleFindPath = () => {
    setIsCalculatingPath(true);
    setShowPathResult(false);
    setTimeout(() => {
      setIsCalculatingPath(false);
      setShowPathResult(true);
    }, 1000);
  };

  return (
    <div className="admin-account-container">
      
      <div className="admin-account-header">
        <div>
          <h2 className="admin-account-title">Tra cứu & Xưng hô</h2>
          <p className="admin-account-subtitle">Xác định quan hệ giữa hai người, tìm đường quan hệ và tính toán cách xưng hô tự động.</p>
        </div>
      </div>
      
      <div className="search-page-content">
        {/* Tabs */}
        <div className="search-tabs">
          <button 
            className={`search-tab-btn ${activeTab === 'finder' ? 'tab-active' : 'tab-inactive'}`}
            onClick={() => setActiveTab('finder')}
          >
            Tính Quan hệ / Xưng hô
          </button>
          <button 
            className={`search-tab-btn ${activeTab === 'path' ? 'tab-active' : 'tab-inactive'}`}
            onClick={() => setActiveTab('path')}
          >
            Tìm đường đi quan hệ
          </button>
        </div>

        {/* Tab Content */}
        <div className="search-tab-content">
          {activeTab === 'finder' && (
            <div className="search-finder-container">
              <div className="search-finder-inputs">
                <div className="search-finder-person">
                  <label className="search-finder-label">Người thứ nhất (A)</label>
                  <input type="text" placeholder="Nhập tên hoặc ID..." defaultValue="Nguyễn Văn A" className="search-finder-input form-input-admin w-full p-3 bg-white form-input-admin w-full p-3 bg-white" />
                </div>
                
                <div className="search-finder-icon">
                  <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"></path></svg>
                </div>

                <div className="search-finder-person">
                  <label className="search-finder-label">Người thứ hai (B)</label>
                  <input type="text" placeholder="Nhập tên hoặc ID..." defaultValue="Nguyễn Văn B" className="search-finder-input form-input-admin w-full p-3 bg-white form-input-admin w-full p-3 bg-white" />
                </div>
              </div>

              <div className="search-finder-actions">
                <button 
                  className="search-btn-analyze admin-btn-primary px-8 py-3 text-lg" 
                  onClick={handleAnalyze}
                  disabled={isCalculating}
                >
                  {isCalculating ? 'Đang phân tích dữ liệu...' : 'Phân tích Xưng hô'}
                </button>
              </div>

              {showResult && (
                <div className="search-result-container mt-12 p-8 bg-blue-50 border border-blue-200 rounded-xl text-center shadow-sm animate-fade-in">
                  <h3 className="search-result-title">Kết quả phân tích</h3>
                  <div className="search-result-grid">
                    <div className="search-result-card">
                      <div className="search-result-label">A gọi B là</div>
                      <div className="search-result-value">Chú họ</div>
                    </div>
                    <div className="search-result-card">
                      <div className="search-result-label">B gọi A là</div>
                      <div className="search-result-value">Cháu họ</div>
                    </div>
                  </div>
                  <p className="search-result-meta">Khoảng cách: 2 đời (Tính từ Cụ Cố chung)</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'path' && (
            <div className="search-path-container">
              <div className="search-path-inputs">
                <input type="text" placeholder="Người A..." defaultValue="Nguyễn Văn A" className="search-path-input form-input-admin flex-1 form-input-admin flex-1" />
                <input type="text" placeholder="Người B..." defaultValue="Nguyễn Văn B" className="search-path-input form-input-admin flex-1 form-input-admin flex-1" />
                <button className="admin-btn-primary" onClick={handleFindPath} disabled={isCalculatingPath}>
                  {isCalculatingPath ? 'Đang tìm...' : 'Tìm đường'}
                </button>
              </div>

              {!showPathResult && !isCalculatingPath && (
                <div className="search-path-empty">
                  <div className="search-path-empty-icon">
                    <svg width="32" height="32" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"></path></svg>
                  </div>
                  <h3 className="search-path-empty-title">Biểu đồ đường đi</h3>
                  <p className="text-slate-500">Nhập hai người dùng để vẽ biểu đồ cây liên kết trực tiếp giữa họ.</p>
                </div>
              )}

              {showPathResult && (
                <div className="search-path-result animate-fade-in text-center p-8 border border-slate-200 rounded-xl bg-slate-50">
                  <h4 className="search-path-result-title animate-fade-in text-center p-8 border border-slate-200 rounded-xl bg-slate-50">Tổ tiên chung gần nhất: Nguyễn Trọng X</h4>
                  <div className="search-path-tree">
                    {/* Node Cụ chung */}
                    <div className="search-path-root">
                      Nguyễn Trọng X (Cụ chung)
                    </div>
                    
                    {/* Paths */}
                    <div className="search-path-branches">
                      {/* Left Path */}
                      <div className="search-path-branch">
                        <div className="search-path-line-h"></div>
                        <div className="search-path-line-v"></div>
                        
                        <div className="search-path-node">Ông Nguyễn Trọng Y</div>
                        <div className="search-path-line-v"></div>
                        <div className="search-path-node">Ông Nguyễn Văn Z</div>
                        <div className="search-path-line-v"></div>
                        <div className="search-path-node-leaf">Nguyễn Văn A</div>
                      </div>

                      {/* Right Path */}
                      <div className="search-path-branch">
                        <div className="search-path-line-h"></div>
                        <div className="search-path-line-v"></div>

                        <div className="search-path-node">Ông Nguyễn Văn W</div>
                        <div className="search-path-line-v"></div>
                        <div className="search-path-node-leaf">Nguyễn Văn B</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SearchPage;
