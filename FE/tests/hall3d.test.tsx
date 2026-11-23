import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { ShaderLib } from 'three';
import { AncestorInfoCard } from '../src/components/member/hall3d/AncestorInfoCard';
import { Hall3DUnavailable } from '../src/components/member/hall3d/Hall3DUnavailable';
import {
  CLICK_DRAG_THRESHOLD,
  MAX_MEMORIAL_LIGHTS,
  exceedsDragThreshold,
  garlandLayout,
  pickLitMemorials,
  pickPortraitUrls,
  zoomDistance,
  zoomReducer,
  type ZoomAction,
} from '../src/components/member/hall3d/hallInteraction';
import {
  formatSolarDate,
  isMemorialDay,
  jdFromDate,
  lunarOfDate,
  memorialIdsOf,
  memorialLabel,
  parseSolarDate,
  solarToLunar,
  vietnamToday,
  type SolarDate,
} from '../src/components/member/hall3d/lunarCalendar';
import {
  GRAYSCALE_VIGNETTE,
  PORTRAIT_PROGRAM_KEY,
  createPortraitUniforms,
  patchPortraitShader,
  setPortraitGrayscale,
} from '../src/components/member/hall3d/portraitShader';

// Test được gói vào thư mục tạm; run.mjs đặt cwd là thư mục FE nên đọc mã nguồn theo cwd.
const root = process.cwd();
const source = (rel: string) => readFileSync(join(root, rel), 'utf8').replace(/\r\n/g, '\n');

const addDays = (date: SolarDate, n: number): SolarDate => {
  const t = new Date(Date.UTC(date.y, date.m - 1, date.d + n));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
};
const iso = (s: SolarDate) => `${s.y}-${String(s.m).padStart(2, '0')}-${String(s.d).padStart(2, '0')}`;
const lunarOf = (s: SolarDate) => solarToLunar(s.d, s.m, s.y);

/* ------------------------------------------------------------------ */
/* Đổi dương -> âm lịch, đối chiếu mốc đã biết                          */
/* ------------------------------------------------------------------ */

describe('Đổi dương lịch sang âm lịch', () => {
  it('17/02/2026 là mùng 1 Tết Bính Ngọ; 29/01/2025 là mùng 1 Tết Ất Tỵ', () => {
    assert.deepEqual(solarToLunar(17, 2, 2026), { day: 1, month: 1, year: 2026, leap: false });
    assert.deepEqual(solarToLunar(29, 1, 2025), { day: 1, month: 1, year: 2025, leap: false });
  });

  it('mùng 1 Tết các năm 2000-2024 (mốc đã biết)', () => {
    const tet: Array<[number, number, number]> = [
      [5, 2, 2000], [24, 1, 2001], [12, 2, 2002], [1, 2, 2003], [22, 1, 2004], [9, 2, 2005], [29, 1, 2006],
      // 2007: trăng mới lúc 23:14 giờ VN ngày 17/02 (00:14 ngày 18/02 giờ Bắc Kinh) nên Tết Việt Nam sớm hơn Trung Quốc một ngày.
      [17, 2, 2007], [7, 2, 2008], [26, 1, 2009], [14, 2, 2010], [3, 2, 2011], [23, 1, 2012], [10, 2, 2013],
      [31, 1, 2014], [19, 2, 2015], [8, 2, 2016], [28, 1, 2017], [16, 2, 2018], [5, 2, 2019], [25, 1, 2020],
      [12, 2, 2021], [1, 2, 2022], [22, 1, 2023], [10, 2, 2024],
    ];
    for (const [d, m, y] of tet) {
      assert.deepEqual(solarToLunar(d, m, y), { day: 1, month: 1, year: y, leap: false }, `${d}/${m}/${y}`);
    }
  });

  it('ngày liền trước Tết là 29 hoặc 30 tháng Chạp của năm trước', () => {
    const eve = solarToLunar(16, 2, 2026);
    assert.equal(eve.month, 12);
    assert.equal(eve.year, 2025);
    assert.ok(eve.day === 29 || eve.day === 30);
    assert.equal(solarToLunar(28, 1, 2025).month, 12);
  });

  it('Rằm tháng 8 (Trung thu) và rằm tháng Giêng', () => {
    assert.deepEqual(solarToLunar(6, 10, 2025), { day: 15, month: 8, year: 2025, leap: false });
    assert.deepEqual(solarToLunar(17, 9, 2024), { day: 15, month: 8, year: 2024, leap: false });
    assert.deepEqual(solarToLunar(29, 9, 2023), { day: 15, month: 8, year: 2023, leap: false });
    assert.deepEqual(solarToLunar(3, 3, 2026), { day: 15, month: 1, year: 2026, leap: false });
  });

  it('tháng nhuận: nhuận tháng 2 năm 2023 và nhuận tháng 6 năm 2025', () => {
    assert.deepEqual(solarToLunar(22, 3, 2023), { day: 1, month: 2, year: 2023, leap: true });
    assert.deepEqual(solarToLunar(20, 4, 2023), { day: 1, month: 3, year: 2023, leap: false });
    assert.deepEqual(solarToLunar(25, 7, 2025), { day: 1, month: 6, year: 2025, leap: true });
    assert.deepEqual(solarToLunar(23, 8, 2025), { day: 1, month: 7, year: 2025, leap: false });
  });

  it('cuối năm dương vẫn thuộc năm âm lịch đang chạy', () => {
    assert.deepEqual(solarToLunar(31, 12, 2025), { day: 12, month: 11, year: 2025, leap: false });
    assert.equal(solarToLunar(1, 1, 2026).year, 2025);
  });

  it('ngày Julian chuẩn và từ chối ngày không có thật', () => {
    assert.equal(jdFromDate(1, 1, 2000), 2451545);
    assert.equal(jdFromDate(17, 2, 2026) - jdFromDate(16, 2, 2026), 1);
    assert.throws(() => solarToLunar(30, 2, 2026), RangeError);
    assert.throws(() => solarToLunar(1, 13, 2026), RangeError);
  });

  it('suốt 400 ngày: ngày âm tăng đều, mỗi tháng 29 hoặc 30 ngày', () => {
    let prev = lunarOf({ y: 2026, m: 1, d: 1 });
    for (let i = 1; i < 400; i += 1) {
      const cur = lunarOf(addDays({ y: 2026, m: 1, d: 1 }, i));
      if (cur.day === 1) assert.ok(prev.day === 29 || prev.day === 30, `ngày cuối tháng ${prev.day}`);
      else assert.equal(cur.day, prev.day + 1);
      prev = cur;
    }
  });
});

describe('Ngày giỗ (âm lịch tính từ ngày mất dương lịch)', () => {
  it('lấy âm lịch của ngày mất; thiếu ngày thì null', () => {
    const lunar = lunarOfDate('1941-03-12');
    assert.ok(lunar);
    assert.equal(memorialLabel('1941-03-12'), `${lunar.day} tháng ${lunar.month} âm lịch`);
    assert.equal(lunarOfDate('1941'), null);
    assert.equal(lunarOfDate(null), null);
    assert.equal(memorialLabel('1941'), null);
  });

  it('mất đúng mùng 1 Tết thì giỗ vào mùng 1 Tết các năm sau', () => {
    const death = '2000-02-05';
    assert.equal(isMemorialDay(death, { y: 2026, m: 2, d: 17 }), true);
    assert.equal(isMemorialDay(death, { y: 2025, m: 1, d: 29 }), true);
    assert.equal(isMemorialDay(death, { y: 2026, m: 2, d: 18 }), false);
    assert.equal(isMemorialDay(death, { y: 2026, m: 2, d: 16 }), false);
  });

  it('chính ngày mất không phải ngày giỗ; trước ngày mất cũng không', () => {
    assert.equal(isMemorialDay('2026-02-17', { y: 2026, m: 2, d: 17 }), false);
    assert.equal(isMemorialDay('2026-02-17', { y: 2025, m: 1, d: 29 }), false);
  });

  it('"hôm nay" tính theo giờ Việt Nam, không theo múi giờ của máy', () => {
    // 16:30 UTC ngày 16/02/2026 = 23:30 ngày 16/02 giờ VN; 17:30 UTC = 00:30 ngày 17/02 giờ VN (mùng 1 Tết).
    assert.deepEqual(vietnamToday(new Date('2026-02-16T16:30:00Z')), { y: 2026, m: 2, d: 16 });
    assert.deepEqual(vietnamToday(new Date('2026-02-16T17:30:00Z')), { y: 2026, m: 2, d: 17 });
    assert.equal(isMemorialDay('2000-02-05', vietnamToday(new Date('2026-02-16T16:30:00Z'))), false);
    assert.equal(isMemorialDay('2000-02-05', vietnamToday(new Date('2026-02-16T17:30:00Z'))), true);
  });

  it('mất trong tháng nhuận thì giỗ vào tháng thường cùng số', () => {
    // 22/03/2023 = mùng 1 tháng 2 NHUẬN; năm 2024 mùng 1 tháng 2 là 10/03/2024.
    assert.equal(lunarOf({ y: 2024, m: 3, d: 10 }).day, 1);
    assert.equal(lunarOf({ y: 2024, m: 3, d: 10 }).month, 2);
    assert.equal(isMemorialDay('2023-03-22', { y: 2024, m: 3, d: 10 }), true);
  });

  it('mất ngày 30 mà tháng này chỉ có 29 ngày thì giỗ vào ngày 29; tháng đủ thì giỗ ngày 30', () => {
    // một ngày mất có âm lịch 30
    let death: SolarDate | null = null;
    for (let i = 0; i < 400 && !death; i += 1) {
      const s = addDays({ y: 2020, m: 1, d: 1 }, i);
      if (lunarOf(s).day === 30) death = s;
    }
    assert.ok(death);
    const month = lunarOf(death).month;
    let short: SolarDate | null = null; // ngày 29 mà hôm sau là mùng 1 (tháng thiếu)
    let full: SolarDate | null = null; // ngày 29 mà hôm sau là ngày 30 (tháng đủ)
    for (let i = 0; i < 366 * 25 && !(short && full); i += 1) {
      const s = addDays({ y: 2022, m: 1, d: 1 }, i);
      const l = lunarOf(s);
      if (l.month !== month || l.day !== 29) continue;
      if (lunarOf(addDays(s, 1)).day === 1) short ||= s;
      else full ||= s;
    }
    assert.ok(short && full, 'cần tìm được cả tháng thiếu và tháng đủ để thử');
    assert.equal(isMemorialDay(iso(death), short), true, 'tháng thiếu: giỗ rơi vào ngày 29');
    assert.equal(isMemorialDay(iso(death), full), false, 'tháng đủ: ngày 29 chưa phải ngày giỗ');
    assert.equal(isMemorialDay(iso(death), addDays(full, 1)), true, 'tháng đủ: giỗ rơi vào ngày 30');
  });

  it('không đổi được thì không hiệu ứng và không báo lỗi', () => {
    const today = { y: 2026, m: 2, d: 17 };
    for (const bad of [null, undefined, '', '1941', 'abc', '1941-13-40', '1941-02-30', '12/03/1941', '0000-00-00']) {
      assert.equal(isMemorialDay(bad as string | null | undefined, today), false, String(bad));
    }
    assert.equal(isMemorialDay('2000-02-05', { y: 2026, m: 2, d: 31 }), false);
    assert.equal(isMemorialDay('2000-02-05', { y: NaN, m: 1, d: 1 }), false);
    assert.doesNotThrow(() => memorialIdsOf([{ id: 'x', deathDate: '\u0000\u0001' }, { id: 'y' }], today));
  });

  it('đọc ngày mất và định dạng hiển thị', () => {
    assert.deepEqual(parseSolarDate('1941-03-12'), { y: 1941, m: 3, d: 12 });
    assert.deepEqual(parseSolarDate('1941-3-2T00:00:00'), { y: 1941, m: 3, d: 2 });
    assert.equal(parseSolarDate('1941'), null);
    assert.equal(formatSolarDate('1941-03-12'), '12/03/1941');
    assert.equal(formatSolarDate('1968'), '1968');
    assert.equal(formatSolarDate(null), '');
    assert.equal(formatSolarDate('không rõ'), '');
  });
});

/* ------------------------------------------------------------------ */
/* Bấm vào ảnh: phóng to, thẻ thông tin, bấm ra ngoài / Esc / Đóng       */
/* ------------------------------------------------------------------ */

describe('Bấm vào ảnh thờ (phân biệt kéo và bấm)', () => {
  const run = (actions: ZoomAction[], start: string | null = null) => actions.reduce(zoomReducer, start);

  it('ngưỡng kéo là 6 px: đúng 6 px vẫn là bấm, quá 6 px là kéo', () => {
    assert.equal(CLICK_DRAG_THRESHOLD, 6);
    assert.equal(exceedsDragThreshold(100, 100, 100, 100), false);
    assert.equal(exceedsDragThreshold(0, 0, 3, 4), false); // 5 px
    assert.equal(exceedsDragThreshold(0, 0, 6, 0), false); // đúng 6 px
    assert.equal(exceedsDragThreshold(0, 0, 6.1, 0), true);
    assert.equal(exceedsDragThreshold(0, 0, 4, 5), true); // ~6,4 px (đường chéo)
    assert.equal(exceedsDragThreshold(10, 10, 10, 3), true);
  });

  it('bấm ảnh thì phóng to ảnh đó; bấm ảnh khác thì chuyển sang ảnh đó', () => {
    assert.equal(run([{ type: 'click', id: 'a', wasDrag: false }]), 'a');
    assert.equal(run([{ type: 'click', id: 'a', wasDrag: false }, { type: 'click', id: 'b', wasDrag: false }]), 'b');
  });

  it('một lần kéo không bao giờ được tính là bấm: không phóng to, không thu nhỏ', () => {
    assert.equal(run([{ type: 'click', id: 'a', wasDrag: true }]), null);
    assert.equal(run([{ type: 'click', id: 'b', wasDrag: true }], 'a'), 'a');
    assert.equal(run([{ type: 'missed', wasDrag: true }], 'a'), 'a');
  });

  it('bấm ra ngoài (không kéo) thu nhỏ lại; bấm ra ngoài khi chưa phóng to thì không đổi gì', () => {
    assert.equal(run([{ type: 'missed', wasDrag: false }], 'a'), null);
    assert.equal(run([{ type: 'missed', wasDrag: false }], null), null);
  });

  it('nút Đóng, phím Esc và "Về cửa" đều thu nhỏ lại', () => {
    for (const type of ['close', 'escape', 'reset'] as const) assert.equal(run([{ type }], 'a'), null, type);
  });

  it('chuyển trang làm ảnh đang xem biến mất thì thu nhỏ; còn ảnh đó thì giữ nguyên', () => {
    assert.equal(run([{ type: 'available', ids: ['x', 'y'] }], 'a'), null);
    assert.equal(run([{ type: 'available', ids: ['a', 'y'] }], 'a'), 'a');
    assert.equal(run([{ type: 'available', ids: [] }], null), null);
  });

  it('cảm ứng: chạm (không di chuyển quá ngưỡng) là bấm, vuốt là kéo', () => {
    // Cùng một logic cho chuột và ngón tay: so khoảng cách từ lúc chạm tới lúc nhả.
    const tap = exceedsDragThreshold(200, 300, 202, 301);
    const swipe = exceedsDragThreshold(200, 300, 260, 300);
    assert.equal(run([{ type: 'click', id: 'a', wasDrag: tap }]), 'a');
    assert.equal(run([{ type: 'click', id: 'a', wasDrag: swipe }]), null);
  });

  it('khoảng cách camera: khung càng nhỏ càng tiến sát, luôn trong giới hạn', () => {
    const big = zoomDistance(1.44, 66);
    const small = zoomDistance(0.3, 66);
    assert.ok(small < big);
    assert.ok(small >= 0.55 && big <= 2.4);
    assert.equal(zoomDistance(0.001, 66), 0.55);
    assert.equal(zoomDistance(50, 66), 2.4);
    assert.ok(zoomDistance(1.44, 85) < zoomDistance(1.44, 50), 'góc nhìn rộng hơn thì đứng gần hơn');
  });

  it('cảnh 3D nối đúng: bấm ra ngoài, Esc (canvas và toàn trang), Đóng, ngưỡng kéo dùng chung', () => {
    const scene = source('src/components/member/AncestralHall3D.tsx');
    assert.match(scene, /onPointerMissed=\{\(\) => dispatchZoom\(\{ type: 'missed', wasDrag: dragRef\.current\.wasDrag \}\)\}/);
    assert.match(scene, /case 'Escape':\s*onExitRef\.current\(\);/);
    assert.match(scene, /event\.key === 'Escape'\) dispatchZoom\(\{ type: 'escape' \}\)/);
    assert.match(scene, /onClose=\{\(\) => dispatchZoom\(\{ type: 'close' \}\)\}/);
    assert.match(scene, /const DRAG_THRESHOLD = CLICK_DRAG_THRESHOLD;/);
    assert.match(scene, /exceedsDragThreshold\(gesture\.current\.startX/);
    assert.match(scene, /if \(drag\.current\.wasDrag\) return;\s*event\.stopPropagation\(\);\s*onSelect\(ancestor\.id\);/);
  });
});

describe('Thẻ thông tin khi phóng to', () => {
  const ancestor = { name: 'Cụ Dương Văn Tổ', generation: 2, birthDate: '1900-01-02', deathDate: '1970', note: 'Người khai khẩn đất làng.' };

  it('hiện họ tên, đời, ngày sinh, ngày mất, ghi chú và nút Đóng', () => {
    const html = renderToStaticMarkup(<AncestorInfoCard ancestor={ancestor} onClose={() => undefined} />);
    assert.match(html, /Cụ Dương Văn Tổ/);
    assert.match(html, /Đời thứ 2/);
    assert.match(html, /Ngày sinh/);
    assert.match(html, /02\/01\/1900/);
    assert.match(html, /Ngày mất/);
    assert.match(html, /1970/);
    assert.match(html, /Người khai khẩn đất làng\./);
    assert.match(html, /aria-label="Đóng thẻ thông tin"[^>]*>Đóng</);
    assert.doesNotMatch(html, /ngày giỗ/);
  });

  it('thiếu dữ liệu thì ghi "Chưa rõ" / "Chưa có ghi chú", không để trống', () => {
    const html = renderToStaticMarkup(<AncestorInfoCard ancestor={{ name: 'A', generation: 1 }} onClose={() => undefined} />);
    assert.equal((html.match(/Chưa rõ/g) || []).length, 2);
    assert.match(html, /Chưa có ghi chú\./);
  });

  it('ngày giỗ hôm nay thì có dòng báo ngày giỗ âm lịch', () => {
    const html = renderToStaticMarkup(<AncestorInfoCard ancestor={ancestor} memorialToday="17 tháng 1 âm lịch" onClose={() => undefined} />);
    assert.match(html, /Hôm nay là ngày giỗ \(17 tháng 1 âm lịch\)/);
  });
});

/* ------------------------------------------------------------------ */
/* Ảnh đen trắng + viền tối góc trong shader                            */
/* ------------------------------------------------------------------ */

describe('Ảnh thờ đen trắng (shader)', () => {
  const freshShader = () => ({
    uniforms: {} as Record<string, unknown>,
    vertexShader: ShaderLib.basic.vertexShader,
    fragmentShader: ShaderLib.basic.fragmentShader,
  });

  it('shader MeshBasicMaterial của three có đúng các điểm chèn mà bản vá cần', () => {
    for (const token of ['#include <common>', '#include <begin_vertex>']) assert.ok(ShaderLib.basic.vertexShader.includes(token), token);
    for (const token of ['#include <common>', '#include <map_fragment>']) assert.ok(ShaderLib.basic.fragmentShader.includes(token), token);
  });

  it('bản vá thêm uniform, biến UV riêng và đoạn GLSL đen trắng + viền ngay sau map_fragment', () => {
    const uniforms = createPortraitUniforms();
    const shader = freshShader();
    patchPortraitShader(shader, uniforms);
    assert.equal(shader.uniforms.uGray, uniforms.uGray, 'dùng chung đối tượng uniform để đổi giá trị là có hiệu lực ngay');
    assert.equal(shader.uniforms.uVignette, uniforms.uVignette);
    assert.match(shader.vertexShader, /varying vec2 vPortraitUv;/);
    assert.match(shader.vertexShader, /#include <begin_vertex>\nvPortraitUv = uv;/);
    assert.match(shader.fragmentShader, /uniform float uGray;/);
    assert.match(shader.fragmentShader, /uniform float uVignette;/);
    const mapAt = shader.fragmentShader.indexOf('#include <map_fragment>');
    const lumaAt = shader.fragmentShader.indexOf('float pLuma');
    assert.ok(mapAt >= 0 && lumaAt > mapAt, 'xử lý màu phải nằm SAU khi đã nhân ảnh vào diffuseColor');
    assert.match(shader.fragmentShader, /mix\( diffuseColor\.rgb, vec3\( pLuma \), uGray \)/);
    assert.match(shader.fragmentShader, /diffuseColor\.rgb \*= 1\.0 - uVignette \* pEdge;/);
  });

  it('hall.portraitGrayscale = true bật đen trắng + viền tối; false trả về màu gốc', () => {
    const uniforms = createPortraitUniforms();
    assert.deepEqual([uniforms.uGray.value, uniforms.uVignette.value], [0, 0]);
    setPortraitGrayscale(uniforms, true);
    assert.equal(uniforms.uGray.value, 1);
    assert.equal(uniforms.uVignette.value, GRAYSCALE_VIGNETTE);
    assert.ok(GRAYSCALE_VIGNETTE > 0 && GRAYSCALE_VIGNETTE < 1);
    setPortraitGrayscale(uniforms, false);
    assert.deepEqual([uniforms.uGray.value, uniforms.uVignette.value], [0, 0]);
  });

  it('mỗi khung có uniform riêng nhưng chung một chương trình shader', () => {
    const a = createPortraitUniforms();
    const b = createPortraitUniforms();
    setPortraitGrayscale(a, true);
    assert.equal(b.uGray.value, 0);
    assert.ok(PORTRAIT_PROGRAM_KEY.length > 0);
  });

  it('cảnh 3D tự xử lý đen trắng; trang không còn đổi ảnh bằng canvas (không xử lý hai lần)', () => {
    const scene = source('src/components/member/AncestralHall3D.tsx');
    assert.match(scene, /material\.onBeforeCompile = \(shader\) => patchPortraitShader\(shader, portraitUniforms\);/);
    assert.match(scene, /setPortraitGrayscale\(portraitUniforms, grayscale\)/);
    assert.match(scene, /portraitGrayscale = false,/);
    const page = source('src/components/member/DigitalAncestralHallModule.tsx');
    assert.doesNotMatch(page, /toGrayscaleObjectUrl|grayMap|graySources|getImageData/);
    assert.equal((page.match(/portraitGrayscale=\{grayscale\}/g) || []).length, 2, 'cả hai chỗ dùng cảnh 3D đều truyền cài đặt');
    assert.match(page, /const grayscale = !!hall\?\.hall\.portraitGrayscale;/);
    assert.doesNotMatch(source('src/components/member/worshipManage/imageTools.ts'), /toGrayscaleObjectUrl|getImageData/);
  });
});

/* ------------------------------------------------------------------ */
/* thumbnailUrl cho cảnh 3D, portraitUrl chỉ khi phóng to                */
/* ------------------------------------------------------------------ */

describe('Ảnh thu nhỏ và ảnh gốc', () => {
  it('chưa phóng to: chỉ dùng thumbnailUrl, không tải ảnh gốc', () => {
    const r = pickPortraitUrls({ thumbnailUrl: '/t.webp', portraitUrl: '/full.jpg' }, false);
    assert.deepEqual(r, { thumb: '/t.webp', full: '/full.jpg', wantFull: false });
  });

  it('phóng to: tải thêm ảnh gốc', () => {
    const r = pickPortraitUrls({ thumbnailUrl: '/t.webp', portraitUrl: '/full.jpg' }, true);
    assert.equal(r.wantFull, true);
    assert.equal(r.full, '/full.jpg');
  });

  it('thiếu thumbnailUrl thì dùng portraitUrl và không tải lại lần hai khi phóng to', () => {
    for (const zoomed of [false, true]) {
      const r = pickPortraitUrls({ thumbnailUrl: null, portraitUrl: '/full.jpg' }, zoomed);
      assert.deepEqual(r, { thumb: '/full.jpg', full: '/full.jpg', wantFull: false });
    }
    assert.equal(pickPortraitUrls({ thumbnailUrl: '  ', portraitUrl: '/full.jpg' }, true).thumb, '/full.jpg');
  });

  it('chỉ có thumbnailUrl: ảnh gốc là chính nó; không có ảnh nào thì rỗng', () => {
    assert.deepEqual(pickPortraitUrls({ thumbnailUrl: '/t.webp' }, true), { thumb: '/t.webp', full: '/t.webp', wantFull: false });
    assert.deepEqual(pickPortraitUrls({}, true), { thumb: '', full: '', wantFull: false });
    assert.deepEqual(pickPortraitUrls({ thumbnailUrl: ' /t ', portraitUrl: ' /f ' }, true), { thumb: '/t', full: '/f', wantFull: true });
  });

  it('trang tải bản nhỏ cho cảnh 3D và chỉ tải ảnh gốc khi có yêu cầu phóng to', () => {
    const page = source('src/components/member/DigitalAncestralHallModule.tsx');
    assert.match(page, /\.filter\(\(tablet\) => thumbPath\(tablet\) && isApiRelativePath\(thumbPath\(tablet\)\)\)/);
    assert.match(page, /thumbPath = \(tablet: TabletItem\): string => \(tablet\.thumbnailUrl \|\| tablet\.portraitUrl \|\| ''\)\.trim\(\)/);
    assert.match(page, /onZoomChange=\{handleZoomChange\}/);
    assert.match(page, /if \(!path \|\| !isApiRelativePath\(path\) \|\| path === thumbPath\(tablet\)\)/);
    const scene = source('src/components/member/AncestralHall3D.tsx');
    assert.match(scene, /const urls = pickPortraitUrls\(ancestor, zoomed\);/);
    assert.match(scene, /if \(!urls\.wantFull\) return undefined;/);
  });
});

/* ------------------------------------------------------------------ */
/* Ngày giỗ: nến sáng hơn, dải hoa; tắt / giảm ở chế độ nhẹ              */
/* ------------------------------------------------------------------ */

describe('Hiệu ứng ngày giỗ', () => {
  const tablets = [
    { id: 'tet', deathDate: '2000-02-05' }, // mất đúng mùng 1 Tết -> giỗ mùng 1 Tết
    { id: 'nam', deathDate: '1941' }, // chỉ có năm: không đổi được
    { id: 'trong', deathDate: null },
    { id: 'homnay', deathDate: '2026-02-17' }, // chính ngày mất
    { id: 'hu', deathDate: 'không rõ' },
  ];

  it('hôm nay 17/02/2026 (mùng 1 Tết): chỉ bài vị mất mùng 1 Tết có giỗ; thiếu ngày thì lặng lẽ bỏ qua', () => {
    const ids = memorialIdsOf(tablets, { y: 2026, m: 2, d: 17 });
    assert.deepEqual([...ids], ['tet']);
  });

  it('ngày thường thì không bài vị nào có hiệu ứng', () => {
    assert.equal(memorialIdsOf(tablets, { y: 2026, m: 2, d: 20 }).size, 0);
  });

  it('chuyển ngày theo giờ Việt Nam: 23:30 hôm trước chưa giỗ, 00:30 hôm sau đã giỗ', () => {
    assert.equal(memorialIdsOf(tablets, vietnamToday(new Date('2026-02-16T16:30:00Z'))).size, 0);
    assert.equal(memorialIdsOf(tablets, vietnamToday(new Date('2026-02-16T17:30:00Z'))).has('tet'), true);
  });

  it('đèn điểm thật chỉ cho tối đa 2 bài vị giỗ ở chế độ high; chế độ nhẹ không có đèn nào', () => {
    const order = ['a', 'b', 'c', 'd'];
    const memorial = new Set(['a', 'c', 'd']);
    assert.equal(MAX_MEMORIAL_LIGHTS, 2);
    assert.deepEqual([...pickLitMemorials(order, memorial, true)], ['a', 'c']);
    assert.equal(pickLitMemorials(order, memorial, false).size, 0);
    assert.equal(pickLitMemorials(order, new Set(), true).size, 0);
  });

  it('dải hoa: võng nhẹ, hai đầu bằng nhau; chế độ nhẹ dùng ít hoa hơn', () => {
    const high = garlandLayout(11, 0.42, 0.03);
    const low = garlandLayout(6, 0.42, 0.03);
    assert.equal(high.length, 11);
    assert.equal(low.length, 6);
    assert.ok(low.length < high.length);
    assert.ok(Math.abs(high[0].y) < 1e-12);
    assert.ok(Math.abs(high[10].y) < 1e-12);
    assert.ok(Math.min(...high.map((f) => f.y)) <= -0.029);
    assert.ok(Math.abs(high[0].x + high[10].x) < 1e-12 && Math.abs(high[10].x - high[0].x - 0.42) < 1e-12);
    assert.ok(new Set(high.map((f) => f.tone)).size === 3, 'đủ ba màu hoa');
    assert.equal(garlandLayout(0, 0.4, 0.03).length, 2);
  });

  it('cảnh 3D: kính phản chiếu thật, đèn điểm và nhấp nháy chỉ ở chế độ high / khi không giảm chuyển động', () => {
    const scene = source('src/components/member/AncestralHall3D.tsx');
    assert.match(scene, /\{high && <mesh geometry=\{geo\.glass\} material=\{mat\.glass\}/);
    assert.match(scene, /const animate = high && !reduced;/);
    assert.match(scene, /withLight=\{memorialLight && high && !reduced\}/);
    assert.match(scene, /garlandLayout\(high \? 11 : 6, 0\.42, 0\.03\)/);
    assert.match(scene, /const flicker = high && !reduced \?/);
    assert.match(scene, /memorialIdsOf\(tiers\.slice\(0, MAX_TIERS\)\.flatMap/);
  });

  it('khung dày hơn, có gờ viền vàng và lớp kính phủ ảnh', () => {
    const scene = source('src/components/member/AncestralHall3D.tsx');
    assert.match(scene, /depth: 0\.052,/);
    assert.match(scene, /geometry=\{geo\.frameRim\} material=\{frameMat\}/);
    assert.match(scene, /new MeshPhysicalMaterial\(\{[^}]*clearcoat: 1/s);
    assert.match(scene, /material=\{mat\.glassStreak\}/);
  });
});

/* ------------------------------------------------------------------ */
/* Bàn thờ 2D đã bị xóa: không WebGL / 3D lỗi thì chỉ có thông báo + danh sách chữ */
/* ------------------------------------------------------------------ */

describe('Không còn chế độ Bàn thờ 2D', () => {
  it('thông báo thay khung 3D: nói rõ chưa hỗ trợ 3D, kèm tên và ngày mất dạng chữ', () => {
    const html = renderToStaticMarkup(
      <Hall3DUnavailable
        items={[
          { id: 'a', name: 'Cụ Dương Văn Tổ', deathDate: '1941-03-12' },
          { id: 'b', name: 'Cụ bà Nguyễn Thị Cả', deathDate: '1950' },
          { id: 'c', name: 'Người chưa rõ', deathDate: null },
        ]}
      />
    );
    assert.match(html, /Thiết bị của bạn chưa hỗ trợ hiển thị 3D\./);
    assert.match(html, /Vui lòng dùng trình duyệt mới hơn/);
    assert.match(html, /Cụ Dương Văn Tổ/);
    assert.match(html, /Mất: 12\/03\/1941/);
    assert.match(html, /Mất: 1950/);
    assert.match(html, /Mất: chưa rõ/);
    assert.match(html, /role="status"/);
    assert.equal((html.match(/<li/g) || []).length, 3);
  });

  it('chưa có bài vị nào thì chỉ có thông báo, không có danh sách trống', () => {
    const html = renderToStaticMarkup(<Hall3DUnavailable items={[]} />);
    assert.match(html, /chưa hỗ trợ hiển thị 3D/);
    assert.doesNotMatch(html, /<ul/);
  });

  it('trang không còn nút chuyển 2D/3D, bàn thờ 2D hay trạng thái prefer3D', () => {
    const page = source('src/components/member/DigitalAncestralHallModule.tsx');
    for (const gone of [/Bàn thờ 2D/, /Phòng thờ 3D<\/button>/, /prefer3D|setPrefer3D/, /altar2D/, /digital-altar-card/, /hall3d-mode/, /altar-lantern/, /digital-incense-burner/, /incense-smoke/]) {
      assert.doesNotMatch(page, gone, String(gone));
    }
    assert.match(page, /const show3D = webglOk && !hall3DFailed;/);
    assert.equal((page.match(/<Hall3DUnavailable/g) || []).length, 1);
    assert.equal((page.match(/unavailable3D/g) || []).length, 3, 'định nghĩa + dùng ở bố cục rỗng và bố cục chính');
    assert.match(page, /\{altar3D\}/);
  });

  it('CSS của bàn thờ 2D và nút chuyển chế độ đã bị xóa; phần dùng chung với 3D vẫn còn', () => {
    const css = source('src/components/member/DigitalAncestralHallModule.css');
    for (const gone of [/digital-altar-card/, /digital-altar-glow/, /digital-altar-tablet/, /altar-offering/, /altar-lantern/, /digital-incense-burner/, /incense-pot/, /incense-smoke/, /incenseSmoke|incenseEmber/, /hall3d-mode/]) {
      assert.doesNotMatch(css, gone, String(gone));
    }
    for (const kept of [/\.digital-altar-actions/, /\.light-incense-button/, /\.write-memorial-button/, /\.hall3d-section/, /\.hall3d-unsupported/, /\.hall3d-caption/]) {
      assert.match(css, kept, String(kept));
    }
  });

  it('thông tin tổ tiên phía trên, danh sách chọn, thắp hương, lời viếng, quản lý bàn thờ và demo vẫn còn', () => {
    const page = source('src/components/member/DigitalAncestralHallModule.tsx');
    for (const kept of [
      /className="ancestor-focus-card"/, /Xem thông tin/, /Mở tư liệu tổ tiên/, /className="ancestor-selector"/,
      /Thắp hương/, /Viết lời viếng/, /<ManageEntryButton/, /<ManagePanelHost/, /import\('\.\/worshipManage\/worshipDemo'\)/,
    ]) {
      assert.match(page, kept, String(kept));
    }
    // Cả bố cục chưa có bài vị lẫn bố cục chính đều dùng chung altarActions (thắp hương, lời viếng, Quản lý bàn thờ).
    assert.ok((page.match(/\{altarActions\}/g) || []).length >= 2);
  });
});
