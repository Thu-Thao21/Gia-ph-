import React, { useEffect, useMemo, useState } from 'react';
import { useClanContext } from '../../context/ClanContext';
import {
  fetchMemberAIConsents,
  updateMemberAIConsents,
  revokeAllMemberAIConsents,
  type MemberAIConsents,
} from '../../services/ai.service';
import './SprintFeatures.css';

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
    description: 'Tên, tiểu sử và các trường hồ sơ bạn chủ động chọn cho một tác vụ AI.',
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

const ALL_CONSENTS = [...DATA_CONSENTS, ...FEATURE_CONSENTS];

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
  const [notice, setNotice] = useState<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null);

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
    () => JSON.stringify(draft.choices) !== JSON.stringify(savedSettings.choices) ||
          draft.masterEnabled !== savedSettings.masterEnabled,
    [draft, savedSettings]
  );

  const enabledFeatureCount = FEATURE_CONSENTS.filter(({ id }) => draft.choices[id]).length;
  const missingDataCount = DATA_CONSENTS.filter(({ id }) => !draft.choices[id]).length;
  const consentState: 'enabled' | 'disabled' | 'warning' = !draft.masterEnabled
    ? 'disabled'
    : missingDataCount > 0 || enabledFeatureCount === 0
      ? 'warning'
      : 'enabled';

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
        setNotice({ type: 'success', text: 'Đã lưu cài đặt quyền riêng tư & AI vào hệ thống.' });
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
          text: 'Đã thu hồi toàn bộ sự đồng ý sử dụng dữ liệu với AI. Dữ liệu của bạn sẽ không bao giờ được gửi đến Gemini.',
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
      <section className="sprint-feature-page ai-consent-page">
        <div style={{ textAlign: 'center', padding: '48px 16px' }}>
          <p>Đang tải quyền riêng tư & AI của bạn...</p>
        </div>
      </section>
    );
  }

  return (
    <section className="sprint-feature-page ai-consent-page" aria-labelledby="ai-consent-title">
      <header className="sprint-feature-hero">
        <div>
          <span>QUYỀN RIÊNG TƯ & AI</span>
          <h1 id="ai-consent-title">Quyền riêng tư & AI</h1>
          <p>
            Bạn quyết định loại dữ liệu và từng tính năng AI được phép sử dụng.
            {activeClanName ? ` Dòng họ hiện tại: ${activeClanName}.` : ''}
          </p>
        </div>
        <div className="ai-consent-summary">
          <span className={`ai-state-badge ${consentState}`}>
            {consentState === 'enabled' && 'Đã bật đầy đủ'}
            {consentState === 'warning' && 'Đang bật có giới hạn'}
            {consentState === 'disabled' && 'Đã tắt'}
          </span>
          <small>Cập nhật: {formatUpdatedAt(savedSettings.updatedAt)}</small>
        </div>
      </header>

      {/* BANNER THÔNG BÁO TÌNH TRẠNG AI DÒNG TỘC */}
      {!savedSettings.clanAiEnabled ? (
        <div className="sprint-alert warning" role="status">
          <span aria-hidden="true">!</span>
          <span>
            <strong>Trưởng tộc chưa kích hoạt tính năng AI cho dòng họ này.</strong> Dù bạn có cấp quyền bên dưới,
            hệ thống vẫn chặn mọi truy vấn AI từ dòng họ này để đảm bảo tuân thủ cấu hình chung của Trưởng tộc.
          </span>
        </div>
      ) : (
        <div className="sprint-alert success" role="status" style={{ backgroundColor: '#f0fdf4', borderColor: '#86efac', color: '#166534' }}>
          <span aria-hidden="true">✓</span>
          <span>
            <strong>Dòng họ đã bật AI.</strong> Tuy nhiên, hệ thống tôn trọng quyền riêng tư cá nhân: Việc Trưởng tộc bật AI
            KHÔNG đồng nghĩa với việc tự động gửi dữ liệu của bạn. Dữ liệu của bạn chỉ được chuyển ra Gemini khi bạn đồng ý bên dưới.
          </span>
        </div>
      )}

      {/* LIÊN KẾT HỒ SƠ PHẢ HỆ */}
      <div className="sprint-card" style={{ padding: '16px 20px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
              Đối tượng bảo vệ quyền riêng tư
            </span>
            <div style={{ fontSize: '1rem', fontWeight: 600, color: '#1e293b', marginTop: '2px' }}>
              {savedSettings.personName ? (
                <>Hồ sơ thành viên phả hệ: <strong>{savedSettings.personName}</strong></>
              ) : (
                <>Tài khoản cá nhân (Chưa liên kết hồ sơ phả hệ)</>
              )}
            </div>
          </div>
          <span style={{ fontSize: '0.8rem', padding: '4px 10px', borderRadius: '9999px', background: '#e2e8f0', color: '#475569' }}>
            {savedSettings.personName ? 'Đã liên kết hồ sơ' : 'Bảo vệ tài khoản'}
          </span>
        </div>
      </div>

      {notice && (
        <div className={`sprint-alert ${notice.type}`} role={notice.type === 'error' ? 'alert' : 'status'}>
          <span aria-hidden="true">{notice.type === 'success' ? '✓' : '!'}</span>
          <span>{notice.text}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Đóng thông báo">×</button>
        </div>
      )}

      <div className="ai-master-card sprint-card">
        <div className="ai-master-copy">
          <span className="ai-master-icon" aria-hidden="true">AI</span>
          <div>
            <h2>Cho phép AI xử lý dữ liệu của tôi</h2>
            <p>
              Khi tắt công tắc này, toàn bộ dữ liệu cá nhân của bạn sẽ bị loại trừ tuyệt đối khỏi mọi yêu cầu gửi đến Gemini AI,
              ngay cả khi các thành viên khác đang sử dụng trợ lý AI.
            </p>
          </div>
        </div>
        <label className="sprint-switch">
          <input
            type="checkbox"
            checked={draft.masterEnabled}
            onChange={(event) => {
              setDraft((current) => ({ ...current, masterEnabled: event.target.checked }));
              setNotice(null);
            }}
            aria-label="Cho phép sử dụng AI"
          />
          <span aria-hidden="true" />
        </label>
      </div>

      {consentState === 'disabled' && (
        <div className="sprint-alert neutral" role="status">
          <span aria-hidden="true">○</span>
          <span>AI cá nhân đang tắt. Dữ liệu của bạn được bảo mật tuyệt đối và không ai có thể đưa vào Gemini.</span>
        </div>
      )}

      {consentState === 'warning' && (
        <div className="sprint-alert warning" role="status">
          <span aria-hidden="true">!</span>
          <span>
            Một số quyền dữ liệu đang tắt hoặc chưa chọn tính năng. AI chỉ hoạt động trong phạm vi bạn cho phép.
          </span>
        </div>
      )}

      <div className="ai-consent-grid">
        <ConsentPanel
          title="Dữ liệu được phép xử lý"
          description="Mỗi nhóm dữ liệu được kiểm soát độc lập."
          items={DATA_CONSENTS}
          settings={draft}
          onChange={updateChoice}
        />
        <ConsentPanel
          title="Tính năng AI được phép"
          description="Kết quả AI luôn là gợi ý và không tự sửa gia phả."
          items={FEATURE_CONSENTS}
          settings={draft}
          onChange={updateChoice}
        />
      </div>

      <div className="sprint-card ai-explanation-card">
        <div>
          <span className="ai-info-mark" aria-hidden="true">i</span>
          <div>
            <h2>Nguyên tắc bảo vệ dữ liệu với AI</h2>
            <p>
              Dữ liệu của bạn chỉ được dùng cho mục đích hỗ trợ gia phả. Hệ thống tuân thủ nguyên tắc Privacy-by-Design:
              không chia sẻ bí mật đời tư, có ghi nhận kiểm toán (Audit Log) cho mọi lần cấp hoặc thu hồi quyền.
            </p>
          </div>
        </div>
        <ul>
          <li>Bạn có quyền thay đổi hoặc thu hồi toàn bộ sự đồng ý bất kỳ lúc nào.</li>
          <li>Hình ảnh không bao giờ được gửi nếu quyền Hình ảnh đang tắt.</li>
          <li>AI không có quyền tự động chỉnh sửa cơ sở dữ liệu phả hệ trong giai đoạn này.</li>
        </ul>
      </div>

      <div className="sprint-action-bar">
        <div>
          <strong>{isDirty ? 'Bạn có thay đổi chưa lưu.' : 'Cài đặt quyền riêng tư hiện tại đã đồng bộ với máy chủ.'}</strong>
          <small>{enabledFeatureCount}/3 tính năng đang được chọn</small>
        </div>
        <div className="sprint-actions">
          <button
            type="button"
            className="sprint-secondary"
            disabled={!isDirty || submitting}
            onClick={() => setDraft(cloneSettings(savedSettings))}
          >
            Hoàn tác
          </button>
          <button
            type="button"
            className="sprint-danger"
            disabled={submitting}
            onClick={() => setConfirmAction('revoke')}
          >
            Thu hồi toàn bộ
          </button>
          <button
            type="button"
            className="sprint-primary"
            disabled={!isDirty || submitting}
            onClick={() => setConfirmAction('save')}
          >
            {submitting ? 'Đang lưu...' : 'Lưu lựa chọn'}
          </button>
        </div>
      </div>

      {confirmAction && (
        <div
          className="sprint-modal-overlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setConfirmAction(null);
          }}
        >
          <div className="sprint-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="ai-confirm-title">
            <span className={`sprint-confirm-icon ${confirmAction === 'revoke' ? 'danger' : ''}`} aria-hidden="true">
              {confirmAction === 'revoke' ? '!' : '✓'}
            </span>
            <h2 id="ai-confirm-title">
              {confirmAction === 'revoke' ? 'Thu hồi toàn bộ quyền AI?' : 'Xác nhận thay đổi quyền AI?'}
            </h2>
            <p>
              {confirmAction === 'revoke'
                ? 'Tất cả loại dữ liệu và tính năng AI của bạn sẽ bị tắt ngay lập tức trên máy chủ. Mọi yêu cầu gửi dữ liệu cá nhân của bạn ra Gemini sẽ bị chặn.'
                : draft.masterEnabled
                  ? 'AI sẽ chỉ được phép sử dụng các loại dữ liệu và tính năng bạn đã chọn.'
                  : 'AI sẽ bị vô hiệu hóa hoàn toàn đối với dữ liệu của bạn sau khi lưu.'}
            </p>
            <div className="sprint-modal-actions">
              <button
                type="button"
                className="sprint-secondary"
                disabled={submitting}
                onClick={() => setConfirmAction(null)}
              >
                Hủy
              </button>
              <button
                type="button"
                className={confirmAction === 'revoke' ? 'sprint-danger' : 'sprint-primary'}
                disabled={submitting}
                onClick={handleConfirm}
              >
                {submitting ? 'Đang xử lý...' : confirmAction === 'revoke' ? 'Xác nhận thu hồi' : 'Xác nhận lưu'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

const ConsentPanel: React.FC<{
  title: string;
  description: string;
  items: ConsentDefinition[];
  settings: ConsentSettings;
  onChange: (id: ConsentId, value: boolean) => void;
}> = ({ title, description, items, settings, onChange }) => (
  <article className={`sprint-card ai-consent-panel ${settings.masterEnabled ? '' : 'disabled'}`}>
    <div className="ai-panel-heading">
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
    <div className="ai-choice-list">
      {items.map((item) => (
        <label className="ai-choice-row" key={item.id}>
          <span className="ai-choice-copy">
            <small>{item.tag}</small>
            <strong>{item.title}</strong>
            <span>{item.description}</span>
          </span>
          <input
            type="checkbox"
            checked={settings.choices[item.id]}
            disabled={!settings.masterEnabled}
            onChange={(event) => onChange(item.id, event.target.checked)}
            aria-label={item.title}
          />
        </label>
      ))}
    </div>
  </article>
);

export default AIConsentModule;
