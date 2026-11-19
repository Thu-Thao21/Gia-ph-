/*
 * Đổi ngày dương lịch sang ÂM LỊCH Việt Nam (múi giờ UTC+7) và tính ngày giỗ.
 *
 * Thuật toán chuẩn của Hồ Ngọc Đức ("Tính âm lịch Việt Nam", dựa trên Astronomical Algorithms của Jean Meeus):
 * ngày Julian -> thời điểm Sóc (trăng mới) -> kinh độ Mặt Trời (trung khí) -> tháng 11 âm lịch -> tháng nhuận.
 * Không dùng thư viện ngoài, không tải gì từ mạng.
 */

export interface SolarDate {
  y: number;
  m: number;
  d: number;
}

export interface LunarDate {
  day: number;
  month: number;
  year: number;
  /** true: tháng nhuận. */
  leap: boolean;
}

const PI = Math.PI;
const INT = Math.floor;
export const VN_TIME_ZONE = 7;

/** Số ngày Julian (JDN) của một ngày dương lịch (lịch Gregory sau 15/10/1582, Julian trước đó). */
export function jdFromDate(dd: number, mm: number, yy: number): number {
  const a = INT((14 - mm) / 12);
  const y = yy + 4800 - a;
  const m = mm + 12 * a - 3;
  let jd = dd + INT((153 * m + 2) / 5) + 365 * y + INT(y / 4) - INT(y / 100) + INT(y / 400) - 32045;
  if (jd < 2299161) jd = dd + INT((153 * m + 2) / 5) + 365 * y + INT(y / 4) - 32083;
  return jd;
}

/** Thời điểm Sóc thứ k (tính từ Sóc 1/1/1900), theo ngày Julian. */
function newMoon(k: number): number {
  const T = k / 1236.85;
  const T2 = T * T;
  const T3 = T2 * T;
  const dr = PI / 180;
  let jd1 = 2415020.75933 + 29.53058868 * k + 0.0001178 * T2 - 0.000000155 * T3;
  jd1 += 0.00033 * Math.sin((166.56 + 132.87 * T - 0.009173 * T2) * dr);
  const M = 359.2242 + 29.10535608 * k - 0.0000333 * T2 - 0.00000347 * T3;
  const Mpr = 306.0253 + 385.81691806 * k + 0.0107306 * T2 + 0.00001236 * T3;
  const F = 21.2964 + 390.67050646 * k - 0.0016528 * T2 - 0.00000239 * T3;
  let C1 = (0.1734 - 0.000393 * T) * Math.sin(M * dr) + 0.0021 * Math.sin(2 * dr * M);
  C1 = C1 - 0.4068 * Math.sin(Mpr * dr) + 0.0161 * Math.sin(dr * 2 * Mpr);
  C1 -= 0.0004 * Math.sin(dr * 3 * Mpr);
  C1 = C1 + 0.0104 * Math.sin(dr * 2 * F) - 0.0051 * Math.sin(dr * (M + Mpr));
  C1 = C1 - 0.0074 * Math.sin(dr * (M - Mpr)) + 0.0004 * Math.sin(dr * (2 * F + M));
  C1 = C1 - 0.0004 * Math.sin(dr * (2 * F - M)) - 0.0006 * Math.sin(dr * (2 * F + Mpr));
  C1 = C1 + 0.001 * Math.sin(dr * (2 * F - Mpr)) + 0.0005 * Math.sin(dr * (2 * Mpr + M));
  const deltat =
    T < -11
      ? 0.001 + 0.000839 * T + 0.0002261 * T2 - 0.00000845 * T3 - 0.000000081 * T * T3
      : -0.000278 + 0.000265 * T + 0.000262 * T2;
  return jd1 + C1 - deltat;
}

/** Kinh độ Mặt Trời (chia thành 12 cung 30°, trả 0..11) lúc 0h của ngày Julian `jdn`. */
function sunLongitude(jdn: number): number {
  const T = (jdn - 2451545.0) / 36525;
  const T2 = T * T;
  const dr = PI / 180;
  const M = 357.5291 + 35999.0503 * T - 0.0001559 * T2 - 0.00000048 * T * T2;
  const L0 = 280.46645 + 36000.76983 * T + 0.0003032 * T2;
  let DL = (1.9146 - 0.004817 * T - 0.000014 * T2) * Math.sin(dr * M);
  DL = DL + (0.019993 - 0.000101 * T) * Math.sin(dr * 2 * M) + 0.00029 * Math.sin(dr * 3 * M);
  let L = (L0 + DL) * dr;
  L -= PI * 2 * INT(L / (PI * 2));
  return L;
}

const getSunLongitude = (dayNumber: number, tz: number): number => INT((sunLongitude(dayNumber - 0.5 - tz / 24) / PI) * 6);
const getNewMoonDay = (k: number, tz: number): number => INT(newMoon(k) + 0.5 + tz / 24);

/** Ngày bắt đầu tháng 11 âm lịch (tháng chứa Đông chí) của năm dương `yy`. */
function getLunarMonth11(yy: number, tz: number): number {
  const off = jdFromDate(31, 12, yy) - 2415021;
  const k = INT(off / 29.530588853);
  let nm = getNewMoonDay(k, tz);
  if (getSunLongitude(nm, tz) >= 9) nm = getNewMoonDay(k - 1, tz);
  return nm;
}

/** Vị trí tháng nhuận trong năm âm lịch bắt đầu từ tháng 11 ở ngày `a11`. */
function getLeapMonthOffset(a11: number, tz: number): number {
  const k = INT((a11 - 2415021.076998695) / 29.530588853 + 0.5);
  let i = 1;
  let arc = getSunLongitude(getNewMoonDay(k + i, tz), tz);
  let last: number;
  do {
    last = arc;
    i += 1;
    arc = getSunLongitude(getNewMoonDay(k + i, tz), tz);
  } while (arc !== last && i < 14);
  return i - 1;
}

/** Đổi ngày dương (dd/mm/yy) sang âm lịch. Ném lỗi nếu ngày không tồn tại. */
export function solarToLunar(dd: number, mm: number, yy: number, tz: number = VN_TIME_ZONE): LunarDate {
  if (!isRealSolarDate(yy, mm, dd)) throw new RangeError('Ngày dương lịch không hợp lệ');
  const dayNumber = jdFromDate(dd, mm, yy);
  const k = INT((dayNumber - 2415021.076998695) / 29.530588853);
  let monthStart = getNewMoonDay(k + 1, tz);
  if (monthStart > dayNumber) monthStart = getNewMoonDay(k, tz);
  let a11 = getLunarMonth11(yy, tz);
  let b11 = a11;
  let lunarYear: number;
  if (a11 >= monthStart) {
    lunarYear = yy;
    a11 = getLunarMonth11(yy - 1, tz);
  } else {
    lunarYear = yy + 1;
    b11 = getLunarMonth11(yy + 1, tz);
  }
  const day = dayNumber - monthStart + 1;
  const diff = INT((monthStart - a11) / 29);
  let leap = false;
  let month = diff + 11;
  if (b11 - a11 > 365) {
    const leapMonthDiff = getLeapMonthOffset(a11, tz);
    if (diff >= leapMonthDiff) {
      month = diff + 10;
      if (diff === leapMonthDiff) leap = true;
    }
  }
  if (month > 12) month -= 12;
  if (month >= 11 && diff < 4) lunarYear -= 1;
  return { day, month, year: lunarYear, leap };
}

/* ------------------------------------------------------------------ */
/* Ngày giỗ                                                             */
/* ------------------------------------------------------------------ */

function isRealSolarDate(y: number, m: number, d: number): boolean {
  if (![y, m, d].every(Number.isInteger) || y < 1583 || y > 2200) return false;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** "yyyy-mm-dd" (hoặc có giờ phía sau) -> ngày dương đầy đủ; chỉ có năm / sai định dạng / ngày không có thật -> null. */
export function parseSolarDate(raw?: string | null): SolarDate | null {
  if (!raw) return null;
  const match = String(raw).trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:$|[T\s])/);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  return isRealSolarDate(y, m, d) ? { y, m, d } : null;
}

/** Hôm nay theo giờ Việt Nam (UTC+7, không có giờ mùa hè), bất kể múi giờ của máy. */
export function vietnamToday(now: Date = new Date()): SolarDate {
  const t = new Date(now.getTime() + VN_TIME_ZONE * 3600 * 1000);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

const nextDay = (date: SolarDate): SolarDate => {
  const t = new Date(Date.UTC(date.y, date.m - 1, date.d + 1));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
};

/** Âm lịch của death_date; null nếu không đổi được (thiếu ngày, ngày sai...). */
export function lunarOfDate(raw?: string | null): LunarDate | null {
  const solar = parseSolarDate(raw);
  if (!solar) return null;
  try {
    return solarToLunar(solar.d, solar.m, solar.y);
  } catch {
    return null;
  }
}

/**
 * Hôm nay (giờ VN) có phải ngày giỗ không: trùng NGÀY và THÁNG ÂM LỊCH với ngày mất (dương lịch -> âm lịch).
 *  - Chỉ tính từ sau ngày mất (chính ngày mất không phải ngày giỗ).
 *  - Mất vào tháng nhuận: giỗ vào tháng thường cùng số; hôm nay là tháng nhuận cũng tính theo số tháng.
 *  - Mất ngày 30 mà tháng này chỉ có 29 ngày thì giỗ vào ngày 29.
 * Không đổi được (không có ngày mất đầy đủ, lỗi tính toán) thì trả false, không ném lỗi.
 */
export function isMemorialDay(deathDateRaw: string | null | undefined, today: SolarDate = vietnamToday()): boolean {
  try {
    const death = parseSolarDate(deathDateRaw);
    if (!death) return false;
    if (jdFromDate(today.d, today.m, today.y) <= jdFromDate(death.d, death.m, death.y)) return false;
    const deathLunar = solarToLunar(death.d, death.m, death.y);
    const todayLunar = solarToLunar(today.d, today.m, today.y);
    if (deathLunar.month !== todayLunar.month) return false;
    if (deathLunar.day === todayLunar.day) return true;
    if (deathLunar.day === 30 && todayLunar.day === 29) {
      const tomorrow = nextDay(today);
      return solarToLunar(tomorrow.d, tomorrow.m, tomorrow.y).day === 1; // tháng thiếu: không có ngày 30
    }
    return false;
  } catch {
    return false;
  }
}

/** id các bài vị có ngày giỗ hôm nay. Bài vị không đổi được ngày (thiếu ngày mất đầy đủ...) bị bỏ qua, không báo lỗi. */
export function memorialIdsOf(
  tablets: ReadonlyArray<{ id: string; deathDate?: string | null }>,
  today: SolarDate = vietnamToday()
): Set<string> {
  const ids = new Set<string>();
  tablets.forEach((item) => {
    if (isMemorialDay(item.deathDate, today)) ids.add(item.id);
  });
  return ids;
}

/** "17 tháng 1 âm lịch" (ngày giỗ hằng năm); null nếu không đổi được. */
export function memorialLabel(deathDateRaw?: string | null): string | null {
  const lunar = lunarOfDate(deathDateRaw);
  return lunar ? `${lunar.day} tháng ${lunar.month} âm lịch` : null;
}

/** "1941-03-12" -> "12/03/1941"; "12/3/1941" -> "12/03/1941"; chỉ có năm thì giữ năm; không rõ thì chuỗi rỗng. */
export function formatSolarDate(raw?: string | null): string {
  if (!raw) return '';
  const text = String(raw).trim();
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[3].padStart(2, '0')}/${iso[2].padStart(2, '0')}/${iso[1]}`;
  const vn = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (vn) return `${vn[1].padStart(2, '0')}/${vn[2].padStart(2, '0')}/${vn[3]}`;
  const year = text.match(/^(\d{4})$/);
  return year ? year[1] : '';
}
