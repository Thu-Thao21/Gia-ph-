import React, { useState, useEffect, useMemo } from 'react';
import { useClanContext } from '../../context/ClanContext';
import { fetchAIDataQualityReport } from '../../services/ai.service';
import type { AIDataQualityReportResponse } from '../../types/ai';
import './ClanDataQualityModule.css';

export interface ClanDataQualityModuleProps {
  clanId?: string;
  canManage?: boolean;
  onNavigateTab?: (tabId: string) => void;
}

export const ClanDataQualityModule: React.FC<ClanDataQualityModuleProps> = ({
  clanId: propClanId,
  canManage = true,
  onNavigateTab,
}) => {
  const { activeClanId, activeClanName } = useClanContext();
  const effectiveClanId = propClanId || activeClanId;

  const [loading, setLoading] = useState<boolean>(true);
  const [report, setReport] = useState<AIDataQualityReportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'duplicates' | 'missing' | 'anomalies'>('overview');
  const [anomalyFilter, setAnomalyFilter] = useState<'ALL' | 'CRITICAL' | 'WARNING' | 'INFO'>('ALL');

  const loadReport = async (forceRescan = false) => {
    if (!effectiveClanId) {
      setError('Vui lòng chọn một dòng họ để thực hiện kiểm định chất lượng dữ liệu.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await fetchAIDataQualityReport(effectiveClanId, {
        include_ai_synthesis: true,
      });
      setReport(data);
    } catch (err: any) {
      setError(err?.message || 'Không thể tải báo cáo kiểm định chất lượng gia phả.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReport();
  }, [effectiveClanId]);

  const filteredAnomalies = useMemo(() => {
    if (!report?.anomalies) return [];
    if (anomalyFilter === 'ALL') return report.anomalies;
    return report.anomalies.filter((a) => a.severity === anomalyFilter);
  }, [report, anomalyFilter]);

  const healthColor = useMemo(() => {
    const score = report?.health_score ?? 100;
    if (score >= 90) return 'green';
    if (score >= 70) return 'blue';
    if (score >= 50) return 'amber';
    return 'red';
  }, [report?.health_score]);

  const healthLabel = useMemo(() => {
    const score = report?.health_score ?? 100;
    if (score >= 90) return 'Rất Tốt • Dữ Liệu Đồng Bộ';
    if (score >= 70) return 'Khá • Cần Rà Soát Nhẹ';
    if (score >= 50) return 'Trung Bình • Nhiều Mâu Thuẫn';
    return 'Báo Động • Cần Chỉnh Sửa Ngay';
  }, [report?.health_score]);

  const isBranchScoped = report?.audit_scope === 'branch_scoped';

  return (
    <div className="quality-module-container">
      {/* Top Banner */}
      <div className="quality-banner-card">
        <div className="quality-banner-content">
          <div className="quality-banner-tags">
            <span className="quality-tag-badge">Giai đoạn 5 • Trợ lý AI Phả Hệ</span>
            {isBranchScoped ? (
              <span className="quality-scope-badge branch-scoped">
                Phạm vi chi nhánh: {report?.scoped_branch_names?.join(', ') || 'Chi nhánh được phân quyền'}
              </span>
            ) : (
              <span className="quality-scope-badge clan-wide">
                Phạm vi: Toàn bộ dòng họ (Clan-wide)
              </span>
            )}
            <span className="quality-scope-badge">Chỉ đọc • Không ghi đè DB</span>
          </div>
          <h1 className="quality-banner-title">Kiểm Định Chất Lượng & Bất Thường Gia Phả</h1>
          <p className="quality-banner-desc">
            Không gian dòng tộc: <strong>{activeClanName || report?.clan_name || 'Dòng họ'}</strong>.
            Tự động phát hiện hồ sơ nghi trùng lặp, đề xuất kiểm tra quan hệ còn thiếu và cảnh báo mâu thuẫn thời gian/thế hệ.
          </p>
        </div>

        <div className="quality-banner-actions">
          <button
            type="button"
            className="quality-rescan-btn"
            onClick={() => loadReport(true)}
            disabled={loading}
          >
            {loading ? (
              <>
                <span className="quality-btn-spinner" />
                <span>Đang quét cơ sở dữ liệu...</span>
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                </svg>
                <span>Chạy lại kiểm định AI</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Lỗi nếu có */}
      {error && (
        <div className="quality-error-alert">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      {loading && !report ? (
        <div className="quality-loading-panel">
          <div className="quality-pulse-spinner" />
          <h3>Hệ thống đang phân tích cấu trúc cây gia phả...</h3>
          <p>Đang kiểm tra đồ thị phả hệ, ma trận tương đồng hồ sơ và rà soát mâu thuẫn niên đại.</p>
        </div>
      ) : report ? (
        <>
          {/* Overview KPI Cards */}
          <div className="quality-kpi-grid">
            {/* Health Score Card */}
            <div className={`quality-health-card ${healthColor}`}>
              <div className="health-left">
                <span className="health-title">Điểm Sức Khỏe Dữ Liệu</span>
                <div className="health-score-display">
                  <span className="health-number">{report.health_score}</span>
                  <span className="health-total">/100</span>
                </div>
                <span className="health-status-text">{healthLabel}</span>
              </div>
              <div className="health-meta">
                <span>Tổng nhân khẩu: <strong>{report.total_persons}</strong></span>
                <span>Tổng quan hệ: <strong>{report.total_relationships}</strong></span>
                {isBranchScoped && (
                  <span className="branch-scope-hint">Giới hạn theo phân quyền chi nhánh</span>
                )}
              </div>
            </div>

            {/* Duplicates KPI */}
            <div
              className={`quality-kpi-item ${activeTab === 'duplicates' ? 'active' : ''}`}
              onClick={() => setActiveTab('duplicates')}
            >
              <div className="kpi-icon orange">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                  <circle cx="8.5" cy="7" r="4"/>
                  <path d="M20 8v6M23 11h-6"/>
                </svg>
              </div>
              <div className="kpi-info">
                <span className="kpi-count">{report.duplicates_count}</span>
                <span className="kpi-label">Hồ sơ nghi trùng</span>
              </div>
            </div>

            {/* Missing Relations KPI */}
            <div
              className={`quality-kpi-item ${activeTab === 'missing' ? 'active' : ''}`}
              onClick={() => setActiveTab('missing')}
            >
              <div className="kpi-icon purple">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                </svg>
              </div>
              <div className="kpi-info">
                <span className="kpi-count">{report.missing_relationships_count}</span>
                <span className="kpi-label">Gợi ý kiểm tra quan hệ</span>
              </div>
            </div>

            {/* Anomalies KPI */}
            <div
              className={`quality-kpi-item ${activeTab === 'anomalies' ? 'active' : ''}`}
              onClick={() => setActiveTab('anomalies')}
            >
              <div className="kpi-icon red">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/>
                  <line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
              </div>
              <div className="kpi-info">
                <span className="kpi-count">{report.anomalies_count}</span>
                <span className="kpi-label">Cảnh báo bất thường</span>
              </div>
            </div>
          </div>

          {/* AI Executive Quality Synthesis Card */}
          {report.ai_summary && (
            <div className="quality-ai-summary-card">
              <div className="ai-summary-header">
                <div className="ai-summary-icon-title">
                  <div className="ai-summary-badge">AI</div>
                  <div>
                    <h3 className="ai-summary-title">Nhận Định & Khuyến Nghị Cố Vấn Từ Trợ Lý AI Gia Phả</h3>
                    <span className="ai-summary-sub">
                      Tổng hợp thông minh từ cơ sở dữ liệu phả hệ • Bảo vệ quyền riêng tư AIConsent
                    </span>
                  </div>
                </div>
                <span className="ai-summary-tag">Cố vấn Ban Quản Trị</span>
              </div>
              <div className="ai-summary-body">
                {report.ai_summary.split('\n').map((line, idx) => (
                  line.trim() ? <p key={idx}>{line.trim()}</p> : null
                ))}
              </div>
              <div className="ai-summary-footer">
                <span className="privacy-pill-safe">
                  Quyền riêng tư: Dữ liệu cá nhân chưa cấp quyền AI (AIConsent) đã được khử định danh an toàn trước khi xử lý.
                </span>
              </div>
            </div>
          )}

          {/* Tab Navigation Controls */}
          <div className="quality-tabs-bar">
            <button
              type="button"
              className={`quality-tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
              onClick={() => setActiveTab('overview')}
            >
              Tổng quan kiểm định
            </button>
            <button
              type="button"
              className={`quality-tab-btn ${activeTab === 'duplicates' ? 'active' : ''}`}
              onClick={() => setActiveTab('duplicates')}
            >
              Hồ sơ nghi trùng
              <span className="tab-pill-count">{report.duplicates_count}</span>
            </button>
            <button
              type="button"
              className={`quality-tab-btn ${activeTab === 'missing' ? 'active' : ''}`}
              onClick={() => setActiveTab('missing')}
            >
              Gợi ý kiểm tra quan hệ
              <span className="tab-pill-count">{report.missing_relationships_count}</span>
            </button>
            <button
              type="button"
              className={`quality-tab-btn ${activeTab === 'anomalies' ? 'active' : ''}`}
              onClick={() => setActiveTab('anomalies')}
            >
              Cảnh báo bất thường
              <span className="tab-pill-count">{report.anomalies_count}</span>
            </button>
          </div>

          {/* TAB CONTENT */}
          <div className="quality-tab-container">
            {/* 1. OVERVIEW TAB */}
            {activeTab === 'overview' && (
              <div className="quality-overview-section">
                <div className="overview-instruction-card">
                  <h4>Quy chuẩn nghiệp vụ kiểm định chất lượng dữ liệu:</h4>
                  <ul>
                    <li>
                      <strong>Điểm tương đồng hồ sơ (thang 100):</strong> Tính toán theo tiêu chí đối chiếu tên, thế hệ, năm sinh, phụ mẫu và phối ngẫu. Điểm số là căn cứ sàng lọc quy chuẩn cho ban quản trị đối chiếu gia phả gốc, không phải xác suất thống kê khẳng định trùng.
                    </li>
                    <li>
                      <strong>Gợi ý kiểm tra liên kết phối ngẫu:</strong> Trường hợp hai thành viên cùng đứng tên phụ huynh của con cái nhưng chưa có liên kết, hệ thống chỉ gợi ý kiểm tra liên kết phối ngẫu; tuyệt đối không tự động kết luận hay suy đoán quan hệ hôn nhân.
                    </li>
                    <li>
                      <strong>Phân quyền quản trị:</strong> Trưởng tộc kiểm định toàn bộ dòng họ; Quản trị viên dòng họ (Family Admin) chỉ được kiểm định trong phạm vi chi nhánh được phân công.
                    </li>
                    <li>
                      <strong>Bảo vệ quyền riêng tư AI:</strong> Mọi thông tin gửi đến mô hình AI đều được đối chiếu quyền riêng tư AIConsent cá nhân và cấu hình dòng họ.
                    </li>
                  </ul>
                </div>
              </div>
            )}

            {/* 2. DUPLICATES TAB */}
            {activeTab === 'duplicates' && (
              <div className="quality-duplicates-list">
                <div className="quality-disclaimer-box">
                  <strong>Nguyên tắc đối soát:</strong> Điểm số tính trên thang điểm 100 dựa theo các tiêu chí (họ tên, thế hệ, năm sinh, phụ mẫu, phối ngẫu, chi nhánh). Đây là điểm tương đồng quy chuẩn hỗ trợ người quản trị sàng lọc, không phải xác suất khẳng định chắc chắn trùng.
                </div>

                {report.duplicate_candidates.length === 0 ? (
                  <div className="quality-empty-state">
                    <div className="empty-state-icon check">✓</div>
                    <h4>Tuyệt vời! Không phát hiện hồ sơ nào nghi trùng lặp</h4>
                    <p>Cơ sở dữ liệu hiện không có các bản ghi trùng tên, cùng năm sinh hoặc trùng phụ mẫu vượt ngưỡng cảnh báo.</p>
                  </div>
                ) : (
                  report.duplicate_candidates.map((dup, idx) => (
                    <div key={idx} className="duplicate-item-card">
                      <div className="dup-header">
                        <div className="dup-similarity-badge">
                          <span className={`sim-pill ${dup.similarity_score >= 85 ? 'high' : 'medium'}`}>
                            Điểm tương đồng: {dup.similarity_score}/100
                          </span>
                          <span className="dup-recommendation">{dup.recommendation}</span>
                        </div>
                      </div>

                      <div className="dup-comparison-grid">
                        <div className="dup-person-box">
                          <div className="dup-person-header">
                            <span className="dup-person-tag">Hồ sơ A</span>
                            <strong>{dup.person_1.full_name}</strong>
                          </div>
                          <div className="dup-person-meta">
                            <span>Đời thứ: <strong>{dup.person_1.generation}</strong></span>
                            <span>Giới tính: <strong>{dup.person_1.gender === 'female' ? 'Nữ' : 'Nam'}</strong></span>
                            <span>Năm sinh: <strong>{dup.person_1.birth_year || 'Chưa rõ'}</strong></span>
                            <span>Chi nhánh: <strong>{dup.person_1.branch_name || 'Chưa phân chi'}</strong></span>
                          </div>
                        </div>

                        <div className="dup-vs-divider">VS</div>

                        <div className="dup-person-box">
                          <div className="dup-person-header">
                            <span className="dup-person-tag">Hồ sơ B</span>
                            <strong>{dup.person_2.full_name}</strong>
                          </div>
                          <div className="dup-person-meta">
                            <span>Đời thứ: <strong>{dup.person_2.generation}</strong></span>
                            <span>Giới tính: <strong>{dup.person_2.gender === 'female' ? 'Nữ' : 'Nam'}</strong></span>
                            <span>Năm sinh: <strong>{dup.person_2.birth_year || 'Chưa rõ'}</strong></span>
                            <span>Chi nhánh: <strong>{dup.person_2.branch_name || 'Chưa phân chi'}</strong></span>
                          </div>
                        </div>
                      </div>

                      <div className="dup-reasons-row">
                        <span className="reasons-label">Căn cứ tương đồng:</span>
                        <div className="reasons-chips">
                          {dup.reasons.map((r, rIdx) => (
                            <span key={rIdx} className="reason-chip">{r}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* 3. MISSING RELATIONSHIPS TAB */}
            {activeTab === 'missing' && (
              <div className="quality-missing-list">
                <div className="quality-disclaimer-box warning">
                  <strong>Nguyên tắc nghiệp vụ:</strong> Cùng có con không đồng nghĩa đã kết hôn. Nếu hai thành viên cùng được khai báo là phụ huynh của một người con nhưng chưa có quan hệ hôn phối, hệ thống chỉ gợi ý <em>"Kiểm tra liên kết phối ngẫu"</em> để ban quản trị đối chiếu hồ sơ thực tế, không tự khẳng định quan hệ hôn nhân.
                </div>

                {report.missing_relationships.length === 0 ? (
                  <div className="quality-empty-state">
                    <div className="empty-state-icon check">✓</div>
                    <h4>Các mối quan hệ gia tộc đã được liên kết đầy đủ!</h4>
                    <p>Không phát hiện thiếu sót liên kết phối ngẫu giữa các cặp phụ mẫu hay liên kết con cái.</p>
                  </div>
                ) : (
                  report.missing_relationships.map((m, idx) => {
                    const isSpouseCheck = m.suggested_type === 'CHECK_SPOUSE_LINK' || m.suggested_type === 'SPOUSE';
                    return (
                      <div key={idx} className="missing-item-card">
                        <div className="missing-top">
                          <div className="missing-type-badge">
                            <span className={`type-pill ${isSpouseCheck ? 'spouse-check' : 'parent-child'}`}>
                              {isSpouseCheck ? 'Gợi ý: Kiểm tra liên kết phối ngẫu' : 'Gợi ý: Kiểm tra liên kết Cha/Mẹ - Con'}
                            </span>
                            <span className={`confidence-pill ${m.confidence.toLowerCase()}`}>
                              Mức ưu tiên: {m.confidence === 'HIGH' ? 'Cao' : m.confidence === 'MEDIUM' ? 'Trung bình' : 'Thấp'}
                            </span>
                          </div>
                        </div>

                        <div className="missing-flow">
                          <div className="flow-member">{m.from_person_name}</div>
                          <div className="flow-arrow">
                            <span>{isSpouseCheck ? 'Kiểm tra phối ngẫu' : 'Kiểm tra phụ mẫu'}</span>
                            ➔
                          </div>
                          <div className="flow-member">{m.to_person_name}</div>
                        </div>

                        <p className="missing-reason-text">{m.reason}</p>

                        {m.evidence && m.evidence.length > 0 && (
                          <div className="missing-evidence-row">
                            <span className="evidence-label">Dữ kiện thực tế từ DB:</span>
                            <div className="evidence-tags">
                              {m.evidence.map((ev, eIdx) => (
                                <span key={eIdx} className="evidence-tag">{ev}</span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* 4. ANOMALIES TAB */}
            {activeTab === 'anomalies' && (
              <div className="quality-anomalies-section">
                {/* Severity Filters */}
                <div className="anomaly-filter-row">
                  <span className="filter-label">Lọc mức độ:</span>
                  <div className="filter-buttons">
                    <button
                      type="button"
                      className={`filter-btn ${anomalyFilter === 'ALL' ? 'active' : ''}`}
                      onClick={() => setAnomalyFilter('ALL')}
                    >
                      Tất cả ({report.anomalies.length})
                    </button>
                    <button
                      type="button"
                      className={`filter-btn critical ${anomalyFilter === 'CRITICAL' ? 'active' : ''}`}
                      onClick={() => setAnomalyFilter('CRITICAL')}
                    >
                      Nghiêm trọng ({report.anomalies.filter((a) => a.severity === 'CRITICAL').length})
                    </button>
                    <button
                      type="button"
                      className={`filter-btn warning ${anomalyFilter === 'WARNING' ? 'active' : ''}`}
                      onClick={() => setAnomalyFilter('WARNING')}
                    >
                      Cảnh báo ({report.anomalies.filter((a) => a.severity === 'WARNING').length})
                    </button>
                    <button
                      type="button"
                      className={`filter-btn info ${anomalyFilter === 'INFO' ? 'active' : ''}`}
                      onClick={() => setAnomalyFilter('INFO')}
                    >
                      Thông tin ({report.anomalies.filter((a) => a.severity === 'INFO').length})
                    </button>
                  </div>
                </div>

                <div className="anomalies-list">
                  {filteredAnomalies.length === 0 ? (
                    <div className="quality-empty-state">
                      <div className="empty-state-icon check">✓</div>
                      <h4>Không có cảnh báo bất thường nào ở nhóm này!</h4>
                      <p>Không có mâu thuẫn thời gian, vòng lặp hay số đời sai lệch.</p>
                    </div>
                  ) : (
                    filteredAnomalies.map((anom, idx) => (
                      <div key={idx} className={`anomaly-card ${anom.severity.toLowerCase()}`}>
                        <div className="anomaly-header">
                          <span className={`severity-tag ${anom.severity.toLowerCase()}`}>
                            {anom.severity === 'CRITICAL' ? 'Nghiêm trọng' : anom.severity === 'WARNING' ? 'Cảnh báo' : 'Thông tin'}
                          </span>
                          <h4 className="anomaly-title">{anom.title}</h4>
                        </div>

                        <p className="anomaly-desc">{anom.description}</p>

                        {anom.affected_persons && anom.affected_persons.length > 0 && (
                          <div className="anomaly-persons-row">
                            <span className="anom-label">Thành viên liên quan:</span>
                            <div className="anom-persons-list">
                              {anom.affected_persons.map((p, pIdx) => (
                                <span key={pIdx} className="anom-person-chip">
                                  {p.full_name} {p.role ? `(${p.role})` : ''}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="anomaly-fix-box">
                          <span className="fix-icon">Khuyến nghị khắc phục:</span>
                          <span className="fix-text">{anom.recommended_fix}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
};

export default ClanDataQualityModule;
