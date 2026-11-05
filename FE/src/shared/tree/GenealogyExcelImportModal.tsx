import React, { useState } from 'react';
import {
  downloadGenealogyTemplate,
  previewGenealogyExcel,
  executeGenealogyExcel,
  type GenealogyValidationResponse,
  type ImportExecutionResponse,
} from '../../services/genealogy.service';
import '../../features/familyAdmin/FamilyAdminModule.css';
import './GenealogyExcelImportModal.css';
import { ExcelTemplateRequirementsGuide } from './ExcelTemplateRequirementsGuide';
import { AIExcelAuditView } from '../../components/clan/AIExcelAuditView';
import { analyzeExcelImportWithAI } from '../../services/ai.service';
import type { AIExcelImportAnalyzeResponse } from '../../types/ai';

export interface GenealogyExcelImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  clanId: string;
  clanName?: string;
  onSuccess: (result: ImportExecutionResponse) => void;
}

export const GenealogyExcelImportModal: React.FC<GenealogyExcelImportModalProps> = ({
  isOpen,
  onClose,
  clanId,
  clanName = 'Dòng họ',
  onSuccess,
}) => {
  const [importFile, setImportFile] = useState<File | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [validationResult, setValidationResult] = useState<GenealogyValidationResponse | null>(null);
  const [aiAuditReport, setAiAuditReport] = useState<AIExcelImportAnalyzeResponse | null>(null);
  const [isAnalyzingAI, setIsAnalyzingAI] = useState<boolean>(false);
  const [activePreviewTab, setActivePreviewTab] = useState<'persons' | 'relations' | 'branches'>('persons');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleDownloadTemplate = async () => {
    setIsDownloading(true);
    setErrorMessage(null);
    try {
      await downloadGenealogyTemplate(clanId, clanName);
    } catch (err: any) {
      setErrorMessage(err?.response?.data?.detail || err?.message || 'Không thể tải file mẫu. Vui lòng thử lại.');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleFileSelected = async (file: File) => {
    if (!file.name.endsWith('.xlsx')) {
      setErrorMessage('Hệ thống chỉ hỗ trợ định dạng Excel (.xlsx).');
      return;
    }
    setImportFile(file);
    setErrorMessage(null);
    setIsValidating(true);
    try {
      const res = await previewGenealogyExcel(clanId, file);
      setValidationResult(res);
    } catch (err: any) {
      setErrorMessage(err?.response?.data?.detail || err?.message || 'Không thể đọc và phân tích file Excel.');
      setValidationResult(null);
    } finally {
      setIsValidating(false);
    }
  };

  const handleExecute = async () => {
    if (!importFile) return;
    setIsExecuting(true);
    setErrorMessage(null);
    try {
      const res = await executeGenealogyExcel(clanId, importFile);
      onSuccess(res);
      handleReset();
      onClose();
    } catch (err: any) {
      setErrorMessage(err?.response?.data?.detail || err?.message || 'Lỗi khi nhập dữ liệu vào cơ sở dữ liệu.');
    } finally {
      setIsExecuting(false);
    }
  };

  const handleRunAIAnalysis = async () => {
    if (!importFile) return;
    setIsAnalyzingAI(true);
    setErrorMessage(null);
    try {
      const res = await analyzeExcelImportWithAI(clanId, importFile);
      setAiAuditReport(res);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Không thể phân tích dữ liệu bằng AI.');
    } finally {
      setIsAnalyzingAI(false);
    }
  };

  const handleReset = () => {
    setImportFile(null);
    setValidationResult(null);
    setAiAuditReport(null);
    setErrorMessage(null);
  };

  return (
    <div className="clan-modal-overlay" style={{ zIndex: 1200 }}>
      <div className="clan-modal-box clan-modal-box-lg" style={{ maxWidth: '980px', maxHeight: '90vh', overflowY: 'auto' }}>
        {/* Header */}
        <div className="clan-modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>
              Nhập Dữ Liệu Gia Phả Từ File Excel
            </h3>
            <span style={{ fontSize: '13px', color: '#64748b' }}>
              {clanName} • Tự động đọc và xây dựng cây gia phả theo chuẩn Person - User
            </span>
          </div>
          <button
            type="button"
            className="clan-modal-close"
            onClick={() => {
              handleReset();
              onClose();
            }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px' }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '20px 24px' }}>
          {/* Guide Banner */}
          <div className="fa-import-guide-banner" style={{ marginBottom: '20px' }}>
            <div className="fa-import-guide-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <div className="fa-import-guide-content">
              <h4>Quy tắc tách biệt Nhân khẩu (Person) & Tài khoản (User):</h4>
              <p>
                Dữ liệu Excel chỉ dùng để tạo hồ sơ phả hệ (Person, Relationship, Chi/Nhánh) và <strong>tuyệt đối không tạo tài khoản User đăng nhập</strong>. Mọi người mới trên cây sẽ mang nhãn <em>&quot;Chưa liên kết tài khoản&quot;</em> cho đến khi có người thật đăng ký và được Trưởng tộc phê duyệt.
              </p>
            </div>
          </div>

          {/* Action Row: Download Template */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', background: '#f8fafc', padding: '12px 16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <div>
              <strong style={{ fontSize: '14px', color: '#1e293b' }}>Bước 1: Tải file mẫu chuẩn (4 sheet)</strong>
              <div style={{ fontSize: '12.5px', color: '#64748b' }}>
                Gồm các sheet: THÀNH VIÊN, QUAN HỆ, CHI NHÁNH, HƯỚNG DẪN kèm dữ liệu mẫu.
              </div>
            </div>
            <button
              type="button"
              className="btn-secondary"
              onClick={handleDownloadTemplate}
              disabled={isDownloading}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '8px 16px', fontSize: '13.5px', fontWeight: 600 }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              {isDownloading ? 'Đang tạo mẫu...' : 'Tải file mẫu Excel'}
            </button>
          </div>

          {/* Error Message Box */}
          {errorMessage && (
            <div className="fa-alert-box fatal" style={{ marginBottom: '16px' }}>
              <div className="fa-alert-box-header">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                {errorMessage}
              </div>
            </div>
          )}

          {/* Dropzone Area */}
          {!validationResult && (
            <div
              className="fa-dropzone"
              style={{ cursor: 'pointer', padding: '36px 20px', textAlign: 'center' }}
              onClick={() => document.getElementById('genealogy-excel-modal-input')?.click()}
            >
              <div className="fa-dropzone-icon" style={{ marginBottom: '12px' }}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="12" y1="18" x2="12" y2="12" />
                  <line x1="9" y1="15" x2="15" y2="15" />
                </svg>
              </div>
              <div className="fa-dropzone-text" style={{ fontSize: '15px', fontWeight: 600, color: '#1e293b' }}>
                {isValidating ? 'Đang đọc và quét lỗi phả hệ toàn diện...' : 'Bấm để chọn file hoặc kéo thả file Excel (.xlsx) vào đây'}
              </div>
              <div className="fa-dropzone-hint" style={{ fontSize: '13px', color: '#64748b', marginTop: '6px' }}>
                File mẫu chuẩn gồm 4 sheet: THÀNH VIÊN, QUAN HỆ, CHI NHÁNH, HƯỚNG DẪN (Tối đa 10MB)
              </div>
              <input
                id="genealogy-excel-modal-input"
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFileSelected(f);
                  e.target.value = '';
                }}
              />
            </div>
          )}

          {/* Template Requirements & Specifications Guide */}
          <ExcelTemplateRequirementsGuide
            onDownloadTemplate={handleDownloadTemplate}
            defaultExpanded={false}
          />

          {/* Validation Report & Preview */}
          {validationResult && (
            <div style={{ marginTop: '16px' }}>
              {aiAuditReport ? (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                    <span style={{ fontSize: '14px', fontWeight: 700, color: '#0369a1' }}>
                      Chế độ xem: AI Thẩm Định Chuyên Sâu (Giai đoạn 6)
                    </span>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => setAiAuditReport(null)}
                      style={{ fontSize: '12.5px', padding: '6px 14px' }}
                    >
                      Chuyển sang Bảng xem trước chuẩn
                    </button>
                  </div>
                  <AIExcelAuditView
                    report={aiAuditReport}
                    onConfirmImport={handleExecute}
                    onCancel={handleReset}
                    isExecuting={isExecuting}
                  />
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', background: 'linear-gradient(90deg, #f0fdf4 0%, #ecfdf5 100%)', border: '1px solid #a7f3d0', borderRadius: '12px', padding: '14px 20px', gap: '12px', flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 800, color: '#059669', background: '#ffffff', padding: '2px 8px', borderRadius: '8px', border: '1px solid #a7f3d0' }}>AI GIAI ĐOẠN 6</span>
                        <strong style={{ fontSize: '14px', color: '#065f46' }}>Đối soát chuyên sâu & Thẩm định gia phả bằng AI</strong>
                      </div>
                      <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#047857' }}>
                        Kiểm tra hồ sơ nghi trùng trong file & cơ sở dữ liệu Neon, quét mâu thuẫn thế hệ, gợi ý liên kết phối ngẫu và nhận báo cáo cố vấn từ Gemini AI.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleRunAIAnalysis}
                      disabled={isAnalyzingAI}
                      style={{
                        background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '10px',
                        padding: '10px 20px',
                        fontWeight: 700,
                        fontSize: '13.5px',
                        cursor: isAnalyzingAI ? 'not-allowed' : 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        boxShadow: '0 2px 8px rgba(5, 150, 105, 0.25)',
                      }}
                    >
                      {isAnalyzingAI ? (
                        <>
                          <span className="spinner-small" />
                          AI đang đối soát...
                        </>
                      ) : (
                        <>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                            <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                            <line x1="12" y1="22.08" x2="12" y2="12" />
                          </svg>
                          Phân tích dữ liệu bằng AI
                        </>
                      )}
                    </button>
                  </div>
              {/* Stats Grid */}
              <div className="fa-import-stats-grid">
                <div className="fa-import-stat-card">
                  <span className="fa-import-stat-label">Thành viên</span>
                  <span className="fa-import-stat-val">{validationResult.summary.total_persons}</span>
                </div>
                <div className="fa-import-stat-card">
                  <span className="fa-import-stat-label">Mối quan hệ</span>
                  <span className="fa-import-stat-val">{validationResult.summary.total_relationships}</span>
                </div>
                <div className="fa-import-stat-card">
                  <span className="fa-import-stat-label">Chi nhánh</span>
                  <span className="fa-import-stat-val">{validationResult.summary.total_branches}</span>
                </div>
                <div className={`fa-import-stat-card ${validationResult.summary.warning_count > 0 ? 'warning' : ''}`}>
                  <span className="fa-import-stat-label">Cảnh báo</span>
                  <span className="fa-import-stat-val">{validationResult.summary.warning_count}</span>
                </div>
                <div className={`fa-import-stat-card ${validationResult.summary.fatal_count > 0 ? 'fatal' : 'success'}`}>
                  <span className="fa-import-stat-label">Lỗi chặn</span>
                  <span className="fa-import-stat-val">{validationResult.summary.fatal_count}</span>
                </div>
              </div>

              {/* Fatal Errors Table */}
              {validationResult.fatal_errors.length > 0 && (
                <div className="fa-alert-box fatal" style={{ marginBottom: '16px' }}>
                  <div className="fa-alert-box-header">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    Phát hiện {validationResult.fatal_errors.length} lỗi chặn dữ liệu (Cần sửa trong file Excel trước khi lưu):
                  </div>
                  <table className="fa-err-table" style={{ width: '100%', marginTop: '10px' }}>
                    <thead>
                      <tr>
                        <th style={{ width: '120px' }}>Sheet</th>
                        <th style={{ width: '70px' }}>Dòng</th>
                        <th style={{ width: '140px' }}>Cột</th>
                        <th>Chi tiết lỗi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {validationResult.fatal_errors.map((err, idx) => (
                        <tr key={idx}>
                          <td><strong>{err.sheet}</strong></td>
                          <td><code>{err.row > 0 ? err.row : '—'}</code></td>
                          <td>{err.column || '—'}</td>
                          <td style={{ color: '#dc2626' }}>{err.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Warnings Box */}
              {validationResult.warnings.length > 0 && (
                <div className="fa-alert-box warning" style={{ marginBottom: '16px' }}>
                  <div className="fa-alert-box-header">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                      <line x1="12" y1="9" x2="12" y2="13" />
                      <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                    Có {validationResult.warnings.length} cảnh báo (Vẫn có thể lưu nhưng cần lưu ý):
                  </div>
                  <ul className="fa-err-list" style={{ marginTop: '8px' }}>
                    {validationResult.warnings.map((w, idx) => (
                      <li key={idx}>
                        <strong>[{w.sheet}] Dòng {w.row}:</strong> {w.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Preview Tabs */}
              <div style={{ marginTop: '16px' }}>
                <div className="fa-preview-tabs" style={{ display: 'flex', gap: '8px', borderBottom: '1px solid #e2e8f0', marginBottom: '12px' }}>
                  <button
                    type="button"
                    className={`fa-preview-tab-btn ${activePreviewTab === 'persons' ? 'active' : ''}`}
                    onClick={() => setActivePreviewTab('persons')}
                  >
                    1. Sheet THÀNH VIÊN ({validationResult.preview.persons.length})
                  </button>
                  <button
                    type="button"
                    className={`fa-preview-tab-btn ${activePreviewTab === 'relations' ? 'active' : ''}`}
                    onClick={() => setActivePreviewTab('relations')}
                  >
                    2. Sheet QUAN HỆ ({validationResult.preview.relationships.length})
                  </button>
                  <button
                    type="button"
                    className={`fa-preview-tab-btn ${activePreviewTab === 'branches' ? 'active' : ''}`}
                    onClick={() => setActivePreviewTab('branches')}
                  >
                    3. Sheet CHI NHÁNH ({validationResult.preview.branches.length})
                  </button>
                </div>

                {activePreviewTab === 'persons' && (
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
                          <th>Mã Chi</th>
                        </tr>
                      </thead>
                      <tbody>
                        {validationResult.preview.persons.map((p, idx) => (
                          <tr key={idx}>
                            <td><code style={{ color: '#0284c7', fontWeight: 700 }}>{p.code}</code></td>
                            <td><strong>{p.fullName}</strong></td>
                            <td>{p.gender === 'MALE' ? 'Nam' : 'Nữ'}</td>
                            <td><span style={{ padding: '2px 8px', borderRadius: '4px', background: '#e0f2fe', color: '#0369a1', fontWeight: 700 }}>Đời {p.generation}</span></td>
                            <td><span style={{ color: p.isLiving ? '#166534' : '#64748b', fontWeight: 600 }}>{p.isLiving ? 'Còn sống' : 'Đã mất'}</span></td>
                            <td>{p.birthDate || '—'}</td>
                            <td>{p.branchCode ? <code style={{ color: '#d97706' }}>{p.branchCode}</code> : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {activePreviewTab === 'relations' && (
                  <div className="fa-table-wrap" style={{ maxHeight: '260px', overflowY: 'auto' }}>
                    <table style={{ width: '100%' }}>
                      <thead>
                        <tr>
                          <th>Người thứ nhất</th>
                          <th>Người thứ hai</th>
                          <th>Loại quan hệ</th>
                          <th>Thứ tự con</th>
                          <th>Ghi chú</th>
                        </tr>
                      </thead>
                      <tbody>
                        {validationResult.preview.relationships.map((r, idx) => (
                          <tr key={idx}>
                            <td><code style={{ color: '#0284c7', fontWeight: 700 }}>{r.person1}</code></td>
                            <td><code style={{ color: '#059669', fontWeight: 700 }}>{r.person2}</code></td>
                            <td>
                              <span style={{ fontWeight: 700, color: r.relationshipType === 'PARENT_CHILD' ? '#2563eb' : '#d97706' }}>
                                {r.relationshipType === 'PARENT_CHILD' ? 'Cha/Mẹ → Con' : 'Vợ ↔ Chồng'}
                              </span>
                            </td>
                            <td>{r.childOrder ? `Con thứ ${r.childOrder}` : '—'}</td>
                            <td>{r.notes || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {activePreviewTab === 'branches' && (
                  <div className="fa-table-wrap" style={{ maxHeight: '260px', overflowY: 'auto' }}>
                    <table style={{ width: '100%' }}>
                      <thead>
                        <tr>
                          <th>Mã Chi</th>
                          <th>Tên Chi/Nhánh</th>
                          <th>Trực thuộc</th>
                          <th>Thứ tự</th>
                        </tr>
                      </thead>
                      <tbody>
                        {validationResult.preview.branches.map((b, idx) => (
                          <tr key={idx}>
                            <td><code style={{ color: '#d97706', fontWeight: 700 }}>{b.code}</code></td>
                            <td><strong>{b.name}</strong></td>
                            <td>{b.parent_code || 'Gốc'}</td>
                            <td>{b.order}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="fa-import-actions-bar" style={{ marginTop: '20px', display: 'flex', justifyContent: 'space-between' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleReset}
                  disabled={isExecuting}
                >
                  Chọn lại file khác
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleExecute}
                  disabled={isExecuting || validationResult.fatal_errors.length > 0}
                  style={{
                    backgroundColor: validationResult.fatal_errors.length > 0 ? '#94a3b8' : '#059669',
                    color: '#ffffff',
                    fontWeight: 700,
                    padding: '10px 24px',
                    borderRadius: '8px',
                    border: 'none',
                    cursor: validationResult.fatal_errors.length > 0 ? 'not-allowed' : 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                    <polyline points="17 21 17 13 7 13 7 21" />
                    <polyline points="7 3 7 8 15 8" />
                  </svg>
                  {isExecuting ? 'Đang lưu vào Neon DB...' : 'Xác nhận & Lưu vào CSDL'}
                </button>
              </div>
            </>
          )}
        </div>
      )}
        </div>
      </div>
    </div>
  );
};

