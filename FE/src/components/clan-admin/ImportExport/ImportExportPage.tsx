import './ImportExportPage.css';
import React, { useState } from 'react';
import PageHeader from '../../../shared/Layout/PageHeader';

export const ImportExportPage: React.FC = () => {
  const [importStep, setImportStep] = useState<0 | 1 | 2 | 3 | 4>(0); // 0 = default

  return (
    <div className="admin-account-container">
      
      <div className="admin-account-header">
        <div>
          <h2 className="admin-account-title">Nhập / Xuất dữ liệu</h2>
          <p className="admin-account-subtitle">Quản lý việc đưa dữ liệu hàng loạt từ file Excel vào hệ thống hoặc xuất dữ liệu ra file.</p>
        </div>
      </div>
      
      {importStep === 0 ? (
        <div className="ie-grid-container">
          {/* Import Card */}
          <div className="ie-card-import">
            <div className="ie-card-icon-wrap">
              <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path></svg>
            </div>
            <h3 className="ie-card-title">Nhập dữ liệu (Import Excel)</h3>
            <p className="ie-card-desc">Tải lên file Excel theo mẫu chuẩn để tự động tạo cây gia phả và hồ sơ hàng loạt.</p>
            
            <button 
              className="ie-btn-start w-full admin-btn-primary bg-blue-600 hover:bg-blue-700 border-none justify-center py-3 text-base"
              onClick={() => setImportStep(1)}
            >
              Bắt đầu Nhập dữ liệu
            </button>
            <div className="ie-link-wrap">
              <button className="ie-link-download">Tải file mẫu (Template)</button>
            </div>
          </div>

          {/* Export Card */}
          <div className="ie-card-export">
            <div className="ie-card-icon-wrap">
              <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
            </div>
            <h3 className="ie-card-title">Xuất dữ liệu (Export)</h3>
            <p className="ie-card-desc">Trích xuất dữ liệu thành viên, gia phả, quỹ ra định dạng Excel hoặc PDF để lưu trữ.</p>
            
            <div className="ie-btn-group">
              <button className="ie-btn-export admin-btn-secondary w-full justify-center py-2.5 admin-btn-secondary w-full justify-center py-2.5 admin-btn-primary w-full justify-center bg-slate-800 hover:bg-slate-900 border-none py-2.5">Xuất Danh sách Thành viên (Excel)</button>
              <button className="ie-btn-export admin-btn-secondary w-full justify-center py-2.5 admin-btn-secondary w-full justify-center py-2.5 admin-btn-primary w-full justify-center bg-slate-800 hover:bg-slate-900 border-none py-2.5">Xuất Báo cáo Quỹ (Excel)</button>
              <button className="ie-btn-export admin-btn-secondary w-full justify-center py-2.5 admin-btn-secondary w-full justify-center py-2.5 admin-btn-primary w-full justify-center bg-slate-800 hover:bg-slate-900 border-none py-2.5">Xuất Phả đồ (PDF/Image)</button>
            </div>
          </div>
        </div>
      ) : (
        /* Import Wizard Mode */
        <div className="ie-wizard-container">
          {/* Stepper Header */}
          <div className="ie-wizard-header">
            <h2 className="ie-wizard-title">Trình hướng dẫn Nhập dữ liệu (Import Wizard)</h2>
            <button className="ie-wizard-btn-close" onClick={() => setImportStep(0)}>Hủy bỏ & Đóng ✕</button>
          </div>
          
          <div className="ie-wizard-stepper">
            <div className={`import-step-label ${importStep >= 1 ? 'step-active' : 'step-inactive'}`}>
              <span className={`import-step-circle ${importStep >= 1 ? 'circle-active' : 'circle-inactive'}`}>1</span>
              <span>Tải file lên</span>
            </div>
            <div className={`import-step-line ${importStep >= 2 ? 'line-active' : 'line-inactive'}`}></div>
            <div className={`import-step-label ${importStep >= 2 ? 'step-active' : 'step-inactive'}`}>
              <span className={`import-step-circle ${importStep >= 2 ? 'circle-active' : 'circle-inactive'}`}>2</span>
              <span>Kiểm tra lỗi</span>
            </div>
            <div className={`import-step-line ${importStep >= 3 ? 'line-active' : 'line-inactive'}`}></div>
            <div className={`import-step-label ${importStep >= 3 ? 'step-active' : 'step-inactive'}`}>
              <span className={`import-step-circle ${importStep >= 3 ? 'circle-active' : 'circle-inactive'}`}>3</span>
              <span>Xác nhận</span>
            </div>
            <div className={`import-step-line ${importStep >= 4 ? 'line-active' : 'line-inactive'}`}></div>
            <div className={`import-step-label ${importStep >= 4 ? 'step-success' : 'step-inactive'}`}>
              <span className={`import-step-circle ${importStep >= 4 ? 'circle-success' : 'circle-inactive'}`}>4</span>
              <span>Hoàn tất</span>
            </div>
          </div>

          <div className="ie-wizard-body">
            {importStep === 1 && (
              <div className="ie-step-1-content">
                <div 
                  className="ie-dropzone border-2 border-dashed border-blue-300 rounded-2xl p-16 bg-blue-50/50 hover:bg-blue-50 transition cursor-pointer group"
                  onClick={() => setImportStep(2)}
                >
                  <div className="ie-dropzone-icon border-2 border-dashed border-blue-300 rounded-2xl p-16 bg-blue-50/50 hover:bg-blue-50 transition cursor-pointer group w-20 h-20 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform">
                    <svg width="40" height="40" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                  </div>
                  <h3 className="ie-dropzone-title border-2 border-dashed border-blue-300 rounded-2xl p-16 bg-blue-50/50 hover:bg-blue-50 transition cursor-pointer group">Kéo thả file Excel vào đây</h3>
                  <p className="ie-dropzone-desc border-2 border-dashed border-blue-300 rounded-2xl p-16 bg-blue-50/50 hover:bg-blue-50 transition cursor-pointer group">hoặc click để chọn file từ máy tính của bạn</p>
                  <button className="ie-btn-select-file admin-btn-secondary pointer-events-none">Chọn file Excel</button>
                </div>
                <p className="ie-step-hint">
                  <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  Đảm bảo file được tải về từ "Tải file mẫu" để tránh lỗi format.
                </p>
              </div>
            )}

            {importStep === 2 && (
              <div className="ie-step-2-content">
                <div className="ie-error-banner">
                  <div className="ie-error-icon">!</div>
                  <div>
                    <h3 className="ie-error-title">Đã phát hiện một số lỗi trong file</h3>
                    <p className="text-slate-500">Tìm thấy <strong className="text-slate-800">45 dòng hợp lệ</strong> và <strong className="text-red-600">2 dòng bị lỗi</strong>. Vui lòng kiểm tra lại.</p>
                  </div>
                </div>

                <div className="ie-table-wrapper">
                  <table className="ie-error-table">
                    <thead className="ie-table-head">
                      <tr>
                        <th className="ie-th">Dòng</th>
                        <th className="ie-th">Họ và tên</th>
                        <th className="ie-th">Lỗi phát hiện</th>
                      </tr>
                    </thead>
                    <tbody className="ie-table-body">
                      <tr>
                        <td className="ie-td">12</td>
                        <td className="ie-td">Nguyễn Văn Lỗi</td>
                        <td className="ie-td">
                          <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                          Cột "Đời thứ" không được để trống
                        </td>
                      </tr>
                      <tr>
                        <td className="ie-td">34</td>
                        <td className="ie-td">Trần Thị Thiếu</td>
                        <td className="ie-td">
                          <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                          Cảnh báo: ID Cha mẹ không tồn tại trong hệ thống
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                
                <p className="ie-error-hint">
                  Bạn có thể chọn tiếp tục để bỏ qua các dòng lỗi (chỉ import dòng hợp lệ), hoặc Hủy để sửa file.
                </p>
              </div>
            )}

            {importStep === 3 && (
              <div className="ie-step-3-content">
                <div className="ie-ready-icon-wrap">
                  <svg width="40" height="40" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </div>
                <h3 className="ie-ready-title">Sẵn sàng Nhập 45 Hồ sơ</h3>
                <p className="ie-ready-desc">Dữ liệu sẽ được tự động đưa vào cây gia phả dựa trên các mối quan hệ được định nghĩa trong file Excel.</p>
                
                <div className="ie-summary-box">
                  <div className="ie-summary-row">
                    <span className="text-slate-500">Tổng số dòng đọc được</span>
                    <strong className="text-slate-800">47</strong>
                  </div>
                  <div className="ie-summary-row">
                    <span className="text-slate-500">Số dòng hợp lệ</span>
                    <strong className="text-green-600">45</strong>
                  </div>
                  <div className="ie-summary-row">
                    <span className="text-slate-500">Số dòng bỏ qua</span>
                    <strong className="text-red-600">2</strong>
                  </div>
                </div>

                <div className="ie-ready-hint">
                  Quá trình import có thể mất vài phút. Vui lòng không đóng trình duyệt.
                </div>
              </div>
            )}

            {importStep === 4 && (
              <div className="ie-step-4-content max-w-xl mx-auto text-center animate-fade-in">
                <div className="ie-success-icon-wrap">
                  <svg width="48" height="48" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                </div>
                <h3 className="ie-success-title">Nhập Dữ Liệu Thành Công!</h3>
                <p className="ie-success-desc">Đã thêm 45 nhân khẩu vào cây gia phả. Mối quan hệ đã được liên kết tự động.</p>
                
                <div className="ie-success-actions">
                  <button className="admin-btn-secondary" onClick={() => setImportStep(0)}>Về màn hình chính</button>
                  <button className="ie-btn-view-tree admin-btn-primary bg-blue-600 hover:bg-blue-700 border-blue-600" onClick={() => alert('Chuyển tới cây gia phả')}>Xem Cây Gia Phả</button>
                </div>
              </div>
            )}
          </div>

          {/* Stepper Footer actions */}
          {importStep > 0 && importStep < 4 && (
            <div className="ie-wizard-footer">
              <button 
                className="admin-btn-secondary" 
                onClick={() => setImportStep(importStep - 1 as any)}
                disabled={importStep === 1}
              >
                Quay lại
              </button>
              
              <button 
                className="admin-btn-primary" 
                onClick={() => setImportStep(importStep + 1 as any)}
              >
                {importStep === 3 ? 'Bắt đầu Import' : 'Tiếp tục'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ImportExportPage;
