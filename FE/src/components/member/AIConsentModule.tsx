import React, { useMemo, useState } from 'react';
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
}

interface ConsentDefinition {
  id: ConsentId;
  title: string;
  description: string;
  tag: string;
}

const STORAGE_KEY = 'mfg-ai-consent';

const DATA_CONSENTS: ConsentDefinition[] = [
  {
    id: 'personalData',
    title: 'Dữ liệu cá nhân',
    description: 'Tên, tiểu sử và các trường hồ sơ bạn chủ động chọn cho một tác vụ AI.',
    tag: 'DỮ LIỆU',
  },
  {
    id: 'images',
    title: 'Hình ảnh',
    description: 'Ảnh chân dung và ảnh tư liệu chỉ được dùng khi bạn bật quyền này.',
    tag: 'HÌNH ẢNH',
  },
  {
    id: 'genealogyData',
    title: 'Dữ liệu gia phả',
    description: 'Quan hệ, đời thứ và nhánh họ phục vụ phân tích trong phạm vi quyền truy cập.',
    tag: 'GIA PHẢ',
  },
];

const FEATURE_CONSENTS: ConsentDefinition[] = [
  {
    id: 'relationshipAnalysis',
    title: 'Phân tích quan hệ và xưng hô',
    description: 'Giải thích vai vế dựa trên các liên kết đã được xác nhận.',
    tag: 'TÍNH NĂNG',
  },
  {
    id: 'dataSuggestions',
    title: 'Gợi ý dữ liệu còn thiếu',
    description: 'Đề xuất trường hồ sơ hoặc liên kết cần người dùng kiểm tra.',
    tag: 'TÍNH NĂNG',
  },
  {
    id: 'biographyDrafts',
    title: 'Hỗ trợ viết tiểu sử',
    description: 'Tạo bản nháp từ đúng những dữ liệu bạn đã cho phép.',
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
};

const cloneSettings = (settings: ConsentSettings): ConsentSettings =>
  JSON.parse(JSON.stringify(settings)) as ConsentSettings;

const loadSettings = (): ConsentSettings => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return cloneSettings(DEFAULT_SETTINGS);
    const parsed = JSON.parse(raw) as Record<string, unknown> | null;
    if (!parsed || typeof parsed !== 'object') return cloneSettings(DEFAULT_SETTINGS);

    const next = cloneSettings(DEFAULT_SETTINGS);
    const choices = parsed.choices as Partial<Record<ConsentId, unknown>> | undefined;

    ALL_CONSENTS.forEach(({ id }) => {
      if (typeof choices?.[id] === 'boolean') next.choices[id] = choices[id] as boolean;
    });

    // Migrate the former three-purpose local format without losing a user's choices.
    if (!choices) {
      next.choices.relationshipAnalysis = Boolean(parsed.relationship);
      next.choices.dataSuggestions = Boolean(parsed.suggestion);
      next.choices.biographyDrafts = Boolean(parsed.biography);
      next.choices.personalData = next.choices.biographyDrafts;
      next.choices.genealogyData = next.choices.relationshipAnalysis || next.choices.dataSuggestions;
    }

    const hasEnabledChoice = Object.values(next.choices).some(Boolean);
    next.masterEnabled = typeof parsed.masterEnabled === 'boolean'
      ? parsed.masterEnabled
      : hasEnabledChoice;
    next.updatedAt = typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null;
    return next;
  } catch {
    return cloneSettings(DEFAULT_SETTINGS);
  }
};

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
  const initialSettings = useMemo(loadSettings, []);
  const [savedSettings, setSavedSettings] = useState<ConsentSettings>(() => cloneSettings(initialSettings));
  const [draft, setDraft] = useState<ConsentSettings>(() => cloneSettings(initialSettings));
  const [confirmAction, setConfirmAction] = useState<'save' | 'revoke' | null>(null);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const isDirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(savedSettings),
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

  const persist = (settings: ConsentSettings, message: string) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
      setSavedSettings(cloneSettings(settings));
      setDraft(cloneSettings(settings));
      setNotice({ type: 'success', text: message });
    } catch {
      setNotice({
        type: 'error',
        text: 'Không thể lưu lựa chọn AI trên trình duyệt. Vui lòng thử lại.',
      });
    }
  };

  const handleConfirm = () => {
    if (confirmAction === 'save') {
      persist(
        { ...cloneSettings(draft), updatedAt: new Date().toISOString() },
        'Đã lưu lựa chọn đồng ý sử dụng AI.'
      );
    }

    if (confirmAction === 'revoke') {
      persist(
        { ...cloneSettings(DEFAULT_SETTINGS), updatedAt: new Date().toISOString() },
        'Đã thu hồi toàn bộ sự đồng ý sử dụng AI.'
      );
    }

    setConfirmAction(null);
  };

  return (
    <section className="sprint-feature-page ai-consent-page" aria-labelledby="ai-consent-title">
      <header className="sprint-feature-hero">
        <div>
          <span>QUYỀN RIÊNG TƯ & AI</span>
          <h1 id="ai-consent-title">Đồng ý sử dụng AI</h1>
          <p>Bạn quyết định loại dữ liệu và từng tính năng AI được phép sử dụng.</p>
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
            <h2>Cho phép các tính năng AI</h2>
            <p>
              Khi tắt, toàn bộ xử lý AI bị vô hiệu hóa. Các lựa chọn chi tiết được giữ lại cho đến khi bạn lưu hoặc thu hồi.
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
          <span>AI đang tắt. Trợ lý AI và các đề xuất tự động sẽ ở trạng thái không khả dụng.</span>
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
            <h2>AI sử dụng dữ liệu như thế nào?</h2>
            <p>
              Dữ liệu chỉ được dùng để tạo kết quả cho tác vụ bạn yêu cầu. Bản demo này lưu lựa chọn trên thiết bị,
              không gửi dữ liệu tới máy chủ và không tự thay đổi hồ sơ hay quan hệ gia phả.
            </p>
          </div>
        </div>
        <ul>
          <li>Bạn có thể thay đổi hoặc thu hồi sự đồng ý bất kỳ lúc nào.</li>
          <li>Hình ảnh không được xử lý nếu quyền Hình ảnh đang tắt.</li>
          <li>Các quyết định quan trọng luôn cần người dùng hoặc quản trị viên xác nhận.</li>
        </ul>
      </div>

      <div className="sprint-action-bar">
        <div>
          <strong>{isDirty ? 'Bạn có thay đổi chưa lưu.' : 'Lựa chọn hiện tại đã được lưu.'}</strong>
          <small>{enabledFeatureCount}/3 tính năng đang được chọn</small>
        </div>
        <div className="sprint-actions">
          <button
            type="button"
            className="sprint-secondary"
            disabled={!isDirty}
            onClick={() => setDraft(cloneSettings(savedSettings))}
          >
            Hoàn tác
          </button>
          <button type="button" className="sprint-danger" onClick={() => setConfirmAction('revoke')}>
            Thu hồi toàn bộ
          </button>
          <button
            type="button"
            className="sprint-primary"
            disabled={!isDirty}
            onClick={() => setConfirmAction('save')}
          >
            Lưu lựa chọn
          </button>
        </div>
      </div>

      {confirmAction && (
        <div className="sprint-modal-overlay" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setConfirmAction(null);
        }}>
          <div className="sprint-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="ai-confirm-title">
            <span className={`sprint-confirm-icon ${confirmAction === 'revoke' ? 'danger' : ''}`} aria-hidden="true">
              {confirmAction === 'revoke' ? '!' : '✓'}
            </span>
            <h2 id="ai-confirm-title">
              {confirmAction === 'revoke' ? 'Thu hồi toàn bộ sự đồng ý?' : 'Xác nhận thay đổi quyền AI?'}
            </h2>
            <p>
              {confirmAction === 'revoke'
                ? 'Tất cả loại dữ liệu và tính năng AI sẽ bị tắt trên thiết bị này.'
                : draft.masterEnabled
                  ? 'AI sẽ chỉ sử dụng các loại dữ liệu và tính năng bạn đang chọn.'
                  : 'AI sẽ bị vô hiệu hóa sau khi lưu thay đổi này.'}
            </p>
            <div className="sprint-modal-actions">
              <button type="button" className="sprint-secondary" onClick={() => setConfirmAction(null)}>Hủy</button>
              <button
                type="button"
                className={confirmAction === 'revoke' ? 'sprint-danger' : 'sprint-primary'}
                onClick={handleConfirm}
              >
                {confirmAction === 'revoke' ? 'Xác nhận thu hồi' : 'Xác nhận lưu'}
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
