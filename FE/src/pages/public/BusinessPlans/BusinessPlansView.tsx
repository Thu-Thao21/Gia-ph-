import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PublicLayout } from '../../../components/guest/PublicLayout';
import { ROUTES } from '../../../config/routes';
import {
  fetchServicePlans,
  formatPlanFeatures,
  formatPlanMemberLimit,
  formatPlanPrice,
  formatPlanStorage,
  readApiError,
  withRequestId,
} from '../../../services/business.service';
import './BusinessPlansView.css';

export interface BusinessTier {
  id: string;
  name: string;
  code?: string;
  description?: string | null;
  badge?: string;
  priceFormatted: string;
  priceAmount: string;
  period: string;
  memberLimit: string | null;
  storage: string | null;
  features: string[];
  isPopular: boolean;
}

export const BusinessPlansView: React.FC = () => {
  const navigate = useNavigate();

  // Gói dịch vụ lấy từ GET /service-plans; id của thẻ là plan_id.
  const [tiers, setTiers] = useState<BusinessTier[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetchServicePlans()
      .then((page) => {
        if (cancelled) return;
        setTiers(
          page.items.map((plan, idx) => {
            const numericPrice = parseFloat(plan.price || '0');
            const priceAmount = numericPrice === 0 ? '0' : numericPrice.toLocaleString('vi-VN');
            const period =
              plan.billing_period_months === 1
                ? '/ tháng'
                : plan.billing_period_months === 12
                ? '/ năm'
                : `/ ${plan.billing_period_months} tháng`;

            // Xác định gói nổi bật (ví dụ STANDARD, gói có chữ Standard, hoặc gói thứ 2 khi có 2 gói)
            const isPopular =
              plan.code === 'STANDARD' ||
              plan.name.toLowerCase().includes('standard') ||
              plan.name.toLowerCase().includes('tiêu chuẩn') ||
              (page.items.length === 2 && idx === 1);

            return {
              id: plan.plan_id,
              name: plan.name,
              code: plan.code,
              description: plan.description,
              priceFormatted: formatPlanPrice(plan),
              priceAmount,
              period,
              memberLimit: formatPlanMemberLimit(plan),
              storage: formatPlanStorage(plan),
              features: formatPlanFeatures(plan),
              isPopular,
            };
          })
        );
      })
      .catch((err) => {
        if (cancelled) return;
        const info = readApiError(err);
        setLoadError(
          info.isNetworkError
            ? 'Không thể kết nối đến máy chủ để tải danh sách gói dịch vụ. Vui lòng thử lại sau.'
            : withRequestId('Không tải được danh sách gói dịch vụ. Vui lòng thử lại sau.', info)
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <PublicLayout>
      <div className="plans-container">
        {/* Header Section */}
        <div className="plans-header">
          <div className="plans-badge">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
            DÀNH CHO ĐẠI DIỆN DÒNG HỌ / TRƯỞNG TỘC
          </div>
          <h1 className="plans-title">Bảng Gói Dịch Vụ Dòng Họ Business</h1>
          <p className="plans-subtitle">
            Lựa chọn gói dịch vụ phù hợp với quy mô thành viên và nhu cầu số hóa của dòng họ bạn.
          </p>

          <div className="plans-trust-pills">
            <div className="trust-pill">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Xác thực danh tính Trưởng tộc
            </div>
            <div className="trust-pill">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Lưu giữ gia phả trường tồn
            </div>
            <div className="trust-pill">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Bảo mật riêng tư đa tầng
            </div>
          </div>
        </div>

        {/* States */}
        {loading && (
          <div className="plans-loading-state">
            <div className="plans-spinner" />
            <span>Đang tải danh sách gói dịch vụ...</span>
          </div>
        )}
        {!loading && loadError && <div className="plans-note-card error">{loadError}</div>}
        {!loading && !loadError && tiers.length === 0 && (
          <div className="plans-note-card">Hiện chưa có gói dịch vụ nào đang mở bán.</div>
        )}

        {/* Pricing Cards Grid */}
        <div className="plans-cards-grid">
          {tiers.map((t) => (
            <div
              key={t.id}
              className={`plan-card ${t.isPopular ? 'popular-plan' : ''}`}
              data-testid={`plan-card-${t.id}`}
            >
              {/* Popular Tag */}
              {t.isPopular && (
                <div className="plan-popular-ribbon">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                  </svg>
                  KHUYÊN DÙNG CHO DÒNG TỘC
                </div>
              )}

              {/* Card Header */}
              <div className="plan-card-header">
                <div className="plan-icon-wrapper">
                  {t.isPopular ? (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                    </svg>
                  ) : (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    </svg>
                  )}
                </div>
                <div>
                  <h3 className="plan-name">{t.name}</h3>
                  <div className="plan-tagline">
                    {t.description || (t.isPopular ? 'Gói giải pháp toàn diện cho đại gia đình' : 'Gói khởi đầu gọn gàng cho chi nhánh')}
                  </div>
                </div>
              </div>

              {/* Price display */}
              <div className="plan-price-block">
                <div className="plan-price-main">
                  <span className="plan-price-amount">{t.priceAmount}</span>
                  <span className="plan-price-currency">đ</span>
                </div>
                <span className="plan-price-period">{t.period}</span>
              </div>

              {/* Core Specs Box */}
              <div className="plan-specs-box">
                {t.memberLimit && (
                  <div className="plan-spec-item">
                    <div className="spec-icon-bubble user-bubble">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                        <circle cx="9" cy="7" r="4" />
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                      </svg>
                    </div>
                    <div className="spec-info">
                      <span className="spec-label">Quy mô thành viên</span>
                      <strong className="spec-value">{t.memberLimit}</strong>
                    </div>
                  </div>
                )}

                {t.storage && (
                  <div className="plan-spec-item">
                    <div className="spec-icon-bubble storage-bubble">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
                      </svg>
                    </div>
                    <div className="spec-info">
                      <span className="spec-label">Dung lượng tư liệu</span>
                      <strong className="spec-value">{t.storage}</strong>
                    </div>
                  </div>
                )}
              </div>

              <div className="plan-divider" />

              {/* Features List */}
              <div className="plan-features-label">Quyền lợi và tính năng gói:</div>
              <ul className="plan-features-list">
                {t.features.map((feat, idx) => (
                  <li key={idx} className="plan-feature-item">
                    <span className="feat-check-bubble">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </span>
                    <span className="feat-text">{feat}</span>
                  </li>
                ))}
              </ul>

              {/* Action Button */}
              <button
                className={`select-plan-btn ${t.isPopular ? 'popular-btn' : ''}`}
                data-testid={`btn-select-plan-${t.id}`}
                onClick={() => navigate(`${ROUTES.PUBLIC.BUSINESS_REGISTER}?tier=${t.id}`)}
              >
                <span>Chọn Gói Này</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </button>
            </div>
          ))}
        </div>

        {/* Security & Guarantee Note */}
        <div className="plans-security-guarantee">
          <div className="security-icon-circle">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <path d="m9 12 2 2 4-4" />
            </svg>
          </div>
          <div className="security-text">
            <strong>Cam kết bảo mật & Xác thực minh bạch</strong>
            <p>
              Bảng giá và thông số được cấu hình chính thức từ máy chủ. Mọi hồ sơ đăng ký Business sẽ được Quản trị viên hệ thống thẩm định và xác minh tính xác thực trước khi phê duyệt cấp quyền Quản trị dòng họ (Owner).
            </p>
          </div>
        </div>
      </div>
    </PublicLayout>
  );
};

export default BusinessPlansView;
