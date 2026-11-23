// GenealogyChartStudio.tsx - Giao diện Thiết kế Phả đồ & Xuất bản in Đa Dòng họ (MFGMS-AI)

import React, { useState, useEffect, useRef } from 'react';
import type { ErgoTreeNode } from '../../../types/tree';
import type { Member } from '../../../types/member';
import {
  type GenealogyChartConfig,
  type ChartThemeId,
  type PaperSize,
  type PaperOrientation,
  THEME_PRESETS,
  DEFAULT_GENEALOGY_CHART_CONFIG,
} from './chartConfigTypes';
import { GenealogyChartCanvas } from './GenealogyChartCanvas';
import {
  exportChartToSVG,
  exportChartToPNG,
  exportChartToJSON,
  triggerPrintWindow,
} from './chartExportUtils';
import './GenealogyChartStudio.css';

export interface GenealogyChartStudioProps {
  nodes: ErgoTreeNode[];
  allMembers?: Member[];
  clanId?: string;
  clanName?: string;
  clanCode?: string;
  canManageTree?: boolean;
  isClanAdmin?: boolean;
  onClose: () => void;
  onApplySuccess?: (config: GenealogyChartConfig) => void;
}

export const GenealogyChartStudio: React.FC<GenealogyChartStudioProps> = ({
  nodes,
  allMembers = [],
  clanId,
  clanName = 'Mai Thế Tộc',
  clanCode,
  canManageTree = false,
  isClanAdmin = false,
  onClose,
  onApplySuccess,
}) => {
  // Key lưu trữ localStorage theo phân quyền
  const clanStorageKey = clanId ? `mfgms_clan_chart_config_${clanId}` : 'mfgms_clan_chart_config_default';
  const userStorageKey = clanId ? `mfgms_user_chart_config_${clanId}` : 'mfgms_user_chart_config_default';

  // 1. Khởi tạo cấu hình phả đồ từ Clan Default hoặc User Default
  const [config, setConfig] = useState<GenealogyChartConfig>(() => {
    try {
      const savedUser = localStorage.getItem(userStorageKey);
      if (savedUser) return JSON.parse(savedUser);
      const savedClan = localStorage.getItem(clanStorageKey);
      if (savedClan) return JSON.parse(savedClan);
    } catch {
      // Fallback
    }
    return {
      ...DEFAULT_GENEALOGY_CHART_CONFIG,
      chartTitle: `PHẢ ĐỒ ${clanName.toUpperCase()}`,
    };
  });

  // Lưu bản sao ban đầu để khôi phục khi nhấn Hủy
  const initialConfigRef = useRef<GenealogyChartConfig>(config);

  // Tab đang kích hoạt ở bảng điều khiển bên trái: 'layout' | 'style' | 'export'
  const [activeTab, setActiveTab] = useState<'layout' | 'style' | 'export'>('style');

  // Zoom scale cho canvas xem trước
  const [zoomScale, setZoomScale] = useState<number>(0.65);

  // Thông báo toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState<boolean>(false);

  // SVG Ref để xuất file
  const svgRef = useRef<SVGSVGElement>(null);

  // Hiển thị toast tự tắt sau 3 giây
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Danh sách chi nhánh duy nhất để đưa vào bộ lọc
  const branchList = Array.from(
    new Set(allMembers.map((m) => m.branch).filter((b): b is string => Boolean(b && b.trim() !== '')))
  );

  // 1. Áp dụng Mẫu giao diện (Preset)
  const applyPreset = (themeId: ChartThemeId) => {
    const preset = THEME_PRESETS.find((p) => p.id === themeId);
    if (!preset) return;
    setConfig((prev) => ({
      ...prev,
      ...preset.config,
      themeId,
    }));
    showToast(`Đã áp dụng mẫu giao diện: ${preset.name}`);
  };

  // 2. Lưu cấu hình cá nhân (Áp dụng hiển thị)
  const handleApply = () => {
    try {
      localStorage.setItem(userStorageKey, JSON.stringify(config));
      initialConfigRef.current = config;
      showToast('Đã lưu và áp dụng cấu hình phả đồ thành công!');
      if (onApplySuccess) onApplySuccess(config);
    } catch {
      showToast('Không thể lưu vào bộ nhớ trình duyệt');
    }
  };

  // 3. Trưởng tộc lưu cấu hình làm mặc định cho toàn dòng họ
  const handleSaveClanDefault = () => {
    try {
      localStorage.setItem(clanStorageKey, JSON.stringify(config));
      showToast(`Đã lưu cấu hình làm mặc định chung cho toàn bộ dòng họ ${clanName}!`);
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
        setConfig(parsed);
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
    setConfig(def);
    showToast('Đã khôi phục về mẫu truyền thống Việt Nam mặc định');
  };

  // 5. Hủy và hoàn nguyên cấu hình
  const handleCancel = () => {
    setConfig(initialConfigRef.current);
    onClose();
  };

  // 6. Xuất SVG
  const handleExportSVG = () => {
    if (!svgRef.current) {
      showToast('Chưa sẵn sàng canvas SVG để xuất file');
      return;
    }
    const cleanFileName = `PhaDo_${clanName.replace(/\s+/g, '_')}`;
    exportChartToSVG(svgRef.current, cleanFileName);
    showToast('Đã xuất file SVG Vector thành công!');
  };

  // 7. Xuất PNG độ nét cao (2x hoặc 4x)
  const handleExportPNG = async (scale: number = 2) => {
    if (!svgRef.current) {
      showToast('Chưa sẵn sàng canvas SVG để xuất file');
      return;
    }
    setIsExporting(true);
    showToast(`Đang vẽ ảnh PNG độ phân giải cao ${scale}x... Vui lòng đợi`);
    try {
      const cleanFileName = `PhaDo_${clanName.replace(/\s+/g, '_')}`;
      await exportChartToPNG(svgRef.current, cleanFileName, scale);
      showToast(`Đã tải xuống ảnh PNG ${scale}x sắc nét thành công!`);
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
    exportChartToJSON(nodes, config, { id: clanId, name: clanName, clanCode }, cleanFileName);
    showToast('Đã xuất file JSON dữ liệu gia phả thành công!');
  };

  // 9. In ấn chuẩn / Xuất PDF
  const handlePrint = () => {
    triggerPrintWindow(config.paperSize, config.paperOrientation);
  };

  return (
    <div className="genealogy-chart-studio-root">
      {/* 1. TOP BAR HEADER */}
      <header className="genealogy-chart-studio-topbar">
        <div className="studio-topbar-left">
          <div className="studio-badge-pill">MFGMS-AI STUDIO</div>
          <h1 className="studio-topbar-title">
            📜 Tùy chỉnh Phả đồ & Xuất bản in — <span className="clan-highlight">{clanName}</span>
          </h1>
        </div>

        <div className="studio-topbar-actions">
          {/* Nút In nhanh / Xuất PDF */}
          <button
            type="button"
            className="studio-btn studio-btn-print"
            onClick={handlePrint}
            title="Mở cửa sổ in ấn chuẩn hoặc Lưu dưới dạng PDF Vector chất lượng cao"
          >
            🖨️ In ấn / Xuất PDF
          </button>

          {/* Nút Áp dụng hiển thị */}
          <button
            type="button"
            className="studio-btn studio-btn-primary"
            onClick={handleApply}
            title="Lưu các thay đổi và áp dụng vào chế độ xem cá nhân của bạn"
          >
            ✓ Áp dụng hiển thị
          </button>

          {/* Nút Trưởng tộc Lưu làm mặc định Dòng họ */}
          {(isClanAdmin || canManageTree) && (
            <button
              type="button"
              className="studio-btn studio-btn-clan-save"
              onClick={handleSaveClanDefault}
              title="Lưu mẫu bố cục & phong cách này làm mặc định cho tất cả thành viên dòng họ xem"
            >
              💾 Lưu mặc định Dòng họ
            </button>
          )}

          {/* Nút Khôi phục mặc định */}
          <button
            type="button"
            className="studio-btn studio-btn-secondary"
            onClick={handleResetDefaults}
            title="Đưa các tùy chọn về mẫu chuẩn ban đầu"
          >
            🔄 Khôi phục mặc định
          </button>

          {/* Nút Đóng & Hoàn nguyên */}
          <button
            type="button"
            className="studio-btn studio-btn-close"
            onClick={handleCancel}
            title="Đóng bảng thiết kế và hoàn nguyên các thay đổi chưa lưu"
          >
            ✕ Thoát
          </button>
        </div>
      </header>

      {/* 2. BODY SPLIT: DRAWER BÊN TRÁI & LIVE CANVAS TRUNG TÂM */}
      <div className="genealogy-chart-studio-body">
        {/* DRAWER BẢNG ĐIỀU KHIỂN (CONTROL PANEL) */}
        <aside className="genealogy-chart-studio-drawer">
          {/* TAB NAVIGATION */}
          <nav className="studio-tab-nav">
            <button
              type="button"
              className={`studio-tab-btn ${activeTab === 'layout' ? 'active' : ''}`}
              onClick={() => setActiveTab('layout')}
            >
              <span className="tab-icon">📐</span>
              <span className="tab-label">Bố cục & Nhánh</span>
            </button>
            <button
              type="button"
              className={`studio-tab-btn ${activeTab === 'style' ? 'active' : ''}`}
              onClick={() => setActiveTab('style')}
            >
              <span className="tab-icon">🎨</span>
              <span className="tab-label">Màu sắc & Khung nền</span>
            </button>
            <button
              type="button"
              className={`studio-tab-btn ${activeTab === 'export' ? 'active' : ''}`}
              onClick={() => setActiveTab('export')}
            >
              <span className="tab-icon">🖨️</span>
              <span className="tab-label">Xuất in & Dữ liệu</span>
            </button>
          </nav>

          {/* TAB CONTENT 1: BỐ CỤC & NHÁNH */}
          {activeTab === 'layout' && (
            <div className="studio-tab-panel">
              <section className="studio-control-group">
                <h3 className="control-group-title">Hướng cây phả đồ</h3>
                <div className="studio-btn-group">
                  <button
                    type="button"
                    className={`choice-btn ${config.direction === 'vertical' ? 'active' : ''}`}
                    onClick={() => setConfig((c) => ({ ...c, direction: 'vertical' }))}
                  >
                    ⬇️ Từ trên xuống (Dọc)
                  </button>
                  <button
                    type="button"
                    className={`choice-btn ${config.direction === 'horizontal' ? 'active' : ''}`}
                    onClick={() => setConfig((c) => ({ ...c, direction: 'horizontal' }))}
                  >
                    ➡️ Trái sang phải (Ngang)
                  </button>
                </div>
              </section>

              <section className="studio-control-group">
                <h3 className="control-group-title">Khoảng cách giữa các thẻ</h3>
                <div className="studio-slider-row">
                  <div className="slider-label-row">
                    <span>Khoảng cách anh chị em (ngang)</span>
                    <strong className="slider-val">{config.siblingSpacing}px</strong>
                  </div>
                  <input
                    type="range"
                    min="24"
                    max="100"
                    step="4"
                    value={config.siblingSpacing}
                    onChange={(e) => setConfig((c) => ({ ...c, siblingSpacing: Number(e.target.value) }))}
                  />
                </div>

                <div className="studio-slider-row">
                  <div className="slider-label-row">
                    <span>Khoảng cách giữa các thế hệ (dọc)</span>
                    <strong className="slider-val">{config.generationSpacing}px</strong>
                  </div>
                  <input
                    type="range"
                    min="48"
                    max="160"
                    step="8"
                    value={config.generationSpacing}
                    onChange={(e) => setConfig((c) => ({ ...c, generationSpacing: Number(e.target.value) }))}
                  />
                </div>

                <label className="studio-checkbox-label">
                  <input
                    type="checkbox"
                    checked={config.zigzagCompact}
                    onChange={(e) => setConfig((c) => ({ ...c, zigzagCompact: e.target.checked }))}
                  />
                  <span>Bố trí so le / ziczac khi nhánh đông con (chống tràn ngang)</span>
                </label>
              </section>

              <section className="studio-control-group">
                <h3 className="control-group-title">Đánh số thế hệ</h3>
                <div className="studio-btn-group">
                  <button
                    type="button"
                    className={`choice-btn ${config.genNumberFormat === 'number' ? 'active' : ''}`}
                    onClick={() => setConfig((c) => ({ ...c, genNumberFormat: 'number' }))}
                  >
                    Đời 1, Đời 2…
                  </button>
                  <button
                    type="button"
                    className={`choice-btn ${config.genNumberFormat === 'roman' ? 'active' : ''}`}
                    onClick={() => setConfig((c) => ({ ...c, genNumberFormat: 'roman' }))}
                  >
                    Thế hệ I, II…
                  </button>
                  <button
                    type="button"
                    className={`choice-btn ${config.genNumberFormat === 'none' ? 'active' : ''}`}
                    onClick={() => setConfig((c) => ({ ...c, genNumberFormat: 'none' }))}
                  >
                    Tắt đánh số
                  </button>
                </div>
              </section>

              <section className="studio-control-group">
                <h3 className="control-group-title">Giới hạn số thế hệ</h3>
                <select
                  className="studio-select"
                  value={config.maxGenerations}
                  onChange={(e) => setConfig((c) => ({ ...c, maxGenerations: Number(e.target.value) }))}
                >
                  <option value={0}>Hiển thị toàn bộ các đời (Đời 1 đến 14)</option>
                  <option value={3}>Chỉ hiển thị 3 đời đầu (Thủy tổ & Con cháu)</option>
                  <option value={5}>Hiển thị 5 đời (Ngũ đại đồng đường)</option>
                  <option value={7}>Hiển thị 7 đời (Thất đại)</option>
                  <option value={9}>Hiển thị 9 đời (Cửu tộc)</option>
                </select>
              </section>

              {branchList.length > 0 && (
                <section className="studio-control-group">
                  <h3 className="control-group-title">Lọc theo chi nhánh</h3>
                  <select
                    className="studio-select"
                    value={config.selectedBranch || ''}
                    onChange={(e) => setConfig((c) => ({ ...c, selectedBranch: e.target.value || undefined }))}
                  >
                    <option value="">Xem toàn bộ các chi phái</option>
                    {branchList.map((b) => (
                      <option key={b} value={b}>
                        Chi phái: {b}
                      </option>
                    ))}
                  </select>
                </section>
              )}

              <section className="studio-control-group">
                <h3 className="control-group-title">Tùy chọn ẩn / hiện trên thẻ</h3>
                <label className="studio-checkbox-label">
                  <input
                    type="checkbox"
                    checked={config.showSpouses}
                    onChange={(e) => setConfig((c) => ({ ...c, showSpouses: e.target.checked }))}
                  />
                  <span>Hiển thị người phối ngẫu (Dâu / Rể)</span>
                </label>
                <label className="studio-checkbox-label">
                  <input
                    type="checkbox"
                    checked={config.showBirthDeath}
                    onChange={(e) => setConfig((c) => ({ ...c, showBirthDeath: e.target.checked }))}
                  />
                  <span>Hiển thị năm sinh - năm mất</span>
                </label>
                <label className="studio-checkbox-label">
                  <input
                    type="checkbox"
                    checked={config.showOccupation}
                    onChange={(e) => setConfig((c) => ({ ...c, showOccupation: e.target.checked }))}
                  />
                  <span>Hiển thị chức vị / nghề nghiệp</span>
                </label>
                <label className="studio-checkbox-label">
                  <input
                    type="checkbox"
                    checked={config.showAvatars}
                    onChange={(e) => setConfig((c) => ({ ...c, showAvatars: e.target.checked }))}
                  />
                  <span>Hiển thị biểu tượng chân dung đại diện</span>
                </label>
              </section>
            </div>
          )}

          {/* TAB CONTENT 2: MÀU SẮC, KHUNG NỀN & TRANG TRÍ TRUYỀN THỐNG */}
          {activeTab === 'style' && (
            <div className="studio-tab-panel">
              <section className="studio-control-group">
                <h3 className="control-group-title">Bộ mẫu phong cách dựng sẵn</h3>
                <div className="studio-preset-cards">
                  {THEME_PRESETS.map((preset) => (
                    <div
                      key={preset.id}
                      className={`preset-card ${config.themeId === preset.id ? 'active' : ''}`}
                      onClick={() => applyPreset(preset.id)}
                    >
                      <div className="preset-card-header">
                        <strong className="preset-card-name">{preset.name}</strong>
                        <span className="preset-card-badge">{preset.badge}</span>
                      </div>
                      <p className="preset-card-desc">{preset.description}</p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="studio-control-group">
                <h3 className="control-group-title">Chế độ tô màu Person Card</h3>
                <div className="studio-btn-group">
                  <button
                    type="button"
                    className={`choice-btn ${config.cardColorMode === 'generation' ? 'active' : ''}`}
                    onClick={() => setConfig((c) => ({ ...c, cardColorMode: 'generation' }))}
                  >
                    👑 Theo thế hệ (14 đời)
                  </button>
                  <button
                    type="button"
                    className={`choice-btn ${config.cardColorMode === 'status' ? 'active' : ''}`}
                    onClick={() => setConfig((c) => ({ ...c, cardColorMode: 'status' }))}
                  >
                    🌿 Còn sống / Đã mất
                  </button>
                  <button
                    type="button"
                    className={`choice-btn ${config.cardColorMode === 'gender' ? 'active' : ''}`}
                    onClick={() => setConfig((c) => ({ ...c, cardColorMode: 'gender' }))}
                  >
                    👫 Nam / Nữ
                  </button>
                </div>
              </section>

              <section className="studio-control-group">
                <h3 className="control-group-title">Đường nối huyết thống (Connectors)</h3>
                <div className="studio-color-pickers">
                  <span>Màu đường:</span>
                  {[
                    { label: 'Vàng đồng', color: '#b45309' },
                    { label: 'Đỏ son', color: '#991b1b' },
                    { label: 'Xanh navy', color: '#2563eb' },
                    { label: 'Xám than', color: '#475569' },
                  ].map((c) => (
                    <button
                      key={c.color}
                      type="button"
                      className={`color-swatch ${config.lineColor === c.color ? 'active' : ''}`}
                      style={{ background: c.color }}
                      onClick={() => setConfig((prev) => ({ ...prev, lineColor: c.color }))}
                      title={c.label}
                    />
                  ))}
                </div>

                <div className="studio-btn-group" style={{ marginTop: '10px' }}>
                  <button
                    type="button"
                    className={`choice-btn ${config.lineStyle === 'solid' ? 'active' : ''}`}
                    onClick={() => setConfig((c) => ({ ...c, lineStyle: 'solid' }))}
                  >
                    Nét liền
                  </button>
                  <button
                    type="button"
                    className={`choice-btn ${config.lineStyle === 'dashed' ? 'active' : ''}`}
                    onClick={() => setConfig((c) => ({ ...c, lineStyle: 'dashed' }))}
                  >
                    Nét đứt
                  </button>
                </div>
              </section>

              <section className="studio-control-group">
                <h3 className="control-group-title">Khung viền & Trang trí truyền thống</h3>
                <label className="studio-checkbox-label">
                  <input
                    type="checkbox"
                    checked={config.showBorder}
                    onChange={(e) => setConfig((c) => ({ ...c, showBorder: e.target.checked }))}
                  />
                  <span>Khung viền nghệ thuật quanh phả đồ</span>
                </label>

                <label className="studio-checkbox-label">
                  <input
                    type="checkbox"
                    checked={config.showWatermark}
                    onChange={(e) =>
                      setConfig((c) => ({
                        ...c,
                        showWatermark: e.target.checked,
                        backgroundPattern: e.target.checked ? 'dong-son' : 'none',
                      }))
                    }
                  />
                  <span>Họa tiết hoa văn Trống đồng Đông Sơn mờ</span>
                </label>

                <label className="studio-checkbox-label">
                  <input
                    type="checkbox"
                    checked={config.showSeal}
                    onChange={(e) => setConfig((c) => ({ ...c, showSeal: e.target.checked }))}
                  />
                  <span>Triện son ngọc phả đỏ ("Gia Phả Bảo Ấn")</span>
                </label>

                <label className="studio-checkbox-label">
                  <input
                    type="checkbox"
                    checked={config.showCouplets}
                    onChange={(e) => setConfig((c) => ({ ...c, showCouplets: e.target.checked }))}
                  />
                  <span>Bật hai câu đối vàng son hai bên phả đồ</span>
                </label>

                {config.showCouplets && (
                  <div className="couplets-input-box">
                    <div className="input-group">
                      <label>Câu đối vế trái:</label>
                      <input
                        type="text"
                        className="studio-input"
                        value={config.coupletLeft}
                        onChange={(e) => setConfig((c) => ({ ...c, coupletLeft: e.target.value }))}
                      />
                    </div>
                    <div className="input-group" style={{ marginTop: '8px' }}>
                      <label>Câu đối vế phải:</label>
                      <input
                        type="text"
                        className="studio-input"
                        value={config.coupletRight}
                        onChange={(e) => setConfig((c) => ({ ...c, coupletRight: e.target.value }))}
                      />
                    </div>
                  </div>
                )}
              </section>

              <section className="studio-control-group">
                <h3 className="control-group-title">Tiêu đề & Khởi tổ dòng họ</h3>
                <div className="input-group">
                  <label>Tiêu đề phả đồ:</label>
                  <input
                    type="text"
                    className="studio-input"
                    value={config.chartTitle}
                    onChange={(e) => setConfig((c) => ({ ...c, chartTitle: e.target.value }))}
                  />
                </div>
                <div className="input-group" style={{ marginTop: '8px' }}>
                  <label>Tên Thủy tổ / Khởi tổ:</label>
                  <input
                    type="text"
                    className="studio-input"
                    value={config.founderTitle}
                    onChange={(e) => setConfig((c) => ({ ...c, founderTitle: e.target.value }))}
                  />
                </div>
              </section>
            </div>
          )}

          {/* TAB CONTENT 3: XUẤT BẢN IN & DỮ LIỆU */}
          {activeTab === 'export' && (
            <div className="studio-tab-panel">
              <section className="studio-control-group">
                <h3 className="control-group-title">Chọn khổ giấy in ấn</h3>
                <div className="studio-btn-group">
                  {(['A4', 'A3', 'A2', 'A1', 'banner'] as PaperSize[]).map((size) => (
                    <button
                      key={size}
                      type="button"
                      className={`choice-btn ${config.paperSize === size ? 'active' : ''}`}
                      onClick={() => setConfig((c) => ({ ...c, paperSize: size }))}
                    >
                      {size === 'banner' ? 'Khổ lớn Cuộn' : `Khổ ${size}`}
                    </button>
                  ))}
                </div>

                <div className="studio-btn-group" style={{ marginTop: '10px' }}>
                  <button
                    type="button"
                    className={`choice-btn ${config.paperOrientation === 'landscape' ? 'active' : ''}`}
                    onClick={() => setConfig((c) => ({ ...c, paperOrientation: 'landscape' }))}
                  >
                    📄 Hướng Ngang (Landscape)
                  </button>
                  <button
                    type="button"
                    className={`choice-btn ${config.paperOrientation === 'portrait' ? 'active' : ''}`}
                    onClick={() => setConfig((c) => ({ ...c, paperOrientation: 'portrait' }))}
                  >
                    📃 Hướng Dọc (Portrait)
                  </button>
                </div>
              </section>

              <section className="studio-control-group">
                <h3 className="control-group-title">Xuất file chất lượng cao</h3>
                <div className="export-action-grid">
                  <button
                    type="button"
                    className="export-card-btn pdf-btn"
                    onClick={handlePrint}
                    title="Mở cửa sổ in ấn hoặc Lưu dưới dạng PDF chuẩn vector"
                  >
                    <span className="export-btn-icon">📄</span>
                    <div className="export-btn-text">
                      <strong>In ấn / Xuất PDF</strong>
                      <span>Khổ {config.paperSize} ({config.paperOrientation === 'landscape' ? 'Ngang' : 'Dọc'})</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    className="export-card-btn png-btn"
                    onClick={() => handleExportPNG(2)}
                    disabled={isExporting}
                    title="Xuất ảnh PNG 300 DPI chuẩn in ấn"
                  >
                    <span className="export-btn-icon">🖼️</span>
                    <div className="export-btn-text">
                      <strong>Xuất PNG Siêu nét (2x)</strong>
                      <span>Độ nét cao 300 DPI rõ từng chữ</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    className="export-card-btn png-ultra-btn"
                    onClick={() => handleExportPNG(4)}
                    disabled={isExporting}
                    title="Xuất ảnh PNG Ultra HD 600 DPI để in bạt/vải khổ lớn"
                  >
                    <span className="export-btn-icon">🌟</span>
                    <div className="export-btn-text">
                      <strong>Xuất PNG Ultra HD (4x)</strong>
                      <span>Độ nét tối đa cho bản in từ đường</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    className="export-card-btn svg-btn"
                    onClick={handleExportSVG}
                    title="Xuất file SVG Vector chuẩn mở, sắc nét vô hạn"
                  >
                    <span className="export-btn-icon">📐</span>
                    <div className="export-btn-text">
                      <strong>Xuất SVG Vector vô hạn</strong>
                      <span>Chỉnh sửa trên AI, Corel, Figma</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    className="export-card-btn json-btn"
                    onClick={handleExportJSON}
                    title="Xuất toàn bộ dữ liệu nút và quan hệ gia phả"
                  >
                    <span className="export-btn-icon">💾</span>
                    <div className="export-btn-text">
                      <strong>Xuất JSON Dữ liệu gia phả</strong>
                      <span>Lưu trữ cấu trúc phả hệ chuẩn</span>
                    </div>
                  </button>
                </div>
              </section>

              <section className="studio-control-group">
                <div className="studio-info-tip">
                  <strong>💡 Lời khuyên khi in ấn phả đồ dòng họ:</strong>
                  <p>
                    Để in treo tại nhà thờ họ hoặc họp họ quy mô lớn, quý tộc họ nên xuất định dạng{' '}
                    <strong>SVG Vector</strong> hoặc <strong>PNG 4x</strong> và chuyển cho xưởng in bạt lụa (Canvas / Silk)
                    với kích thước ngang từ 2m đến 4m để có chất lượng trang nghiêm, sắc nét nhất.
                  </p>
                </div>
              </section>
            </div>
          )}
        </aside>

        {/* KHU VỰC LIVE PREVIEW CANVAS */}
        <main className="genealogy-chart-studio-preview-pane">
          {/* Thanh công cụ Zoom & Căn giữa canvas */}
          <div className="preview-toolbar-overlay">
            <span className="preview-guide-badge">
              👁️ Bản xem trước trực tiếp • Khổ {config.paperSize} ({config.paperOrientation === 'landscape' ? 'Ngang' : 'Dọc'})
            </span>
            <div className="preview-zoom-group">
              <button
                type="button"
                className="preview-zoom-btn"
                onClick={() => setZoomScale((z) => Math.min(2.0, Math.round((z + 0.1) * 100) / 100))}
                title="Phóng to"
              >
                +
              </button>
              <span className="preview-zoom-level">{Math.round(zoomScale * 100)}%</span>
              <button
                type="button"
                className="preview-zoom-btn"
                onClick={() => setZoomScale((z) => Math.max(0.1, Math.round((z - 0.1) * 100) / 100))}
                title="Thu nhỏ"
              >
                -
              </button>
              <button
                type="button"
                className="preview-zoom-btn fit"
                onClick={() => setZoomScale(0.5)}
                title="Vừa toàn cảnh"
              >
                Toàn cảnh
              </button>
              <button
                type="button"
                className="preview-zoom-btn reset"
                onClick={() => setZoomScale(1.0)}
                title="100% tỷ lệ gốc"
              >
                100%
              </button>
            </div>
          </div>

          {/* Canvas Phả đồ Trực tiếp */}
          <GenealogyChartCanvas
            nodes={nodes}
            config={config}
            clanName={clanName}
            zoomScale={zoomScale}
            onZoomChange={setZoomScale}
            svgRef={svgRef}
          />
        </main>
      </div>

      {/* TOAST THÔNG BÁO NỔI */}
      {toastMessage && <div className="studio-floating-toast">{toastMessage}</div>}
    </div>
  );
};

export default GenealogyChartStudio;
