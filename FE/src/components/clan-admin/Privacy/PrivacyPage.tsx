import './PrivacyPage.css';
import React, { useState } from 'react';
import PageHeader from '../../../shared/Layout/PageHeader';

export const PrivacyPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'public' | 'members' | 'interfamily'>('public');

  return (
    <div className="admin-account-container">
      
      <div className="admin-account-header">
        <div>
          <h2 className="admin-account-title">Quyền riêng tư & Bảo mật</h2>
          <p className="admin-account-subtitle">Cấu hình mức độ hiển thị dữ liệu dòng họ đối với người ngoài, thành viên và các dòng họ liên kết.</p>
        </div>
      </div>
      
      <div className="privacy-page-content">
        {/* Tabs */}
        <div className="privacy-tabs">
          <button 
            className={`privacy-tab-btn ${activeTab === 'public' ? 'tab-active' : 'tab-inactive'}`}
            onClick={() => setActiveTab('public')}
          >
            Mức công khai chung (Public)
          </button>
          <button 
            className={`privacy-tab-btn ${activeTab === 'members' ? 'tab-active' : 'tab-inactive'}`}
            onClick={() => setActiveTab('members')}
          >
            Phân quyền Thành viên (Members)
          </button>
          <button 
            className={`privacy-tab-btn ${activeTab === 'interfamily' ? 'tab-active' : 'tab-inactive'}`}
            onClick={() => setActiveTab('interfamily')}
          >
            Chia sẻ Liên họ (Inter-family)
          </button>
        </div>

        {/* Tab Content */}
        <div className="privacy-tab-content">
          {activeTab === 'public' && (
            <div className="max-w-3xl">
              <h3 className="privacy-section-title">Cấu hình Guest (Khách viếng thăm)</h3>
              <p className="privacy-section-desc">Những dữ liệu này sẽ hiển thị công khai trên internet mà không cần đăng nhập.</p>

              <div className="space-y-4">
                <div className="privacy-setting-row">
                  <div>
                    <h4 className="privacy-setting-name">Tên và Nguồn gốc Dòng họ</h4>
                    <p className="privacy-setting-desc">Văn bia, lịch sử hình thành</p>
                  </div>
                  <div className="privacy-setting-actions">
                    <button className="privacy-btn-public">Public</button>
                    <button className="privacy-btn-hide">Ẩn</button>
                  </div>
                </div>

                <div className="privacy-setting-row">
                  <div>
                    <h4 className="privacy-setting-name">Thông tin Cụ Thủy Tổ</h4>
                    <p className="privacy-setting-desc">Tiểu sử, hình ảnh Thủy Tổ</p>
                  </div>
                  <div className="privacy-setting-actions">
                    <button className="privacy-btn-public">Public</button>
                    <button className="privacy-btn-hide">Ẩn</button>
                  </div>
                </div>

                <div className="privacy-setting-row">
                  <div>
                    <h4 className="privacy-setting-name">Cây Gia phả (Rút gọn)</h4>
                    <p className="privacy-setting-desc">Chỉ hiện tên, ẩn ngày tháng năm sinh</p>
                  </div>
                  <div className="privacy-setting-actions">
                    <button className="privacy-btn-public">Public</button>
                    <button className="privacy-btn-hide">Ẩn</button>
                  </div>
                </div>
              </div>

              <div className="mt-8">
                <button className="privacy-btn-save admin-btn-primary px-8 admin-btn-primary px-8">Lưu thay đổi</button>
              </div>
            </div>
          )}

          {activeTab === 'members' && (
            <div className="max-w-4xl">
              <h3 className="privacy-section-title">Ma trận Quyền Thành viên (Member Visibility)</h3>
              <p className="privacy-section-desc">Cấu hình chi tiết những thông tin tài khoản Member có thể nhìn thấy bên trong nội bộ dòng họ.</p>

              <table className="privacy-table">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="privacy-th">Loại Dữ liệu</th>
                    <th className="privacy-th">Cho phép xem</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="privacy-td">Full Tree (Toàn bộ Cây gia phả)</td>
                    <td className="privacy-td-center">
                      <input type="checkbox" className="privacy-checkbox" defaultChecked />
                    </td>
                  </tr>
                  <tr>
                    <td className="privacy-td">Contact Info (Số điện thoại, Email của người khác)</td>
                    <td className="privacy-td-center">
                      <input type="checkbox" className="privacy-checkbox" />
                    </td>
                  </tr>
                  <tr>
                    <td className="privacy-td">Quỹ Dòng họ (Tổng quan)</td>
                    <td className="privacy-td-center">
                      <input type="checkbox" className="privacy-checkbox" defaultChecked />
                    </td>
                  </tr>
                  <tr>
                    <td className="privacy-td">Tài liệu riêng tư (Private Archives)</td>
                    <td className="privacy-td-center">
                      <input type="checkbox" className="privacy-checkbox" disabled title="Tài liệu riêng tư chỉ dành cho Admin" />
                    </td>
                  </tr>
                </tbody>
              </table>

              <div className="mt-8">
                <button className="privacy-btn-save admin-btn-primary px-8 admin-btn-primary px-8">Lưu cấu hình</button>
              </div>
            </div>
          )}

          {activeTab === 'interfamily' && (
            <div className="max-w-3xl">
              <h3 className="privacy-section-title">Chia sẻ Liên họ</h3>
              <p className="privacy-section-desc">Chỉ cấu hình được khi có Yêu cầu liên họ (Inter-family Request) ở trạng thái APPROVED.</p>
              
              <div className="privacy-info-box">
                Vui lòng cấu hình chi tiết tại module Quản lý Liên họ sau khi kết nối thành công.
                <br/>
                Các trường dữ liệu PRIVATE sẽ không bao giờ được phép chia sẻ liên họ.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PrivacyPage;
