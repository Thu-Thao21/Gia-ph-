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
  sendRegistrationOtp,
  verifyRegistrationOtp,
  withRequestId,
  type ServicePlan,
} from '../../../services/business.service';
import {
  formatWait,
  otpErrorMessage,
  isOtpRateLimited,
  otpNewCodeReason,
  otpRetryAfterSeconds,
  type OtpNewCodeReason,
} from '../../../api/otpErrors';
import OtpResendPrompt from '../../../components/auth/OtpResendPrompt/OtpResendPrompt';
import {
  DUPLICATE_CLAN_MESSAGE,
  FIELD_INFO,
  invalidFields,
  logoError as checkLogo,
  normalizeVnMobile,
  originError,
  personNameError,
} from './registrationRules';
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

  // OTP State
  const [otpCode, setOtpCode] = useState('');
  const [isOtpSent, setIsOtpSent] = useState(false);
  const [isEmailVerified, setIsEmailVerified] = useState(false);
  // Token dùng một lần BE trả sau khi xác thực đúng mã (Mốc M5-1); chỉ giữ trong bộ nhớ.
  const [verificationToken, setVerificationToken] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpMsg, setOtpMsg] = useState<{ text: string; isError: boolean } | null>(null);
  const [otpCountdown, setOtpCountdown] = useState(0);
  // Khác null khi mã đang nhập không dùng được nữa (hết hạn, sai quá số lần, đã có mã mới hơn).
  const [newCodeReason, setNewCodeReason] = useState<OtpNewCodeReason | null>(null);
  // Lần gửi mã gần nhất bị giới hạn: khối "Gửi mã mới" chỉ giữ nút khóa + đếm ngược, không thêm câu.
  const [otpRateLimited, setOtpRateLimited] = useState(false);

  useEffect(() => {
    if (otpCountdown <= 0) return;
    const timer = setInterval(() => {
      setOtpCountdown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [otpCountdown]);

  const isValidGmail = (email: string) => {
    return /^[^@\s]+@gmail\.com$/i.test(email.trim());
  };

  const handleSendOtp = async () => {
    const trimmed = repEmail.trim();
    if (!isValidGmail(trimmed)) {
      setOtpMsg({ text: 'Email bắt buộc phải có đuôi @gmail.com hợp lệ.', isError: true });
      return;
    }
    setOtpLoading(true);
    setOtpMsg(null);
    try {
      await sendRegistrationOtp(trimmed);
      setIsOtpSent(true);
      setOtpCode('');
      setNewCodeReason(null);
      setOtpRateLimited(false);
      setOtpCountdown(60);
      setOtpMsg({ text: 'Mã xác thực 6 số đã được gửi tới Gmail của bạn. Vui lòng kiểm tra hộp thư.', isError: false });
    } catch (err: unknown) {
      setOtpRateLimited(isOtpRateLimited(err));
      const wait = otpRetryAfterSeconds(err);
      if (wait !== null) setOtpCountdown(wait); // chờ đúng thời gian BE báo (retry_after)
      setOtpMsg({ text: otpErrorMessage(err, 'send'), isError: true });
    } finally {
      setOtpLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    const trimmedCode = otpCode.trim();
    if (trimmedCode.length !== 6) {
      setOtpMsg({ text: 'Vui lòng nhập đủ 6 chữ số mã OTP.', isError: true });
      return;
    }
    setOtpLoading(true);
    setOtpMsg(null);
    try {
      const verified = await verifyRegistrationOtp(repEmail.trim(), trimmedCode);
      setVerificationToken(verified.verification_token);
      setIsEmailVerified(true);
      setOtpMsg({ text: 'Xác thực Gmail thành công!', isError: false });
    } catch (err: unknown) {
      const reason = otpNewCodeReason(err);
      if (reason) {
        // Mã đã nhập không dùng được nữa: xóa ô nhập, mời bấm "Gửi mã mới" (KHÔNG tự gửi).
        setOtpCode('');
        setNewCodeReason(reason);
        setOtpRateLimited(false);
      }
      setOtpMsg({ text: otpErrorMessage(err, 'verify'), isError: true });
    } finally {
      setOtpLoading(false);
    }
  };

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
  const [clanNameError, setClanNameError] = useState('');
  const [logoError, setLogoError] = useState('');
  const [copied, setCopied] = useState(false);
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

  // [L-27 & L-28] Validation Bước 1: Họ tên đại diện và Số điện thoại
  const handleNextStep1 = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    // Mốc M5c: cùng quy tắc với BE (BE mới là nơi chặn thật).
    const nameError = personNameError(repName);
    if (nameError) {
      setErrorMsg(nameError);
      return;
    }
    if (!normalizeVnMobile(repPhone)) {
      setErrorMsg('Số điện thoại di động Việt Nam không hợp lệ (VD: 0912345678 hoặc +84 912 345 678; đầu số 03, 05, 07, 08, 09).');
      return;
    }

    if (!isValidGmail(repEmail)) {
      setErrorMsg('Địa chỉ email bắt buộc phải có đuôi @gmail.com hợp lệ.');
      return;
    }
    if (!isEmailVerified) {
      setErrorMsg('Vui lòng xác thực địa chỉ Gmail bằng mã OTP trước khi tiếp tục.');
      return;
    }
    setErrorMsg('');
    setStep(2);
  };

  // [L-07 & L-29] Validation Bước 2: Tên dòng họ 5-255 ký tự, chữ cái tiếng Việt, số, khoảng trắng (chặn _ và ký tự đặc biệt)
  const handleNextStep2 = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setClanNameError('');

    const trimmedFamilyName = familyName.trim();
    if (trimmedFamilyName.length < 5 || trimmedFamilyName.length > 255) {
      const err = 'Tên dòng họ phải có độ dài từ 5 đến 255 ký tự.';
      setClanNameError(err);
      setErrorMsg(err);
      return;
    }

    const clanNameRegex = /^[a-zA-Z0-9\sàáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđÀÁẢÃẠĂẰẮẲẴẶÂẦẤẨẪẬÈÉẺẼẸÊỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢÙÚỦŨỤƯỪỨỬỮỰỲÝỶỸỴĐ]+$/;
    if (!clanNameRegex.test(trimmedFamilyName)) {
      const err = 'Tên dòng họ chỉ được chứa chữ cái tiếng Việt, số và khoảng trắng (không chứa ký tự gạch dưới _ hoặc ký tự đặc biệt).';
      setClanNameError(err);
      setErrorMsg(err);
      return;
    }

    const originProblem = originError(familyOrigin);
    if (originProblem) {
      setErrorMsg(originProblem);
      return;
    }

    setErrorMsg('');
    setClanNameError('');
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
        representative_phone: normalizeVnMobile(repPhone) ?? repPhone.trim(),
        clan_name: familyName,
        origin_place: familyOrigin.trim(),
        requested_plan_id: selectedPlan.plan_id,
        verification_token: verificationToken,
      });
      setTrackingCode(result.tracking_code);
      setIsSubmitted(true);
    } catch (err) {
      const info = readApiError(err);
      if (info.isNetworkError) {
        setErrorMsg('Không thể kết nối đến máy chủ. Vui lòng kiểm tra kết nối và thử lại.');
      } else if (info.status === 409 && info.code === 'EMAIL_ALREADY_REGISTERED') {
        // Mốc M5: một Gmail chỉ đăng ký một lần (thành viên, hồ sơ Business, Gmail liên hệ của Trưởng tộc).
        setErrorMsg(
          'Gmail này đã được dùng để đăng ký trên hệ thống. Vui lòng dùng một Gmail khác cho người đại diện, hoặc đăng nhập / dùng chức năng quên mật khẩu nếu đây là tài khoản của bạn.'
        );
      } else if (info.status === 409 && info.code === 'DUPLICATE_CLAN') {
        // Mốc M5c: dòng họ đã có; câu chung, BE không trả gì về dòng họ kia.
        setClanNameError(DUPLICATE_CLAN_MESSAGE);
        setErrorMsg(DUPLICATE_CLAN_MESSAGE);
        setStep(2);
      } else if (info.status === 409 && info.code === 'DUPLICATE_RESOURCE') {
        setErrorMsg(
          'Đã có một hồ sơ đang chờ duyệt với cùng email và tên dòng họ. Vui lòng dùng mã tra cứu đã nhận để theo dõi, không cần gửi lại.'
        );
      } else if (info.status === 422) {
        // Mốc M5c: BE trả details.fields; hiện đúng trường sai và quay về bước chứa trường đó.
        const fields = invalidFields(info.details?.fields);
        if (fields.length > 0) {
          setErrorMsg(`Vui lòng kiểm tra lại: ${fields.map((f) => FIELD_INFO[f].label).join(', ')}.`);
          if (fields.includes('clan_name')) setClanNameError('Tên dòng họ chưa hợp lệ (5–255 ký tự, chỉ chữ, số và khoảng trắng).');
          setStep(FIELD_INFO[fields[0]].step);
        } else {
          setErrorMsg('Thông tin đăng ký không hợp lệ. Vui lòng kiểm tra lại các trường bắt buộc và gói đã chọn.');
        }
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
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <strong className="code-value" data-testid="text-tracking-code">{trackingCode}</strong>
                <button
                  type="button"
                  data-testid="btn-copy-tracking-code"
                  onClick={() => {
                    if (trackingCode) {
                      navigator.clipboard.writeText(trackingCode);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }
                  }}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '8px',
                    background: copied ? '#15803d' : '#22c55e',
                    color: '#ffffff',
                    border: 'none',
                    cursor: 'pointer',
                    fontWeight: 700,
                    fontSize: '13px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    transition: 'background 0.2s',
                  }}
                >
                  {copied ? '✓ Đã sao chép!' : '📋 Sao chép mã'}
                </button>
              </div>
              <span className="code-label">Mã chỉ hiển thị một lần, hãy lưu lại.</span>
            </div>

            <div className="receipt-warning">
              ⚠️ <strong>Lưu ý quan trọng:</strong> Gửi đăng ký Business hoặc chọn gói chưa đồng nghĩa với việc được cấp quyền Business Owner ngay lập tức. Quyền sẽ được kích hoạt sau khi yêu cầu được duyệt chính thức.
            </div>

            <div className="receipt-actions">
              <button
                className="pub-btn-primary"
                data-testid="btn-open-tracking-page"
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
                    data-testid="input-rep-name"
                    placeholder="VD: Nguyễn Văn A"
                    value={repName}
                    onChange={(e) => setRepName(e.target.value)}
                    required
                  />
                </div>

                <div className="form-field">
                  <label className="field-label">Địa chỉ Email liên hệ (@gmail.com) *</label>
                  <div className="email-input-group">
                    <input
                      type="email"
                      className="field-input"
                      data-testid="input-rep-email"
                      placeholder="VD: nguyenvana@gmail.com"
                      value={repEmail}
                      onChange={(e) => {
                        setRepEmail(e.target.value);
                        if (isEmailVerified) setIsEmailVerified(false);
                        setVerificationToken('');
                        if (isOtpSent) setIsOtpSent(false);
                        setNewCodeReason(null);
                        setOtpMsg(null);
                      }}
                      disabled={isEmailVerified}
                      required
                    />
                    {!isEmailVerified && (
                      <button
                        type="button"
                        className="otp-send-btn"
                        onClick={handleSendOtp}
                        disabled={otpLoading || otpCountdown > 0 || !isValidGmail(repEmail)}
                      >
                        {otpLoading ? 'Đang gửi...' : otpCountdown > 0 ? `Gửi lại (${formatWait(otpCountdown)})` : isOtpSent ? 'Gửi lại mã' : 'Gửi mã OTP'}
                      </button>
                    )}
                  </div>

                  {isEmailVerified ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                      <span className="otp-success-badge">✓ Đã xác thực Gmail thành công</span>
                      <button
                        type="button"
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#64748b',
                          fontSize: '13px',
                          textDecoration: 'underline',
                          cursor: 'pointer',
                          padding: 0,
                        }}
                        onClick={() => {
                          setIsEmailVerified(false);
                          setVerificationToken('');
                          setIsOtpSent(false);
                          setOtpCode('');
                          setNewCodeReason(null);
                          setOtpMsg(null);
                        }}
                      >
                        Đổi email khác
                      </button>
                    </div>
                  ) : (
                    isOtpSent && (
                      <div className="otp-box-container" style={{ marginTop: '8px' }}>
                        <span style={{ fontSize: '13px', color: '#475569', fontWeight: 600 }}>
                          Nhập mã xác thực 6 số gửi đến hộp thư {repEmail}:
                        </span>
                        {(!newCodeReason || newCodeReason === 'superseded') && (
                        <div className="otp-input-row">
                          <input
                            type="text"
                            maxLength={6}
                            className="otp-input-code"
                            placeholder="000000"
                            value={otpCode}
                            onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                          />
                          <button
                            type="button"
                            className="otp-verify-btn"
                            onClick={handleVerifyOtp}
                            disabled={otpLoading || otpCode.trim().length !== 6}
                          >
                            {otpLoading ? 'Đang kiểm tra...' : 'Xác nhận OTP'}
                          </button>
                        </div>
                        )}
                        {newCodeReason && (
                          <OtpResendPrompt
                            reason={newCodeReason}
                            secondsLeft={otpCountdown}
                            loading={otpLoading}
                            onResend={handleSendOtp}
                            rateLimited={otpRateLimited}
                          />
                        )}
                      </div>
                    )
                  )}

                  {otpMsg && (
                    <p className={`otp-msg-text ${otpMsg.isError ? 'error' : 'success'}`} style={{ marginTop: '6px' }}>
                      {otpMsg.text}
                    </p>
                  )}
                </div>

                <div className="form-field">
                  <label className="field-label">Số điện thoại di động *</label>
                  <input
                    type="tel"
                    className="field-input"
                    data-testid="input-rep-phone"
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
                    data-testid="select-rep-role"
                    value={repRole}
                    onChange={(e) => setRepRole(e.target.value)}
                  >
                    <option value="Trưởng tộc">Trưởng tộc / Trưởng chi</option>
                    <option value="Hội đồng gia tộc">Thành viên Hội đồng gia tộc</option>
                    <option value="Thành viên được ủy quyền">Thành viên được dòng họ ủy quyền</option>
                  </select>
                </div>

                <div className="wiz-action-row">
                  <button type="submit" className="wiz-next-btn" data-testid="btn-step1-next">
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
                    className={`field-input ${clanNameError ? 'field-input-error' : ''}`}
                    data-testid="input-clan-name"
                    placeholder="VD: Dòng Họ Nguyễn Chi 1 Kim Liên"
                    value={familyName}
                    onChange={(e) => {
                      setFamilyName(e.target.value);
                      if (clanNameError) setClanNameError('');
                    }}
                    required
                  />
                  {clanNameError && (
                    <span
                      className="field-error-text"
                      data-testid="clan-name-error"
                      style={{ color: '#dc2626', fontSize: '13px', marginTop: '6px', display: 'block', fontWeight: 600 }}
                    >
                      ⚠️ {clanNameError}
                    </span>
                  )}
                </div>

                <div className="form-field">
                  <label className="field-label">Quê gốc / Nhà thờ tổ chính *</label>
                  <input
                    type="text"
                    className="field-input"
                    data-testid="input-clan-origin"
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
                    data-testid="input-clan-code"
                    placeholder="VD: NGUYEN_KL"
                    value={familyCode}
                    onChange={(e) => setFamilyCode(e.target.value)}
                  />
                </div>

                <div className="form-field">
                  <label className="field-label">Mô tả tóm tắt lịch sử dòng họ</label>
                  <textarea
                    className="field-textarea"
                    data-testid="textarea-clan-desc"
                    rows={3}
                    placeholder="Tóm tắt truyền thống, các chi nhánh chính..."
                    value={familyDesc}
                    onChange={(e) => setFamilyDesc(e.target.value)}
                  />
                </div>

                <div className="form-field">
                  <label className="field-label">Ảnh biểu trưng / Logo dòng họ (Tùy chọn, tối đa 2MB)</label>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="field-input"
                    data-testid="input-clan-logo"
                    onChange={async (e) => {
                      const input = e.target;
                      const file = input.files?.[0];
                      setLogoError('');
                      if (!file) return;
                      // Mốc M5c: kiểm tra theo NỘI DUNG (magic bytes), không theo đuôi tệp; không nhận SVG.
                      const head = new Uint8Array(await file.slice(0, 512).arrayBuffer());
                      const problem = checkLogo(file.size, head);
                      if (problem) {
                        setLogoError(problem);
                        input.value = '';
                      }
                    }}
                  />
                  {logoError && (
                    <span
                      className="field-error-text"
                      data-testid="clan-logo-error"
                      style={{ color: '#dc2626', fontSize: '13px', marginTop: '6px', display: 'block', fontWeight: 600 }}
                    >
                      ⚠️ {logoError}
                    </span>
                  )}
                  <small style={{ color: '#64748b', fontSize: '12px', marginTop: '4px', display: 'block' }}>
                    Định dạng hỗ trợ: JPG, PNG, WEBP (tối đa 2MB). Không nhận SVG.
                  </small>
                </div>

                <div className="wiz-action-row">
                  <button type="button" className="wiz-back-btn" data-testid="btn-step2-back" onClick={() => setStep(1)}>
                    ← Quay lại
                  </button>
                  <button type="submit" className="wiz-next-btn" data-testid="btn-step2-next">
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
                      data-testid={`tier-card-${plan.plan_id}`}
                      onClick={() => setSelectedTier(plan.plan_id)}
                    >
                      <h4>{plan.name}</h4>
                      {formatPlanMemberLimit(plan) && <span className="tier-limit">{formatPlanMemberLimit(plan)}</span>}
                      {plan.description && <p className="tier-desc">{plan.description}</p>}
                    </div>
                  ))}
                </div>

                <div className="wiz-action-row">
                  <button type="button" className="wiz-back-btn" data-testid="btn-step3-back" onClick={() => setStep(2)}>
                    ← Quay lại
                  </button>
                  <button type="button" className="wiz-next-btn" data-testid="btn-step3-next" onClick={handleNextStep3}>
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
                  <button type="button" className="wiz-back-btn" data-testid="btn-step4-back" onClick={() => setStep(3)}>
                    ← Sửa lại
                  </button>
                  <button
                    type="button"
                    className="wiz-submit-btn"
                    data-testid="btn-submit-registration"
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
