import React, { useState } from 'react';
import {
  detectSmartExcelSchema,
  parseAndPreviewSmartExcel,
  commitSmartExcelImport,
} from '../../services/ai.service';
import type {
  AISmartExcelDetectResponse,
  AISmartExcelPreviewResponse,
  AISmartExcelCommitResponse,
} from '../../types/ai';
import './GenealogyExcelImportModal.css';

export interface SmartExcelImportWorkflowProps {
  clanId: string;
  clanName?: string;
  onSuccess: (result: AISmartExcelCommitResponse) => void;
  onCancel?: () => void;
  embedded?: boolean;
}

export const SmartExcelImportWorkflow: React.FC<SmartExcelImportWorkflowProps> = ({
  clanId,
  clanName = 'Dòng họ',
  onSuccess,
  onCancel,
  embedded = false,
}) => {
  // Step state: 'upload' -> 'mapping' -> 'preview'
  const [step, setStep] = useState<'upload' | 'mapping' | 'preview'>('upload');
  const [file, setFile] = useState<File | null>(null);

  // Schema Detection state
  const [isDetecting, setIsDetecting] = useState<boolean>(false);
  const [detectRes, setDetectRes] = useState<AISmartExcelDetectResponse | null>(null);
  const [customMapping, setCustomMapping] = useState<Record<string, string>>({});
  const [selectedSheet, setSelectedSheet] = useState<string>('');

  // Graph Parsing state
  const [isParsing, setIsParsing] = useState<boolean>(false);
  const [previewRes, setPreviewRes] = useState<AISmartExcelPreviewResponse | null>(null);

  // Commit state
  const [isCommitting, setIsCommitting] = useState<boolean>(false);
  const [commitResult, setCommitResult] = useState<AISmartExcelCommitResponse | null>(null);
  const [wipeExisting, setWipeExisting] = useState<boolean>(true);

  // UI state
  const [activeTab, setActiveTab] = useState<'persons' | 'relations'>('persons');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // STEP 1: FILE SELECTION & AI SCHEMA DETECTION
  // ---------------------------------------------------------------------------
  const handleFileSelected = async (selectedFile: File) => {
    const ext = selectedFile.name.toLowerCase();
    if (!ext.endsWith('.xlsx') && !ext.endsWith('.xls')) {
      setErrorMessage('Hệ thống hỗ trợ tệp Excel định dạng .xlsx hoặc .xls.');
      return;
    }

    if (selectedFile.size > 15 * 1024 * 1024) {
      setErrorMessage('Dung lượng tệp vượt quá giới hạn 15MB. Vui lòng kiểm tra lại.');
      return;
    }

    setFile(selectedFile);
    setErrorMessage(null);
    setIsDetecting(true);

    try {
      const res = await detectSmartExcelSchema(clanId, selectedFile);
      setDetectRes(res);
      setSelectedSheet(res.selected_sheet);

      // Pre-fill mapping dictionary from AI suggestions
      const initialMap: Record<string, string> = {};
      res.column_mapping.forEach((c) => {
        initialMap[c.col_letter] = c.suggested_field;
      });
      setCustomMapping(initialMap);
      setStep('mapping');
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.message || 'Không thể nhận diện cấu trúc tệp Excel.';
      setErrorMessage(typeof msg === 'string' ? msg : JSON.stringify(msg));
      setFile(null);
    } finally {
      setIsDetecting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // STEP 2: PARSE & RECONSTRUCT TREE GRAPH
  // ---------------------------------------------------------------------------
  const handleStartParse = async () => {
    if (!file || !detectRes) return;

    // Validate that at least the 'full_name' column is mapped
    const hasFullName = Object.values(customMapping).some((val) => val === 'full_name');
    if (!hasFullName) {
      setErrorMessage('Cần ít nhất một cột được gán là "Họ và tên" để hệ thống dựng danh sách thành viên.');
      return;
    }

    setIsParsing(true);
    setErrorMessage(null);

    try {
      const res = await parseAndPreviewSmartExcel(clanId, file, {
        selected_sheet: selectedSheet || detectRes.selected_sheet,
        header_row: detectRes.header_row,
        data_start_row: detectRes.data_start_row,
        column_mapping: customMapping,
      });

      setPreviewRes(res);
      setStep('preview');
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.message || 'Không thể bóc tách và ráp nối cây phả hệ.';
      setErrorMessage(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setIsParsing(false);
    }
  };

  // ---------------------------------------------------------------------------
  // STEP 3: COMMIT TO DATABASE
  // ---------------------------------------------------------------------------
  const handleCommit = async () => {
    if (!previewRes || !previewRes.is_valid) return;

    setIsCommitting(true);
    setErrorMessage(null);

    try {
      const res = await commitSmartExcelImport(clanId, previewRes, wipeExisting);
      setCommitResult(res);
      onSuccess(res);
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.message || 'Lỗi khi lưu dữ liệu phả hệ vào cơ sở dữ liệu.';
      setErrorMessage(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setIsCommitting(false);
    }
  };

  const handleReset = () => {
    setStep('upload');
    setFile(null);
    setDetectRes(null);
    setCustomMapping({});
    setPreviewRes(null);
    setCommitResult(null);
    setErrorMessage(null);
  };

  return (
    <div className={`smart-excel-workflow-container ${embedded ? 'embedded' : ''}`}>
      {/* Error Message Box */}
      {errorMessage && (
        <div className="fa-alert-box fatal" style={{ marginBottom: '16px' }}>
          <div className="fa-alert-box-header">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>{errorMessage}</span>
          </div>
        </div>
      )}

      {/* Success Commitment Banner */}
      {commitResult && (
        <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '12px', padding: '20px', textAlign: 'center', marginBottom: '20px' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#dcfce7', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h4 style={{ margin: '0 0 8px', fontSize: '17px', fontWeight: 700, color: '#15803d' }}>
            Nhập dữ liệu gia phả thành công
          </h4>
          <p style={{ margin: '0 0 16px', fontSize: '13.5px', color: '#166534' }}>
            {commitResult.message || `Đã nhập thành công ${commitResult.created_persons} thành viên và ${commitResult.created_relationships} mối quan hệ vào cây phả hệ.`}
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '12px' }}>
            <button
              type="button"
              className="smart-btn-secondary"
              onClick={handleReset}
            >
              Nhập thêm tệp khác
            </button>
            {onCancel && (
              <button
                type="button"
                className="smart-btn-primary"
                onClick={onCancel}
              >
                Hoàn tất & Đóng
              </button>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          STEP 1: UPLOAD (DROPZONE)
          ===================================================================== */}
      {!commitResult && step === 'upload' && (
        <div>
          {/* Guide Banner: Person - User Separation */}
          <div className="fa-import-guide-banner" style={{ marginBottom: '20px' }}>
            <div className="fa-import-guide-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <div className="fa-import-guide-content">
              <h4>Quy tắc bảo mật Nhân khẩu & Tài khoản người dùng:</h4>
              <p>
                Dữ liệu đọc từ file Excel chỉ dùng để xây dựng cây phả hệ (Hồ sơ thành viên, quan hệ thế hệ, chi họ) và <strong>tuyệt đối không tự tạo tài khoản đăng nhập</strong>. Mọi người mới trên cây sẽ mang nhãn <em>&quot;Chưa liên kết tài khoản&quot;</em>. Sau này con cháu đăng ký tài khoản thật và xin gia nhập thì Trưởng tộc mới duyệt liên kết.
              </p>
            </div>
          </div>

          {/* Smart AI Dropzone */}
          <div
            className="smart-dropzone-box"
            onClick={() => document.getElementById('smart-excel-main-file-input')?.click()}
          >
            <div className="smart-dropzone-icon">
              {isDetecting ? (
                <span className="spinner-small" style={{ width: '28px', height: '28px' }} />
              ) : (
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
              )}
            </div>
            <h4 style={{ margin: '0 0 6px', fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>
              {isDetecting ? 'AI đang đọc và nhận diện cấu trúc file Excel...' : 'Tải lên file Excel gia phả bất kỳ của dòng họ'}
            </h4>
            <p style={{ margin: 0, fontSize: '13.5px', color: '#64748b' }}>
              Bạn có thể sử dụng file Excel hiện có của gia tộc. AI sẽ tự động phát hiện các cột Họ tên, Cha/Mẹ, Vợ/Chồng, Năm sinh, Đời và ráp nối cây phả hệ.
            </p>
            <span style={{ display: 'inline-block', marginTop: '10px', fontSize: '12px', color: '#2563eb', fontWeight: 600 }}>
              Hỗ trợ định dạng .xlsx hoặc .xls (Tối đa 15MB)
            </span>
            <input
              id="smart-excel-main-file-input"
              type="file"
              accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFileSelected(f);
                e.target.value = '';
              }}
            />
          </div>

          {/* Information Guidelines */}
          <div style={{ marginTop: '20px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px 20px' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b', marginBottom: '8px' }}>
              Khả năng nhận diện của Trợ lý AI:
            </div>
            <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '12.5px', color: '#475569', lineHeight: 1.6 }}>
              <li>Tự động nhận biết các cột: <strong>Họ tên, Thân phụ (Bố/Cha), Thân mẫu (Mẹ), Hôn phối (Vợ/Chồng)</strong>.</li>
              <li>Hỗ trợ cột <strong>Đời (Thế hệ 1, 2, 3...)</strong>, năm sinh, năm mất, nơi an táng hoặc chi họ.</li>
              <li>Không yêu cầu thứ tự hay định dạng cố định, AI sẽ gợi ý ánh xạ để bạn kiểm tra trước khi ráp nối.</li>
            </ul>
          </div>
        </div>
      )}

      {/* =====================================================================
          STEP 2: COLUMN MAPPING CONFIRMATION
          ===================================================================== */}
      {!commitResult && step === 'mapping' && detectRes && (
        <div>
          {/* AI Banner */}
          <div className="smart-mapping-banner">
            <svg className="smart-mapping-banner-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
            <div>
              <strong style={{ fontSize: '13.5px', color: '#1e40af' }}>
                {detectRes.notes || 'AI đã tự động nhận diện cấu trúc các cột dữ liệu:'}
              </strong>
              <div style={{ fontSize: '12.5px', color: '#3b82f6', marginTop: '3px' }}>
                Trang tính: <strong>{selectedSheet || detectRes.selected_sheet}</strong> • Bắt đầu đọc dữ liệu từ dòng <strong>{detectRes.data_start_row}</strong>
              </div>
            </div>
          </div>

          <div style={{ marginBottom: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>
              Kiểm tra và tùy chỉnh ý nghĩa các cột ({detectRes.column_mapping.length} cột phát hiện):
            </span>
            <button
              type="button"
              className="smart-btn-secondary"
              onClick={() => setStep('upload')}
              style={{ padding: '6px 14px', fontSize: '12.5px' }}
            >
              Chọn tệp khác
            </button>
          </div>

          {/* Grid of Columns */}
          <div className="smart-mapping-grid">
            {detectRes.column_mapping.map((col) => (
              <div key={col.col_letter} className="smart-col-card">
                <div className="smart-col-card-top">
                  <span className="smart-col-letter-badge">Cột {col.col_letter}</span>
                  <span className="smart-col-confidence-tag">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    Khớp {(col.confidence * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="smart-col-header-text" title={col.header_text}>
                  &quot;{col.header_text}&quot;
                </div>
                <div>
                  <select
                    className="smart-field-select"
                    value={customMapping[col.col_letter] || 'none'}
                    onChange={(e) => {
                      setCustomMapping({
                        ...customMapping,
                        [col.col_letter]: e.target.value,
                      });
                    }}
                  >
                    {detectRes.available_fields.map((f) => (
                      <option key={f.key} value={f.key}>
                        {f.label} {f.required ? '(*)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          </div>

          {/* Sample rows preview */}
          {detectRes.sample_preview_rows.length > 0 && (
            <div style={{ marginBottom: '24px' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#475569', marginBottom: '8px' }}>
                Dữ liệu mẫu từ tệp của bạn (3 dòng đầu):
              </div>
              <div className="fa-table-wrap" style={{ maxHeight: '160px', overflowY: 'auto' }}>
                <table style={{ width: '100%' }}>
                  <thead>
                    <tr>
                      {detectRes.column_mapping.map((c) => (
                        <th key={c.col_letter} style={{ fontSize: '11px', whiteSpace: 'nowrap' }}>
                          {c.header_text} ({c.col_letter})
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {detectRes.sample_preview_rows.map((row, rIdx) => (
                      <tr key={rIdx}>
                        {detectRes.column_mapping.map((c) => (
                          <td key={c.col_letter} style={{ fontSize: '12px' }}>
                            {row[c.col_letter] || '—'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Step 2 Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', borderTop: '1px solid #f1f5f9', paddingTop: '16px' }}>
            <button
              type="button"
              className="smart-btn-secondary"
              onClick={() => setStep('upload')}
            >
              Quay lại
            </button>
            <button
              type="button"
              className="smart-btn-primary"
              onClick={handleStartParse}
              disabled={isParsing}
            >
              {isParsing ? (
                <>
                  <span className="spinner-small" />
                  <span>AI đang ráp nối cây phả hệ...</span>
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                  </svg>
                  <span>Ráp Nối Cây Phả Hệ & Xem Trước</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* =====================================================================
          STEP 3: PREVIEW & COMMIT
          ===================================================================== */}
      {!commitResult && step === 'preview' && previewRes && (
        <div>
          {/* KPI Summary Cards */}
          <div className="smart-kpi-grid">
            <div className="smart-kpi-card highlight">
              <span className="smart-kpi-label">Tổng Nhân Khẩu</span>
              <span className="smart-kpi-val blue">{previewRes.summary.total_persons}</span>
              <span className="smart-kpi-sub">
                {previewRes.summary.explicit_persons || previewRes.summary.total_persons} trong danh sách
                {previewRes.summary.implicit_spouses ? ` • ${previewRes.summary.implicit_spouses} phối ngẫu liên kết` : ''}
              </span>
            </div>

            <div className="smart-kpi-card">
              <span className="smart-kpi-label">Quan Hệ Gia Đình</span>
              <span className="smart-kpi-val">{previewRes.summary.total_relationships}</span>
              <span className="smart-kpi-sub">
                {previewRes.summary.parent_child_count || 0} Cha-Con • {previewRes.summary.spouse_count || 0} Vợ-Chồng
              </span>
            </div>

            <div className="smart-kpi-card">
              <span className="smart-kpi-label">Số Chi Nhánh</span>
              <span className="smart-kpi-val">{previewRes.summary.total_branches}</span>
              <span className="smart-kpi-sub">Tự động phân cành</span>
            </div>

            <div className="smart-kpi-card">
              <span className="smart-kpi-label">Tình Trạng</span>
              <span className="smart-kpi-val" style={{ fontSize: '20px', marginTop: '4px' }}>
                <span style={{ color: '#16a34a' }}>{previewRes.summary.living_count}</span>
                <span style={{ color: '#94a3b8', margin: '0 6px' }}>/</span>
                <span style={{ color: '#64748b' }}>{previewRes.summary.deceased_count}</span>
              </span>
              <span className="smart-kpi-sub">Còn sống / Đã mất</span>
            </div>
          </div>

          {/* Warnings Banner if any */}
          {previewRes.warnings.length > 0 && (
            <div className="fa-alert-box warning" style={{ marginBottom: '16px' }}>
              <div className="fa-alert-box-header">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span>Lưu ý khi tự động dựng phả hệ ({previewRes.warnings.length} điểm cần xem):</span>
              </div>
              <ul style={{ margin: '6px 0 0', paddingLeft: '20px', fontSize: '12.5px' }}>
                {previewRes.warnings.slice(0, 5).map((w, idx) => (
                  <li key={idx}><strong>Dòng {w.row}:</strong> {w.message}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Fatal Errors Banner if invalid */}
          {!previewRes.is_valid && previewRes.fatal_errors.length > 0 && (
            <div className="fa-alert-box fatal" style={{ marginBottom: '16px' }}>
              <div className="fa-alert-box-header">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span>Phát hiện lỗi logic phả hệ ({previewRes.fatal_errors.length} lỗi chặn dữ liệu):</span>
              </div>
              <ul style={{ margin: '6px 0 0', paddingLeft: '20px', fontSize: '12.5px' }}>
                {previewRes.fatal_errors.map((err, idx) => (
                  <li key={idx}><strong>{err.sheet ? `${err.sheet} - ` : ''}Dòng {err.row}:</strong> {err.message}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Tabs */}
          <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid #e2e8f0', marginBottom: '12px' }}>
            <button
              type="button"
              className={`fa-preview-tab-btn ${activeTab === 'persons' ? 'active' : ''}`}
              onClick={() => setActiveTab('persons')}
            >
              Danh sách thành viên ({previewRes.preview.persons.length})
            </button>
            <button
              type="button"
              className={`fa-preview-tab-btn ${activeTab === 'relations' ? 'active' : ''}`}
              onClick={() => setActiveTab('relations')}
            >
              Mối quan hệ tự động ráp nối ({previewRes.preview.relationships.length})
            </button>
          </div>

          {/* Persons Table */}
          {activeTab === 'persons' && (
            <div className="fa-table-wrap" style={{ maxHeight: '260px', overflowY: 'auto' }}>
              <table style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th>Mã</th>
                    <th>Họ và tên</th>
                    <th>Giới tính</th>
                    <th>Đời</th>
                    <th>Tình trạng</th>
                    <th>Ngày sinh</th>
                    <th>Chi họ</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRes.preview.persons.map((p: any, idx: number) => (
                    <tr key={idx}>
                      <td><code style={{ color: '#2563eb', fontWeight: 700 }}>{p.code}</code></td>
                      <td><strong>{p.fullName}</strong></td>
                      <td>{p.gender === 'MALE' ? 'Nam' : (p.gender === 'FEMALE' ? 'Nữ' : 'Khác')}</td>
                      <td>
                        <span style={{ padding: '2px 8px', borderRadius: '4px', background: '#eff6ff', color: '#1d4ed8', fontWeight: 700 }}>
                          Đời {p.generation}
                        </span>
                      </td>
                      <td>
                        <span style={{ color: p.isLiving ? '#16a34a' : '#64748b', fontWeight: 600 }}>
                          {p.isLiving ? 'Còn sống' : 'Đã mất'}
                        </span>
                      </td>
                      <td>{p.birthDate || '—'}</td>
                      <td>{p.branchName || 'Chi Trưởng'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Relationships Table */}
          {activeTab === 'relations' && (
            <div className="fa-table-wrap" style={{ maxHeight: '260px', overflowY: 'auto' }}>
              <table style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th>Người thứ nhất</th>
                    <th>Mối quan hệ</th>
                    <th>Người thứ hai</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRes.preview.relationships.map((r: any, idx: number) => {
                    const p1 = previewRes.preview.persons.find((x: any) => x.code === r.person1);
                    const p2 = previewRes.preview.persons.find((x: any) => x.code === r.person2);
                    return (
                      <tr key={idx}>
                        <td>
                          <strong>{p1?.fullName || r.person1}</strong>
                          <div style={{ fontSize: '11px', color: '#64748b' }}>Đời {p1?.generation || '?'}</div>
                        </td>
                        <td>
                          {r.relationshipType === 'PARENT_CHILD' ? (
                            <span className="smart-rel-badge-parent">
                              Cha/Mẹ → Con
                            </span>
                          ) : (
                            <span className="smart-rel-badge-spouse">
                              Vợ ↔ Chồng
                            </span>
                          )}
                        </td>
                        <td>
                          <strong>{p2?.fullName || r.person2}</strong>
                          <div style={{ fontSize: '11px', color: '#64748b' }}>Đời {p2?.generation || '?'}</div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Wipe Old Data Option */}
          <div style={{ marginTop: '16px', padding: '12px 16px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <input
              type="checkbox"
              id="smart-wipe-toggle"
              checked={wipeExisting}
              onChange={(e) => setWipeExisting(e.target.checked)}
              style={{ width: '18px', height: '18px', accentColor: '#2563eb', cursor: 'pointer' }}
            />
            <label htmlFor="smart-wipe-toggle" style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b', cursor: 'pointer', margin: 0 }}>
              Làm mới dữ liệu phả hệ: Xóa sạch dữ liệu cũ của dòng họ trước khi nhập (Khuyên dùng để cây phả hệ chỉ có 1 đỉnh và không bị trùng lặp)
            </label>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '20px', borderTop: '1px solid #f1f5f9', paddingTop: '16px' }}>
            <button
              type="button"
              className="smart-btn-secondary"
              onClick={() => setStep('mapping')}
              disabled={isCommitting}
            >
              Quay lại chỉnh cột
            </button>
            <button
              type="button"
              className="smart-btn-primary"
              onClick={handleCommit}
              disabled={!previewRes.is_valid || isCommitting}
            >
              {isCommitting ? (
                <>
                  <span className="spinner-small" />
                  <span>Đang lưu vào cây gia phả...</span>
                </>
              ) : (
                <>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                    <polyline points="17 21 17 13 7 13 7 21" />
                    <polyline points="7 3 7 8 15 8" />
                  </svg>
                  <span>Xác Nhận & Lưu Vào Cây Gia Phả</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

