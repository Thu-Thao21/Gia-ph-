import './BusinessPage.css';
import React, { useState } from 'react';
import PageHeader from '../../../shared/Layout/PageHeader';

export const BusinessPage: React.FC = () => {
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferStep, setTransferStep] = useState(1);

  return (
    <div className="admin-account-container">
      
      <div className="admin-account-header">
        <div>
          <h2 className="admin-account-title">Quản lý Business & Gói Dịch vụ</h2>
          <p className="admin-account-subtitle">Quản lý dung lượng, giới hạn thành viên, gia hạn gói và chuyển giao quyền Trưởng tộc.</p>
        </div>
      </div>
      
      <div className="business-container-main">
        {/* Package Info */}
        <div className="business-package-card">
          <div className="business-package-header">
            <div className="business-package-bg-glow"></div>
            <div className="business-package-badge-wrapper">
              <span className="text-blue-600">★</span>
              <span className="business-package-title">Gói Premium</span>
              <span className="business-package-status-badge">Đang hoạt động</span>
            </div>
            
            <p className="business-package-desc">Trải nghiệm toàn bộ tính năng cao cấp cho dòng họ lớn.</p>
            
            <div className="business-stats-grid">
              <div>
                <p className="business-stat-label">Nhân khẩu tối đa</p>
                <p className="business-stat-value">1,245 / 5,000</p>
              </div>
              <div>
                <p className="business-stat-label">Dung lượng lưu trữ</p>
                <p className="business-stat-value">15 GB / 50 GB</p>
              </div>
              <div>
                <p className="business-stat-label">Tài khoản truy cập</p>
                <p className="business-stat-value">450 / 1,000</p>
              </div>
              <div>
                <p className="business-stat-label">Ngày hết hạn</p>
                <p className="business-stat-value-alert">31/12/2026</p>
              </div>
            </div>

            <div className="business-actions-wrapper">
              <button className="business-btn-renew admin-btn-primary px-8">Gia hạn ngay</button>
              <button className="business-btn-upgrade admin-btn-secondary px-8">Nâng / Hạ gói</button>
            </div>
          </div>

          <div className="business-history-card">
            <h3 className="business-history-title">Lịch sử giao dịch</h3>
            <div className="space-y-4">
              <div className="business-history-item">
                <div>
                  <p className="business-history-item-title">Gia hạn 1 năm - Gói Premium</p>
                  <p className="business-history-item-desc">Thanh toán qua VNPay • 01/01/2026</p>
                </div>
                <p className="business-history-item-amount">5,000,000 đ</p>
              </div>
              <div className="business-history-item-last">
                <div>
                  <p className="business-history-item-title">Đăng ký mới - Gói Premium</p>
                  <p className="business-history-item-desc">Thanh toán qua Chuyển khoản • 01/01/2025</p>
                </div>
                <p className="business-history-item-amount">5,000,000 đ</p>
              </div>
            </div>
          </div>
        </div>

        {/* Danger Zone */}
        <div>
          <div className="business-danger-card">
            <h3 className="business-danger-title">
              <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
              Khu vực Nguy hiểm
            </h3>
            <p className="business-danger-desc">Các hành động dưới đây sẽ thay đổi vĩnh viễn quyền sở hữu tài khoản doanh nghiệp của dòng họ.</p>
            
            <button 
              className="business-btn-transfer"
              onClick={() => setShowTransferModal(true)}
            >
              Chuyển giao quyền Trưởng tộc
            </button>
          </div>
        </div>
      </div>

      {/* Transfer Owner Modal */}
      {showTransferModal && (
        <div className="business-modal-overlay">
          <div className="business-modal-content">
            <div className="business-modal-header">
              <h3 className="business-modal-title">Chuyển giao quyền Trưởng tộc</h3>
            </div>
            
            <div className="p-6">
              {transferStep === 1 ? (
                <>
                  <p className="business-modal-desc-warn">Bạn chuẩn bị chuyển giao TOÀN BỘ QUYỀN LỰC của hệ thống cho một người khác. Người này phải có tài khoản Family Admin hiện tại.</p>
                  
                  <label className="business-modal-label">Chọn người kế nhiệm</label>
                  <select className="business-modal-select form-input-admin w-full mb-6">
                    <option value="">-- Chọn Family Admin --</option>
                    <option value="user1">Nguyễn Văn Kế Nhiệm (Chi 1)</option>
                    <option value="user2">Trần Thị Quản Lý (Chi 2)</option>
                  </select>

                  <div className="business-modal-footer">
                    <button className="admin-btn-secondary" onClick={() => setShowTransferModal(false)}>Hủy bỏ</button>
                    <button className="business-btn-danger admin-btn-primary bg-red-600 border-blue-600 hover:bg-red-700" onClick={() => setTransferStep(2)}>Tiếp tục</button>
                  </div>
                </>
              ) : (
                <>
                  <div className="business-modal-alert">
                    <strong>CẢNH BÁO MẤT QUYỀN:</strong> Ngay sau khi bấm Xác nhận, tài khoản của bạn sẽ bị giáng cấp xuống Family Admin. Bạn sẽ không thể hoàn tác hành động này!
                  </div>
                  
                  <label className="business-modal-label">Nhập mật khẩu của bạn để xác nhận</label>
                  <input type="password" placeholder="Mật khẩu đăng nhập..." className="business-modal-input-pwd form-input-admin w-full mb-6" />

                  <div className="business-modal-footer">
                    <button className="admin-btn-secondary" onClick={() => setTransferStep(1)}>Quay lại</button>
                    <button className="business-btn-danger-confirm admin-btn-primary bg-red-600 border-blue-600 hover:bg-red-700 admin-btn-primary bg-red-600 border-blue-600 hover:bg-red-700" onClick={() => setShowTransferModal(false)}>Xác nhận Chuyển giao</button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BusinessPage;
