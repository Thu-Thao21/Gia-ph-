import React, { useState } from 'react';
import type { MemberDetail } from '../../../types/member';
import { summarizeAIBiography } from '../../../services/ai.service';
import type { AIBiographySummarizeResponse } from '../../../types/ai';
import { useClanContext } from '../../../context/ClanContext';
import '../Profile.css';
import './BiographyTab.css';

export interface BiographyTabProps {
  member: MemberDetail;
}

export const BiographyTab: React.FC<BiographyTabProps> = ({ member }) => {
  const { activeClanId } = useClanContext();
  const effectiveClanId = member.familyId || activeClanId;

  const [selectedStyle, setSelectedStyle] = useState<'short' | 'standard' | 'formal'>('standard');
  const [loadingAI, setLoadingAI] = useState<boolean>(false);
  const [aiSummary, setAiSummary] = useState<AIBiographySummarizeResponse | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  const handleGenerateSummary = async () => {
    if (!effectiveClanId || !member.id) {
      setAiError('Không xác định được mã dòng họ hoặc thành viên.');
      return;
    }

    setLoadingAI(true);
    setAiError(null);
    setCopied(false);

    try {
      const res = await summarizeAIBiography(effectiveClanId, {
        person_id: member.id,
        style: selectedStyle,
      });
      setAiSummary(res);
    } catch (err: any) {
      setAiError(err?.message || 'Không thể tạo bản tóm tắt tiểu sử bằng AI.');
    } finally {
      setLoadingAI(false);
    }
  };

  const handleCopy = async () => {
    if (!aiSummary?.summary) return;
    try {
      await navigator.clipboard.writeText(aiSummary.summary);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback
    }
  };

  return (
    <div className="biography-tab-wrapper">
      {/* KHỐI AI TÓM TẮT TIỂU SỬ TỔ TIÊN (GIAI ĐOẠN 4) */}
      <div className="profile-card ai-biography-card">
        <div className="ai-bio-header">
          <div className="ai-bio-title-wrap">
            <div className="ai-bio-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
            </div>
            <div>
              <h3 className="profile-card-title ai-title">Tóm Tắt Tiểu Sử Bằng AI</h3>
              <p className="ai-bio-subtitle">
                Tự động tổng hợp tiểu sử có căn cứ từ dữ kiện gia phả (thế hệ, chi tộc, quan hệ gia đình).
              </p>
            </div>
          </div>

          {/* Bộ chọn phong cách tóm tắt */}
          <div className="ai-style-selector">
            <span className="style-label">Phong cách:</span>
            <div className="style-pills">
              <button
                type="button"
                className={`style-pill-btn ${selectedStyle === 'short' ? 'active' : ''}`}
                onClick={() => setSelectedStyle('short')}
                disabled={loadingAI}
              >
                Ngắn gọn (3-5 câu)
              </button>
              <button
                type="button"
                className={`style-pill-btn ${selectedStyle === 'standard' ? 'active' : ''}`}
                onClick={() => setSelectedStyle('standard')}
                disabled={loadingAI}
              >
                Tiêu chuẩn (1-2 đoạn)
              </button>
              <button
                type="button"
                className={`style-pill-btn ${selectedStyle === 'formal' ? 'active' : ''}`}
                onClick={() => setSelectedStyle('formal')}
                disabled={loadingAI}
              >
                Trang trọng (Gia tộc)
              </button>
            </div>
          </div>
        </div>

        {/* Nút hành động */}
        <div className="ai-bio-action-row">
          <button
            type="button"
            className="ai-generate-bio-btn"
            onClick={handleGenerateSummary}
            disabled={loadingAI}
          >
            {loadingAI ? (
              <>
                <span className="ai-btn-spinner" />
                <span>AI đang phân tích dữ kiện & soạn thảo...</span>
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                </svg>
                <span>{aiSummary ? 'Tạo lại bản tóm tắt' : 'Tạo bản tóm tắt tiểu sử bằng AI'}</span>
              </>
            )}
          </button>
        </div>

        {/* Thông báo lỗi nếu có */}
        {aiError && (
          <div className="ai-bio-error-alert">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>{aiError}</span>
          </div>
        )}

        {/* KẾT QUẢ TÓM TẮT AI */}
        {aiSummary && (
          <div className="ai-bio-result-card">
            <div className="result-top-bar">
              <div className="result-badge-group">
                <span className="result-ai-tag">Bản tóm tắt do Gemini tạo</span>
                <span className="result-style-tag">
                  {aiSummary.style === 'short'
                    ? 'Ngắn gọn'
                    : aiSummary.style === 'formal'
                    ? 'Trang trọng'
                    : 'Tiêu chuẩn'}
                </span>
                {aiSummary.status === 'clan_ai_disabled' && (
                  <span className="result-notice-tag">Chế độ cơ bản (AI dòng họ chưa bật)</span>
                )}
                {aiSummary.status === 'consent_revoked' && (
                  <span className="result-notice-tag warning">Chưa cấp quyền AI cá nhân</span>
                )}
              </div>
              <button
                type="button"
                className={`copy-summary-btn ${copied ? 'copied' : ''}`}
                onClick={handleCopy}
                title="Sao chép nội dung tóm tắt"
              >
                {copied ? (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    <span>Đã sao chép!</span>
                  </>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                    <span>Sao chép nội dung</span>
                  </>
                )}
              </button>
            </div>

            {/* Nội dung tóm tắt */}
            <div className="ai-summary-text-content">
              {aiSummary.summary.split('\n').map((paragraph, idx) => (
                paragraph.trim() ? <p key={idx}>{paragraph.trim()}</p> : null
              ))}
            </div>

            {/* Dữ kiện đã kiểm chứng từ DB */}
            {aiSummary.verified_facts && aiSummary.verified_facts.length > 0 && (
              <div className="verified-facts-box">
                <span className="facts-label">Dữ kiện phả hệ đã xác minh từ Neon DB:</span>
                <div className="facts-list">
                  {aiSummary.verified_facts.map((fact, idx) => (
                    <span key={idx} className="fact-chip">
                      <span className="fact-dot" />
                      {fact}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="ai-bio-footer-disclaimer">
              Bản tóm tắt chỉ mang tính chất tham khảo cho gia tộc, không tự ý thay đổi hoặc ghi đè tiểu sử gốc trong cơ sở dữ liệu.
            </div>
          </div>
        )}
      </div>

      {/* TIỂU SỬ GỐC TRONG GIA PHẢ */}
      <div className="profile-card">
        <h3 className="profile-card-title">Tiểu Sử & Ghi Chép Gốc</h3>
        <p className="biography-text">
          {member.bio || 'Chưa có thông tin tiểu sử nào được ghi chép cho thành viên này.'}
        </p>
      </div>

      {/* DÒNG THỜI GIAN & SỰ KIỆN QUAN TRỌNG */}
      <div className="profile-card">
        <h3 className="profile-card-title">Dòng Thời Gian & Sự Kiện Quan Trọng</h3>
        {member.lifeEvents && member.lifeEvents.length > 0 ? (
          <div className="profile-timeline">
            {member.lifeEvents.map((evt) => (
              <div key={evt.id} className="profile-timeline-item">
                <div className="profile-timeline-year">{evt.eventDate || 'Thời gian chưa rõ'}</div>
                <div className="profile-timeline-title">{evt.title}</div>
                {evt.location && <div className="biography-location"> {evt.location}</div>}
                {evt.description && <div className="profile-timeline-desc">{evt.description}</div>}
              </div>
            ))}
          </div>
        ) : (
          <div className="profile-empty">Chưa có sự kiện đời sống nào được cập nhật.</div>
        )}
      </div>
    </div>
  );
};

export default BiographyTab;
