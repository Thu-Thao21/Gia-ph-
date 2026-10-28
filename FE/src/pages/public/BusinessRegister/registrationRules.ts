/*
 * Mốc M5c: các quy tắc của form đăng ký Business, GIỐNG phía BE (schemas/business.py). FE chỉ báo sớm
 * cho người dùng; BE mới là nơi chặn thật. Hàm thuần, không phụ thuộc React.
 */

const collapse = (value: string) => value.normalize('NFC').replace(/\s+/g, ' ').trim();

/** Họ tên người đại diện: chữ cái, khoảng trắng và . ' - ; 2–100 ký tự. Trả lỗi hoặc null. */
export function personNameError(value: string): string | null {
  const v = collapse(value);
  if (v.length < 2 || v.length > 100 || !/^\p{L}+(?:[ .'-]\p{L}+)*\.?$/u.test(v)) {
    return 'Họ và tên người đại diện chỉ gồm chữ cái, khoảng trắng và dấu . \' - (từ 2 đến 100 ký tự).';
  }
  return null;
}

/** Số di động Việt Nam -> dạng 0XXXXXXXXX (nhận +84, 84, dấu cách, chấm, gạch, ngoặc); null nếu sai. */
export function normalizeVnMobile(value: string): string | null {
  let digits = value.trim().replace(/[ .()-]/g, '');
  if (digits.startsWith('+84')) digits = `0${digits.slice(3)}`;
  else if (digits.startsWith('84') && digits.length === 11) digits = `0${digits.slice(2)}`;
  return /^0(?:3|5|7|8|9)\d{8}$/.test(digits) ? digits : null;
}

export function originError(value: string): string | null {
  const v = collapse(value);
  if (v.length < 2 || v.length > 255 || v.includes('_') || !/^[\p{L}\p{M}\p{N} ,./()'-]+$/u.test(v)) {
    return 'Quê gốc chỉ gồm chữ, số, khoảng trắng và , . / ( ) \' - (từ 2 đến 255 ký tự).';
  }
  return null;
}

/** Tên trường BE (body.xxx) -> nhãn tiếng Việt và bước của wizard. */
export const FIELD_INFO: Record<string, { label: string; step: 1 | 2 | 3 }> = {
  representative_name: { label: 'Họ và tên người đại diện', step: 1 },
  representative_email: { label: 'Email liên hệ (@gmail.com)', step: 1 },
  representative_phone: { label: 'Số điện thoại di động', step: 1 },
  clan_name: { label: 'Tên dòng họ', step: 2 },
  origin_place: { label: 'Quê gốc / Nhà thờ tổ', step: 2 },
  requested_plan_id: { label: 'Gói dịch vụ', step: 3 },
  verification_token: { label: 'Xác thực Gmail', step: 1 },
};

/** details.fields của VALIDATION_ERROR (["body.clan_name", ...]) -> các trường đã biết, theo thứ tự bước. */
export function invalidFields(fields: unknown): string[] {
  if (!Array.isArray(fields)) return [];
  const names = fields
    .filter((f): f is string => typeof f === 'string')
    .map((f) => f.replace(/^body\./, ''))
    .filter((f) => f in FIELD_INFO);
  return Array.from(new Set(names)).sort((a, b) => FIELD_INFO[a].step - FIELD_INFO[b].step);
}

/** Câu chung khi dòng họ đã có trên hệ thống: KHÔNG nhắc gì tới dòng họ kia (BE cũng không trả). */
export const DUPLICATE_CLAN_MESSAGE =
  'Dòng họ này (cùng tên và quê gốc) đã được đăng ký trên hệ thống. Nếu bạn thuộc dòng họ này, vui lòng liên hệ Trưởng tộc hoặc quản trị viên. Nếu là một dòng họ khác, hãy ghi rõ hơn tên dòng họ hoặc quê gốc.';

export const LOGO_MAX_BYTES = 2 * 1024 * 1024;

/** Loại ảnh theo NỘI DUNG (magic bytes), không theo đuôi tệp; SVG luôn bị từ chối. */
export function detectLogoType(head: Uint8Array): 'png' | 'jpeg' | 'webp' | 'svg' | null {
  const text = new TextDecoder('latin1').decode(head.slice(0, 256)).trimStart().toLowerCase();
  if (text.startsWith('<svg') || text.startsWith('<?xml') || text.includes('<svg')) return 'svg';
  const b = head;
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b.length >= 12 && text.startsWith('riff') && new TextDecoder('latin1').decode(b.slice(8, 12)) === 'WEBP') return 'webp';
  return null;
}

export function logoError(size: number, head: Uint8Array): string | null {
  if (size > LOGO_MAX_BYTES) return 'Ảnh biểu trưng vượt quá 2MB. Vui lòng chọn tệp nhỏ hơn.';
  const kind = detectLogoType(head);
  if (kind === 'svg') return 'Không nhận ảnh SVG vì lý do an toàn. Vui lòng dùng PNG, JPG hoặc WEBP.';
  if (kind === null) return 'Tệp không phải ảnh PNG, JPG hoặc WEBP hợp lệ (đổi đuôi tệp không làm thay đổi nội dung).';
  return null;
}
