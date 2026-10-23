import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { PublicLayout } from '../../../components/guest/PublicLayout';
import { useRetryCountdown } from '../../../hooks/useRetryCountdown';
import {
  formatDateTime,
  RATE_LIMIT_DONE_MESSAGE,
  rateLimitMessage,
  readApiError,
  trackBusinessRegistration,
  withRequestId,
  type RegistrationStatus,
} from '../../../services/business.service';
import './BusinessTrackStatusPage.css';

export interface BusinessRequestStatus {
  code: string;
  repName?: string;
  familyName: string;
  tierName?: string;
  status: 'pending' | 'approved' | 'needs_info' | 'rejected' | 'cancelled';
  submittedAt: string;
  updatedAt: string;
  adminNotes?: string;
}

const STATUS_TO_UI: Record<RegistrationStatus, BusinessRequestStatus['status']> = {
  DRAFT: 'pending',
  PENDING: 'pending',
  APPROVED: 'approved',
  NEED_SUPPLEMENT: 'needs_info',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled',
};

export const BusinessTrackStatusPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  // Mã do trang đăng ký chuyển sang qua state của router (không đưa mã bí mật vào URL).
  const stateCode = (location.state as { trackingCode?: unknown } | null)?.trackingCode;
  const urlCode = typeof stateCode === 'string' ? stateCode : searchParams.get('code') || '';

  const [inputCode, setInputCode] = useState(urlCode);
  const [searchedCode, setSearchedCode] = useState(urlCode);
  const [currentResult, setCurrentResult] = useState<BusinessRequestStatus | null>(null);
  const [searched, setSearched] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [lookupError, setLookupError] = useState('');
  const lookingUpRef = useRef(false);
  const autoLookedUpRef = useRef('');
  const retry = useRetryCountdown();

  // Supplemental info form state for 'needs_info' status
  const [suppInfo, setSuppInfo] = useState('');
  const [suppSuccess, setSuppSuccess] = useState(false);

  useEffect(() => {
    if (urlCode && autoLookedUpRef.current !== urlCode) {
      autoLookedUpRef.current = urlCode;
      void handleLookup(urlCode);
    }
  }, [urlCode]);

  const handleLookup = async (codeToSearch?: string) => {
    // Mã tra cứu là bí mật: gửi nguyên vẹn, không trim, không đổi hoa/thường.
    const code = codeToSearch ?? inputCode;

    // [L-31]: Bắt điều kiện rỗng
    if (!code.trim()) {
      setLookupError('Vui lòng nhập mã tra cứu.');
      setSearched(true);
      return;
    }

    if (lookingUpRef.current || retry.isLocked) return;

    // [L-09]: Gán searchedCode tại thời điểm nhấn nút tra cứu
    setSearchedCode(code);
    lookingUpRef.current = true;
    setIsLoading(true);
    setLookupError('');
    try {
      const result = await trackBusinessRegistration(code);
      setCurrentResult({
        code,
        familyName: result.clan_name,
        status: STATUS_TO_UI[result.status] ?? 'pending',
        submittedAt: formatDateTime(result.submitted_at),
        updatedAt: formatDateTime(result.updated_at),
        // public_reason chỉ có khi REJECTED (lý do từ chối công khai).
        adminNotes: result.public_reason ?? undefined,
      });
    } catch (err) {
      const info = readApiError(err);
      setCurrentResult(null);
      if (info.status === 404) {
        // Mã sai: hiện thông báo không tìm thấy.
        setLookupError('');
      } else if (info.isNetworkError) {
        setLookupError('Không thể kết nối đến máy chủ. Vui lòng kiểm tra kết nối và thử lại.');
      } else if (info.status === 422) {
        setLookupError('Mã tra cứu không hợp lệ. Vui lòng kiểm tra lại mã đã được cấp.');
      } else if (info.status === 429) {
        if (info.retryAfterSeconds) retry.start(info.retryAfterSeconds);
        setLookupError(info.retryAfterSeconds ? RATE_LIMIT_DONE_MESSAGE : rateLimitMessage(null));
      } else {
        setLookupError(withRequestId('Tra cứu thất bại. Vui lòng thử lại sau.', info));
      }
    } finally {
      setSearched(true);
      lookingUpRef.current = false;
      setIsLoading(false);
    }
  };

  // Khi đang bị giới hạn tần suất, hiện đếm ngược theo Retry-After.
  const displayError = retry.isLocked ? rateLimitMessage(retry.secondsLeft) : lookupError;

  const handleSendSupplemental = (e: React.FormEvent) => {
    e.preventDefault();
    if (!suppInfo.trim()) return;
    setSuppSuccess(true);
    setSuppInfo('');
    setTimeout(() => setSuppSuccess(false), 4000);
  };

  return (
    <PublicLayout>
      <div className="track-container">
        <div className="track-header">
          <span className="track-badge">TRA CỨU TRẠNG THÁI YÊU CẦU</span>
          <h1 className="track-title">Theo Dõi Đăng Ký Dòng Họ Business</h1>
          {/* [L-08] Sửa tiêu đề/mô tả: Xóa chữ 'hoặc email đại diện' và ví dụ BIZ-... */}
          <p className="track-subtitle">
            Nhập mã theo dõi yêu cầu để kiểm tra tiến độ xét duyệt.
          </p>

          <form
            className="track-search-form"
            onSubmit={(e) => {
              e.preventDefault();
              void handleLookup();
            }}
          >
            {/* [L-08 & L-09 & L-31] Input placeholder, reset searched on change, disabled if empty */}
            <input
              type="text"
              className="track-input"
              data-testid="input-track-code"
              placeholder="Nhập mã tra cứu hồ sơ"
              value={inputCode}
              onChange={(e) => {
                setInputCode(e.target.value);
                setSearched(false);
                setLookupError('');
              }}
              required
            />
            <button
              type="submit"
              className="track-btn"
              data-testid="btn-track-submit"
              disabled={!inputCode.trim() || isLoading || retry.isLocked}
            >
              {isLoading ? 'Đang tra cứu...' : 'Tra Cứu Ngay'}
            </button>
          </form>
        </div>

        {searched && (
          <div className="track-result-section">
            {displayError ? (
              <div className="track-empty">{displayError}</div>
            ) : !currentResult ? (
              <div className="track-empty">
                {/* [L-09] Sử dụng searchedCode thay cho inputCode */}
                ❌ Không tìm thấy yêu cầu đăng ký nào khớp với mã <strong>{searchedCode}</strong>.
                Vui lòng kiểm tra lại chính xác mã tra cứu đã cấp.
              </div>
            ) : (
              <div className="status-detail-card">
                <div className="status-card-head">
                  <div>
                    <span className="code-tag">Mã yêu cầu: {currentResult.code}</span>
                    <h3 className="req-family-name">{currentResult.familyName}</h3>
                  </div>

                  <span className={`status-pill ${currentResult.status}`}>
                    {currentResult.status === 'pending' && '⏳ Đang chờ duyệt'}
                    {currentResult.status === 'approved' && '✓ Đã chấp thuận'}
                    {currentResult.status === 'needs_info' && '⚠️ Cần bổ sung thông tin'}
                    {currentResult.status === 'rejected' && '✕ Từ chối'}
                    {currentResult.status === 'cancelled' && '✕ Đã hủy'}
                  </span>
                </div>

                <div className="req-meta-grid">
                  {currentResult.repName && <div>👤 <strong>Người đại diện:</strong> {currentResult.repName}</div>}
                  {currentResult.tierName && <div>📦 <strong>Gói đăng ký:</strong> {currentResult.tierName}</div>}
                  <div>📅 <strong>Thời điểm gửi:</strong> {currentResult.submittedAt}</div>
                  <div>🕒 <strong>Cập nhật lần cuối:</strong> {currentResult.updatedAt}</div>
                </div>

                {currentResult.adminNotes && (
                  <div className="admin-response-box">
                    <strong>Phản hồi từ Ban Quản Trị:</strong> {currentResult.adminNotes}
                  </div>
                )}

                {/* Supplemental Form if Status is 'needs_info' */}
                {currentResult.status === 'needs_info' && (
                  <div className="supp-info-box">
                    <h4>Bổ sung thông tin theo yêu cầu của Admin:</h4>
                    {suppSuccess && (
                      <div className="supp-success">
                        ✓ Đã gửi thông tin bổ sung thành công!
                      </div>
                    )}
                    <form onSubmit={handleSendSupplemental} className="supp-form">
                      <textarea
                        className="supp-textarea"
                        rows={3}
                        placeholder="Nhập thông tin đính chính hoặc minh chứng bổ sung..."
                        value={suppInfo}
                        onChange={(e) => setSuppInfo(e.target.value)}
                        required
                      />
                      <button type="submit" className="supp-submit-btn">
                        Gửi thông tin bổ sung
                      </button>
                    </form>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </PublicLayout>
  );
};

export default BusinessTrackStatusPage;
