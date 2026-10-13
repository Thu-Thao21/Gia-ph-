import React from 'react';
import { useNavigate } from 'react-router-dom';
import MembersGrowthChart from './MembersGrowthChart';
import logoImage from '../../../assets/logo.jpg';
import './DashboardPage.css';

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();

  const handleNavigate = (path: string) => {
    navigate(path);
  };

  return (
    <div className="admin-account-container">
      {/* Welcome Banner */}
      <div className="admin-header-banner">
        <div 
          className="admin-header-banner-bg-logo"
          style={{ backgroundImage: `url(${logoImage})` }}
        />
        <div className="admin-header-banner-inner dashboard-banner-relative">
          <div className="dashboard-tag-inner admin-system-tag text-blue-100 bg-blue-900/50 inline-block px-3 py-1 rounded-full mb-3 text-xs font-bold tracking-widest border border-blue-400/30">QUẢN TRỊ DÒNG HỌ • CLAN ADMIN</div>
          <h1 className="dashboard-title admin-greeting text-white text-3xl font-black mb-3 drop-shadow-md">
            Tổng quan Dòng họ (Đang tải...)
          </h1>
          <p className="dashboard-subtitle admin-subtext text-blue-50 text-base leading-relaxed max-w-none drop-shadow-sm pr-4 md:pr-12">
            Kính chào Trưởng tộc. Không gian gia phả kỹ thuật số của dòng họ đang hoạt động ổn định trên nền tảng đám mây. Hệ thống phân tích huyết thống đã tự động chạy quét và sao lưu dữ liệu toàn vẹn vào lúc 03:00 sáng nay. Dưới đây là bức tranh toàn cảnh về quy mô, tình hình tài chính và các hoạt động đang diễn ra của toàn thể dòng họ.
          </p>
          <div className="dashboard-header-actions">
            <button className="dashboard-btn-add" onClick={() => handleNavigate('/clan-admin/persons')}>
              <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
              Thêm nhân khẩu mới
            </button>
            <button className="dashboard-btn-view" onClick={() => handleNavigate('/clan-admin/events')}>
              Xem lịch trình dòng họ
            </button>
          </div>
        </div>
      </div>

      <div className="dashboard-content-scroll">
        
        {/* Lời khuyên / Hướng dẫn nhanh (Fill empty space) */}
        <div className="dashboard-guide-card">
          <div className="dashboard-guide-header">
            <h3 className="dashboard-guide-title">
              <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              Hướng dẫn & Gợi ý dành cho Trưởng Tộc
            </h3>
            <span className="dashboard-guide-badge">Có 3 gợi ý mới</span>
          </div>
          <div className="dashboard-guide-grid">
            <div className="dashboard-guide-item">
              <div className="dashboard-guide-item-number">1</div>
              <div>
                <h4 className="dashboard-guide-item-title">Cập nhật hồ sơ gốc</h4>
                <p className="dashboard-guide-item-desc">Hãy thường xuyên bổ sung thông tin lịch sử và hình ảnh nhà thờ Tổ để các thế hệ con cháu hiểu rõ hơn về cội nguồn.</p>
              </div>
            </div>
            <div className="dashboard-guide-item">
              <div className="dashboard-guide-item-number">2</div>
              <div>
                <h4 className="dashboard-guide-item-title">Xét duyệt đúng hạn</h4>
                <p className="dashboard-guide-item-desc">Việc duyệt nhanh các yêu cầu liên kết nhân khẩu giúp thành viên sớm có quyền truy cập vào phả đồ chi tiết của gia đình họ.</p>
              </div>
            </div>
            <div className="dashboard-guide-item">
              <div className="dashboard-guide-item-number">3</div>
              <div>
                <h4 className="dashboard-guide-item-title">Phân quyền chi/nhánh</h4>
                <p className="dashboard-guide-item-desc">Dòng họ ngày càng mở rộng. Hãy bổ nhiệm các Trưởng Chi (Family Admin) để san sẻ gánh nặng quản lý dữ liệu từng cụm nhỏ.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Section 1: Thông tin lõi */}
        <div className="mb-4">
          <h3 className="dashboard-section-title">Quy mô & Cấu trúc Phả hệ</h3>
          <p className="dashboard-section-desc">
            Tổng quan về sự phát triển của dòng họ, số lượng thành viên đã đăng ký tài khoản và cơ cấu tổ chức các chi nhánh/phòng ban.
          </p>
        </div>
        
        <div className="dashboard-stats-grid">
          {/* Card 1 */}
          <div 
            onClick={() => handleNavigate('/clan-admin/persons')}
            className="dashboard-stat-card bg-white p-6 rounded-xl border border-blue-100 shadow-sm cursor-pointer hover:border-blue-500 hover:shadow-md transition group relative overflow-hidden bg-white p-6 rounded-xl border border-blue-100 shadow-sm cursor-pointer hover:border-blue-500 hover:shadow-md transition group relative overflow-hidden bg-white p-6 rounded-xl border border-blue-100 shadow-sm cursor-pointer hover:border-blue-500 hover:shadow-md transition group relative overflow-hidden bg-white p-6 rounded-xl border border-blue-100 shadow-sm cursor-pointer hover:border-blue-500 hover:shadow-md transition group relative overflow-hidden"
          >
            <div className="dashboard-stat-bg-glow absolute top-0 right-0 w-20 h-20 bg-blue-50 rounded-full -mr-10 -mt-10 opacity-50 group-hover:scale-150 transition-transform duration-500 absolute top-0 right-0 w-20 h-20 bg-blue-50 rounded-full -mr-10 -mt-10 opacity-50 group-hover:scale-150 transition-transform duration-500 absolute top-0 right-0 w-20 h-20 bg-blue-50 rounded-full -mr-10 -mt-10 opacity-50 group-hover:scale-150 transition-transform duration-500 absolute top-0 right-0 w-20 h-20 bg-blue-50 rounded-full -mr-10 -mt-10 opacity-50 group-hover:scale-150 transition-transform duration-500"></div>
            <div className="dashboard-stat-header">
              <div className="dashboard-stat-icon w-12 h-12 rounded-lg bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-colors w-12 h-12 rounded-lg bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-colors w-12 h-12 rounded-lg bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-colors w-12 h-12 rounded-lg bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-colors">
                <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" /></svg>
              </div>
              <span className="dashboard-stat-badge">Cập nhật 2h trước</span>
            </div>
            <h4 className="dashboard-stat-value">0</h4>
            <p className="dashboard-stat-label">Nhân khẩu (Person)</p>
            <p className="dashboard-stat-detail">Toàn bộ hồ sơ danh tính của những người thuộc dòng máu Nguyễn Đại Tôn đã được lưu trữ an toàn.</p>
          </div>

          {/* Card 2 */}
          <div 
            onClick={() => handleNavigate('/clan-admin/members')}
            className="dashboard-stat-card bg-white p-6 rounded-xl border border-blue-100 shadow-sm cursor-pointer hover:border-blue-500 hover:shadow-md transition group relative overflow-hidden bg-white p-6 rounded-xl border border-blue-100 shadow-sm cursor-pointer hover:border-blue-500 hover:shadow-md transition group relative overflow-hidden bg-white p-6 rounded-xl border border-blue-100 shadow-sm cursor-pointer hover:border-blue-500 hover:shadow-md transition group relative overflow-hidden bg-white p-6 rounded-xl border border-blue-100 shadow-sm cursor-pointer hover:border-blue-500 hover:shadow-md transition group relative overflow-hidden"
          >
            <div className="dashboard-stat-bg-glow absolute top-0 right-0 w-20 h-20 bg-blue-50 rounded-full -mr-10 -mt-10 opacity-50 group-hover:scale-150 transition-transform duration-500 absolute top-0 right-0 w-20 h-20 bg-blue-50 rounded-full -mr-10 -mt-10 opacity-50 group-hover:scale-150 transition-transform duration-500 absolute top-0 right-0 w-20 h-20 bg-blue-50 rounded-full -mr-10 -mt-10 opacity-50 group-hover:scale-150 transition-transform duration-500 absolute top-0 right-0 w-20 h-20 bg-blue-50 rounded-full -mr-10 -mt-10 opacity-50 group-hover:scale-150 transition-transform duration-500"></div>
            <div className="dashboard-stat-header">
              <div className="dashboard-stat-icon w-12 h-12 rounded-lg bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-colors w-12 h-12 rounded-lg bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-colors w-12 h-12 rounded-lg bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-colors w-12 h-12 rounded-lg bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-colors">
                <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></svg>
              </div>
              <span className="dashboard-stat-badge">+12 tuần này</span>
            </div>
            <h4 className="dashboard-stat-value">0</h4>
            <p className="dashboard-stat-label">Tài khoản (Account)</p>
            <p className="dashboard-stat-detail">Tài khoản được cấp quyền truy cập, tương tác trực tuyến với bản đồ gia phả số hóa.</p>
          </div>

          {/* Card 3 */}
          <div 
            onClick={() => handleNavigate('/clan-admin/branches')}
            className="dashboard-stat-card bg-white p-6 rounded-xl border border-blue-100 shadow-sm cursor-pointer hover:border-blue-500 hover:shadow-md transition group relative overflow-hidden bg-white p-6 rounded-xl border border-blue-100 shadow-sm cursor-pointer hover:border-blue-500 hover:shadow-md transition group relative overflow-hidden bg-white p-6 rounded-xl border border-blue-100 shadow-sm cursor-pointer hover:border-blue-500 hover:shadow-md transition group relative overflow-hidden bg-white p-6 rounded-xl border border-blue-100 shadow-sm cursor-pointer hover:border-blue-500 hover:shadow-md transition group relative overflow-hidden"
          >
            <div className="dashboard-stat-bg-glow absolute top-0 right-0 w-20 h-20 bg-blue-50 rounded-full -mr-10 -mt-10 opacity-50 group-hover:scale-150 transition-transform duration-500 absolute top-0 right-0 w-20 h-20 bg-blue-50 rounded-full -mr-10 -mt-10 opacity-50 group-hover:scale-150 transition-transform duration-500 absolute top-0 right-0 w-20 h-20 bg-blue-50 rounded-full -mr-10 -mt-10 opacity-50 group-hover:scale-150 transition-transform duration-500 absolute top-0 right-0 w-20 h-20 bg-blue-50 rounded-full -mr-10 -mt-10 opacity-50 group-hover:scale-150 transition-transform duration-500"></div>
            <div className="dashboard-stat-header">
              <div className="dashboard-stat-icon w-12 h-12 rounded-lg bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-colors w-12 h-12 rounded-lg bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-colors w-12 h-12 rounded-lg bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-colors w-12 h-12 rounded-lg bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-colors">
                <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
              </div>
              <span className="dashboard-stat-badge">Cơ cấu ổn định</span>
            </div>
            <h4 className="dashboard-stat-value">0 / 0</h4>
            <p className="dashboard-stat-label">Chi / Nhánh</p>
            <p className="dashboard-stat-detail">Mạng lưới 12 Chi lớn và 45 Nhánh nhỏ phân bổ trên khắp toàn quốc và hải ngoại.</p>
          </div>

          {/* Card 4 */}
          <div 
            onClick={() => handleNavigate('/clan-admin/family-admins')}
            className="dashboard-stat-card bg-white p-6 rounded-xl border border-blue-100 shadow-sm cursor-pointer hover:border-blue-500 hover:shadow-md transition group relative overflow-hidden bg-white p-6 rounded-xl border border-blue-100 shadow-sm cursor-pointer hover:border-blue-500 hover:shadow-md transition group relative overflow-hidden bg-white p-6 rounded-xl border border-blue-100 shadow-sm cursor-pointer hover:border-blue-500 hover:shadow-md transition group relative overflow-hidden bg-white p-6 rounded-xl border border-blue-100 shadow-sm cursor-pointer hover:border-blue-500 hover:shadow-md transition group relative overflow-hidden"
          >
            <div className="dashboard-stat-bg-glow absolute top-0 right-0 w-20 h-20 bg-blue-50 rounded-full -mr-10 -mt-10 opacity-50 group-hover:scale-150 transition-transform duration-500 absolute top-0 right-0 w-20 h-20 bg-blue-50 rounded-full -mr-10 -mt-10 opacity-50 group-hover:scale-150 transition-transform duration-500 absolute top-0 right-0 w-20 h-20 bg-blue-50 rounded-full -mr-10 -mt-10 opacity-50 group-hover:scale-150 transition-transform duration-500 absolute top-0 right-0 w-20 h-20 bg-blue-50 rounded-full -mr-10 -mt-10 opacity-50 group-hover:scale-150 transition-transform duration-500"></div>
            <div className="dashboard-stat-header">
              <div className="dashboard-stat-icon w-12 h-12 rounded-lg bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-colors w-12 h-12 rounded-lg bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-colors w-12 h-12 rounded-lg bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-colors w-12 h-12 rounded-lg bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-colors">
                <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
              </div>
              <span className="dashboard-stat-badge">Đã ủy quyền</span>
            </div>
            <h4 className="dashboard-stat-value">0</h4>
            <p className="dashboard-stat-label">Phụ tá (Family Admin)</p>
            <p className="dashboard-stat-detail">Đội ngũ phụ tá đắc lực hỗ trợ Trưởng tộc số hóa thông tin từng cụm chi nhỏ.</p>
          </div>
        </div>

        <MembersGrowthChart />

        {/* Section 2: Công việc cần xử lý */}
        <div className="dashboard-task-header-wrapper">
          <h3 className="dashboard-task-title">Danh Mục Cần Xử Lý Kịp Thời</h3>
          <p className="dashboard-task-desc">
            Những tác vụ này yêu cầu quyền quyết định trực tiếp từ Trưởng tộc để đảm bảo hệ thống vận hành minh bạch.
          </p>
        </div>
        
        <div className="dashboard-task-grid">
          <div 
            onClick={() => handleNavigate('/clan-admin/approvals')}
            className="dashboard-task-card"
          >
            <div className="dashboard-task-edge-color"></div>
            <div className="dashboard-task-card-header">
              <div className="dashboard-task-icon">
                0
              </div>
              <div>
                <h4 className="dashboard-task-card-title">Yêu cầu chờ duyệt</h4>
                <p className="dashboard-task-card-subtitle">Ưu tiên cao</p>
              </div>
            </div>
            <p className="dashboard-task-card-desc">
              Không có yêu cầu sửa đổi hồ sơ nào đang chờ duyệt.
            </p>
            <button className="dashboard-task-card-action">
              Xử lý ngay <span className="text-lg">→</span>
            </button>
          </div>

          <div 
            onClick={() => handleNavigate('/clan-admin/inter-family')}
            className="dashboard-task-card"
          >
            <div className="dashboard-task-edge-color"></div>
            <div className="dashboard-task-card-header">
              <div className="dashboard-task-icon">
                0
              </div>
              <div>
                <h4 className="dashboard-task-card-title">Lời mời Liên họ</h4>
                <p className="dashboard-task-card-subtitle">Chờ phản hồi</p>
              </div>
            </div>
            <p className="dashboard-task-card-desc">
              Không có lời mời giao lưu liên kết họ tộc nào.
            </p>
            <button className="dashboard-task-card-action">
              Xem chi tiết thư mời <span className="text-lg">→</span>
            </button>
          </div>

          <div 
            onClick={() => handleNavigate('/clan-admin/ai')}
            className="dashboard-task-card"
          >
            <div className="dashboard-task-edge-color"></div>
            <div className="dashboard-task-card-header">
              <div className="dashboard-task-icon">
                0
              </div>
              <div>
                <h4 className="dashboard-task-card-title">Cảnh báo AI</h4>
                <p className="dashboard-task-card-subtitle">Tự động phát hiện</p>
              </div>
            </div>
            <p className="dashboard-task-card-desc">
              Không có hồ sơ nào có dấu hiệu trùng lặp hoặc lỗi logic.
            </p>
            <button className="dashboard-task-card-action">
              Chạy công cụ gộp <span className="text-lg">→</span>
            </button>
          </div>
        </div>

        {/* Section 3: Hoạt động & Quỹ */}
        <div className="dashboard-activity-grid">
          
          <div className="dashboard-schedule-col">
            <div className="dashboard-schedule-header-wrapper">
              <h3 className="dashboard-schedule-title">Lịch trình & Kế hoạch Hành động</h3>
              <p className="dashboard-schedule-desc">Các sự kiện, ngày giỗ quan trọng được tổ chức trong thời gian tới.</p>
            </div>
            <div className="dashboard-schedule-list">
              <div 
                className="dashboard-schedule-item"
                onClick={() => handleNavigate('/clan-admin/memorial-days')}
              >
                <div className="dashboard-schedule-item-inner">
                  <div className="dashboard-schedule-date-box">
                    <span className="dashboard-schedule-month">Tháng 8</span>
                    <span className="dashboard-schedule-day">15</span>
                  </div>
                  <div className="flex-1">
                    <h4 className="dashboard-schedule-item-title">Đại Lễ Giỗ Cụ Thủy Tổ Nguyễn Bặc</h4>
                    <p className="dashboard-schedule-item-desc">Địa điểm tổ chức: Nhà thờ Tổ, Xóm 4, Gia Viễn, Ninh Bình. Dự kiến sẽ có khoảng 300 con cháu trên mọi miền tổ quốc về tham dự và dâng hương.</p>
                    <span className="dashboard-schedule-item-badge">Chỉ còn 3 ngày nữa</span>
                  </div>
                </div>
                <span className="dashboard-schedule-arrow">❯</span>
              </div>
              
              <div 
                className="dashboard-schedule-item"
                onClick={() => handleNavigate('/clan-admin/events')}
              >
                <div className="dashboard-schedule-item-inner">
                  <div className="dashboard-schedule-date-box">
                    <span className="dashboard-schedule-month">Tháng 11</span>
                    <span className="dashboard-schedule-day">20</span>
                  </div>
                  <div className="flex-1">
                    <h4 className="dashboard-schedule-item-title">Họp mặt dòng họ thường niên & Lễ Trao thưởng</h4>
                    <p className="dashboard-schedule-item-desc">Tổng kết hoạt động năm 2026. Báo cáo tài chính thu chi minh bạch. Phát thưởng Quỹ Khuyến học cho 45 cháu học sinh giỏi các cấp.</p>
                    <span className="dashboard-schedule-item-badge">120 người đã xác nhận tham gia</span>
                  </div>
                </div>
                <span className="dashboard-schedule-arrow">❯</span>
              </div>
            </div>

            <div 
              className="dashboard-fund-card"
              onClick={() => handleNavigate('/clan-admin/funds')}
            >
              <div className="dashboard-fund-bg-glow-1"></div>
              <div className="dashboard-fund-bg-glow-2"></div>
              <div className="dashboard-fund-content">
                <p className="dashboard-fund-label">Báo Cáo Tổng Quỹ Khuyến Học & Xây Dựng</p>
                <h3 className="dashboard-fund-amount">0 ₫</h3>
                <p className="dashboard-fund-desc">
                  <span className="dashboard-fund-badge">Đang cập nhật</span>
                  Chưa có dữ liệu đóng góp mới.
                </p>
              </div>
              <div className="dashboard-fund-icon-wrapper">
                <svg width="32" height="32" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" /></svg>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="dashboard-plan-header-wrapper">
              <h3 className="dashboard-plan-title">Trạng thái Gói Nền Tảng</h3>
              <p className="dashboard-plan-desc">Chỉ số sử dụng tài nguyên (Business Plan).</p>
            </div>
            <div 
              className="dashboard-plan-card"
              onClick={() => handleNavigate('/clan-admin/business')}
            >
              <div className="dashboard-plan-bg-glow"></div>
              <div className="dashboard-plan-header">
                <span className="dashboard-plan-star">★</span>
                <span className="dashboard-plan-name">Gói Premium (Chuyên nghiệp)</span>
              </div>
              
              <div className="dashboard-plan-date-wrapper">
                <p className="dashboard-plan-date-label">Hiệu lực sử dụng đến ngày</p>
                <h4 className="dashboard-plan-date-value">31/12/2026</h4>
                <p className="dashboard-plan-date-desc">Hệ thống sẽ tự động gửi email gia hạn trước 30 ngày. Quý dòng họ đang được hưởng mức ưu đãi đặc biệt.</p>
              </div>
              
              <div className="dashboard-plan-usage-wrapper">
                <div className="dashboard-plan-usage-item">
                  <div className="dashboard-plan-usage-label">
                    <span>Hạn mức Nhân khẩu</span>
                    <span>0 / 0</span>
                  </div>
                  <div className="dashboard-plan-progress-bg">
                    <div className="dashboard-plan-progress-fill w-0">
                      <div className="dashboard-plan-progress-inner"></div>
                    </div>
                  </div>
                  <p className="dashboard-plan-usage-text">Đã dùng 0%</p>
                </div>
                
                <div className="dashboard-plan-usage-item">
                  <div className="dashboard-plan-usage-label">
                    <span>Bộ nhớ Đám mây (Tư liệu)</span>
                    <span>0GB / 0GB</span>
                  </div>
                  <div className="dashboard-plan-progress-bg">
                    <div className="dashboard-plan-progress-fill w-0">
                      <div className="dashboard-plan-progress-inner"></div>
                    </div>
                  </div>
                  <p className="dashboard-plan-usage-text">Đã dùng 0%</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
