import React, { useEffect, useState } from 'react';
import {
  fetchClanAISettings,
  updateClanAISettings,
  testGeminiConnection,
  type ClanAISetting,
  type AITestConnectionResponse,
} from '../../services/ai.service';
import './ClanAISettingsPage.css';

interface Props {
  clanId: string;
}

export const ClanAISettingsPage: React.FC<Props> = ({ clanId }) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [testing, setTesting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // AI Settings State
  const [aiEnabled, setAiEnabled] = useState<boolean>(false);
  const [features, setFeatures] = useState<{
    assistant: boolean;
    relationship_analysis: boolean;
    suggestions: boolean;
    biography: boolean;
  }>({
    assistant: true,
    relationship_analysis: true,
    suggestions: true,
    biography: true,
  });

  const [allowedDataScopes, setAllowedDataScopes] = useState<{
    public_events: boolean;
    general_history: boolean;
    personal_data: boolean;
    images: boolean;
  }>({
    public_events: true,
    general_history: true,
    personal_data: false,
    images: false,
  });

  const [geminiModel, setGeminiModel] = useState<string>('gemini-3.5-flash-lite');
  const [isConfigured, setIsConfigured] = useState<boolean>(true);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  // Gemini Test Widget State
  const [testPrompt, setTestPrompt] = useState<string>(
    'Xin chào Gemini! Đây là thử nghiệm kiểm tra tính sẵn sàng của hệ thống phả hệ số MFGMS.'
  );
  const [testResult, setTestResult] = useState<AITestConnectionResponse | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  // Load Settings on mount
  useEffect(() => {
    let isCancelled = false;
    setLoading(true);
    setError(null);

    fetchClanAISettings(clanId)
      .then((data: ClanAISetting) => {
        if (isCancelled) return;
        setAiEnabled(Boolean(data.ai_enabled));
        if (data.features) {
          setFeatures({
            assistant: Boolean(data.features.assistant),
            relationship_analysis: Boolean(data.features.relationship_analysis),
            suggestions: Boolean(data.features.suggestions),
            biography: Boolean(data.features.biography),
          });
        }
        if (data.allowed_data_scopes) {
          setAllowedDataScopes({
            public_events: Boolean(data.allowed_data_scopes.public_events),
            general_history: Boolean(data.allowed_data_scopes.general_history),
            personal_data: Boolean(data.allowed_data_scopes.personal_data),
            images: Boolean(data.allowed_data_scopes.images),
          });
        }
        if (data.gemini_model) setGeminiModel(data.gemini_model);
        setIsConfigured(Boolean(data.configured));
        setUpdatedAt(data.updated_at || null);
      })
      .catch((err) => {
        if (isCancelled) return;
        setError(err.message || 'Không thể tải cài đặt AI của dòng họ.');
      })
      .finally(() => {
        if (!isCancelled) setLoading(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [clanId]);

  // Handle Save
  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await updateClanAISettings(clanId, {
        ai_enabled: aiEnabled,
        features,
        allowed_data_scopes: allowedDataScopes,
        gemini_model: geminiModel,
      });

      setAiEnabled(res.ai_enabled);
      setUpdatedAt(res.updated_at || null);
      setSuccessMsg('Đã lưu cấu hình AI của dòng họ thành công.');
    } catch (err: any) {
      setError(err.message || 'Lưu cấu hình AI thất bại.');
    } finally {
      setSaving(false);
    }
  };

  // Handle Gemini Connection Test
  const handleTestConnection = async () => {
    setTesting(true);
    setTestError(null);
    setTestResult(null);

    try {
      const res = await testGeminiConnection(clanId, testPrompt);
      setTestResult(res);
    } catch (err: any) {
      setTestError(err.message || 'Kiểm tra kết nối thất bại.');
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="clan-ai-container loading-state">
        <div className="clan-ai-spinner" />
        <p>Đang tải cấu hình AI dòng họ...</p>
      </div>
    );
  }

  return (
    <div className="clan-ai-container">
      {/* Header */}
      <div className="clan-ai-header">
        <div>
          <h2>Cấu hình AI dòng họ</h2>
          <p className="clan-ai-subtitle">
            Quản lý quyền kích hoạt trí tuệ nhân tạo (Gemini API), phạm vi tính năng và điều kiện gửi dữ liệu ra bên ngoài.
          </p>
        </div>
        <div className="clan-ai-badges">
          <span className={`status-badge ${aiEnabled ? 'active' : 'inactive'}`}>
            {aiEnabled ? 'AI đang Bật' : 'AI đang Tắt'}
          </span>
          <span className="model-badge">Model: {geminiModel}</span>
        </div>
      </div>

      {/* Thông báo */}
      {error && (
        <div className="clan-ai-alert alert-error">
          <strong>Lỗi:</strong> {error}
        </div>
      )}
      {successMsg && (
        <div className="clan-ai-alert alert-success">
          <strong>Thành công:</strong> {successMsg}
        </div>
      )}

      {/* SECTION 1: MASTER TOGGLE */}
      <div className="clan-ai-card">
        <div className="clan-ai-card-header">
          <div>
            <h3>1. Kích hoạt tính năng AI cho dòng họ</h3>
            <p>Quyết định cao nhất từ Trưởng tộc cho phép sử dụng trợ lý trí tuệ nhân tạo đối với dòng họ này.</p>
          </div>
          <label className="switch-control">
            <input
              type="checkbox"
              checked={aiEnabled}
              onChange={(e) => {
                setAiEnabled(e.target.checked);
                setSuccessMsg(null);
              }}
            />
            <span className="switch-slider" />
          </label>
        </div>

        {!aiEnabled ? (
          <div className="notice-box notice-warning">
            <strong>Trạng thái: AI đang TẮT.</strong> Mọi tính năng trợ lý AI, gợi ý quan hệ và tiểu sử tự động
            trong dòng họ này đều bị tạm dừng. Dữ liệu dòng họ tuyệt đối không được gửi đến máy chủ Gemini.
          </div>
        ) : (
          <div className="notice-box notice-info">
            <strong>Trạng thái: AI đang BẬT.</strong> Hệ thống cho phép các tính năng AI bên dưới hoạt động.
            Lưu ý: Dữ liệu cá nhân chỉ được gửi nếu chính thành viên đó cấp quyền đồng ý trong mục Quyền riêng tư & AI.
          </div>
        )}
      </div>

      {/* SECTION 2: FEATURE GROUPS */}
      <div className="clan-ai-card">
        <h3>2. Các nhóm tính năng AI được phép hoạt động</h3>
        <p className="card-desc">Lựa chọn các dịch vụ AI mà các thành viên trong dòng họ được phép sử dụng.</p>

        <div className="options-grid">
          <label className="option-item">
            <input
              type="checkbox"
              disabled={!aiEnabled}
              checked={features.assistant}
              onChange={(e) => setFeatures({ ...features, assistant: e.target.checked })}
            />
            <div className="option-text">
              <span className="option-title">Trợ lý hỏi đáp thông minh (AI Assistant)</span>
              <span className="option-desc">Hỏi đáp văn hóa dòng họ, các ngày giỗ, tìm hiểu nguồn gốc tổ tiên.</span>
            </div>
          </label>

          <label className="option-item">
            <input
              type="checkbox"
              disabled={!aiEnabled}
              checked={features.relationship_analysis}
              onChange={(e) => setFeatures({ ...features, relationship_analysis: e.target.checked })}
            />
            <div className="option-text">
              <span className="option-title">Phân tích quan hệ huyết thống & phả hệ</span>
              <span className="option-desc">Tính toán thế thứ, vai vế xưng hô chuẩn mực theo phong tục truyền thống.</span>
            </div>
          </label>

          <label className="option-item">
            <input
              type="checkbox"
              disabled={!aiEnabled}
              checked={features.suggestions}
              onChange={(e) => setFeatures({ ...features, suggestions: e.target.checked })}
            />
            <div className="option-text">
              <span className="option-title">Gợi ý hoàn thiện dữ liệu gia phả</span>
              <span className="option-desc">Phát hiện nhánh họ còn thiếu, gợi ý thông tin ngày mất hoặc liên kết thân nhân.</span>
            </div>
          </label>

          <label className="option-item">
            <input
              type="checkbox"
              disabled={!aiEnabled}
              checked={features.biography}
              onChange={(e) => setFeatures({ ...features, biography: e.target.checked })}
            />
            <div className="option-text">
              <span className="option-title">Hỗ trợ soạn thảo tiểu sử & ghi chép</span>
              <span className="option-desc">Hỗ trợ viết tóm tắt tiểu sử tiền nhân, danh nhân dòng tộc từ tư liệu lịch sử.</span>
            </div>
          </label>
        </div>
      </div>

      {/* SECTION 3: DATA SCOPE */}
      <div className="clan-ai-card">
        <h3>3. Phạm vi dữ liệu được phép gửi đến Gemini API</h3>
        <p className="card-desc">Thiết lập ranh giới an toàn thông tin theo nguyên tắc bảo vệ quyền riêng tư.</p>

        <div className="options-grid">
          <label className="option-item">
            <input
              type="checkbox"
              disabled={!aiEnabled}
              checked={allowedDataScopes.public_events}
              onChange={(e) => setAllowedDataScopes({ ...allowedDataScopes, public_events: e.target.checked })}
            />
            <div className="option-text">
              <span className="option-title">Sự kiện & Ngày giỗ công khai của dòng họ</span>
              <span className="option-desc">Lịch cúng giỗ, lễ tế tổ, họp mặt dòng tộc và hoạt động chung.</span>
            </div>
          </label>

          <label className="option-item">
            <input
              type="checkbox"
              disabled={!aiEnabled}
              checked={allowedDataScopes.general_history}
              onChange={(e) => setAllowedDataScopes({ ...allowedDataScopes, general_history: e.target.checked })}
            />
            <div className="option-text">
              <span className="option-title">Lịch sử & Sự tích tổ tiên đã mất</span>
              <span className="option-desc">Gia huấn, nguồn gốc phát tích dòng tộc, danh nhân đã khuất.</span>
            </div>
          </label>

          <label className="option-item highlight-warning">
            <input
              type="checkbox"
              disabled={!aiEnabled}
              checked={allowedDataScopes.personal_data}
              onChange={(e) => setAllowedDataScopes({ ...allowedDataScopes, personal_data: e.target.checked })}
            />
            <div className="option-text">
              <span className="option-title">Dữ liệu cá nhân thành viên còn sống</span>
              <span className="option-desc">
                Họ tên, ngày sinh, nơi ở. <strong>Bắt buộc:</strong> Phải có sự đồng ý riêng của từng thành viên trong mục Quyền riêng tư & AI.
              </span>
            </div>
          </label>

          <label className="option-item highlight-warning">
            <input
              type="checkbox"
              disabled={!aiEnabled}
              checked={allowedDataScopes.images}
              onChange={(e) => setAllowedDataScopes({ ...allowedDataScopes, images: e.target.checked })}
            />
            <div className="option-text">
              <span className="option-title">Hình ảnh chân dung & tư liệu cá nhân</span>
              <span className="option-desc">
                Chỉ gửi khi có sự cho phép minh thị của người sở hữu tư liệu.
              </span>
            </div>
          </label>
        </div>
      </div>

      {/* SAVE BUTTON */}
      <div className="clan-ai-actions">
        <button
          type="button"
          className="btn-primary-save"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? 'Đang lưu cấu hình...' : 'Lưu cấu hình AI dòng họ'}
        </button>
        {updatedAt && (
          <span className="last-updated-text">
            Cập nhật lần cuối: {new Date(updatedAt).toLocaleString('vi-VN')}
          </span>
        )}
      </div>

      {/* SECTION 4: TEST CONNECTION WIDGET (SAFE MOCK/SIMULATION) */}
      <div className="clan-ai-card test-connection-card">
        <div className="test-card-header">
          <div>
            <h3>4. Kiểm tra kết nối Gemini AI (Mô phỏng an toàn)</h3>
            <p>
              Giai đoạn 2: Kiểm tra tính sẵn sàng, độ trễ và khả năng xử lý tiếng Việt của model mà không gửi dữ liệu Person thật từ cơ sở dữ liệu.
            </p>
          </div>
          <span className="badge-pill">Giai đoạn 2 Foundation</span>
        </div>

        <div className="test-input-group">
          <label htmlFor="test-prompt">Câu hỏi kiểm tra mô phỏng:</label>
          <textarea
            id="test-prompt"
            rows={3}
            value={testPrompt}
            onChange={(e) => setTestPrompt(e.target.value)}
            placeholder="Nhập câu hỏi thử nghiệm cho Gemini..."
            disabled={testing || !aiEnabled}
          />
        </div>

        <div className="test-btn-wrapper">
          <button
            type="button"
            className="btn-test-connection"
            onClick={handleTestConnection}
            disabled={testing || !aiEnabled}
          >
            {testing ? 'Đang gửi kiểm tra đến Gemini...' : 'Kiểm tra kết nối Gemini AI'}
          </button>
          {!aiEnabled && (
            <span className="hint-disabled">
              (Cần bật AI cho dòng họ ở Mục 1 và bấm Lưu trước khi kiểm tra)
            </span>
          )}
        </div>

        {/* Kết quả kiểm tra */}
        {testError && (
          <div className="test-result-box test-result-error">
            <h4>Kiểm tra thất bại</h4>
            <p>{testError}</p>
          </div>
        )}

        {testResult && (
          <div className="test-result-box test-result-success">
            <div className="result-header">
              <span className="result-status-tag">KẾT NỐI GEMINI THÀNH CÔNG</span>
              <span className="result-meta">
                Model: <strong>{testResult.model}</strong> | Độ trễ:{' '}
                <strong>{testResult.latency_ms} ms</strong>
              </span>
            </div>
            <div className="result-body">
              <pre>{testResult.response}</pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ClanAISettingsPage;

