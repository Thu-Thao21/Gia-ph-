import React from 'react';
import { useNavigate } from 'react-router-dom';
import { PublicLayout } from '../../../components/guest/PublicLayout';
import { ROUTES } from '../../../config/routes';
import circularEmblemLogo from '../../../assets/logo/logo_circular_emblem.png';
import './PublicHomePage.css';

export const PublicHomePage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <PublicLayout>
      <div className="pub-home-container">
        {/* Hero Banner Section */}
        <section className="pub-hero-card">
          <div className="pub-hero-grid">
            <div className="pub-hero-info">
              <span className="pub-hero-badge">HỆ THỐNG GIA PHẢ LIÊN HỌ HÀNG ĐẦU VIỆT NAM</span>
              <h1 className="pub-hero-title">
                Số Hóa Gia Phả Dòng Họ Việt
              </h1>
              <div className="pub-hero-subtitle">
                <span className="pub-hero-sub-item">Gắn Kết Dòng Họ</span>
                <span className="pub-hero-sub-sep" aria-hidden="true">–</span>
                <span className="pub-hero-sub-item">Lưu Truyền Thế Hệ</span>
                <span className="pub-hero-sub-sep" aria-hidden="true">–</span>
                <span className="pub-hero-sub-item">Kết Nối Liên Họ</span>
              </div>
              <p className="pub-hero-desc">
                Nền tảng quản lý sơ đồ gia phả đa thế hệ, tra cứu trực hệ, lưu trữ tư liệu cổ, tổ chức ngày giỗ & sự kiện gia tộc chuyên nghiệp.
              </p>

              <div className="pub-hero-buttons">
                <button
                  className="pub-btn-primary"
                  onClick={() => navigate(ROUTES.PUBLIC.FAMILIES)}
                >
                  Tra Cứu Dòng Họ (Public)
                </button>
                <button
                  className="pub-btn-secondary"
                  onClick={() => navigate(ROUTES.PUBLIC.BUSINESS_REGISTER)}
                >
                  Đăng Ký Dòng Họ Business
                </button>
              </div>
            </div>

            <div className="pub-hero-image-box">
              <div className="pub-hero-emblem-wrapper">
                <img src={circularEmblemLogo} alt="Gia Phả Dòng Tộc Emblem Logo" className="pub-hero-emblem-logo" />
              </div>
            </div>
          </div>
        </section>

        {/* Feature Highlights Grid (Static Interface) */}
        <section className="pub-features-section">
          <h2 className="section-heading">Tính Năng Nổi Bật Dành Cho Dòng Họ</h2>

          <div className="pub-features-grid">
            <div className="pub-feature-card">
              <h3 className="feature-title">Cây Gia Phả Tương Tác</h3>
              <p className="feature-desc">
                Xem sơ đồ cây gia phả nhiều thế hệ dạng đứng hoặc ngang, thu phóng dễ dàng và tìm kiếm thông tin ông bà, con cháu nhanh chóng.
              </p>
            </div>

            <div className="pub-feature-card">
              <h3 className="feature-title">Mạng Lưới Liên Họ</h3>
              <p className="feature-desc">
                Gắn kết các nhánh họ Nội, Ngoại, Dâu, Rể và Thông gia, dễ dàng chia sẻ thông tin gia tộc nhưng vẫn bảo đảm an toàn riêng tư.
              </p>
            </div>

            <div className="pub-feature-card">
              <h3 className="feature-title">Tra Cứu & Xưng Hô Tự Động</h3>
              <p className="feature-desc">
                Tự động xác định thứ bậc và gợi ý cách xưng hô chuẩn phong tục Việt Nam giữa hai người bất kỳ trong dòng họ.
              </p>
            </div>

            <div className="pub-feature-card">
              <h3 className="feature-title">Phòng Thờ Số & Ngày Giỗ</h3>
              <p className="feature-desc">
                Thắp hương, dâng hoa tưởng nhớ tổ tiên từ xa, viết lời tri ân và nhận thông báo nhắc nhở ngày giỗ Âm/Dương lịch hàng năm.
              </p>
            </div>

            <div className="pub-feature-card">
              <h3 className="feature-title">Trợ Lý AI Gia Phả</h3>
              <p className="feature-desc">
                Trò chuyện thông minh để tìm hiểu lịch sử, gốc tích dòng họ và xem thống kê tổng số con cháu trong gia tộc.
              </p>
            </div>

            <div className="pub-feature-card">
              <h3 className="feature-title">Bảo Mật & Phân Quyền</h3>
              <p className="feature-desc">
                An tâm lưu trữ thông tin gia đình với các chế độ bảo mật linh hoạt, chỉ người trong dòng họ mới được xem sơ đồ gia phả chi tiết.
              </p>
            </div>
          </div>
        </section>

        {/* Quick CTA Banner */}
        <section className="pub-cta-card">
          <div>
            <h2 className="cta-title">Bạn Đã Được Cấp Mã Kích Hoạt Gia Nhập Dòng Họ?</h2>
            <p className="cta-desc">Mở link lời mời hoặc nhập mã kích hoạt để bắt đầu truy cập cây gia phả cá nhân.</p>
          </div>
          <button className="pub-btn-light" onClick={() => navigate(ROUTES.ACTIVATION)}>
            Kích Hoạt Mã Lời Mời ➔
          </button>
        </section>
      </div>
    </PublicLayout>
  );
};

export default PublicHomePage;
