/*
 * Công cụ ảnh cho màn hình quản lý bàn thờ (không dùng thư viện ngoài):
 *  - kiểm tra tệp trước khi tải (loại tệp, dung lượng),
 *  - tính vùng cắt theo tỉ lệ khung ảnh thờ và cắt bằng canvas.
 * (Cài đặt "Ảnh thờ đen trắng" do cảnh 3D tự xử lý trong shader: xem hall3d/portraitShader.ts.)
 * BE vẫn kiểm tra lại theo NỘI DUNG THẬT của tệp; kiểm tra ở đây chỉ để báo lỗi sớm và rõ ràng.
 */

export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // khớp BE (WORSHIP_IMAGE_MAX_BYTES)
export const MAX_IMAGE_SIDE = 4000; // khớp BE (WORSHIP_IMAGE_MAX_SIDE)
/** Ảnh nguồn nhỏ hơn mức này cho ảnh cắt xấu, báo người dùng chọn ảnh khác. */
export const MIN_SOURCE_SIDE = 100;

/** Khung ảnh thờ trong cảnh 3D là 3:4 (rộng:cao). */
export const PORTRAIT_ASPECT = 3 / 4;
/** Ảnh bìa phòng thờ: 16:9. */
export const COVER_ASPECT = 16 / 9;
export const PORTRAIT_OUTPUT_WIDTH = 600; // 600x800
export const COVER_OUTPUT_WIDTH = 1600; // 1600x900

const EXT_TYPES: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

export interface FileLike {
  name?: string;
  type?: string;
  size: number;
}

/** Loại ảnh theo MIME; MIME rỗng (một số trình duyệt) thì suy ra từ đuôi tệp. */
function detectType(file: FileLike): string {
  const mime = (file.type || '').toLowerCase();
  if (mime) return mime === 'image/jpg' ? 'image/jpeg' : mime;
  const ext = (file.name || '').toLowerCase().split('.').pop() || '';
  return EXT_TYPES[ext] || '';
}

/** Trả về thông báo lỗi tiếng Việt, hoặc null nếu tệp hợp lệ để mở bước cắt ảnh. */
export function validateImageFile(file: FileLike): string | null {
  if (!file || file.size <= 0) return 'Tệp ảnh rỗng. Vui lòng chọn tệp khác.';
  const type = detectType(file);
  if (!(ACCEPTED_IMAGE_TYPES as readonly string[]).includes(type)) {
    return 'Chỉ nhận ảnh JPG, PNG hoặc WebP. Vui lòng chọn tệp đúng định dạng.';
  }
  if (file.size > MAX_IMAGE_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(1).replace('.', ',');
    return `Ảnh nặng ${mb} MB, vượt mức tối đa 5 MB. Vui lòng chọn ảnh nhỏ hơn.`;
  }
  return null;
}

/** Kiểm tra kích thước điểm ảnh sau khi mở được ảnh. */
export function validateImageSize(width: number, height: number): string | null {
  if (!(width > 0 && height > 0)) return 'Không đọc được ảnh. Tệp có thể bị hỏng, vui lòng chọn tệp khác.';
  if (Math.min(width, height) < MIN_SOURCE_SIDE) {
    return `Ảnh quá nhỏ (${width}×${height}). Cạnh ngắn cần tối thiểu ${MIN_SOURCE_SIDE} px.`;
  }
  return null;
}

export interface CropRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;

/** Kích thước khung cắt (theo điểm ảnh của ảnh gốc) ở mức phóng `zoom` (1 = khung lớn nhất vừa trong ảnh). */
export function cropFrameSize(
  naturalW: number,
  naturalH: number,
  aspect: number,
  zoom: number
): { sw: number; sh: number } {
  const z = Math.min(Math.max(zoom, MIN_ZOOM), MAX_ZOOM);
  const maxW = Math.min(naturalW, naturalH * aspect);
  const sw = maxW / z;
  return { sw, sh: sw / aspect };
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/**
 * Vùng cắt quanh tâm (cx, cy) tính bằng điểm ảnh gốc; tâm được kéo vào trong để khung không tràn ra ngoài ảnh.
 * Kết quả luôn có đúng tỉ lệ `aspect` và nằm gọn trong ảnh.
 */
export function computeCropRect(
  naturalW: number,
  naturalH: number,
  aspect: number,
  zoom: number,
  cx: number,
  cy: number
): CropRect {
  const { sw, sh } = cropFrameSize(naturalW, naturalH, aspect, zoom);
  const sx = clamp(cx - sw / 2, 0, Math.max(0, naturalW - sw));
  const sy = clamp(cy - sh / 2, 0, Math.max(0, naturalH - sh));
  return { sx, sy, sw, sh };
}

/** Kích thước ảnh đầu ra: rộng tối đa `maxWidth`, không phóng to quá vùng cắt, đúng tỉ lệ, luôn trong giới hạn BE. */
export function outputSize(rect: CropRect, aspect: number, maxWidth: number): { width: number; height: number } {
  const width = Math.max(16, Math.min(maxWidth, Math.round(rect.sw), MAX_IMAGE_SIDE));
  const height = Math.max(16, Math.min(Math.round(width / aspect), MAX_IMAGE_SIDE));
  return { width, height };
}

/** Tối thiểu của canvas dùng khi cắt (tách ra để thử bằng canvas giả). */
export interface CanvasLike {
  width: number;
  height: number;
  getContext(kind: '2d'): {
    fillStyle: string;
    fillRect(x: number, y: number, w: number, h: number): void;
    drawImage(image: unknown, sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number): void;
  } | null;
  toBlob(callback: (blob: Blob | null) => void, type?: string, quality?: number): void;
}

const defaultCanvasFactory = (): CanvasLike => document.createElement('canvas') as unknown as CanvasLike;

/**
 * Cắt ảnh bằng canvas rồi trả về Blob JPEG (nền trắng cho ảnh PNG/WebP trong suốt).
 * Dùng canvas giả được qua tham số `makeCanvas` khi thử.
 */
export function cropToBlob(
  source: unknown,
  rect: CropRect,
  out: { width: number; height: number },
  makeCanvas: () => CanvasLike = defaultCanvasFactory,
  quality = 0.92
): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    try {
      const canvas = makeCanvas();
      canvas.width = out.width;
      canvas.height = out.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Trình duyệt không hỗ trợ cắt ảnh.'));
        return;
      }
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, out.width, out.height);
      ctx.drawImage(source, rect.sx, rect.sy, rect.sw, rect.sh, 0, 0, out.width, out.height);
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Không cắt được ảnh. Vui lòng thử ảnh khác.'))),
        'image/jpeg',
        quality
      );
    } catch {
      reject(new Error('Không cắt được ảnh. Vui lòng thử ảnh khác.'));
    }
  });
}
