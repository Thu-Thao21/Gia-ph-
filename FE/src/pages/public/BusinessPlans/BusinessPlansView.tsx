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
  badge?: string;
  priceFormatted: string;
  memberLimit: string | null;
  storage: string | null;
  features: string[];
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
          page.items.map((plan) => ({
            id: plan.plan_id,
            name: plan.name,
            priceFormatted: formatPlanPrice(plan),
            memberLimit: formatPlanMemberLimit(plan),
            storage: formatPlanStorage(plan),
            features: formatPlanFeatures(plan),
          }))
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
        <div className="plans-header">
          <span className="plans-badge">DÀNH CHO ĐẠI DIỆN DÒNG HỌ / TRƯỞNG TỘC</span>
          <h1 className="plans-title">Bảng Gói Dịch Vụ Dòng Họ Business</h1>
          <p className="plans-subtitle">
            Lựa chọn gói dịch vụ phù hợp với quy mô thành viên và nhu cầu số hóa của dòng họ bạn.
          </p>
        </div>

        {loading && <div className="plans-note-card">Đang tải danh sách gói dịch vụ...</div>}
        {!loading && loadError && <div className="plans-note-card">{loadError}</div>}
        {!loading && !loadError && tiers.length === 0 && (
          <div className="plans-note-card">Hiện chưa có gói dịch vụ nào đang mở bán.</div>
        )}

        <div className="plans-cards-grid">
          {tiers.map((t) => (
            <div key={t.id} className="plan-card" data-testid={`plan-card-${t.id}`}>
              {t.badge && <span className="plan-recom-badge">{t.badge}</span>}
              <h3 className="plan-name">{t.name}</h3>
              <div className="plan-price-box">
                <span className="plan-price-val">{t.priceFormatted}</span>
              </div>
              {t.memberLimit && <div className="plan-limit">{t.memberLimit}</div>}
              {t.storage && <div className="plan-storage">{t.storage}</div>}

              <div className="plan-divider" />

              <ul className="plan-features-list">
                {t.features.map((feat, idx) => (
                  <li key={idx}>✓ {feat}</li>
                ))}
              </ul>

              <button
                className="select-plan-btn"
                data-testid={`btn-select-plan-${t.id}`}
                onClick={() => navigate(`${ROUTES.PUBLIC.BUSINESS_REGISTER}?tier=${t.id}`)}
              >
                Chọn Gói Này ➔
              </button>
            </div>
          ))}
        </div>

        <div className="plans-note-card">
          Thông tin về bảng giá và giới hạn được tải động từ cấu hình hệ thống. Mọi thủ tục đăng ký Business sẽ được Quản trị viên thẩm định trước khi cấp quyền Owner.
        </div>
      </div>
    </PublicLayout>
  );
};

export default BusinessPlansView;
