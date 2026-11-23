// chartExportUtils.ts - Xuất bản in chất lượng cao: PDF, PNG (1x, 2x, 4x), SVG Vector, JSON

import type { GenealogyChartConfig, PaperSize, PaperOrientation } from './chartConfigTypes';
import type { ErgoTreeNode } from '../../../types/tree';

/**
 * Tải xuống Blob dữ liệu dưới dạng file trên trình duyệt
 */
export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Xuất file SVG Vector chuẩn mở, sắc nét vô hạn, phù hợp nhập vào AI / Corel / Figma để in ấn khổ lớn
 */
export function exportChartToSVG(svgElement: SVGElement, fileName: string) {
  const serializer = new XMLSerializer();
  let svgString = serializer.serializeToString(svgElement);

  // Thêm namespace XML chuẩn nếu thiếu
  if (!svgString.match(/^<svg[^>]+xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)) {
    svgString = svgString.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
  }
  if (!svgString.match(/^<svg[^>]+xmlns:xlink="http:\/\/www\.w3\.org\/1999\/xlink"/)) {
    svgString = svgString.replace(/^<svg/, '<svg xmlns:xlink="http://www.w3.org/1999/xlink"');
  }

  // Thêm khai báo XML header
  const fullSvg = '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n' + svgString;
  const blob = new Blob([fullSvg], { type: 'image/svg+xml;charset=utf-8' });
  downloadBlob(blob, `${fileName}.svg`);
}

/**
 * Xuất file ảnh PNG độ nét cao (1x: chuẩn, 2x: 300 DPI in ấn, 4x: Ultra HD 600 DPI)
 */
export function exportChartToPNG(
  svgElement: SVGElement,
  fileName: string,
  scale: number = 2
): Promise<boolean> {
  return new Promise((resolve, reject) => {
    try {
      const bbox = svgElement.getBoundingClientRect();
      const width = Math.max(800, bbox.width || 1920);
      const height = Math.max(600, bbox.height || 1080);

      const serializer = new XMLSerializer();
      let svgString = serializer.serializeToString(svgElement);

      if (!svgString.match(/^<svg[^>]+xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)) {
        svgString = svgString.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
      }

      const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);
      const img = new Image();

      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(width * scale);
        canvas.height = Math.round(height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          URL.revokeObjectURL(url);
          reject(new Error('Cannot get 2D canvas context'));
          return;
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.scale(scale, scale);
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (pngBlob) => {
            URL.revokeObjectURL(url);
            if (pngBlob) {
              downloadBlob(pngBlob, `${fileName}_${scale}x.png`);
              resolve(true);
            } else {
              reject(new Error('Failed to create PNG blob'));
            }
          },
          'image/png',
          0.98
        );
      };

      img.onerror = (err) => {
        URL.revokeObjectURL(url);
        reject(err);
      };

      img.src = url;
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Xuất dữ liệu phả đồ dưới dạng JSON chuẩn cấu trúc
 */
export function exportChartToJSON(
  nodes: ErgoTreeNode[],
  config: GenealogyChartConfig,
  clanMeta: { id?: string; name?: string; clanCode?: string },
  fileName: string
) {
  const exportPayload = {
    system: 'MFGMS-AI (Multi-Family Genealogy Management System)',
    exportVersion: '2.0',
    exportDate: new Date().toISOString(),
    clan: {
      id: clanMeta.id || '',
      name: clanMeta.name || config.chartTitle || 'Dòng họ',
      clanCode: clanMeta.clanCode || '',
      founder: config.founderTitle || '',
      branch: config.clanBranchSubtitle || '',
    },
    presentationConfig: {
      themeId: config.themeId,
      displayMode: config.displayMode,
      direction: config.direction,
      cardColorMode: config.cardColorMode,
      fontFamily: config.fontFamily,
      coupletLeft: config.coupletLeft,
      coupletRight: config.coupletRight,
      paperSize: config.paperSize,
      paperOrientation: config.paperOrientation,
    },
    statistics: {
      totalRootNodes: nodes.length,
      maxGenerationsConfigured: config.maxGenerations || 'All',
    },
    data: nodes,
  };

  const jsonString = JSON.stringify(exportPayload, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8' });
  downloadBlob(blob, `${fileName}.json`);
}

/**
 * Kích hoạt hộp thoại In chuẩn của trình duyệt (In trực tiếp ra máy in hoặc Lưu dưới dạng PDF chuẩn vector)
 */
export function triggerPrintWindow(paperSize: PaperSize, orientation: PaperOrientation) {
  // Tạo hoặc cập nhật style print @page
  const printStyleId = 'mfgms-print-page-style';
  let styleEl = document.getElementById(printStyleId) as HTMLStyleElement;
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = printStyleId;
    document.head.appendChild(styleEl);
  }

  const sizeCss = paperSize === 'banner' ? 'A2 landscape' : `${paperSize} ${orientation}`;

  styleEl.innerHTML = `
    @page {
      size: ${sizeCss};
      margin: 8mm;
    }
    @media print {
      body * {
        visibility: hidden !important;
      }
      #genealogy-chart-print-area,
      #genealogy-chart-print-area * {
        visibility: visible !important;
      }
      #genealogy-chart-print-area {
        position: fixed !important;
        left: 0 !important;
        top: 0 !important;
        width: 100% !important;
        height: auto !important;
        margin: 0 !important;
        padding: 0 !important;
        background: transparent !important;
        box-shadow: none !important;
      }
      .genealogy-chart-studio-drawer,
      .genealogy-chart-studio-topbar,
      .tree-canvas-nav-overlay,
      .no-print {
        display: none !important;
      }
    }
  `;

  window.print();
}
