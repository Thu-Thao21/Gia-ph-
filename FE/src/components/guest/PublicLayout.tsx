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

      {/* Public Footer */}
      <footer className="public-footer">
        <div className="public-footer-inner">
          <div className="footer-col brand">
            <h3 className="footer-brand-title">Gia Phả Việt</h3>
            <p className="footer-brand-desc">
              Nền tảng số hóa gia phả, kết nối các dòng họ liên kết hàng đầu Việt Nam.
            </p>
          </div>

          <div className="footer-col">
            <h4 className="footer-col-title">Dành Cho Khách / Đại Diện</h4>
            <ul className="footer-links">
              <li onClick={() => navigate(ROUTES.PUBLIC.ROOT)}>Giới thiệu nền tảng</li>
              <li onClick={() => navigate(ROUTES.PUBLIC.FAMILIES)}>Tra cứu thông tin công khai</li>
              <li onClick={() => navigate(ROUTES.PUBLIC.BUSINESS_PLANS)}>Xem bảng giá Business</li>
              <li onClick={() => navigate(ROUTES.PUBLIC.BUSINESS_REGISTER)}>Đăng ký dòng họ mới</li>
              <li onClick={() => navigate(ROUTES.PUBLIC.BUSINESS_TRACK)}>Theo dõi trạng thái duyệt</li>
            </ul>
          </div>

          <div className="footer-col">
            <h4 className="footer-col-title">Thành Viên & Bảo Mật</h4>
            <ul className="footer-links">
              <li onClick={() => navigate(ROUTES.LOGIN)}>Đăng nhập hệ thống</li>
              <li onClick={() => navigate(ROUTES.ACTIVATION)}>Kích hoạt mã gia nhập</li>
              <li onClick={() => navigate(ROUTES.FORGOT_PASSWORD)}>Quên mật khẩu</li>
              <li>Chính sách riêng tư (PUBLIC/FAMILY)</li>
            </ul>
          </div>
        </div>

        <div className="public-footer-bottom">
          © 2026 MULTI-FAMILY GENEALOGY SYSTEM • Bảo lưu mọi quyền.
        </div>
      </footer>
    </div>
  );
};

export default PublicLayout;
