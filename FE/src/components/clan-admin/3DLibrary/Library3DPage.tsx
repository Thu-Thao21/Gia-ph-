import './Library3DPage.css';
import React, { useState } from 'react';
import PageHeader from '../../../shared/Layout/PageHeader';

export const Library3DPage: React.FC = () => {
  const [selectedModel, setSelectedModel] = useState<any>(null);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);

  const libraryItems: any[] = [];

  return (
    <div className="admin-account-container">
      
      <div className="admin-account-header">
        <div>
          <h2 className="admin-account-title">Thư viện 3D / 360</h2>
          <p className="admin-account-subtitle">Quản lý và xem các mô hình 3D, ảnh chụp panorama 360 độ của từ đường, lăng mộ.</p>
        </div>
      </div>
      
      <div className="library-list-container">
        <div className="library-toolbar">
          <div className="library-filters">
            <button className="library-filter-btn-active">Tất cả (0)</button>
            <button className="library-filter-btn-inactive">Tour 360</button>
            <button className="library-filter-btn-inactive">Mô hình 3D</button>
          </div>
          <button className="admin-btn-primary" onClick={() => setIsUploadModalOpen(true)}>+ Tải lên dữ liệu mới</button>
        </div>

        <div className="library-grid">
          {libraryItems.map(item => (
            <div key={item.id} className="library-card group border border-slate-200 rounded-xl overflow-hidden group hover:shadow-lg transition bg-white flex flex-col">
              <div className="library-card-thumb border border-slate-200 rounded-xl overflow-hidden group hover:shadow-lg transition bg-white flex flex-col">
                <span className="library-card-emoji border border-slate-200 rounded-xl overflow-hidden group hover:shadow-lg transition bg-white flex flex-col text-6xl group-hover:scale-110 transition-transform duration-500">{item.thumb}</span>
                <div className="library-card-badge border border-slate-200 rounded-xl overflow-hidden group hover:shadow-lg transition bg-white flex flex-col">
                  {item.type === '360' ? 'PANORAMA 360' : 'MÔ HÌNH 3D'}
                </div>
                <div className="library-card-overlay border border-slate-200 rounded-xl overflow-hidden group hover:shadow-lg transition bg-white flex flex-col absolute inset-0 bg-slate-900/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition duration-300">
                  <button className="library-card-btn admin-btn-primary flex items-center gap-2 border border-slate-200 rounded-xl overflow-hidden group hover:shadow-lg transition bg-white flex flex-col" onClick={() => setSelectedModel(item)}>
                    <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg>
                    Xem Chi Tiết
                  </button>
                </div>
              </div>
              <div className="library-card-info border border-slate-200 rounded-xl overflow-hidden group hover:shadow-lg transition bg-white flex flex-col">
                <h3 className="library-card-title border border-slate-200 rounded-xl overflow-hidden group hover:shadow-lg transition bg-white flex flex-col">{item.title}</h3>
                <div className="library-card-meta border border-slate-200 rounded-xl overflow-hidden group hover:shadow-lg transition bg-white flex flex-col">
                  <span>📅 {item.date}</span>
                  <span>👁️ {item.views} lượt xem</span>
                </div>
              </div>
            </div>
          ))}

          <div 
            className="library-upload-card"
            onClick={() => setIsUploadModalOpen(true)}
          >
            <div className="library-upload-icon-wrapper">
              <svg width="28" height="28" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"></path></svg>
            </div>
            <p className="library-upload-title">Tải lên dữ liệu mới</p>
            <p className="library-upload-desc">Hỗ trợ định dạng: .obj, .gltf, .jpg 360</p>
          </div>
        </div>
      </div>

      {/* VR/3D Viewer Modal Mock */}
      {selectedModel && (
        <div className="library-viewer-overlay fixed inset-0 z-[60] bg-slate-900/95 backdrop-blur-sm flex flex-col animate-fade-in">
          <div className="library-viewer-header">
            <div>
              <h2 className="library-viewer-title">{selectedModel.title}</h2>
              <p className="library-viewer-subtitle">Đang xem chế độ {selectedModel.type === '360' ? 'Panorama 360 độ' : 'Mô hình 3D tương tác'}</p>
            </div>
            <div className="library-viewer-actions">
              <button className="library-viewer-btn" title="Toàn màn hình">
                <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"></path></svg>
              </button>
              <button className="library-viewer-close-btn" onClick={() => setSelectedModel(null)}>
                <svg width="28" height="28" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>
            </div>
          </div>
          
          <div className="library-viewer-body">
            {/* Viewer Mock */}
            <div className="library-viewer-bg"></div>
            
            <div className="library-viewer-content z-10 text-center animate-pulse">
              <div className="library-viewer-emoji">{selectedModel.thumb}</div>
              <p className="library-viewer-text-1">Mô phỏng không gian {selectedModel.type}</p>
              <p className="library-viewer-text-2">Sử dụng chuột để xoay và con lăn để thu phóng</p>
            </div>

            {/* Controls Mock */}
            <div className="library-viewer-controls">
              <button className="library-control-btn">↺</button>
              <button className="library-control-btn">↕</button>
              <button className="library-control-btn">↔</button>
              <div className="library-control-divider"></div>
              <button className="library-control-btn-bold">+</button>
              <button className="library-control-btn-bold">-</button>
            </div>
          </div>
        </div>
      )}

      {/* Upload Modal */}
      {isUploadModalOpen && (
        <div className="library-modal-overlay">
          <div className="library-modal-backdrop" onClick={() => setIsUploadModalOpen(false)}></div>
          <div className="library-modal-content relative bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-fade-in">
            <div className="library-modal-header">
              <h3 className="library-modal-title">Tải lên Dữ liệu 3D / 360</h3>
              <button className="library-modal-close" onClick={() => setIsUploadModalOpen(false)}>✕</button>
            </div>
            <div className="library-modal-body">
              <div>
                <label className="library-modal-label-mb2">Loại dữ liệu <span className="library-modal-required-asterisk">*</span></label>
                <div className="library-radio-group">
                  <label className="library-radio-label">
                    <input type="radio" name="dataType" defaultChecked className="library-radio-input" />
                    <span className="library-radio-text">Tour Panorama 360</span>
                  </label>
                  <label className="library-radio-label">
                    <input type="radio" name="dataType" className="library-radio-input" />
                    <span className="library-radio-text">Mô hình 3D (Object)</span>
                  </label>
                </div>
              </div>
              
              <div>
                <label className="library-modal-label-mb1">Tiêu đề hiển thị <span className="library-modal-required-asterisk-2">*</span></label>
                <input type="text" className="library-modal-input form-input-admin w-full" placeholder="Ví dụ: Lăng mộ cụ tổ..." />
              </div>

              <div>
                <label className="library-modal-label-mb1">Chọn Tệp tin (File) <span className="library-modal-required-asterisk-3">*</span></label>
                <div className="library-upload-dropzone">
                  <div className="library-upload-dropzone-icon">
                    <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path></svg>
                  </div>
                  <p className="library-upload-dropzone-text1">Kéo thả file vào đây hoặc nhấn để chọn</p>
                  <p className="library-upload-dropzone-text2">Dung lượng tối đa 100MB.</p>
                </div>
              </div>
            </div>
            <div className="library-modal-footer">
              <button className="admin-btn-secondary" onClick={() => setIsUploadModalOpen(false)}>Huỷ</button>
              <button className="admin-btn-primary" onClick={() => { alert('Bắt đầu tải lên!'); setIsUploadModalOpen(false); }}>Tải lên dữ liệu</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Library3DPage;
