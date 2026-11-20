/*
 * Hình ghim (marker pin) dạng SVG nhúng sẵn trong mã nguồn — KHÔNG tải ảnh ngoài. Mỗi hình: thân ghim bo tròn
 * màu category, viền trắng, đổ bóng mềm (SVG feDropShadow, bake sẵn vào ảnh — không cần layer CSS riêng), vòng
 * tròn trắng ở giữa chứa 1 biểu tượng đơn giản cùng màu thân ghim.
 *
 * `buildMarkerIconSvg` là hàm THUẦN (chỉ ráp chuỗi SVG, không chạm DOM) nên test được trực tiếp.
 * `loadMarkerImage` cần DOM (Image) nên chỉ gọi được trong trình duyệt — WorldMapView dùng để nạp qua
 * map.addImage trước khi vẽ layer điểm.
 */
import type { MapMarkerIcon } from './worldMapData';

/** Kích thước logic của ghim trên bản đồ (độc lập độ phân giải ảnh — xem MARKER_PIXEL_RATIO). */
export const MARKER_WIDTH = 40;
export const MARKER_HEIGHT = 50;
/** Ảnh được vẽ ở độ phân giải gấp đôi cho nét trên màn hình retina; map.addImage dùng pixelRatio tương ứng. */
export const MARKER_PIXEL_RATIO = 2;

/** 1 glyph SVG (chỉ các thẻ hình học con, không có <svg> bọc ngoài), đặt giữa vòng tròn trắng bán kính ~9 tại (20,18). */
const GLYPH_BY_ICON: Record<MapMarkerIcon, string> = {
  // Nhà thờ / từ đường: mái nhà tam giác + thân nhà.
  hall: '<polygon points="20,11 27,17.5 13,17.5" /><rect x="14.5" y="17.5" width="11" height="7.5" rx="0.8" />',
  // Mộ phần: bia mộ (hình chữ nhật bo tròn phần đỉnh).
  grave: '<path d="M13 25.5V18a7 7 0 0 1 14 0v7.5H13Z" />',
  // Quê hương / di tích: cây (tán tròn + gốc).
  heritage: '<circle cx="20" cy="14.5" r="4.6" /><rect x="18.6" y="18.5" width="2.8" height="6" rx="1" />',
  // Sự kiện: ngôi sao 5 cánh đơn giản.
  event: '<polygon points="20,10.3 22.1,15.4 27.6,15.8 23.4,19.4 24.7,24.8 20,21.8 15.3,24.8 16.6,19.4 12.4,15.8 17.9,15.4" />',
  // Khác: chấm tròn trung tính.
  other: '<circle cx="20" cy="18" r="4.2" />',
};

/**
 * Chuỗi SVG hoàn chỉnh cho 1 icon id (ứng với đúng 1 màu — xem MARKER_ICON_COLOR). Hàm thuần: cùng input luôn
 * ra cùng output, không chạm DOM, không random, nên test trực tiếp được.
 */
export function buildMarkerIconSvg(icon: MapMarkerIcon, color: string): string {
  const w = MARKER_WIDTH * MARKER_PIXEL_RATIO;
  const h = MARKER_HEIGHT * MARKER_PIXEL_RATIO;
  const glyph = GLYPH_BY_ICON[icon] ?? GLYPH_BY_ICON.other;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${MARKER_WIDTH} ${MARKER_HEIGHT}">` +
    `<defs><filter id="wm-shadow-${icon}" x="-60%" y="-60%" width="220%" height="220%">` +
    `<feDropShadow dx="0" dy="1.6" stdDeviation="1.8" flood-color="#0f172a" flood-opacity="0.38"/>` +
    `</filter></defs>` +
    `<g filter="url(#wm-shadow-${icon})">` +
    `<path d="M20 2C11.16 2 4 9.16 4 18c0 12.4 16 30 16 30s16-17.6 16-30C36 9.16 28.84 2 20 2Z" fill="${color}" stroke="#ffffff" stroke-width="2.2"/>` +
    `<circle cx="20" cy="18" r="9" fill="#ffffff"/>` +
    `<g fill="${color}" stroke="none">${glyph}</g>` +
    `</g>` +
    `</svg>`
  );
}

/** Nạp chuỗi SVG thành HTMLImageElement (data URI, không có request mạng) để đăng ký qua map.addImage. */
export function loadMarkerImage(svg: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Không tạo được hình ghim từ SVG.'));
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}
