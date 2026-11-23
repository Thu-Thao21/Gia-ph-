// GenealogyChartModal.tsx - Cửa sổ Modal Tùy chỉnh Phả đồ & Áp dụng Trực tiếp trên Cây Gia Phả

import React, { useState, useRef } from 'react';
import type { ErgoTreeNode } from '../../../types/tree';
import type { Member } from '../../../types/member';
import {
  type GenealogyChartConfig,
  type ChartThemeId,
  type PaperSize,
  THEME_PRESETS,
  DEFAULT_GENEALOGY_CHART_CONFIG,
} from './chartConfigTypes';
import {
  exportChartToSVG,
  exportChartToPNG,
  exportChartToJSON,
  triggerPrintWindow,
} from './chartExportUtils';
import './GenealogyChartModal.css';

export interface GenealogyChartModalProps {
  nodes: ErgoTreeNode[];
  allMembers?: Member[];
  clanId?: string;
  clanName?: string;
  clanCode?: string;
  canManageTree?: boolean;
  isClanAdmin?: boolean;
  currentConfig: GenealogyChartConfig;
  onApplyToTree: (newConfig: GenealogyChartConfig) => void;
  onClose: () => void;
}

export const GenealogyChartModal: React.FC<GenealogyChartModalProps> = ({
  nodes,
  allMembers = [],
  clanId,
  clanName = 'Mai Thế Tộc',
  clanCode,
  canManageTree = false,
  isClanAdmin = false,
  currentConfig,
  onApplyToTree,
  onClose,
}) => {
  const clanStorageKey = clanId ? `mfgms_clan_chart_config_${clanId}` : 'mfgms_clan_chart_config_default';
  const userStorageKey = clanId ? `mfgms_user_chart_config_${clanId}` : 'mfgms_user_chart_config_default';

  // State cấu hình đang chỉnh sửa trong Modal
  const [draftConfig, setDraftConfig] = useState<GenealogyChartConfig>({
    ...currentConfig,
    chartTitle: currentConfig.chartTitle || `PHẢ ĐỒ ${clanName.toUpperCase()}`,
  });

  // Tùy chọn: Tự động cập nhật trực tiếp trên cây mỗi khi chỉnh
  const [liveSyncOnTree, setLiveSyncOnTree] = useState<boolean>(true);

  // Tab đang kích hoạt: 'style' | 'layout' | 'export'
  const [activeTab, setActiveTab] = useState<'style' | 'layout' | 'export'>('style');

  // Trạng thái xuất file
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Cập nhật cấu hình và đồng bộ ngay lên cây nếu bật liveSync
  const updateDraft = (updater: (prev: GenealogyChartConfig) => GenealogyChartConfig) => {
    setDraftConfig((prev) => {
      const next = updater(prev);
      if (liveSyncOnTree) {
        onApplyToTree(next);
      }
      return next;
    });
  };

  // 1. Áp dụng Mẫu giao diện (Preset)
  const handleApplyPreset = (themeId: ChartThemeId) => {
    const preset = THEME_PRESETS.find((p) => p.id === themeId);
    if (!preset) return;
    updateDraft((prev) => ({
      ...prev,
      ...preset.config,
      themeId,
    }));
    showToast(`Đã chọn mẫu phong cách: ${preset.name}`);
  };

  // 2. Bấm nút "Áp dụng trên cây ngay"
  const handleApplyNow = () => {
    try {
      localStorage.setItem(userStorageKey, JSON.stringify(draftConfig));
      onApplyToTree(draftConfig);
      showToast('Đã áp dụng thành công diện mạo mới lên cây gia phả!');
    } catch {
      showToast('Không thể lưu cấu hình vào bộ nhớ trình duyệt');
    }
  };

  // 3. Trưởng tộc lưu làm mặc định dòng họ
  const handleSaveClanDefault = () => {
    try {
      localStorage.setItem(clanStorageKey, JSON.stringify(draftConfig));
      onApplyToTree(draftConfig);
      showToast(`Đã lưu làm cấu hình mặc định cho toàn bộ dòng họ ${clanName}!`);
    } catch {
      showToast('Không thể lưu cấu hình dòng họ');
    }
  };

  // 4. Khôi phục mặc định
  const handleResetDefaults = () => {
    try {
      const savedClan = localStorage.getItem(clanStorageKey);
      if (savedClan) {
        const parsed = JSON.parse(savedClan);
        setDraftConfig(parsed);
        onApplyToTree(parsed);
        showToast('Đã khôi phục về cấu hình mặc định của dòng họ');
        return;
      }
    } catch {
      // Ignore
    }
    const def = {
      ...DEFAULT_GENEALOGY_CHART_CONFIG,
      chartTitle: `PHẢ ĐỒ ${clanName.toUpperCase()}`,
    };
    setDraftConfig(def);
    onApplyToTree(def);
    showToast('Đã khôi phục về mẫu truyền thống Việt Nam mặc định');
  };

  // 5. Xuất in chuẩn / PDF
  const handlePrint = () => {
    triggerPrintWindow(draftConfig.paperSize, draftConfig.paperOrientation);
  };

  // 6. Xuất SVG
  const handleExportSVG = () => {
    const svgEl = document.querySelector('.tree-svg-connector-canvas') as SVGElement;
    if (!svgEl) {
      showToast('Chưa tìm thấy phần tử cây để xuất SVG');
      return;
    }
    const cleanFileName = `PhaDo_${clanName.replace(/\s+/g, '_')}`;
    exportChartToSVG(svgEl, cleanFileName);
    showToast('Đã xuất file SVG Vector thành công!');
  };

  // 7. Xuất PNG (2x hoặc 4x)
  const handleExportPNG = async (scale: number = 2) => {
    const svgEl = document.querySelector('.tree-svg-connector-canvas') as SVGElement;
    if (!svgEl) {
      showToast('Chưa tìm thấy phần tử cây để xuất PNG');
      return;
    }
    setIsExporting(true);
    showToast(`Đang kết xuất ảnh PNG độ nét cao ${scale}x... Vui lòng đợi`);
    try {
      const cleanFileName = `PhaDo_${clanName.replace(/\s+/g, '_')}`;
      await exportChartToPNG(svgEl, cleanFileName, scale);
      showToast(`Đã tải xuống ảnh PNG ${scale}x sắc nét!`);
    } catch (err) {
      console.error(err);
      showToast('Có lỗi xảy ra khi tạo ảnh PNG');
    } finally {
      setIsExporting(false);
    }
  };

  // 8. Xuất JSON
  const handleExportJSON = () => {
    const cleanFileName = `GiaPha_${clanName.replace(/\s+/g, '_')}_Data`;
    exportChartToJSON(nodes, draftConfig, { id: clanId, name: clanName, clanCode }, cleanFileName);
    showToast('Đã xuất file JSON dữ liệu gia phả!');
  };

  // Danh sách chi nhánh
  const branchList = Array.from(
    new Set(allMembers.map((m) => m.branch).filter((b): b is string => Boolean(b && b.trim() !== '')))
  );

  return (
    <div className="genealogy-chart-modal-backdrop" onClick={onClose}>
      <div className="genealogy-chart-modal-card" onClick={(e) => e.stopPropagation()}>
        {/* HEADER */}
        <div className="chart-modal-header">
          <div className="chart-modal-header-left">
            <div>
              <h2 className="chart-modal-title">
                Tùy chỉnh Phả đồ & Xuất bản in — <span className="clan-title-highlight">{clanName}</span>
              </h2>
              <p className="chart-modal-subtitle">
                Tùy chọn phong cách, màu sắc, hoa văn Trống đồng và áp dụng trực tiếp lên cây gia phả ngay lập tức.
              </p>
            </div>
          </div>
          <button type="button" className="chart-modal-close-btn" onClick={onClose} title="Đóng cửa sổ">
            ✕
          </button>
        </div>

        {/* TAB NAVIGATION */}
        <div className="chart-modal-tabs">
          <button
            type="button"
            className={`chart-modal-tab-btn ${activeTab === 'style' ? 'active' : ''}`}
            onClick={() => setActiveTab('style')}
          >
            <span>Màu sắc & Khung nền</span>
          </button>
          <button
            type="button"
            className={`chart-modal-tab-btn ${activeTab === 'layout' ? 'active' : ''}`}
            onClick={() => setActiveTab('layout')}
          >
            <span>Bố cục & Nhánh</span>
          </button>
          <button
            type="button"
            className={`chart-modal-tab-btn ${activeTab === 'export' ? 'active' : ''}`}
            onClick={() => setActiveTab('export')}
          >
            <span>Xuất bản in & Dữ liệu</span>
          </button>
        </div>

        {/* BODY PANEL */}
        <div className="chart-modal-body">
          {/* TAB 1: MÀU SẮC & PHONG CÁCH TRUYỀN THỐNG */}
          {activeTab === 'style' && (
            <div className="chart-tab-content">
              {/* Preset Cards */}
              <div className="chart-section-box">
                <h4 className="chart-section-title">1. Chọn mẫu phong cách giao diện</h4>
                <div className="chart-preset-grid">
                  {THEME_PRESETS.map((preset) => (
                    <div
                      key={preset.id}
                      className={`chart-preset-item ${draftConfig.themeId === preset.id ? 'active' : ''}`}
                      onClick={() => handleApplyPreset(preset.id)}
                    >
                      <div className="preset-item-header">
                        <strong className="preset-item-name">{preset.name}</strong>
                        <span className="preset-item-tag">{preset.badge}</span>
                      </div>
                      <p className="preset-item-desc">{preset.description}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Chế độ màu sắc Person Card */}
              <div className="chart-section-box">
                <h4 className="chart-section-title">2. Chế độ tô màu Thẻ thành viên</h4>
                <div className="chart-choice-row">
                  <button
                    type="button"
                    className={`choice-pill ${draftConfig.cardColorMode === 'generation' ? 'active' : ''}`}
                    onClick={() => updateDraft((c) => ({ ...c, cardColorMode: 'generation' }))}
                  >
                    Phân theo thế hệ (14 đời 14 màu riêng biệt)
                  </button>
                  <button
                    type="button"
                    className={`choice-pill ${draftConfig.cardColorMode === 'status' ? 'active' : ''}`}
                    onClick={() => updateDraft((c) => ({ ...c, cardColorMode: 'status' }))}
                  >
                    Phân theo còn sống / đã mất
                  </button>
                  <button
                    type="button"
                    className={`choice-pill ${draftConfig.cardColorMode === 'gender' ? 'active' : ''}`}
                    onClick={() => updateDraft((c) => ({ ...c, cardColorMode: 'gender' }))}
                  >
                    Phân theo Nam / Nữ
                  </button>
                </div>
              </div>

              {/* Đường nối huyết thống */}
              <div className="chart-section-box">
                <h4 className="chart-section-title">3. Đường nối huyết thống (Connectors)</h4>
                <div className="color-swatches-row">
                  <span className="field-label">Màu nét nối:</span>
                  {[
                    { label: 'Vàng đồng', color: '#b45309' },
                    { label: 'Đỏ son', color: '#991b1b' },
                    { label: 'Xanh navy', color: '#2563eb' },
                    { label: 'Xám than', color: '#475569' },
                  ].map((c) => (
                    <button
                      key={c.color}
                      type="button"
                      className={`swatch-circle ${draftConfig.lineColor === c.color ? 'active' : ''}`}
                      style={{ background: c.color }}
                      onClick={() => updateDraft((prev) => ({ ...prev, lineColor: c.color }))}
                      title={c.label}
                    />
                  ))}
                  <div className="inline-btn-group" style={{ marginLeft: 'auto' }}>
                    <button
                      type="button"
                      className={`inline-choice ${draftConfig.lineStyle === 'solid' ? 'active' : ''}`}
                      onClick={() => updateDraft((c) => ({ ...c, lineStyle: 'solid' }))}
                    >
                      Nét liền
                    </button>
                    <button
                      type="button"
                      className={`inline-choice ${draftConfig.lineStyle === 'dashed' ? 'active' : ''}`}
                      onClick={() => updateDraft((c) => ({ ...c, lineStyle: 'dashed' }))}
                    >
                      Nét đứt
                    </button>
                  </div>
                </div>
              </div>

              {/* Hoa văn Trống đồng, Khung viền & Câu đối */}
              <div className="chart-section-box">
                <h4 className="chart-section-title">4. Khung viền & Trang trí truyền thống Việt Nam</h4>
                <div className="checkboxes-grid">
                  <label className="chart-checkbox">
                    <input
                      type="checkbox"
                      checked={draftConfig.showWatermark}
                      onChange={(e) =>
                        updateDraft((c) => ({
                          ...c,
                          showWatermark: e.target.checked,
                          backgroundPattern: e.target.checked ? 'dong-son' : 'none',
                        }))
                      }
                    />
                    <span>Họa tiết hoa văn Trống đồng Đông Sơn mờ</span>
                  </label>

                  <label className="chart-checkbox">
                    <input
                      type="checkbox"
                      checked={draftConfig.showBorder}
                      onChange={(e) => updateDraft((c) => ({ ...c, showBorder: e.target.checked }))}
                    />
                    <span>Khung viền nghệ thuật quanh phả đồ</span>
                  </label>

                  <label className="chart-checkbox">
                    <input
                      type="checkbox"
                      checked={draftConfig.showSeal}
                      onChange={(e) => updateDraft((c) => ({ ...c, showSeal: e.target.checked }))}
                    />
                    <span>Triện son ngọc phả ("Gia Phả Bảo Ấn")</span>
                  </label>

                  <label className="chart-checkbox">
                    <input
                      type="checkbox"
                      checked={draftConfig.showCouplets}
                      onChange={(e) => updateDraft((c) => ({ ...c, showCouplets: e.target.checked }))}
                    />
                    <span>Bật hai câu đối vàng son hai bên</span>
                  </label>
                </div>

                {draftConfig.showCouplets && (
                  <div className="couplets-edit-box">
                    <div className="couplet-field">
                      <label>Vế trái:</label>
                      <input
                        type="text"
                        className="modal-text-input"
                        value={draftConfig.coupletLeft}
                        onChange={(e) => updateDraft((c) => ({ ...c, coupletLeft: e.target.value }))}
                      />
                    </div>
                    <div className="couplet-field">
                      <label>Vế phải:</label>
                      <input
                        type="text"
                        className="modal-text-input"
                        value={draftConfig.coupletRight}
                        onChange={(e) => updateDraft((c) => ({ ...c, coupletRight: e.target.value }))}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: BỐ CỤC & NHÁNH */}
          {activeTab === 'layout' && (
            <div className="chart-tab-content">
              {/* Hướng cây */}
              <div className="chart-section-box">
                <h4 className="chart-section-title">1. Hướng hiển thị cây</h4>
                <div className="chart-choice-row">
                  <button
                    type="button"
                    className={`choice-pill ${draftConfig.direction === 'vertical' ? 'active' : ''}`}
                    onClick={() => updateDraft((c) => ({ ...c, direction: 'vertical' }))}
                  >
                    Từ trên xuống dưới (Dọc truyền thống)
                  </button>
                  <button
                    type="button"
                    className={`choice-pill ${draftConfig.direction === 'horizontal' ? 'active' : ''}`}
                    onClick={() => updateDraft((c) => ({ ...c, direction: 'horizontal' }))}
                  >
                    Từ trái sang phải (Ngang)
                  </button>
                </div>
              </div>

              {/* Khoảng cách thẻ */}
              <div className="chart-section-box">
                <h4 className="chart-section-title">2. Khoảng cách giữa các thẻ</h4>
                <div className="range-slider-group">
                  <div className="slider-label">
                    <span>Khoảng cách anh chị em (ngang):</span>
                    <strong>{draftConfig.siblingSpacing}px</strong>
                  </div>
                  <input
                    type="range"
                    min="24"
                    max="100"
                    step="4"
                    value={draftConfig.siblingSpacing}
                    onChange={(e) => updateDraft((c) => ({ ...c, siblingSpacing: Number(e.target.value) }))}
                  />
                </div>

                <div className="range-slider-group" style={{ marginTop: '12px' }}>
                  <div className="slider-label">
                    <span>Khoảng cách giữa các thế hệ (dọc):</span>
                    <strong>{draftConfig.generationSpacing}px</strong>
                  </div>
                  <input
                    type="range"
                    min="48"
                    max="160"
                    step="8"
                    value={draftConfig.generationSpacing}
                    onChange={(e) => updateDraft((c) => ({ ...c, generationSpacing: Number(e.target.value) }))}
                  />
                </div>

                <label className="chart-checkbox" style={{ marginTop: '12px' }}>
                  <input
                    type="checkbox"
                    checked={draftConfig.zigzagCompact}
                    onChange={(e) => updateDraft((c) => ({ ...c, zigzagCompact: e.target.checked }))}
                  />
                  <span>Bố trí so le / ziczac khi nhánh đông thành viên (chống tràn ngang)</span>
                </label>
              </div>

              {/* Đánh số đời & Giới hạn thế hệ */}
              <div className="chart-section-box">
                <h4 className="chart-section-title">3. Đánh số đời & Giới hạn hiển thị</h4>
                <div className="form-inline-row">
                  <div className="form-col">
                    <label className="field-label">Định dạng số đời:</label>
                    <select
                      className="modal-select-input"
                      value={draftConfig.genNumberFormat}
                      onChange={(e) => updateDraft((c) => ({ ...c, genNumberFormat: e.target.value as any }))}
                    >
                      <option value="number">Đời 1, Đời 2, Đời 3…</option>
                      <option value="roman">Thế hệ I, II, III…</option>
                      <option value="none">Tắt đánh số thế hệ</option>
                    </select>
                  </div>

                  <div className="form-col">
                    <label className="field-label">Giới hạn số đời hiển thị:</label>
                    <select
                      className="modal-select-input"
                      value={draftConfig.maxGenerations}
                      onChange={(e) => updateDraft((c) => ({ ...c, maxGenerations: Number(e.target.value) }))}
                    >
                      <option value={0}>Toàn bộ các thế hệ (14 đời)</option>
                      <option value={3}>3 đời (Tam đại)</option>
                      <option value={5}>5 đời (Ngũ đại đồng đường)</option>
                      <option value={7}>7 đời (Thất đại)</option>
                      <option value={9}>9 đời (Cửu tộc)</option>
                    </select>
                  </div>
                </div>

                {branchList.length > 0 && (
                  <div style={{ marginTop: '12px' }}>
                    <label className="field-label">Lọc theo chi nhánh cụ thể:</label>
                    <select
                      className="modal-select-input"
                      value={draftConfig.selectedBranch || ''}
                      onChange={(e) => updateDraft((c) => ({ ...c, selectedBranch: e.target.value || undefined }))}
                    >
                      <option value="">Xem toàn bộ các chi phái</option>
                      {branchList.map((b) => (
                        <option key={b} value={b}>
                          Chi phái: {b}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Tùy chọn ẩn hiện thông tin */}
              <div className="chart-section-box">
                <h4 className="chart-section-title">4. Thông tin hiển thị trên thẻ</h4>
                <div className="checkboxes-grid">
                  <label className="chart-checkbox">
                    <input
                      type="checkbox"
                      checked={draftConfig.showSpouses}
                      onChange={(e) => updateDraft((c) => ({ ...c, showSpouses: e.target.checked }))}
                    />
                    <span>Hiển thị người phối ngẫu (Dâu / Rể)</span>
                  </label>

                  <label className="chart-checkbox">
                    <input
                      type="checkbox"
                      checked={draftConfig.showBirthDeath}
                      onChange={(e) => updateDraft((c) => ({ ...c, showBirthDeath: e.target.checked }))}
                    />
                    <span>Hiển thị năm sinh - năm mất</span>
                  </label>

                  <label className="chart-checkbox">
                    <input
                      type="checkbox"
                      checked={draftConfig.showOccupation}
                      onChange={(e) => updateDraft((c) => ({ ...c, showOccupation: e.target.checked }))}
                    />
                    <span>Hiển thị chức vị / nghề nghiệp</span>
                  </label>

                  <label className="chart-checkbox">
                    <input
                      type="checkbox"
                      checked={draftConfig.showAvatars}
                      onChange={(e) => updateDraft((c) => ({ ...c, showAvatars: e.target.checked }))}
                    />
                    <span>Hiển thị biểu tượng chân dung đại diện</span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: XUẤT BẢN IN & DỮ LIỆU */}
          {activeTab === 'export' && (
            <div className="chart-tab-content">
              {/* Chọn khổ giấy */}
              <div className="chart-section-box">
                <h4 className="chart-section-title">1. Chọn khổ giấy in ấn</h4>
                <div className="chart-choice-row">
                  {(['A4', 'A3', 'A2', 'A1', 'banner'] as PaperSize[]).map((size) => (
                    <button
                      key={size}
                      type="button"
                      className={`choice-pill ${draftConfig.paperSize === size ? 'active' : ''}`}
                      onClick={() => updateDraft((c) => ({ ...c, paperSize: size }))}
                    >
                      {size === 'banner' ? 'Khổ lớn Cuộn (Từ đường)' : `Khổ ${size}`}
                    </button>
                  ))}
                </div>

                <div className="chart-choice-row" style={{ marginTop: '10px' }}>
                  <button
                    type="button"
                    className={`choice-pill ${draftConfig.paperOrientation === 'landscape' ? 'active' : ''}`}
                    onClick={() => updateDraft((c) => ({ ...c, paperOrientation: 'landscape' }))}
                  >
                    Hướng Ngang (Landscape)
                  </button>
                  <button
                    type="button"
                    className={`choice-pill ${draftConfig.paperOrientation === 'portrait' ? 'active' : ''}`}
                    onClick={() => updateDraft((c) => ({ ...c, paperOrientation: 'portrait' }))}
                  >
                    Hướng Dọc (Portrait)
                  </button>
                </div>
              </div>

              {/* Các nút xuất file */}
              <div className="chart-section-box">
                <h4 className="chart-section-title">2. Xuất file chất lượng cao</h4>
                <div className="modal-export-buttons-grid">
                  <button type="button" className="modal-export-btn btn-pdf" onClick={handlePrint}>
                    <div className="export-text">
                      <strong>In ấn / Xuất PDF chuẩn Vector</strong>
                      <span>Khổ {draftConfig.paperSize} ({draftConfig.paperOrientation === 'landscape' ? 'Ngang' : 'Dọc'})</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    className="modal-export-btn btn-png"
                    onClick={() => handleExportPNG(2)}
                    disabled={isExporting}
                  >
                    <div className="export-text">
                      <strong>Xuất ảnh PNG Siêu nét (2x - 300 DPI)</strong>
                      <span>Độ nét cao chuẩn in ảnh kỷ yếu dòng họ</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    className="modal-export-btn btn-png-ultra"
                    onClick={() => handleExportPNG(4)}
                    disabled={isExporting}
                  >
                    <div className="export-text">
                      <strong>Xuất ảnh PNG Ultra HD (4x - 600 DPI)</strong>
                      <span>Độ nét tối đa cho bản in bạt lụa nhà thờ họ</span>
                    </div>
                  </button>

                  <button type="button" className="modal-export-btn btn-svg" onClick={handleExportSVG}>
                    <div className="export-text">
                      <strong>Xuất SVG Vector vô hạn</strong>
                      <span>Phóng to vô hạn không vỡ nét (AI / Corel)</span>
                    </div>
                  </button>

                  <button type="button" className="modal-export-btn btn-json" onClick={handleExportJSON}>
                    <div className="export-text">
                      <strong>Xuất JSON Dữ liệu gia phả</strong>
                      <span>Lưu trữ cấu trúc nút và quan hệ huyết thống</span>
                    </div>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* FOOTER ACTIONS */}
        <div className="chart-modal-footer">
          <div className="modal-footer-left">
            <label className="live-sync-checkbox">
              <input
                type="checkbox"
                checked={liveSyncOnTree}
                onChange={(e) => setLiveSyncOnTree(e.target.checked)}
              />
              <span>Xem trước trực tiếp trên cây gia phả</span>
            </label>
          </div>

          <div className="modal-footer-right">
            {/* Nút Khôi phục mặc định */}
            <button
              type="button"
              className="modal-action-btn btn-reset"
              onClick={handleResetDefaults}
              title="Đưa các tùy chọn về mẫu chuẩn mặc định"
            >
              Khôi phục mặc định
            </button>

            {/* Trưởng tộc lưu mặc định dòng họ */}
            {(isClanAdmin || canManageTree) && (
              <button
                type="button"
                className="modal-action-btn btn-clan-default"
                onClick={handleSaveClanDefault}
                title="Lưu cấu hình này làm mẫu mặc định cho toàn bộ dòng họ xem chung"
              >
                Lưu mặc định Dòng họ
              </button>
            )}

            {/* Nút Áp dụng trên cây ngay */}
            <button
              type="button"
              className="modal-action-btn btn-apply-primary"
              onClick={handleApplyNow}
              title="Lưu cấu hình và áp dụng ngay lập tức lên cây gia phả"
            >
              Áp dụng trên cây ngay
            </button>

            {/* Nút Đóng */}
            <button type="button" className="modal-action-btn btn-close" onClick={onClose}>
              Đóng
            </button>
          </div>
        </div>

        {/* Toast thông báo nổi */}
        {toastMessage && <div className="modal-floating-toast">{toastMessage}</div>}
      </div>
    </div>
  );
};

export default GenealogyChartModal;
