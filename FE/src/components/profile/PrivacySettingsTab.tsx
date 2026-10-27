import React, { useMemo, useState } from 'react';
import './PrivacySettingsTab.css';

export interface PrivacySettingsTabProps {
  memberId?: string;
}

export type VisibilityLevel = 'PUBLIC' | 'AFFILIATED' | 'FAMILY' | 'ADMIN_ONLY' | 'PRIVATE';

type PrivacyRuleId =
  | 'overallProfile'
  | 'personalInfo'
  | 'familyInfo'
  | 'familyTree'
  | 'birthDeath'
  | 'sensitiveInfo';

type AudienceRole = 'SELF' | 'GUEST' | 'AFFILIATED' | 'FAMILY' | 'ADMIN';
type ManagedAudienceRole = Exclude<AudienceRole, 'SELF'>;

interface PrivacySettings {
  visibility: Record<PrivacyRuleId, VisibilityLevel>;
  groupAccess: Record<ManagedAudienceRole, Record<PrivacyRuleId, boolean>>;
  updatedAt: string | null;
}

interface PrivacyRuleDefinition {
  id: PrivacyRuleId;
  label: string;
  description: string;
  previewLabel: string;
}

const STORAGE_KEY = 'mfg-privacy-settings-v2';

const RULES: PrivacyRuleDefinition[] = [
  {
    id: 'overallProfile',
    label: 'Hiển thị hồ sơ tổng quan',
    description: 'Tên, ảnh đại diện, đời thứ và trạng thái thành viên.',
    previewLabel: 'Hồ sơ tổng quan',
  },
  {
    id: 'personalInfo',
    label: 'Thông tin cá nhân',
    description: 'Email, số điện thoại, nghề nghiệp và học vấn.',
    previewLabel: 'Thông tin cá nhân',
  },
  {
    id: 'familyInfo',
    label: 'Thông tin thành viên gia đình',
    description: 'Cha mẹ, vợ/chồng, con cái và chi nhánh.',
    previewLabel: 'Thành viên gia đình',
  },
  {
    id: 'familyTree',
    label: 'Cây gia phả',
    description: 'Vị trí và các liên kết của bạn trên cây gia phả.',
    previewLabel: 'Cây gia phả',
  },
  {
    id: 'birthDeath',
    label: 'Ngày sinh / ngày mất',
    description: 'Ngày tháng năm sinh, ngày mất và thông tin tưởng niệm.',
    previewLabel: 'Ngày sinh / ngày mất',
  },
  {
    id: 'sensitiveInfo',
    label: 'Thông tin nhạy cảm',
    description: 'Địa chỉ chi tiết, giấy tờ định danh và ghi chú riêng.',
    previewLabel: 'Thông tin nhạy cảm',
  },
];

const AUDIENCES: Array<{ id: ManagedAudienceRole; label: string; shortLabel: string }> = [
  { id: 'GUEST', label: 'Khách công khai', shortLabel: 'Khách' },
  { id: 'AFFILIATED', label: 'Dòng họ liên kết', shortLabel: 'Liên họ' },
  { id: 'FAMILY', label: 'Thành viên trong họ', shortLabel: 'Trong họ' },
  { id: 'ADMIN', label: 'Quản trị dòng họ', shortLabel: 'Quản trị' },
];

const PREVIEW_ROLES: Array<{ id: AudienceRole; label: string }> = [
  { id: 'SELF', label: 'Chính tôi' },
  { id: 'GUEST', label: 'Khách' },
  { id: 'AFFILIATED', label: 'Họ liên kết' },
  { id: 'FAMILY', label: 'Trong dòng họ' },
  { id: 'ADMIN', label: 'Quản trị' },
];

const DEFAULT_SETTINGS: PrivacySettings = {
  visibility: {
    overallProfile: 'PUBLIC',
    personalInfo: 'FAMILY',
    familyInfo: 'FAMILY',
    familyTree: 'AFFILIATED',
    birthDeath: 'FAMILY',
    sensitiveInfo: 'PRIVATE',
  },
  groupAccess: {
    GUEST: {
      overallProfile: true,
      personalInfo: false,
      familyInfo: false,
      familyTree: false,
      birthDeath: false,
      sensitiveInfo: false,
    },
    AFFILIATED: {
      overallProfile: true,
      personalInfo: false,
      familyInfo: true,
      familyTree: true,
      birthDeath: false,
      sensitiveInfo: false,
    },
    FAMILY: {
      overallProfile: true,
      personalInfo: true,
      familyInfo: true,
      familyTree: true,
      birthDeath: true,
      sensitiveInfo: false,
    },
    ADMIN: {
      overallProfile: true,
      personalInfo: true,
      familyInfo: true,
      familyTree: true,
      birthDeath: true,
      sensitiveInfo: true,
    },
  },
  updatedAt: null,
};

const cloneSettings = (settings: PrivacySettings): PrivacySettings =>
  JSON.parse(JSON.stringify(settings)) as PrivacySettings;

const isVisibilityLevel = (value: unknown): value is VisibilityLevel =>
  ['PUBLIC', 'AFFILIATED', 'FAMILY', 'ADMIN_ONLY', 'PRIVATE'].includes(String(value));

const loadSettings = (): PrivacySettings => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return cloneSettings(DEFAULT_SETTINGS);
    const parsed = JSON.parse(raw) as Partial<PrivacySettings>;
    const next = cloneSettings(DEFAULT_SETTINGS);

    RULES.forEach(({ id }) => {
      const level = parsed.visibility?.[id];
      if (isVisibilityLevel(level)) next.visibility[id] = level;
      AUDIENCES.forEach(({ id: audience }) => {
        const access = parsed.groupAccess?.[audience]?.[id];
        if (typeof access === 'boolean') next.groupAccess[audience][id] = access;
      });
    });

    next.updatedAt = typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null;
    return next;
  } catch {
    return cloneSettings(DEFAULT_SETTINGS);
  }
};

const formatUpdatedAt = (value: string | null) => {
  if (!value) return 'Chưa lưu trên thiết bị này';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Chưa xác định';
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
};

const levelAllowsAudience = (level: VisibilityLevel, role: AudienceRole) => {
  if (role === 'SELF') return true;
  if (level === 'PUBLIC') return true;
  if (level === 'AFFILIATED') return role === 'AFFILIATED' || role === 'FAMILY' || role === 'ADMIN';
  if (level === 'FAMILY') return role === 'FAMILY' || role === 'ADMIN';
  if (level === 'ADMIN_ONLY') return role === 'ADMIN';
  return false;
};

export const PrivacySettingsTab: React.FC<PrivacySettingsTabProps> = ({ memberId }) => {
  const initialSettings = useMemo(loadSettings, []);
  const [savedSettings, setSavedSettings] = useState<PrivacySettings>(() => cloneSettings(initialSettings));
  const [draft, setDraft] = useState<PrivacySettings>(() => cloneSettings(initialSettings));
  const [activePreviewRole, setActivePreviewRole] = useState<AudienceRole>('FAMILY');
  const [confirmAction, setConfirmAction] = useState<'save' | 'reset' | null>(null);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const isDirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(savedSettings),
    [draft, savedSettings]
  );

  const sampleMemberData = {
    fullName: 'Nguyễn Văn An',
    generation: 4,
    branch: 'Chi trưởng · Nhánh Hà Nội',
    email: 'nguyenvanan@giaphaviet.vn',
    phone: '0912 345 678',
    occupation: 'Kỹ sư phần mềm',
    parents: 'Nguyễn Văn Bình · Trần Thị Lan',
    spouseAndChildren: 'Vợ: Lê Thị Mai · 2 người con',
    treePosition: 'Đời thứ 4 · Hậu duệ nhánh Nguyễn Văn Bình',
    birthDeath: 'Sinh ngày 20/05/1985 · Đang sinh sống',
    sensitive: 'Số 123 Trần Hưng Đạo, Hà Nội · CCCD •••• 2288',
  };

  const updateVisibility = (ruleId: PrivacyRuleId, level: VisibilityLevel) => {
    setDraft((current) => ({
      ...current,
      visibility: { ...current.visibility, [ruleId]: level },
    }));
    setNotice(null);
  };

  const updateGroupAccess = (
    audience: ManagedAudienceRole,
    ruleId: PrivacyRuleId,
    allowed: boolean
  ) => {
    setDraft((current) => ({
      ...current,
      groupAccess: {
        ...current.groupAccess,
        [audience]: { ...current.groupAccess[audience], [ruleId]: allowed },
      },
    }));
    setNotice(null);
  };

  const isVisibleInPreview = (ruleId: PrivacyRuleId): boolean => {
    if (activePreviewRole === 'SELF') return true;
    return (
      levelAllowsAudience(draft.visibility[ruleId], activePreviewRole) &&
      draft.groupAccess[activePreviewRole][ruleId]
    );
  };

  const persist = (settings: PrivacySettings, successMessage: string) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
      setSavedSettings(cloneSettings(settings));
      setDraft(cloneSettings(settings));
      setNotice({ type: 'success', message: successMessage });
    } catch {
      setNotice({
        type: 'error',
        message: 'Không thể lưu trên trình duyệt. Vui lòng kiểm tra quyền lưu trữ và thử lại.',
      });
    }
  };

  const handleConfirm = () => {
    if (confirmAction === 'save') {
      persist(
        { ...cloneSettings(draft), updatedAt: new Date().toISOString() },
        'Đã lưu cài đặt quyền riêng tư.'
      );
    }

    if (confirmAction === 'reset') {
      persist(
        { ...cloneSettings(DEFAULT_SETTINGS), updatedAt: new Date().toISOString() },
        'Đã khôi phục chính sách riêng tư mặc định.'
      );
    }

    setConfirmAction(null);
  };

  return (
    <section className="privacy-page-container" aria-labelledby="privacy-page-title">
      <header className="privacy-header-card">
        <div>
          <span className="privacy-eyebrow">CÀI ĐẶT & BẢO MẬT</span>
          <h2 className="privacy-title" id="privacy-page-title">Quyền riêng tư hồ sơ</h2>
          <p className="privacy-subtitle">
            Kiểm soát ai được xem hồ sơ, dữ liệu gia đình, cây gia phả và thông tin nhạy cảm của bạn.
          </p>
        </div>
        <div className="privacy-save-state" aria-live="polite">
          <span className={`privacy-state-pill ${isDirty ? 'dirty' : 'saved'}`}>
            {isDirty ? 'Có thay đổi chưa lưu' : 'Đã đồng bộ trên thiết bị'}
          </span>
          <small>Cập nhật: {formatUpdatedAt(savedSettings.updatedAt)}</small>
          {memberId && <small>Mã hồ sơ: {memberId}</small>}
        </div>
      </header>

      {notice && (
        <div className={`privacy-notice ${notice.type}`} role={notice.type === 'error' ? 'alert' : 'status'}>
          <span aria-hidden="true">{notice.type === 'success' ? '✓' : '!'}</span>
          <span>{notice.message}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Đóng thông báo">×</button>
        </div>
      )}

      <div className="privacy-grid">
        <div className="privacy-form-card">
          <div className="privacy-card-heading">
            <div>
              <h3 className="privacy-card-title">Mức hiển thị theo loại dữ liệu</h3>
              <p>Mức cơ sở áp dụng trước chính sách theo nhóm người xem.</p>
            </div>
          </div>

          <div className="privacy-rules-list">
            {RULES.map((rule) => (
              <div className="privacy-field-row" key={rule.id}>
                <div className="privacy-field-info">
                  <label className="privacy-field-name" htmlFor={`privacy-${rule.id}`}>{rule.label}</label>
                  <span className="privacy-field-desc">{rule.description}</span>
                </div>
                <select
                  id={`privacy-${rule.id}`}
                  className="privacy-select"
                  value={draft.visibility[rule.id]}
                  onChange={(event) => updateVisibility(rule.id, event.target.value as VisibilityLevel)}
                >
                  <option value="PUBLIC">Công khai</option>
                  <option value="AFFILIATED">Họ liên kết trở lên</option>
                  <option value="FAMILY">Trong dòng họ</option>
                  <option value="ADMIN_ONLY">Chỉ quản trị</option>
                  <option value="PRIVATE">Chỉ mình tôi</option>
                </select>
              </div>
            ))}
          </div>
        </div>

        <aside className="privacy-preview-card" aria-label="Xem trước hồ sơ theo nhóm người xem">
          <div className="privacy-card-heading">
            <div>
              <h3 className="privacy-card-title">Xem trước quyền truy cập</h3>
              <p>Kết quả kết hợp mức hiển thị và chính sách nhóm bên dưới.</p>
            </div>
          </div>

          <div className="privacy-role-tabs" role="tablist" aria-label="Chọn góc nhìn">
            {PREVIEW_ROLES.map((role) => (
              <button
                key={role.id}
                type="button"
                role="tab"
                aria-selected={activePreviewRole === role.id}
                className={`privacy-role-tab ${activePreviewRole === role.id ? 'active' : ''}`}
                onClick={() => setActivePreviewRole(role.id)}
              >
                {role.label}
              </button>
            ))}
          </div>

          <div className="privacy-preview-box" role="tabpanel">
            {isVisibleInPreview('overallProfile') ? (
              <>
                <div className="preview-profile-head">
                  <div className="preview-avatar" aria-hidden="true">A</div>
                  <div>
                    <h4 className="preview-name">{sampleMemberData.fullName}</h4>
                    <span className="preview-gen">Đời thứ {sampleMemberData.generation} · {sampleMemberData.branch}</span>
                  </div>
                </div>

                <div className="preview-fields-list">
                  <PreviewSection
                    visible={isVisibleInPreview('personalInfo')}
                    label="Thông tin cá nhân"
                    value={`${sampleMemberData.email} · ${sampleMemberData.phone} · ${sampleMemberData.occupation}`}
                  />
                  <PreviewSection
                    visible={isVisibleInPreview('familyInfo')}
                    label="Gia đình"
                    value={`${sampleMemberData.parents} · ${sampleMemberData.spouseAndChildren}`}
                  />
                  <PreviewSection
                    visible={isVisibleInPreview('familyTree')}
                    label="Cây gia phả"
                    value={sampleMemberData.treePosition}
                  />
                  <PreviewSection
                    visible={isVisibleInPreview('birthDeath')}
                    label="Sinh / mất"
                    value={sampleMemberData.birthDeath}
                  />
                  <PreviewSection
                    visible={isVisibleInPreview('sensitiveInfo')}
                    label="Nhạy cảm"
                    value={sampleMemberData.sensitive}
                  />
                </div>
              </>
            ) : (
              <div className="privacy-locked-profile">
                
                <strong>Hồ sơ này không hiển thị với nhóm đang chọn</strong>
                <p>Hãy thay đổi mức “Hồ sơ tổng quan” hoặc quyền của nhóm để xem trước.</p>
              </div>
            )}
          </div>
        </aside>
      </div>

      <div className="privacy-group-card">
        <div className="privacy-card-heading">
          <div>
            <h3 className="privacy-card-title">Chính sách theo nhóm người xem</h3>
            <p>Bỏ chọn một ô để chặn riêng nhóm đó, kể cả khi mức hiển thị cơ sở cho phép.</p>
          </div>
        </div>

        <div className="privacy-matrix-scroll">
          <table className="privacy-matrix">
            <thead>
              <tr>
                <th scope="col">Loại dữ liệu</th>
                {AUDIENCES.map((audience) => <th scope="col" key={audience.id}>{audience.shortLabel}</th>)}
              </tr>
            </thead>
            <tbody>
              {RULES.map((rule) => (
                <tr key={rule.id}>
                  <th scope="row">
                    <strong>{rule.previewLabel}</strong>
                    <small>{draft.visibility[rule.id] === 'PRIVATE' ? 'Chỉ mình tôi' : 'Theo mức cơ sở'}</small>
                  </th>
                  {AUDIENCES.map((audience) => {
                    const allowedByLevel = levelAllowsAudience(draft.visibility[rule.id], audience.id);
                    return (
                      <td key={audience.id}>
                        <label
                          className={`privacy-matrix-check ${allowedByLevel ? '' : 'limited'}`}
                          title={allowedByLevel ? audience.label : 'Mức hiển thị cơ sở hiện vẫn giới hạn nhóm này'}
                        >
                          <input
                            type="checkbox"
                            checked={draft.groupAccess[audience.id][rule.id]}
                            onChange={(event) => updateGroupAccess(audience.id, rule.id, event.target.checked)}
                            aria-label={`${audience.label}: ${rule.label}`}
                          />
                          <span aria-hidden="true" />
                        </label>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="privacy-actions-bar">
        <div>
          <strong>{isDirty ? 'Các thay đổi mới chỉ ở bản xem trước.' : 'Thiết lập hiện tại đã được lưu.'}</strong>
          <small>Bạn có thể thay đổi hoặc thu hồi quyền bất kỳ lúc nào.</small>
        </div>
        <div className="privacy-actions">
          <button
            type="button"
            className="privacy-secondary-btn"
            onClick={() => setDraft(cloneSettings(savedSettings))}
            disabled={!isDirty}
          >
            Hoàn tác
          </button>
          <button type="button" className="privacy-reset-btn" onClick={() => setConfirmAction('reset')}>
            Khôi phục mặc định
          </button>
          <button
            type="button"
            className="privacy-save-btn"
            onClick={() => setConfirmAction('save')}
            disabled={!isDirty}
          >
            Lưu thay đổi
          </button>
        </div>
      </div>

      {confirmAction && (
        <div className="privacy-modal-overlay" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setConfirmAction(null);
        }}>
          <div className="privacy-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="privacy-confirm-title">
            <span className={`privacy-confirm-icon ${confirmAction === 'reset' ? 'warning' : ''}`} aria-hidden="true">
              {confirmAction === 'reset' ? '↺' : '✓'}
            </span>
            <h3 id="privacy-confirm-title">
              {confirmAction === 'reset' ? 'Khôi phục quyền mặc định?' : 'Lưu thay đổi quyền riêng tư?'}
            </h3>
            <p>
              {confirmAction === 'reset'
                ? 'Mọi lựa chọn hiện tại sẽ được thay bằng chính sách mặc định của hệ thống trên thiết bị này.'
                : 'Khả năng xem hồ sơ của khách, thành viên và quản trị sẽ thay đổi theo cấu hình vừa chọn.'}
            </p>
            <div className="privacy-confirm-actions">
              <button type="button" className="privacy-secondary-btn" onClick={() => setConfirmAction(null)}>Hủy</button>
              <button
                type="button"
                className={confirmAction === 'reset' ? 'privacy-reset-btn' : 'privacy-save-btn'}
                onClick={handleConfirm}
              >
                {confirmAction === 'reset' ? 'Khôi phục' : 'Xác nhận lưu'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

const PreviewSection: React.FC<{ visible: boolean; label: string; value: string }> = ({
  visible,
  label,
  value,
}) => (
  <div className={`preview-field-item ${visible ? '' : 'hidden'}`}>
    <span className="preview-label">{label}</span>
    <span className="preview-value">{visible ? value : 'Đã ẩn theo quyền riêng tư'}</span>
  </div>
);

export default PrivacySettingsTab;
