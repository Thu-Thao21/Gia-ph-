/*
 * Logic thuần (không three, không React) của cảnh 3D ảnh thờ: phân biệt kéo/bấm, trạng thái phóng to một ảnh,
 * khoảng cách camera khi phóng to, chọn ảnh thu nhỏ hay ảnh gốc, bố cục dải hoa ngày giỗ.
 */

/** Ngưỡng (px): con trỏ/ngón tay di chuyển quá mức này kể từ lúc nhấn thì là KÉO, không phải BẤM. */
export const CLICK_DRAG_THRESHOLD = 6;

export function exceedsDragThreshold(
  startX: number,
  startY: number,
  x: number,
  y: number,
  threshold: number = CLICK_DRAG_THRESHOLD
): boolean {
  return Math.hypot(x - startX, y - startY) > threshold;
}

/* ------------------------------------------------------------------ */
/* Trạng thái phóng to: id của ảnh đang xem sát, hoặc null              */
/* ------------------------------------------------------------------ */

export type ZoomAction =
  | { type: 'click'; id: string; wasDrag: boolean } // bấm vào một ảnh thờ
  | { type: 'missed'; wasDrag: boolean } // bấm ra ngoài (không trúng ảnh nào)
  | { type: 'close' } // nút Đóng
  | { type: 'escape' } // phím Esc
  | { type: 'reset' } // "Về cửa" / Home
  | { type: 'available'; ids: readonly string[] }; // danh sách ảnh đang hiển thị đổi (chuyển trang...)

/**
 * Bấm vào ảnh -> phóng to ảnh đó (bấm ảnh khác thì chuyển sang ảnh đó). Bấm ra ngoài, Đóng, Esc, Về cửa -> trở lại.
 * Một lần KÉO (wasDrag) không bao giờ được tính là bấm: kéo để nhìn quanh không được phóng to hay thu lại.
 */
export function zoomReducer(state: string | null, action: ZoomAction): string | null {
  switch (action.type) {
    case 'click':
      return action.wasDrag ? state : action.id;
    case 'missed':
      return action.wasDrag ? state : null;
    case 'close':
    case 'escape':
    case 'reset':
      return null;
    case 'available':
      return state !== null && !action.ids.includes(state) ? null : state;
    default:
      return state;
  }
}

/**
 * Khoảng cách từ camera tới mặt ảnh để khung ảnh chiếm ~58% chiều cao khung nhìn.
 * `frameHeight` là chiều cao khung ảnh trong không gian thế giới, `fovDeg` là góc nhìn dọc của camera.
 */
export function zoomDistance(frameHeight: number, fovDeg: number, fill = 0.58, min = 0.55, max = 2.4): number {
  const visibleUnit = 2 * Math.tan((fovDeg * Math.PI) / 360); // chiều cao nhìn thấy trên mỗi đơn vị khoảng cách
  const raw = frameHeight / (fill * Math.max(0.2, visibleUnit));
  return Math.min(max, Math.max(min, raw));
}

/* ------------------------------------------------------------------ */
/* Ảnh: thu nhỏ cho cảnh 3D, ảnh gốc khi phóng to                       */
/* ------------------------------------------------------------------ */

const clean = (url?: string | null): string => (url ? url.trim() : '');

export interface PortraitSources {
  thumbnailUrl?: string | null;
  portraitUrl?: string | null;
}

/**
 * - thumb: ảnh dùng trong cảnh 3D (thumbnailUrl; thiếu thì portraitUrl).
 * - full: ảnh gốc (portraitUrl; thiếu thì thumb).
 * - wantFull: chỉ tải ảnh gốc khi đang phóng to và ảnh gốc khác ảnh thu nhỏ.
 */
export function pickPortraitUrls(source: PortraitSources, zoomed: boolean): { thumb: string; full: string; wantFull: boolean } {
  const thumb = clean(source.thumbnailUrl) || clean(source.portraitUrl);
  const full = clean(source.portraitUrl) || thumb;
  return { thumb, full, wantFull: zoomed && !!full && full !== thumb };
}

/* ------------------------------------------------------------------ */
/* Dải hoa ngày giỗ                                                     */
/* ------------------------------------------------------------------ */

export interface GarlandFlower {
  x: number;
  y: number;
  z: number;
  /** 0 trắng, 1 vàng, 2 đỏ. */
  tone: 0 | 1 | 2;
}

/** Dải hoa võng nhẹ chạy ngang trước đế bài vị (rộng `width`, võng xuống `sag`). Chế độ nhẹ dùng ít hoa hơn. */
export function garlandLayout(count: number, width: number, sag: number): GarlandFlower[] {
  const n = Math.max(2, Math.floor(count));
  return Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1);
    return {
      x: (t - 0.5) * width,
      y: -Math.sin(Math.PI * t) * sag,
      z: 0,
      tone: (i % 3) as 0 | 1 | 2,
    };
  });
}

/** Số bài vị giỗ tối đa được bật đèn điểm thật ở nến (đèn thật rất tốn). Chế độ nhẹ: không có đèn thật nào. */
export const MAX_MEMORIAL_LIGHTS = 2;

/** Chọn các bài vị giỗ (theo thứ tự hiển thị) được bật đèn điểm; chế độ nhẹ trả tập rỗng. */
export function pickLitMemorials(orderedIds: readonly string[], memorialIds: ReadonlySet<string>, high: boolean): Set<string> {
  const lit = new Set<string>();
  if (!high) return lit;
  for (const id of orderedIds) {
    if (lit.size >= MAX_MEMORIAL_LIGHTS) break;
    if (memorialIds.has(id)) lit.add(id);
  }
  return lit;
}
