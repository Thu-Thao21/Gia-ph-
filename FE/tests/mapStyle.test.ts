// Test chọn nền bản đồ (MapTiler khi có khóa, OpenFreeMap khi thiếu/rỗng) và che khóa trong thông báo lỗi.
// Dùng khóa GIẢ; không đọc FE/.env.local.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  MAPTILER_LIGHT_STYLE_ID,
  MAPTILER_SATELLITE_STYLE_ID,
  MAPTILER_STYLE_ID,
  OPENFREEMAP_STYLE_URL,
  basemapNotice,
  getBasemap,
  normalizeMapTilerKey,
  openFreeMapBasemap,
  resolveBasemap,
  sanitizeMapError,
} from '../src/components/worldmap/mapStyle';

const FAKE_KEY = 'FAKEKEY0123456789abcdef';
const root = process.cwd();

describe('resolveBasemap: chọn nền theo khóa', () => {
  // THAY ĐỔI CÓ CHỦ ĐÍCH (nhiệm vụ nâng cấp giao diện bản đồ): nền mặc định đổi từ "streets-v4" sang
  // "basic-v2-light" (nhẹ, màu dịu, ít chi tiết đường — để điểm dòng họ nổi bật). "streets-v4" vẫn giữ
  // nguyên export MAPTILER_STYLE_ID, nay chỉ còn vai trò dự phòng nội bộ khi "kind" không hợp lệ.
  it('có khóa, không truyền kind -> MapTiler, style nhẹ mặc định (basic-v2-light), khóa nằm trong query ?key=', () => {
    const b = resolveBasemap(FAKE_KEY);
    assert.equal(b.provider, 'maptiler');
    assert.equal(b.fallbackReason, null);
    assert.equal(b.styleUrl, `https://api.maptiler.com/maps/${MAPTILER_LIGHT_STYLE_ID}/style.json?key=${FAKE_KEY}`);
    assert.equal(MAPTILER_LIGHT_STYLE_ID, 'basic-v2-light');
  });

  it('kind="map" tường minh -> giống hệt mặc định (style nhẹ)', () => {
    assert.equal(resolveBasemap(FAKE_KEY, 'map').styleUrl, resolveBasemap(FAKE_KEY).styleUrl);
  });

  it('kind="satellite" -> style vệ tinh (hybrid)', () => {
    const b = resolveBasemap(FAKE_KEY, 'satellite');
    assert.equal(b.provider, 'maptiler');
    assert.equal(b.styleUrl, `https://api.maptiler.com/maps/${MAPTILER_SATELLITE_STYLE_ID}/style.json?key=${FAKE_KEY}`);
    assert.equal(MAPTILER_SATELLITE_STYLE_ID, 'hybrid');
  });

  it('kind lạ (không phải map/satellite) -> rơi về style dự phòng streets-v4, không để bản đồ trắng', () => {
    const b = resolveBasemap(FAKE_KEY, 'khong-ton-tai' as never);
    assert.equal(b.styleUrl, `https://api.maptiler.com/maps/${MAPTILER_STYLE_ID}/style.json?key=${FAKE_KEY}`);
  });

  it('khóa có khoảng trắng hai đầu được cắt; ký tự đặc biệt được mã hóa URL', () => {
    assert.match(resolveBasemap(`  ${FAKE_KEY}\n`).styleUrl, new RegExp(`key=${FAKE_KEY}$`));
    assert.match(resolveBasemap('a&b=c').styleUrl, /key=a%26b%3Dc$/);
  });

  it('không có khóa (undefined/null) -> OpenFreeMap, lý do no-key', () => {
    for (const raw of [undefined, null]) {
      const b = resolveBasemap(raw);
      assert.deepEqual(b, { provider: 'openfreemap', styleUrl: OPENFREEMAP_STYLE_URL, fallbackReason: 'no-key' });
    }
  });

  it('khóa rỗng hoặc chỉ khoảng trắng -> OpenFreeMap', () => {
    assert.equal(resolveBasemap('').provider, 'openfreemap');
    assert.equal(resolveBasemap('   ').provider, 'openfreemap');
    assert.equal(resolveBasemap('\t\n').fallbackReason, 'no-key');
  });

  it('giá trị mẫu trong .env.example (your_key_here) coi như chưa cấu hình', () => {
    assert.equal(resolveBasemap('your_key_here').provider, 'openfreemap');
    assert.equal(resolveBasemap('YOUR_KEY_HERE').provider, 'openfreemap');
  });

  it('kiểu không phải chuỗi (số, boolean, object) -> OpenFreeMap, không ném lỗi', () => {
    for (const raw of [123, true, {}, []]) assert.equal(resolveBasemap(raw).provider, 'openfreemap');
  });

  it('URL nền dự phòng là OpenFreeMap liberty và không chứa khóa', () => {
    const b = resolveBasemap(undefined);
    assert.equal(b.styleUrl, 'https://tiles.openfreemap.org/styles/liberty');
    assert.ok(!b.styleUrl.includes('key='));
  });
});

describe('normalizeMapTilerKey', () => {
  it('trả khóa đã cắt, hoặc null khi thiếu', () => {
    assert.equal(normalizeMapTilerKey(` ${FAKE_KEY} `), FAKE_KEY);
    assert.equal(normalizeMapTilerKey(''), null);
    assert.equal(normalizeMapTilerKey(undefined), null);
  });
});

describe('getBasemap (đọc import.meta.env)', () => {
  it('trong môi trường test không có VITE_MAPTILER_API_KEY nên dùng OpenFreeMap và bản đồ không vỡ', () => {
    const b = getBasemap();
    assert.equal(b.provider, 'openfreemap');
    assert.equal(b.fallbackReason, 'no-key');
  });
});

describe('basemapNotice: dòng ghi chú nhỏ', () => {
  it('không có khóa -> có ghi chú; có khóa -> không ghi chú', () => {
    assert.match(basemapNotice(resolveBasemap(undefined)) ?? '', /OpenFreeMap.*chưa cấu hình khóa MapTiler/);
    assert.equal(basemapNotice(resolveBasemap(FAKE_KEY)), null);
  });
  it('khóa bị MapTiler từ chối -> ghi chú riêng, không lộ khóa', () => {
    const note = basemapNotice(openFreeMapBasemap('key-failed')) ?? '';
    assert.match(note, /Không tải được nền MapTiler/);
    assert.ok(!note.includes('key='));
  });
});

describe('sanitizeMapError: che khóa trong thông báo lỗi', () => {
  it('che giá trị ?key= và &key=, giữ phần còn lại của URL', () => {
    const msg = `AJAXError: Forbidden (403): https://api.maptiler.com/maps/streets-v4/style.json?key=${FAKE_KEY}`;
    const out = sanitizeMapError(msg);
    assert.ok(!out.includes(FAKE_KEY));
    assert.match(out, /style\.json\?key=\*\*\*$/);
    assert.equal(sanitizeMapError(`https://x/y?a=1&key=${FAKE_KEY}&b=2`), 'https://x/y?a=1&key=***&b=2');
  });
  it('che nhiều khóa trong một thông báo; không đổi thông báo không có khóa', () => {
    assert.equal(sanitizeMapError(`a?key=AAA b?key=BBB`), 'a?key=*** b?key=***');
    assert.equal(sanitizeMapError('Failed to fetch'), 'Failed to fetch');
  });
  it('đầu vào không phải chuỗi -> chuỗi rỗng', () => {
    assert.equal(sanitizeMapError(undefined), '');
    assert.equal(sanitizeMapError(new Error('x')), '');
  });
});

describe('không hardcode khóa', () => {
  const dir = join(root, 'src/components/worldmap');
  const files = readdirSync(dir).filter((n) => /\.(ts|tsx|css)$/.test(n));
  it('mã bản đồ không chứa chuỗi giống khóa thật (key=<20+ ký tự>)', () => {
    assert.ok(files.length > 0);
    for (const name of files) {
      const text = readFileSync(join(dir, name), 'utf8');
      assert.ok(!/key=[A-Za-z0-9]{16,}/.test(text), `${name} có chuỗi giống khóa`);
    }
  });
  it('.env.example chỉ có giá trị giả cho VITE_MAPTILER_API_KEY', () => {
    const text = readFileSync(join(root, '.env.example'), 'utf8');
    assert.match(text, /^VITE_MAPTILER_API_KEY=your_key_here\s*$/m);
  });
});
