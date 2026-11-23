import React, { useEffect, useMemo, useState } from 'react';
import { useClanContext } from '../../context/ClanContext';
import {
  fetchMemberAIConsents,
  updateMemberAIConsents,
  revokeAllMemberAIConsents,
  type MemberAIConsents,
} from '../../services/ai.service';
import './AIConsentModule.css';
import { LoadingState } from '../../shared/Feedback/LoadingState';

type ConsentId =
  | 'personalData'
  | 'images'
  | 'genealogyData'
  | 'relationshipAnalysis'
  | 'dataSuggestions'
  | 'biographyDrafts';

interface ConsentSettings {
  masterEnabled: boolean;
  choices: Record<ConsentId, boolean>;
  updatedAt: string | null;
  clanAiEnabled: boolean;
  personName: string | null;
}

interface ConsentDefinition {
  id: ConsentId;
  title: string;
  description: string;
  tag: string;
}

const DATA_CONSENTS: ConsentDefinition[] = [
  {
    id: 'personalData',
    title: 'Dữ liệu cá nhân',
    description: 'Tên, tiểu sử và các trường thông tin cơ bản bạn chọn cho tác vụ AI.',
    tag: 'DỮ LIỆU',
  },
  {
    id: 'images',
    title: 'Hình ảnh & Chân dung',
    description: 'Ảnh chân dung và ảnh tư liệu chỉ được dùng khi bạn bật quyền này.',
    tag: 'HÌNH ẢNH',
  },
  {
    id: 'genealogyData',
    title: 'Dữ liệu gia phả',
    description: 'Quan hệ họ hàng, thế thứ và nhánh họ phục vụ phân tích trong phạm vi cho phép.',
    tag: 'GIA PHẢ',
  },
];

const FEATURE_CONSENTS: ConsentDefinition[] = [
  {
    id: 'relationshipAnalysis',
    title: 'Phân tích quan hệ & xưng hô',
    description: 'Giải thích vai vế dựa trên các liên kết đã được xác nhận trong dòng họ.',
    tag: 'TÍNH NĂNG',
  },
  {
    id: 'dataSuggestions',
    title: 'Gợi ý dữ liệu còn thiếu',
    description: 'Đề xuất trường hồ sơ hoặc liên kết thân nhân cần kiểm tra.',
    tag: 'TÍNH NĂNG',
  },
  {
    id: 'biographyDrafts',
    title: 'Hỗ trợ viết tiểu sử',
    description: 'Tạo bản nháp tiểu sử từ đúng những dữ liệu bạn đã cho phép.',
    tag: 'TÍNH NĂNG',
  },
];

const DEFAULT_SETTINGS: ConsentSettings = {
  masterEnabled: false,
  choices: {
    personalData: false,
    images: false,
    genealogyData: false,
    relationshipAnalysis: false,
    dataSuggestions: false,
    biographyDrafts: false,
  },
  updatedAt: null,
  clanAiEnabled: false,
  personName: null,
};

const cloneSettings = (settings: ConsentSettings): ConsentSettings =>
  JSON.parse(JSON.stringify(settings)) as ConsentSettings;

const formatUpdatedAt = (value: string | null) => {
  if (!value) return 'Chưa có lần cập nhật';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Không xác định';
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
};

export const AIConsentModule: React.FC = () => {
  const { activeClanId, activeClanName } = useClanContext();
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [savedSettings, setSavedSettings] = useState<ConsentSettings>(() => cloneSettings(DEFAULT_SETTINGS));
  const [draft, setDraft] = useState<ConsentSettings>(() => cloneSettings(DEFAULT_SETTINGS));
  const [confirmAction, setConfirmAction] = useState<'save' | 'revoke' | null>(null);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Load consents from Backend
  useEffect(() => {
    if (!activeClanId) {
      setLoading(false);
      return;
    }

    let isCancelled = false;
    setLoading(true);
    setNotice(null);

    fetchMemberAIConsents(activeClanId)
      .then((data: MemberAIConsents) => {
        if (isCancelled) return;
        const loaded: ConsentSettings = {
          masterEnabled: Boolean(data.master_consent),
          choices: {
            personalData: Boolean(data.choices.personalData),
            images: Boolean(data.choices.images),
            genealogyData: Boolean(data.choices.genealogyData),
            relationshipAnalysis: Boolean(data.choices.relationshipAnalysis),
            dataSuggestions: Boolean(data.choices.dataSuggestions),
            biographyDrafts: Boolean(data.choices.biographyDrafts),
          },
          updatedAt: data.updated_at || null,
          clanAiEnabled: Boolean(data.clan_ai_enabled),
          personName: data.person_name || null,
        };
        setSavedSettings(cloneSettings(loaded));
        setDraft(cloneSettings(loaded));
      })
      .catch((err) => {
        if (isCancelled) return;
        setNotice({
          type: 'error',
          text: err.message || 'Không thể tải quyền riêng tư & AI từ máy chủ.',
        });
      })
      .finally(() => {
        if (!isCancelled) setLoading(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [activeClanId]);

  const isDirty = useMemo(
    () =>
      JSON.stringify(draft.choices) !== JSON.stringify(savedSettings.choices) ||
      draft.masterEnabled !== savedSettings.masterEnabled,
    [draft, savedSettings]
  );

  const enabledFeatureCount = FEATURE_CONSENTS.filter(({ id }) => draft.choices[id]).length;

  const updateChoice = (id: ConsentId, value: boolean) => {
    setDraft((current) => ({
      ...current,
      choices: { ...current.choices, [id]: value },
    }));
    setNotice(null);
  };

  const handleConfirm = async () => {
    if (!activeClanId) return;
    setSubmitting(true);

    if (confirmAction === 'save') {
      try {
        const res = await updateMemberAIConsents(activeClanId, {
          master_consent: draft.masterEnabled,
          choices: draft.choices,
        });

        const next: ConsentSettings = {
          masterEnabled: Boolean(res.master_consent),
          choices: {
            personalData: Boolean(res.choices.personalData),
            images: Boolean(res.choices.images),
            genealogyData: Boolean(res.choices.genealogyData),
            relationshipAnalysis: Boolean(res.choices.relationshipAnalysis),
            dataSuggestions: Boolean(res.choices.dataSuggestions),
            biographyDrafts: Boolean(res.choices.biographyDrafts),
          },
          updatedAt: res.updated_at || new Date().toISOString(),
          clanAiEnabled: Boolean(res.clan_ai_enabled),
          personName: res.person_name || draft.personName,
        };

        setSavedSettings(cloneSettings(next));
        setDraft(cloneSettings(next));
        setNotice({ type: 'success', text: 'Đã lưu cấu hình quyền riêng tư & AI thành công.' });
      } catch (err: any) {
        setNotice({
          type: 'error',
          text: err.message || 'Lỗi khi lưu cài đặt quyền AI.',
        });
      }
    }

    if (confirmAction === 'revoke') {
      try {
        await revokeAllMemberAIConsents(activeClanId);
        const next: ConsentSettings = {
          ...cloneSettings(DEFAULT_SETTINGS),
          updatedAt: new Date().toISOString(),
          clanAiEnabled: savedSettings.clanAiEnabled,
          personName: savedSettings.personName,
        };

        setSavedSettings(cloneSettings(next));
        setDraft(cloneSettings(next));
        setNotice({
          type: 'success',
          text: 'Đã thu hồi toàn bộ sự đồng ý sử dụng dữ liệu với AI. Dữ liệu của bạn được bảo mật tuyệt đối.',
        });
      } catch (err: any) {
        setNotice({
          type: 'error',
          text: err.message || 'Lỗi khi thu hồi quyền AI.',
        });
      }
    }

    setSubmitting(false);
    setConfirmAction(null);
  };

  if (loading) {
    return (
      <div className="ai-consent-container">
        <LoadingState
          message="Đang tải thiết lập Quyền riêng tư & AI..."
          subMessage="Hệ thống đang đồng bộ cấu hình bảo mật dữ liệu và quyền truy cập AI của bạn từ máy chủ gia tộc."
        />
      </div>
    );
  }

  return (
    <div className="ai-consent-container">
      {/* 1. BLUE SIGNATURE HERO HEADER (Đồng bộ với các trang khác) */}
      <header className="ai-hero-header">
        <div className="ai-hero-content">
          <span className="ai-hero-eyebrow">QUYỀN RIÊNG TƯ & AI</span>
          <h1 className="ai-hero-title">Quyền riêng tư & AI</h1>
          <p className="ai-hero-desc">
            Quản lý phạm vi dữ liệu cá nhân và các tính năng AI bạn cho phép sử dụng trong dòng họ.
          </p>
          <div className="ai-hero-meta-row">
            <span className="ai-hero-glass-tag">
              Dòng họ: <strong>{activeClanName || 'Chưa chọn'}</strong>
            </span>
            <span className="ai-hero-glass-tag">
              {savedSettings.personName ? `Hồ sơ: ${savedSettings.personName}` : 'Tài khoản cá nhân'}
            </span>
          </div>
        </div>
        <div className="ai-hero-right">
          <span className={`ai-hero-status-pill ${draft.masterEnabled ? 'active' : 'inactive'}`}>
            {draft.masterEnabled ? 'AI đang Bật' : 'AI đang Tắt'}
          </span>
          <span className="ai-hero-date">
            Cập nhật: {formatUpdatedAt(savedSettings.updatedAt)}
          </span>
        </div>
      </header>

      {/* THÔNG BÁO TÁC VỤ */}
      {notice && (
        <div className={`ai-alert alert-${notice.type}`} role="status">
          <span>{notice.text}</span>
          <button
            type="button"
            className="ai-alert-close"
            onClick={() => setNotice(null)}
            aria-label="Đóng thông báo"
          >
            ×
          </button>
        </div>
      )}

      {/* SECTION 1: MASTER TOGGLE */}
      <div className="ai-card">
        <div className="ai-card-header">
          <div className="ai-card-title-group">
            <h3>1. Kích hoạt quyền riêng tư AI cho dữ liệu cá nhân</h3>
            <p>Quyết định cho phép hệ thống sử dụng dữ liệu của bạn trong các tính năng hỗ trợ thông minh.</p>
          </div>
          <label className="ai-switch-control">
            <span className="ai-switch-label">{draft.masterEnabled ? 'Đang Bật' : 'Đang Tắt'}</span>
            <input
              type="checkbox"
              checked={draft.masterEnabled}
              onChange={(e) => {
                setDraft((current) => ({ ...current, masterEnabled: e.target.checked }));
                setNotice(null);
              }}
              aria-label="Cho phép AI xử lý dữ liệu của tôi"
            />
            <span className="ai-switch-track" />
          </label>
        </div>

        {/* Thông báo ngữ cảnh trạng thái trong Card 1 */}
        {!savedSettings.clanAiEnabled ? (
          <div className="ai-notice-box notice-warning">
            <span>
              <strong>Trưởng tộc chưa kích hoạt tính năng AI cho dòng họ này.</strong> Dù bạn có cấp quyền bên dưới,
              hệ thống vẫn chặn mọi truy vấn AI từ dòng họ này để đảm bảo tuân thủ thiết lập chung.
            </span>
          </div>
        ) : !draft.masterEnabled ? (
          <div className="ai-notice-box notice-neutral">
            <span>
              <strong>AI cá nhân đang TẮT.</strong> Toàn bộ dữ liệu cá nhân của bạn được bảo mật tuyệt đối,
              không bao giờ được gửi đến Gemini AI ngay cả khi thành viên khác đang dùng trợ lý.
            </span>
          </div>
        ) : (
          <div className="ai-notice-box notice-info">
            <span>
              <strong>AI cá nhân đang BẬT.</strong> Hệ thống chỉ sử dụng đúng các phạm vi dữ liệu và tính năng bạn đã đồng ý bên dưới.
            </span>
          </div>
        )}
      </div>

      {/* SECTION 2: DỮ LIỆU ĐƯỢC PHÉP XỬ LÝ */}
      <div className="ai-card">
        <h3>2. Phạm vi dữ liệu được phép xử lý</h3>
        <p className="card-desc">Chỉ những nhóm dữ liệu được chọn mới có thể đưa vào phân tích hỗ trợ.</p>

        <div className="ai-options-grid">
          {DATA_CONSENTS.map((item) => {
            const isChecked = draft.choices[item.id];
            return (
              <label
                key={item.id}
                className={`ai-option-item ${!draft.masterEnabled ? 'disabled' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  disabled={!draft.masterEnabled}
                  onChange={(e) => updateChoice(item.id, e.target.checked)}
                />
                <div className="ai-option-text">
                  <span className="ai-option-badge">{item.tag}</span>
                  <span className="ai-option-title">{item.title}</span>
                  <span className="ai-option-desc">{item.description}</span>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      {/* SECTION 3: TÍNH NĂNG AI ĐƯỢC PHÉP */}
      <div className="ai-card">
        <h3>3. Các tính năng AI được phép hoạt động</h3>
        <p className="card-desc">Kết quả AI luôn là gợi ý hỗ trợ và không tự ý sửa đổi cơ sở dữ liệu gia phả.</p>

        <div className="ai-options-grid">
          {FEATURE_CONSENTS.map((item) => {
            const isChecked = draft.choices[item.id];
            return (
              <label
                key={item.id}
                className={`ai-option-item ${!draft.masterEnabled ? 'disabled' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  disabled={!draft.masterEnabled}
                  onChange={(e) => updateChoice(item.id, e.target.checked)}
                />
                <div className="ai-option-text">
                  <span className="ai-option-badge">{item.tag}</span>
                  <span className="ai-option-title">{item.title}</span>
                  <span className="ai-option-desc">{item.description}</span>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      {/* SECTION 4: NGUYÊN TẮC BẢO VỆ DỮ LIỆU */}
      <div className="ai-card">
        <h3>4. Cam kết bảo vệ quyền riêng tư & Nguyên tắc AI</h3>
        <p className="card-desc">Thiết lập minh bạch theo nguyên tắc Privacy-by-Design.</p>

        <div className="ai-commitments-grid">
          <div className="ai-commitment-item">
            <strong>Quyền kiểm soát tức thì</strong>
            <p>Bạn có toàn quyền thay đổi hoặc thu hồi toàn bộ sự đồng ý bất kỳ lúc nào với hiệu lực tức thì.</p>
          </div>
          <div className="ai-commitment-item">
            <strong>Cách ly hình ảnh & chân dung</strong>
            <p>Ảnh chân dung và tư liệu không bao giờ được gửi nếu quyền Hình ảnh & Chân dung đang tắt.</p>
          </div>
          <div className="ai-commitment-item">
            <strong>An toàn phả hệ & Nhật ký kiểm toán</strong>
            <p>AI không tự sửa dữ liệu dòng tộc. Mọi thao tác cấp hoặc thu hồi quyền đều được lưu nhật ký (Audit Log).</p>
          </div>
        </div>
      </div>

      {/* SECTION 5: THANH THAO TÁC LIỀN TRANG (KHÔNG NỔI ĐÈ LÊN CHATBOT) */}
      <div className="ai-actions-bar">
        <div className="ai-actions-status">
          {isDirty && <span className="ai-dirty-badge">Có thay đổi chưa lưu</span>}
          <span className="ai-status-summary-text">
            {enabledFeatureCount}/3 tính năng AI đang chọn • Cập nhật lần cuối: {formatUpdatedAt(savedSettings.updatedAt)}
          </span>
        </div>
        <div className="ai-actions-buttons">
          <button
            type="button"
            className="btn-ai-revert"
            disabled={!isDirty || submitting}
            onClick={() => setDraft(cloneSettings(savedSettings))}
          >
            Hoàn tác
          </button>
          <button
            type="button"
            className="btn-ai-revoke"
            disabled={submitting}
            onClick={() => setConfirmAction('revoke')}
          >
            Thu hồi toàn bộ
          </button>
          <button
            type="button"
            className="btn-ai-save"
            disabled={!isDirty || submitting}
            onClick={() => setConfirmAction('save')}
          >
            {submitting ? 'Đang lưu...' : 'Lưu lựa chọn'}
          </button>
        </div>
      </div>

      {/* MODAL XÁC NHẬN */}
      {confirmAction && (
        <div
          className="ai-modal-overlay"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setConfirmAction(null);
          }}
        >
          <div className="ai-modal-dialog" role="dialog" aria-modal="true">
            <div className="ai-modal-header">
              <h3>
                {confirmAction === 'revoke' ? 'Thu hồi toàn bộ quyền AI?' : 'Xác nhận lưu thay đổi quyền AI?'}
              </h3>
            </div>
            <p>
              {confirmAction === 'revoke'
                ? 'Tất cả loại dữ liệu và tính năng AI của bạn sẽ bị tắt ngay lập tức trên máy chủ. Mọi yêu cầu gửi dữ liệu cá nhân của bạn ra Gemini sẽ bị chặn.'
                : draft.masterEnabled
                  ? 'AI sẽ chỉ được phép sử dụng các loại dữ liệu và tính năng bạn đã chọn.'
                  : 'AI sẽ bị vô hiệu hóa hoàn toàn đối với dữ liệu của bạn sau khi lưu.'}
            </p>
            <div className="ai-modal-footer">
              <button
                type="button"
                className="btn-ai-revert"
                disabled={submitting}
                onClick={() => setConfirmAction(null)}
              >
                Hủy
              </button>
              <button
                type="button"
                className={confirmAction === 'revoke' ? 'btn-ai-revoke' : 'btn-ai-save'}
                disabled={submitting}
                onClick={handleConfirm}
              >
                {submitting ? 'Đang xử lý...' : confirmAction === 'revoke' ? 'Xác nhận thu hồi' : 'Xác nhận lưu'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AIConsentModule;
