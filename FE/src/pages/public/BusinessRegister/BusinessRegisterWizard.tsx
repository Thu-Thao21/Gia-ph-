import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PublicLayout } from '../../../components/guest/PublicLayout';
import { ROUTES } from '../../../config/routes';
import { useRetryCountdown } from '../../../hooks/useRetryCountdown';
import {
  createBusinessRegistration,
  fetchServicePlans,
  formatPlanMemberLimit,
  RATE_LIMIT_DONE_MESSAGE,
  rateLimitMessage,
  readApiError,
  withRequestId,
  type ServicePlan,
} from '../../../services/business.service';
import './BusinessRegisterWizard.css';

export const BusinessRegisterWizard: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // ?tier=<plan_id> từ trang Bảng gói; không có gói mặc định.
  const initialTier = searchParams.get('tier') || '';

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Form State
  const [repName, setRepName] = useState('');
  const [repEmail, setRepEmail] = useState('');
  const [repPhone, setRepPhone] = useState('');
  // repRole, familyCode, familyDesc chỉ hiển thị trên giao diện, KHÔNG gửi lên BE (BE từ chối trường lạ bằng 422).
  const [repRole, setRepRole] = useState('Trưởng tộc');

  const [familyName, setFamilyName] = useState('');
  const [familyCode, setFamilyCode] = useState('');
  const [familyOrigin, setFamilyOrigin] = useState('');
  const [familyDesc, setFamilyDesc] = useState('');

  // plan_id của gói đã chọn
  const [selectedTier, setSelectedTier] = useState(initialTier);

  // Gói dịch vụ từ GET /service-plans
  const [plans, setPlans] = useState<ServicePlan[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [plansError, setPlansError] = useState('');

  // Result state
  const [trackingCode, setTrackingCode] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const retry = useRetryCountdown();

  useEffect(() => {
    let cancelled = false;
    fetchServicePlans()
      .then((page) => {
        if (cancelled) return;
        setPlans(page.items);
        // Bỏ chọn nếu ?tier không phải một gói đang bán.
        setSelectedTier((current) => (page.items.some((plan) => plan.plan_id === current) ? current : ''));
      })
      .catch((err) => {
        if (cancelled) return;
        const info = readApiError(err);
        setPlansError(
          info.isNetworkError
            ? 'Không thể kết nối đến máy chủ để tải danh sách gói dịch vụ. Vui lòng thử lại sau.'
            : withRequestId('Không tải được danh sách gói dịch vụ. Vui lòng thử lại sau.', info)
        );
      })
      .finally(() => {
        if (!cancelled) setPlansLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedPlan = plans.find((plan) => plan.plan_id === selectedTier) || null;

  const handleNextStep1 = (e: React.FormEvent) => {
    e.preventDefault();
    if (!repName || !repEmail || !repPhone) {
      setErrorMsg('Vui lòng điền đầy đủ thông tin người đại diện.');
      return;
    }
    setErrorMsg('');
    setStep(2);
  };

  const handleNextStep2 = (e: React.FormEvent) => {
    e.preventDefault();
    if (!familyName || !familyOrigin) {
      setErrorMsg('Vui lòng điền tên dòng họ và quê gốc.');
      return;
    }
    setErrorMsg('');
    setStep(3);
  };

  const handleNextStep3 = () => {
    if (!selectedPlan) {
      setErrorMsg('Vui lòng chọn một gói dịch vụ.');
      return;
    }
    setErrorMsg('');
    setStep(4);
  };

  const handleSubmitRegistration = async () => {
    if (submittingRef.current || retry.isLocked) return;
    if (!selectedPlan) {
      setErrorMsg('Vui lòng chọn một gói dịch vụ.');
      setStep(3);
      return;
    }
    submittingRef.current = true;
    setIsSubmitting(true);
    setErrorMsg('');
    try {
      // Chỉ gửi các trường BE nhận (BusinessRegistrationCreateRequest).
      const result = await createBusinessRegistration({
        representative_name: repName,
        representative_email: repEmail,
        representative_phone: repPhone.trim() || undefined,
        clan_name: familyName,
        origin_place: familyOrigin.trim() || undefined,
        requested_plan_id: selectedPlan.plan_id,
      });
      setTrackingCode(result.tracking_code);
      setIsSubmitted(true);
    } catch (err) {
      const info = readApiError(err);
      if (info.isNetworkError) {
        setErrorMsg('Không thể kết nối đến máy chủ. Vui lòng kiểm tra kết nối và thử lại.');
      } else if (info.status === 409 && info.code === 'DUPLICATE_RESOURCE') {
        setErrorMsg(
          'Đã có một hồ sơ đang chờ duyệt với cùng email và tên dòng họ. Vui lòng dùng mã tra cứu đã nhận để theo dõi, không cần gửi lại.'
        );
      } else if (info.status === 422) {
        setErrorMsg(
          'Thông tin đăng ký không hợp lệ. Vui lòng kiểm tra email, số điện thoại (6–30 ký tự gồm chữ số, dấu cách, + ( ) -), các trường bắt buộc và gói đã chọn.'
        );
      } else if (info.status === 429) {
        if (info.retryAfterSeconds) retry.start(info.retryAfterSeconds);
        setErrorMsg(info.retryAfterSeconds ? RATE_LIMIT_DONE_MESSAGE : rateLimitMessage(null));
      } else {
        setErrorMsg(withRequestId('Gửi đăng ký thất bại. Vui lòng thử lại sau.', info));
      }
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  // Khi đang bị giới hạn tần suất, hiện đếm ngược theo Retry-After.
  const displayError = retry.isLocked ? rateLimitMessage(retry.secondsLeft) : errorMsg;

  return (
    <PublicLayout>
      <div className="wiz-container">
        <div className="wiz-header">
          <span className="wiz-badge">QUY TRÌNH DÀNH CHO KHÁCH / ĐẠI DIỆN DÒNG HỌ</span>
          <h1 className="wiz-title">Đăng Ký Khởi Tạo Dòng Họ Business</h1>
          <p className="wiz-subtitle">
            Luồng đăng ký 4 bước để yêu cầu thiết lập tài khoản quản trị dòng họ mới.
          </p>

          {/* Stepper Progress Bar */}
          {!isSubmitted && (
            <div className="wiz-stepper-bar">
              <div className={`step-item ${step >= 1 ? 'active' : ''}`}>
                <span className="step-num">1</span>
                <span className="step-text">Đại diện dòng họ</span>
              </div>
              <div className="step-line" />
              <div className={`step-item ${step >= 2 ? 'active' : ''}`}>
                <span className="step-num">2</span>
                <span className="step-text">Thông tin dòng họ</span>
              </div>
              <div className="step-line" />
              <div className={`step-item ${step >= 3 ? 'active' : ''}`}>
                <span className="step-num">3</span>
                <span className="step-text">Chọn gói Business</span>
              </div>
              <div className="step-line" />
              <div className={`step-item ${step >= 4 ? 'active' : ''}`}>
                <span className="step-num">4</span>
                <span className="step-text">Kiểm tra & Gửi</span>
              </div>
            </div>
          )}
        </div>

        {displayError && <div className="wiz-error-alert">{displayError}</div>}

        {isSubmitted ? (
          /* Receipt Card after successful submission */
          <div className="wiz-receipt-card">
            <div className="receipt-icon">🎉</div>
            <h2 className="receipt-title">Đăng Ký Khởi Tạo Business Thành Công!</h2>
            <p className="receipt-desc">
              Yêu cầu của bạn đã được ghi nhận vào hệ thống. Quản trị viên sẽ tiến hành thẩm định và phản hồi trong thời gian sớm nhất.
            </p>

            <div className="receipt-code-box">
              <span className="code-label">MÃ TRA CỨU THEO DÕI YÊU CẦU:</span>
              <strong className="code-value">{trackingCode}</strong>
              <span className="code-label">Mã chỉ hiển thị một lần, hãy lưu lại.</span>
            </div>

            <div className="receipt-warning">
              ⚠️ <strong>Lưu ý quan trọng:</strong> Gửi đăng ký Business hoặc chọn gói chưa đồng nghĩa với việc được cấp quyền Business Owner ngay lập tức. Quyền sẽ được kích hoạt sau khi yêu cầu được duyệt chính thức.
            </div>

            <div className="receipt-actions">
              <button
                className="pub-btn-primary"
                onClick={() => navigate(ROUTES.PUBLIC.BUSINESS_TRACK, { state: { trackingCode } })}
              >
                Mở Màn Hình Theo Dõi Trạng Thái ➔
              </button>
            </div>
          </div>
        ) : (
          <div className="wiz-form-card">
            {/* STEP 1: Representative Info */}
            {step === 1 && (
              <form onSubmit={handleNextStep1} className="wiz-step-form">
                <h3 className="step-title">Bước 1: Thông tin đại diện dòng họ</h3>

                <div className="form-field">
                  <label className="field-label">Họ và tên người đại diện *</label>
                  <input
                    type="text"
                    className="field-input"
                    placeholder="VD: Nguyễn Văn A"
                    value={repName}
                    onChange={(e) => setRepName(e.target.value)}
                    required
                  />
                </div>

                <div className="form-field">
                  <label className="field-label">Địa chỉ Email liên hệ *</label>
                  <input
                    type="email"
                    className="field-input"
                    placeholder="VD: nguyenvana@gmail.com"
                    value={repEmail}
                    onChange={(e) => setRepEmail(e.target.value)}
                    required
                  />
                </div>

                <div className="form-field">
                  <label className="field-label">Số điện thoại di động *</label>
                  <input
                    type="tel"
                    className="field-input"
                    placeholder="VD: 0912345678"
                    value={repPhone}
                    onChange={(e) => setRepPhone(e.target.value)}
                    required
                  />
                </div>

                <div className="form-field">
                  <label className="field-label">Vai trò / Chức danh trong dòng họ</label>
                  <select
                    className="field-select"
                    value={repRole}
                    onChange={(e) => setRepRole(e.target.value)}
                  >
                    <option value="Trưởng tộc">Trưởng tộc / Trưởng chi</option>
                    <option value="Hội đồng gia tộc">Thành viên Hội đồng gia tộc</option>
                    <option value="Thành viên được ủy quyền">Thành viên được dòng họ ủy quyền</option>
                  </select>
                </div>

                <div className="wiz-action-row">
                  <button type="submit" className="wiz-next-btn">
                    Tiếp tục ➔
                  </button>
                </div>
              </form>
            )}

            {/* STEP 2: Family Info */}
            {step === 2 && (
              <form onSubmit={handleNextStep2} className="wiz-step-form">
                <h3 className="step-title">Bước 2: Thông tin chi tiết dòng họ</h3>

                <div className="form-field">
                  <label className="field-label">Tên dòng họ đăng ký *</label>
                  <input
                    type="text"
                    className="field-input"
                    placeholder="VD: Dòng Họ Nguyễn Chi 1 Kim Liên"
                    value={familyName}
                    onChange={(e) => setFamilyName(e.target.value)}
                    required
                  />
                </div>

                <div className="form-field">
                  <label className="field-label">Quê gốc / Nhà thờ tổ chính *</label>
                  <input
                    type="text"
                    className="field-input"
                    placeholder="VD: Làng Đông, Xã Kim Liên, Huyện Nam Đàn, Nghệ An"
                    value={familyOrigin}
                    onChange={(e) => setFamilyOrigin(e.target.value)}
                    required
                  />
                </div>

                <div className="form-field">
                  <label className="field-label">Gợi ý Mã dòng họ viết tắt (nếu có)</label>
                  <input
                    type="text"
                    className="field-input"
                    placeholder="VD: NGUYEN_KL"
                    value={familyCode}
                    onChange={(e) => setFamilyCode(e.target.value)}
                  />
                </div>

                <div className="form-field">
                  <label className="field-label">Mô tả tóm tắt lịch sử dòng họ</label>
                  <textarea
                    className="field-textarea"
                    rows={3}
                    placeholder="Tóm tắt truyền thống, các chi nhánh chính..."
                    value={familyDesc}
                    onChange={(e) => setFamilyDesc(e.target.value)}
                  />
                </div>

                <div className="wiz-action-row">
                  <button type="button" className="wiz-back-btn" onClick={() => setStep(1)}>
                    ← Quay lại
                  </button>
                  <button type="submit" className="wiz-next-btn">
                    Tiếp tục ➔
                  </button>
                </div>
              </form>
            )}

            {/* STEP 3: Select Package Tier */}
            {step === 3 && (
              <div className="wiz-step-form">
                <h3 className="step-title">Bước 3: Chọn gói dịch vụ Business</h3>

                {plansLoading && <p className="tier-desc">Đang tải danh sách gói dịch vụ...</p>}
                {!plansLoading && plansError && <div className="wiz-error-alert">{plansError}</div>}
                {!plansLoading && !plansError && plans.length === 0 && (
                  <p className="tier-desc">Hiện chưa có gói dịch vụ nào đang mở bán.</p>
                )}

                <div className="tier-select-grid">
                  {plans.map((plan) => (
                    <div
                      key={plan.plan_id}
                      className={`tier-option-card ${selectedTier === plan.plan_id ? 'selected' : ''}`}
                      onClick={() => setSelectedTier(plan.plan_id)}
                    >
                      <h4>{plan.name}</h4>
                      {formatPlanMemberLimit(plan) && <span className="tier-limit">{formatPlanMemberLimit(plan)}</span>}
                      {plan.description && <p className="tier-desc">{plan.description}</p>}
                    </div>
                  ))}
                </div>

                <div className="wiz-action-row">
                  <button type="button" className="wiz-back-btn" onClick={() => setStep(2)}>
                    ← Quay lại
                  </button>
                  <button type="button" className="wiz-next-btn" onClick={handleNextStep3}>
                    Tiếp tục ➔
                  </button>
                </div>
              </div>
            )}

            {/* STEP 4: Review & Confirm */}
            {step === 4 && (
              <div className="wiz-step-form">
                <h3 className="step-title">Bước 4: Xác nhận thông tin đăng ký</h3>

                <div className="review-box">
                  <h4>1. Người Đại Diện:</h4>
                  <p>{repName} ({repRole}) — Email: {repEmail} — SĐT: {repPhone}</p>

                  <h4 style={{ marginTop: '12px' }}>2. Dòng Họ:</h4>
                  <p>{familyName} — Quê gốc: {familyOrigin}</p>

                  <h4 style={{ marginTop: '12px' }}>3. Gói Đã Chọn:</h4>
                  <p style={{ fontWeight: 700, color: '#2563eb' }}>
                    {selectedPlan?.name}
                    {selectedPlan && formatPlanMemberLimit(selectedPlan) && ` (${formatPlanMemberLimit(selectedPlan)})`}
                  </p>
                </div>

                <div className="wiz-action-row">
                  <button type="button" className="wiz-back-btn" onClick={() => setStep(3)}>
                    ← Sửa lại
                  </button>
                  <button
                    type="button"
                    className="wiz-submit-btn"
                    onClick={() => void handleSubmitRegistration()}
                    disabled={isSubmitting || retry.isLocked}
                  >
                    ✓ Gửi Đăng Ký Khởi Tạo Business
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </PublicLayout>
  );
};

export default BusinessRegisterWizard;
