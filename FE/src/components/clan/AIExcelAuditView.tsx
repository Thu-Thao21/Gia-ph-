import React, { useState, useMemo } from 'react';
import type { AIExcelImportAnalyzeResponse } from '../../types/ai';
import './AIExcelAuditView.css';

export interface AIExcelAuditViewProps {
  report: AIExcelImportAnalyzeResponse;
  onConfirmImport?: () => void;
  onCancel?: () => void;
  isExecuting?: boolean;
}

export const AIExcelAuditView: React.FC<AIExcelAuditViewProps> = ({
  report,
  onConfirmImport,
  onCancel,
  isExecuting = false,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'duplicates' | 'anomalies' | 'errors' | 'preview'>('overview');
  const [previewSubTab, setPreviewSubTab] = useState<'persons' | 'relations' | 'branches'>('persons');
  const [errFilter, setErrFilter] = useState<'ALL' | 'FATAL' | 'WARNING'>('ALL');

  const { summary } = report;
  const isBranchScoped = report.audit_scope === 'branch_scoped';

  const healthColor = useMemo(() => {
    const score = summary.health_score ?? 100;
    if (score >= 90) return 'green';
    if (score >= 70) return 'blue';
    if (score >= 50) return 'amber';
    return 'red';
  }, [summary.health_score]);

  const readinessStatus = useMemo(() => {
    if (summary.fatal_count > 0) {
      return {
        label: `CHƯA THỂ NHẬP • Phát hiện ${summary.fatal_count} lỗi chặn bắt buộc`,
        color: 'red',
        canImport: false,
      };
    }
    if (summary.warning_count > 0 || summary.duplicates_count > 0) {
      return {
        label: `SẴN SÀNG CÓ ĐIỀU KIỆN • Cần xem xét ${summary.warning_count} cảnh báo`,
        color: 'amber',
        canImport: true,
      };
    }
    return {
      label: 'RẤT TỐT • Dữ liệu hoàn chỉnh sẵn sàng nhập vào Neon DB',
      color: 'green',
      canImport: true,
    };
  }, [summary.fatal_count, summary.warning_count, summary.duplicates_count]);

  const allIssues = useMemo(() => {
    const list: Array<{ type: 'FATAL' | 'WARNING'; sheet: string; row: number; column: string; message: string; code?: string }> = [];
    report.fatal_errors.forEach((e) => list.push({ type: 'FATAL', sheet: e.sheet, row: e.row, column: e.column, message: e.message, code: e.code }));
    report.warnings.forEach((w) => list.push({ type: 'WARNING', sheet: w.sheet, row: w.row, column: w.column, message: w.message, code: w.code }));
    return list;
  }, [report.fatal_errors, report.warnings]);

  const filteredIssues = useMemo(() => {
    if (errFilter === 'FATAL') return allIssues.filter((i) => i.type === 'FATAL');
    if (errFilter === 'WARNING') return allIssues.filter((i) => i.type === 'WARNING');
    return allIssues;
  }, [allIssues, errFilter]);

  return (
    <div className="excel-audit-container">
      {/* 1. Header Banner */}
      <div className="audit-banner-card">
        <div className="audit-banner-left">
          <div className="audit-tags-row">
            <span className="audit-badge-tag">Giai đoạn 6 • AI Thẩm Định Nhập Excel</span>
            {isBranchScoped ? (
              <span className="audit-scope-tag branch">Phạm vi: Chi nhánh được phân quyền</span>
            ) : (
              <span className="audit-scope-tag clan">Phạm vi: Toàn bộ dòng họ (Clan-wide)</span>
            )}
            <span className="audit-scope-tag read-only">Chỉ đọc • Chưa lưu Neon DB</span>
          </div>
          <h2 className="audit-banner-title">Kết Quả AI Đối Soát Dữ Liệu Excel Gia Phả</h2>
          <p className="audit-banner-desc">
            Dòng tộc: <strong>{report.clan_name}</strong>. Hệ thống đã quét đối chiếu cấu trúc 4 sheets, ma trận nghi trùng lặp và mâu thuẫn thế hệ.
          </p>
        </div>

        <div className="audit-readiness-box">
          <span className={`readiness-pill ${readinessStatus.color}`}>
            {readinessStatus.label}
          </span>
        </div>
      </div>

      {/* 2. KPI Summary Grid */}
      <div className="audit-kpi-grid">
        {/* Health Score Card */}
        <div className={`audit-health-card ${healthColor}`}>
          <div className="health-left">
            <span className="health-label">Điểm Sức Khỏe File</span>
            <div className="health-val-row">
              <span className="health-big-num">{summary.health_score}</span>
              <span className="health-max">/100</span>
            </div>
            <span className="health-sub">Thang điểm chuẩn xác</span>
          </div>
          <div className="health-right">
            <span>Dự kiến thêm:</span>
            <strong>{summary.total_persons} người</strong>
            <strong>{summary.total_relationships} quan hệ</strong>
          </div>
        </div>

        {/* Fatal Count */}
        <div
          className={`audit-kpi-chip ${summary.fatal_count > 0 ? 'fatal' : 'clean'}`}
          onClick={() => { setActiveTab('errors'); setErrFilter('FATAL'); }}
        >
          <div className="kpi-num">{summary.fatal_count}</div>
          <div className="kpi-text">Lỗi chặn dữ liệu</div>
          <span className="kpi-hint">{summary.fatal_count > 0 ? 'Bắt buộc sửa file' : 'Không có lỗi'}</span>
        </div>

        {/* Duplicates Count */}
        <div
          className={`audit-kpi-chip ${summary.duplicates_count > 0 ? 'warning' : 'clean'}`}
          onClick={() => setActiveTab('duplicates')}
        >
          <div className="kpi-num">{summary.duplicates_count}</div>
          <div className="kpi-text">Hồ sơ nghi trùng</div>
          <span className="kpi-hint">Trong file & với Neon</span>
        </div>

        {/* Anomalies Count */}
        <div
          className={`audit-kpi-chip ${summary.anomalies_count > 0 ? 'warning' : 'clean'}`}
          onClick={() => setActiveTab('anomalies')}
        >
          <div className="kpi-num">{summary.anomalies_count}</div>
          <div className="kpi-text">Quan hệ bất thường</div>
          <span className="kpi-hint">Thế hệ & năm sinh</span>
        </div>

        {/* Missing Suggestions */}
        <div
          className={`audit-kpi-chip ${summary.missing_suggestions_count > 0 ? 'info' : 'clean'}`}
          onClick={() => setActiveTab('anomalies')}
        >
          <div className="kpi-num">{summary.missing_suggestions_count}</div>
          <div className="kpi-text">Gợi ý kiểm tra phối ngẫu</div>
          <span className="kpi-hint">Đồng phụ huynh</span>
        </div>
      </div>

      {/* 3. Gemini AI Advisory Box */}
      {report.ai_advisory && (
        <div className="audit-ai-advisory-card">
          <div className="advisory-header">
            <div className="advisory-title-group">
              <span className="advisory-ai-badge">AI</span>
              <div>
                <h3 className="advisory-title">Khuyến Nghị Thẩm Định Từ Trợ Lý AI Gia Phả</h3>
                <span className="advisory-sub">Tổng hợp nhận định chuyên sâu trước khi người quản trị bấm ghi nhận Neon DB</span>
              </div>
            </div>
            <span className="advisory-tag">Báo cáo thẩm định Import</span>
          </div>

          <div className="advisory-body">
            {report.ai_advisory.split('\n').map((line, idx) => (
              line.trim() ? <p key={idx}>{line.trim()}</p> : null
            ))}
          </div>

          <div className="advisory-footer">
            <span className="advisory-privacy-tag">
              Bảo vệ quyền riêng tư: Dữ liệu cá nhân chưa cấp quyền AI (AIConsent) đã được khử định danh an toàn trước khi chuyển đến Gemini.
            </span>
          </div>
        </div>
      )}

      {/* 4. Tab Navigation Bar */}
      <div className="audit-tabs-bar">
        <button
          type="button"
          className={`audit-tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          Tổng quan nhập liệu
        </button>
        <button
          type="button"
          className={`audit-tab-btn ${activeTab === 'duplicates' ? 'active' : ''}`}
          onClick={() => setActiveTab('duplicates')}
        >
          Hồ sơ nghi trùng
          <span className="tab-count-pill">{summary.duplicates_count}</span>
        </button>
        <button
          type="button"
          className={`audit-tab-btn ${activeTab === 'anomalies' ? 'active' : ''}`}
          onClick={() => setActiveTab('anomalies')}
        >
          Quan hệ bất thường & Gợi ý
          <span className="tab-count-pill">{summary.anomalies_count + summary.missing_suggestions_count}</span>
        </button>
        <button
          type="button"
          className={`audit-tab-btn ${activeTab === 'errors' ? 'active' : ''}`}
          onClick={() => setActiveTab('errors')}
        >
          Lỗi & Cảnh báo chi tiết
          <span className={`tab-count-pill ${summary.fatal_count > 0 ? 'fatal' : ''}`}>{allIssues.length}</span>
        </button>
        <button
          type="button"
          className={`audit-tab-btn ${activeTab === 'preview' ? 'active' : ''}`}
          onClick={() => setActiveTab('preview')}
        >
          Dữ liệu xem trước
          <span className="tab-count-pill">{summary.total_persons}</span>
        </button>
      </div>

      {/* 5. Tab Content Sections */}
      <div className="audit-tab-content">
        {/* TAB 1: OVERVIEW */}
        {activeTab === 'overview' && (
          <div className="audit-overview-panel">
            <div className="audit-guide-card">
              <h4>Nguyên tắc vận hành và đối soát dữ liệu phả hệ số (Giai đoạn 6):</h4>
              <ul>
                <li>
                  <strong>Không tự động gộp hồ sơ:</strong> Khi phát hiện Person trùng họ tên hoặc năm sinh, hệ thống cảnh báo để người quản trị kiểm tra gia phả gốc; hệ thống tuyệt đối không tự ý gộp hay sửa hồ sơ.
                </li>
                <li>
                  <strong>Cùng có con không đồng nghĩa đã kết hôn:</strong> Nếu hai người cùng được khai báo là phụ huynh của một người con, hệ thống chỉ gợi ý <em>&quot;Kiểm tra liên kết phối ngẫu&quot;</em>, không tự suy đoán hôn nhân.
                </li>
                <li>
                  <strong>Chặn khi có lỗi nghiêm trọng (Fatal):</strong> Các lỗi như trùng mã trong file, ngày mất trước ngày sinh, chu trình vòng lặp hay cha mẹ sinh sau con sẽ khóa nút &quot;Xác nhận nhập&quot; cho đến khi file được sửa lại.
                </li>
                <li>
                  <strong>Giao dịch nguyên tử (Atomic Transaction):</strong> Quá trình nhập vào Neon DB được bảo vệ trong transaction duy nhất. Nếu bất kỳ dòng nào xảy ra lỗi trong DB, toàn bộ sẽ được rollback an toàn 100%.
                </li>
              </ul>
            </div>
          </div>
        )}

        {/* TAB 2: DUPLICATES */}
        {activeTab === 'duplicates' && (
          <div className="audit-duplicates-panel">
            <div className="audit-disclaimer-box">
              <strong>Nguyên tắc chấm điểm tương đồng:</strong> Điểm số tính trên thang điểm 100 theo tiêu chí heuristic (tên, thế hệ, năm sinh, phụ mẫu khai báo). Đây là công cụ sàng lọc cho ban quản trị, không phải xác suất khẳng định chắc chắn trùng.
            </div>

            {report.duplicate_candidates.length === 0 ? (
              <div className="audit-empty-state">
                <span className="empty-check">✓</span>
                <h4>Không phát hiện hồ sơ nào nghi trùng lặp!</h4>
                <p>Cả trong nội bộ file Excel và đối chiếu với cơ sở dữ liệu Neon đều không có bản ghi trùng vượt ngưỡng cảnh báo.</p>
              </div>
            ) : (
              <div className="audit-dup-cards-list">
                {report.duplicate_candidates.map((dup, idx) => (
                  <div key={idx} className="audit-dup-card">
                    <div className="dup-card-top">
                      <div className="dup-badge-group">
                        <span className={`sim-score-badge ${dup.similarity_score >= 85 ? 'high' : 'medium'}`}>
                          Điểm tương đồng: {dup.similarity_score}/100
                        </span>
                        <span className={`dup-source-tag ${dup.source}`}>
                          {dup.source === 'intra_excel' ? 'Nghi trùng nội bộ trong file Excel' : 'Nghi trùng với Person trên Neon DB'}
                        </span>
                      </div>
                      <span className="dup-rec-text">{dup.recommendation}</span>
                    </div>

                    <div className="dup-grid-compare">
                      <div className="dup-col">
                        <span className="dup-col-label">
                          {dup.source === 'intra_excel' ? `Hồ sơ trong file (Dòng ${dup.person_1.row || '?'})` : `Hồ sơ Excel dự kiến nhập (Dòng ${dup.person_1.row || '?'})`}
                        </span>
                        <strong className="dup-col-name">{dup.person_1.full_name}</strong>
                        <div className="dup-col-meta">
                          <span>Mã: <code>{dup.person_1.code || '—'}</code></span>
                          <span>Đời thứ: <strong>{dup.person_1.generation}</strong></span>
                          <span>Năm sinh: <strong>{dup.person_1.birth_year || 'Chưa rõ'}</strong></span>
                        </div>
                      </div>

                      <div className="dup-vs-divider">VS</div>

                      <div className="dup-col target">
                        <span className="dup-col-label">
                          {dup.source === 'intra_excel' ? `Hồ sơ trong file (Dòng ${dup.person_2.row || '?'})` : 'Hồ sơ đã có trên cơ sở dữ liệu Neon'}
                        </span>
                        <strong className="dup-col-name">{dup.person_2.full_name}</strong>
                        <div className="dup-col-meta">
                          {dup.person_2.code && <span>Mã: <code>{dup.person_2.code}</code></span>}
                          {dup.person_2.person_id && <span>ID Neon: <code>{dup.person_2.person_id.slice(0, 8)}...</code></span>}
                          <span>Đời thứ: <strong>{dup.person_2.generation}</strong></span>
                          <span>Năm sinh: <strong>{dup.person_2.birth_year || 'Chưa rõ'}</strong></span>
                          {dup.person_2.branch_name && <span>Chi: <strong>{dup.person_2.branch_name}</strong></span>}
                        </div>
                      </div>
                    </div>

                    <div className="dup-reasons-chips">
                      <span className="reasons-head">Căn cứ phát hiện:</span>
                      {dup.reasons.map((r, rIdx) => (
                        <span key={rIdx} className="reason-pill">{r}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: ANOMALIES & MISSING RELATIONS */}
        {activeTab === 'anomalies' && (
          <div className="audit-anomalies-panel">
            {/* Missing Spouse Suggestions */}
            {report.missing_relationship_suggestions.length > 0 && (
              <div className="anomalies-section-block">
                <h4 className="section-block-title">
                  Gợi ý kiểm tra liên kết phối ngẫu ({report.missing_relationship_suggestions.length})
                </h4>
                <div className="audit-disclaimer-box warning">
                  <strong>Lưu ý:</strong> Cùng có con không đồng nghĩa đã kết hôn. Hệ thống phát hiện hai phụ huynh cùng đứng tên con cái nhưng chưa có quan hệ phối ngẫu trong file; đề xuất ban quản trị kiểm tra gia phả thực tế.
                </div>

                <div className="missing-list-grid">
                  {report.missing_relationship_suggestions.map((m, idx) => (
                    <div key={idx} className="missing-item-box">
                      <div className="missing-box-header">
                        <span className="missing-type-tag">Kiểm tra liên kết phối ngẫu</span>
                        <span className="missing-priority-tag">Ưu tiên: Trung bình</span>
                      </div>
                      <div className="missing-flow-row">
                        <div className="flow-person">
                          <strong>{m.from_person.full_name}</strong>
                          <code>{m.from_person.code}</code>
                        </div>
                        <div className="flow-mid">
                          <span>Kiểm tra phối ngẫu</span>
                          ➔
                        </div>
                        <div className="flow-person">
                          <strong>{m.to_person.full_name}</strong>
                          <code>{m.to_person.code}</code>
                        </div>
                      </div>
                      <p className="missing-reason-msg">{m.reason}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Anomalous Relationships */}
            <div className="anomalies-section-block" style={{ marginTop: '20px' }}>
              <h4 className="section-block-title">
                Cảnh báo bất thường quan hệ & niên đại ({report.anomalous_relationships.length})
              </h4>
              {report.anomalous_relationships.length === 0 ? (
                <div className="audit-empty-state">
                  <span className="empty-check">✓</span>
                  <h4>Cấu trúc quan hệ hợp lý và chuẩn xác!</h4>
                  <p>Không có mâu thuẫn năm sinh, không có đảo ngược thế hệ hay bước nhảy đời quá lớn.</p>
                </div>
              ) : (
                <div className="anomalous-list-grid">
                  {report.anomalous_relationships.map((a, idx) => (
                    <div key={idx} className={`anom-card-item ${a.severity.toLowerCase()}`}>
                      <div className="anom-item-top">
                        <span className={`anom-severity-badge ${a.severity.toLowerCase()}`}>
                          {a.severity === 'CRITICAL' ? 'Nghiêm trọng (Lỗi chặn)' : 'Cảnh báo'}
                        </span>
                        <span className="anom-loc-badge">Sheet {a.sheet}{a.row ? `, Dòng ${a.row}` : ''}</span>
                        <h4 className="anom-title-text">{a.title}</h4>
                      </div>
                      <p className="anom-desc-text">{a.description}</p>
                      <div className="anom-fix-box">
                        <span className="fix-label">Hướng khắc phục:</span>
                        <span className="fix-val">{a.recommended_fix}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 4: ERRORS & WARNINGS TABLE */}
        {activeTab === 'errors' && (
          <div className="audit-errors-panel">
            <div className="errors-filter-bar">
              <button
                type="button"
                className={`filter-btn ${errFilter === 'ALL' ? 'active' : ''}`}
                onClick={() => setErrFilter('ALL')}
              >
                Tất cả ({allIssues.length})
              </button>
              <button
                type="button"
                className={`filter-btn fatal ${errFilter === 'FATAL' ? 'active' : ''}`}
                onClick={() => setErrFilter('FATAL')}
              >
                Lỗi chặn dữ liệu ({report.fatal_errors.length})
              </button>
              <button
                type="button"
                className={`filter-btn warning ${errFilter === 'WARNING' ? 'active' : ''}`}
                onClick={() => setErrFilter('WARNING')}
              >
                Cảnh báo cần lưu ý ({report.warnings.length})
              </button>
            </div>

            {filteredIssues.length === 0 ? (
              <div className="audit-empty-state">
                <span className="empty-check">✓</span>
                <h4>Không có vấn đề nào trong nhóm này!</h4>
              </div>
            ) : (
              <div className="audit-table-wrap">
                <table className="audit-issue-table">
                  <thead>
                    <tr>
                      <th style={{ width: '120px' }}>Mức độ</th>
                      <th style={{ width: '140px' }}>Sheet</th>
                      <th style={{ width: '90px' }}>Dòng</th>
                      <th style={{ width: '150px' }}>Vị trí / Cột</th>
                      <th>Chi tiết lỗi và khuyến nghị xử lý</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredIssues.map((issue, idx) => (
                      <tr key={idx} className={issue.type.toLowerCase()}>
                        <td>
                          <span className={`issue-tag ${issue.type.toLowerCase()}`}>
                            {issue.type === 'FATAL' ? 'Lỗi chặn' : 'Cảnh báo'}
                          </span>
                        </td>
                        <td><strong>{issue.sheet}</strong></td>
                        <td>{issue.row > 0 ? `Dòng ${issue.row}` : 'Toàn cục'}</td>
                        <td><code>{issue.column || 'Logic'}</code></td>
                        <td>{issue.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 5: PREVIEW */}
        {activeTab === 'preview' && (
          <div className="audit-preview-panel">
            <div className="preview-subtabs-row">
              <button
                type="button"
                className={`subtab-btn ${previewSubTab === 'persons' ? 'active' : ''}`}
                onClick={() => setPreviewSubTab('persons')}
              >
                Thành viên ({report.preview.persons.length})
              </button>
              <button
                type="button"
                className={`subtab-btn ${previewSubTab === 'relations' ? 'active' : ''}`}
                onClick={() => setPreviewSubTab('relations')}
              >
                Mối quan hệ ({report.preview.relationships.length})
              </button>
              <button
                type="button"
                className={`subtab-btn ${previewSubTab === 'branches' ? 'active' : ''}`}
                onClick={() => setPreviewSubTab('branches')}
              >
                Chi nhánh ({report.preview.branches.length})
              </button>
            </div>

            {previewSubTab === 'persons' && (
              <div className="audit-table-wrap">
                <table className="audit-data-table">
                  <thead>
                    <tr>
                      <th>Dòng</th>
                      <th>Mã TV</th>
                      <th>Họ và tên</th>
                      <th>Giới tính</th>
                      <th>Đời thứ</th>
                      <th>Tình trạng</th>
                      <th>Ngày sinh</th>
                      <th>Ngày mất</th>
                      <th>Mã Chi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.preview.persons.map((p, idx) => (
                      <tr key={idx}>
                        <td>{p.row_idx}</td>
                        <td><code>{p.code}</code></td>
                        <td><strong>{p.fullName}</strong></td>
                        <td>{p.gender === 'FEMALE' ? 'Nữ' : 'Nam'}</td>
                        <td>Đời {p.generation}</td>
                        <td>
                          <span className={`status-dot ${p.isLiving ? 'living' : 'deceased'}`}>
                            {p.isLiving ? 'Còn sống' : 'Đã mất'}
                          </span>
                        </td>
                        <td>{p.birthDate || '—'}</td>
                        <td>{p.deathDate || '—'}</td>
                        <td>{p.branchCode ? <code>{p.branchCode}</code> : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {previewSubTab === 'relations' && (
              <div className="audit-table-wrap">
                <table className="audit-data-table">
                  <thead>
                    <tr>
                      <th>Dòng</th>
                      <th>Người 1 (Nguồn)</th>
                      <th>Người 2 (Đích)</th>
                      <th>Loại quan hệ</th>
                      <th>Thứ tự con</th>
                      <th>Ghi chú</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.preview.relationships.map((r, idx) => (
                      <tr key={idx}>
                        <td>{r.row_idx}</td>
                        <td><code className="code-blue">{r.person1}</code></td>
                        <td><code className="code-green">{r.person2}</code></td>
                        <td>
                          <span className={`rel-type-pill ${r.relationshipType === 'PARENT_CHILD' ? 'pc' : 'sp'}`}>
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

            {previewSubTab === 'branches' && (
              <div className="audit-table-wrap">
                <table className="audit-data-table">
                  <thead>
                    <tr>
                      <th>Dòng</th>
                      <th>Mã Chi</th>
                      <th>Tên Chi/Nhánh</th>
                      <th>Trực thuộc</th>
                      <th>Thứ tự</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.preview.branches.map((b, idx) => (
                      <tr key={idx}>
                        <td>{b.row_idx}</td>
                        <td><code className="code-amber">{b.code}</code></td>
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
        )}
      </div>

      {/* 6. Footer Actions Bar */}
      <div className="audit-actions-bar">
        <button
          type="button"
          className="btn-cancel-audit"
          onClick={onCancel}
          disabled={isExecuting}
        >
          Hủy / Chọn file khác
        </button>

        <div className="action-right-group">
          {summary.fatal_count > 0 && (
            <span className="import-blocked-hint">
              Cần sửa {summary.fatal_count} lỗi chặn trong file Excel trước khi Import
            </span>
          )}
          <button
            type="button"
            className="btn-confirm-import"
            disabled={!readinessStatus.canImport || isExecuting}
            onClick={onConfirmImport}
          >
            {isExecuting ? (
              <>
                <span className="audit-btn-spinner" />
                <span>Đang ghi vào Neon DB...</span>
              </>
            ) : (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                  <polyline points="17 21 17 13 7 13 7 21" />
                  <polyline points="7 3 7 8 15 8" />
                </svg>
                <span>Xác nhận & Lưu vào CSDL Neon</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AIExcelAuditView;

