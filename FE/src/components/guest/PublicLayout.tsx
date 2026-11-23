import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ROUTES } from '../../config/routes';
import circularEmblemLogo from '../../assets/logo/logo_circular_emblem.png';
import './PublicLayout.css';

interface PublicLayoutProps {
  children: React.ReactNode;
}

export const PublicLayout: React.FC<PublicLayoutProps> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();

  const isNavActive = (path: string) => {
    return location.pathname === path;
  };

  return (
    <div className="public-layout-container">
      {/* Public Top Header Navigation */}
      <header className="public-header">
        <div className="public-header-inner">
          <div className="public-brand-logo" onClick={() => navigate(ROUTES.PUBLIC.ROOT)}>
            <img src={circularEmblemLogo} alt="Gia Phả Việt Logo" className="public-logo-img" />
            <div>
              <div className="public-system-sub">HỆ THỐNG GIA PHẢ LIÊN HỌ</div>
              <div className="public-brand-name">Gia Phả Việt</div>
            </div>
          </div>

          <nav className="public-nav-links">
            <button
              className={`public-nav-item ${isNavActive(ROUTES.PUBLIC.ROOT) ? 'active' : ''}`}
              onClick={() => navigate(ROUTES.PUBLIC.ROOT)}
            >
              Trang Chủ
            </button>
            <button
              className={`public-nav-item ${isNavActive(ROUTES.PUBLIC.FAMILIES) ? 'active' : ''}`}
              onClick={() => navigate(ROUTES.PUBLIC.FAMILIES)}
            >
              Tra Cứu Dòng Họ
            </button>
            <button
              className={`public-nav-item ${isNavActive(ROUTES.PUBLIC.BUSINESS_PLANS) ? 'active' : ''}`}
              onClick={() => navigate(ROUTES.PUBLIC.BUSINESS_PLANS)}
            >
              Gói Business
            </button>
            <button
              className={`public-nav-item ${isNavActive(ROUTES.PUBLIC.BUSINESS_TRACK) ? 'active' : ''}`}
              onClick={() => navigate(ROUTES.PUBLIC.BUSINESS_TRACK)}
            >
              Theo Dõi Đăng Ký
            </button>
            <button
              className={`public-nav-item ${isNavActive(ROUTES.ACTIVATION) ? 'active' : ''}`}
              onClick={() => navigate(ROUTES.ACTIVATION)}
            >
              Kích Hoạt Lời Mời
            </button>
          </nav>

          <div className="public-header-actions">
            <button className="public-login-btn" onClick={() => navigate(ROUTES.LOGIN)}>
              Đăng Nhập
            </button>
            <button className="public-register-biz-btn" onClick={() => navigate(ROUTES.PUBLIC.BUSINESS_REGISTER)}>
              Đăng Ký Business
            </button>
          </div>
        </div>
      </header>

      {/* Main Page Content */}
      <main className="public-main-content">{children}</main>

      {/* Enhanced Modern Public Footer */}
      <footer className="public-footer">
        <div className="public-footer-inner">
          {/* Col 1: Brand & Identity & Contact */}
          <div className="footer-col brand-col">
            <div className="footer-brand-header">
              <img src={circularEmblemLogo} alt="Gia Phả Việt Logo" className="footer-logo-img" />
              <div>
                <h3 className="footer-brand-title">Gia Phả Việt</h3>
                <div className="footer-brand-tagline">Hệ Thống Quản Trị & Số Hóa Gia Phả Đa Dòng Họ</div>
              </div>
            </div>
            <p className="footer-brand-desc">
              Nền tảng số hóa gia phả, kết nối các dòng họ liên kết hàng đầu Việt Nam. Lưu giữ cội nguồn trường tồn, kết nối phả hệ thông gia và gìn giữ văn hóa gia tộc cho muôn đời sau.
            </p>
            <div className="footer-contact-list">
              <div className="footer-contact-item">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                </svg>
                <span>Hotline: <strong>0788 606 420</strong> (Tư vấn dòng tộc)</span>
              </div>
              <div className="footer-contact-item">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                  <polyline points="22,6 12,13 2,6" />
                </svg>
                <span>Hỗ trợ kỹ thuật: <strong>multifamilygenealogyhelp@gmail.com</strong></span>
              </div>
              <div className="footer-contact-item">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                <span>Trung tâm hỗ trợ: <strong>Hà Nội • TP.Đà Nẵng • TP. Hồ Chí Minh</strong></span>
              </div>
            </div>
          </div>

          {/* Col 2: Dành cho Khách / Đại diện */}
          <div className="footer-col">
            <h4 className="footer-col-title">
              <span>Dành Cho Khách / Đại Diện</span>
              <span className="col-title-bar" />
            </h4>
            <ul className="footer-links">
              <li onClick={() => navigate(ROUTES.PUBLIC.ROOT)}>
                <span className="link-arrow">›</span> Giới thiệu nền tảng & Sứ mệnh
              </li>
              <li onClick={() => navigate(ROUTES.PUBLIC.FAMILIES)}>
                <span className="link-arrow">›</span> Tra cứu thông tin công khai
              </li>
              <li onClick={() => navigate(ROUTES.PUBLIC.BUSINESS_PLANS)}>
                <span className="link-arrow">›</span> Xem bảng giá Business <span className="footer-pill-tag">Mới</span>
              </li>
              <li onClick={() => navigate(ROUTES.PUBLIC.BUSINESS_REGISTER)}>
                <span className="link-arrow">›</span> Đăng ký dòng họ mới (Cấp quyền Owner)
              </li>
              <li onClick={() => navigate(ROUTES.PUBLIC.BUSINESS_TRACK)}>
                <span className="link-arrow">›</span> Theo dõi trạng thái duyệt hồ sơ
              </li>
            </ul>
          </div>

          {/* Col 3: Tính Năng Cốt Lõi */}
          <div className="footer-col">
            <h4 className="footer-col-title">
              <span>Tính Năng & Công Nghệ</span>
              <span className="col-title-bar" />
            </h4>
            <ul className="footer-links">
              <li onClick={() => navigate(ROUTES.PUBLIC.ROOT)}>
                <span className="link-arrow">›</span> Cây gia phả tương tác 3D đa chiều
              </li>
              <li onClick={() => navigate(ROUTES.PUBLIC.ROOT)}>
                <span className="link-arrow">›</span> Mạng lưới liên kết thông gia 4 đời
              </li>
              <li onClick={() => navigate(ROUTES.PUBLIC.ROOT)}>
                <span className="link-arrow">›</span> Bản đồ GPS phần mộ & Nhà thờ tộc
              </li>
              <li onClick={() => navigate(ROUTES.PUBLIC.ROOT)}>
                <span className="link-arrow">›</span> Trợ lý AI phân tích quan hệ & Xưng hô
              </li>
              <li onClick={() => navigate(ROUTES.PUBLIC.ROOT)}>
                <span className="link-arrow">›</span> Không gian thờ tự số hóa & Ngày giỗ
              </li>
            </ul>
          </div>

          {/* Col 4: Thành viên & Bảo mật */}
          <div className="footer-col">
            <h4 className="footer-col-title">
              <span>Thành Viên & Bảo Mật</span>
              <span className="col-title-bar" />
            </h4>
            <ul className="footer-links">
              <li onClick={() => navigate(ROUTES.LOGIN)}>
                <span className="link-arrow">›</span> Đăng nhập tài khoản gia tộc
              </li>
              <li onClick={() => navigate(ROUTES.ACTIVATION)}>
                <span className="link-arrow">›</span> Kích hoạt mã / link lời mời
              </li>
              <li onClick={() => navigate(ROUTES.FORGOT_PASSWORD)}>
                <span className="link-arrow">›</span> Khôi phục mật khẩu cá nhân
              </li>
              <li onClick={() => navigate(ROUTES.PUBLIC.ROOT)}>
                <span className="link-arrow">›</span> Chính sách riêng tư (PUBLIC / FAMILY)
              </li>
              <li onClick={() => navigate(ROUTES.PUBLIC.ROOT)}>
                <span className="link-arrow">›</span> Tiêu chuẩn bảo mật dữ liệu gia phả
              </li>
            </ul>
          </div>
        </div>

        {/* Footer Bottom Bar with Security Badges */}
        <div className="public-footer-bottom">
          <div className="footer-bottom-inner">
            <div className="copyright-text">
              © 2026 <strong>GIA PHẢ VIỆT</strong> – Kết nối huyết thống – Gìn giữ cội nguồn – Trường tồn cùng thế hệ.
            </div>
            <div className="footer-security-badges">
              <span className="badge-item">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                Bảo mật thông tin gia tộc
              </span>
              <span className="badge-item">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
                Số hóa gia phả toàn diện
              </span>
              <span className="badge-item">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Lưu giữ di sản muôn đời
              </span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default PublicLayout;
