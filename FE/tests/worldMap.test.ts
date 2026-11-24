// Test logic thuần của bản đồ thế giới (gom dữ liệu, GeoJSON, khung nhìn, chú giải/bộ lọc, thống kê, kích
// thước cụm, popup, ?demo=1). Không cần WebGL/DOM: chỉ import worldMapData.ts và dữ liệu demo.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ClanLocation, PersonBurial } from '../src/types/location';
import {
  CATEGORY_META,
  CATEGORY_ORDER,
  DEFAULT_VIEWPORT_MAX_ZOOM,
  DEFAULT_VISIBLE_CATEGORY,
  NO_ADDRESS_TEXT,
  SOUTHEAST_ASIA_MAX_BOUNDS,
  VIEWPORT_PADDING,
  VIEWPORT_PADDING_VIETNAM_FALLBACK,
  VIETNAM_BOUNDS,
  buildFitBoundsOptions,
  buildLegend,
  buildPopupModel,
  burialsToPoints,
  clampViewportPadding,
  clusterSizeBucket,
  computeBounds,
  computeDefaultViewport,
  escapeHtml,
  filterPointsByCategory,
  formatBurialDate,
  formatCoordinatesText,
  formatMapStats,
  hasUsableSize,
  isDemoRequested,
  isValidCoordinate,
  isWithinVietnam,
  locationsToPoints,
  mergePoints,
  renderPopupHtml,
  toFeatureCollection,
  viewportPaddingFor,
  type WorldMapPoint,
} from '../src/components/worldmap/worldMapData';
import { DEMO_BURIALS, DEMO_LOCATIONS } from '../src/components/worldmap/worldMapDemo';
import { buildMarkerIconSvg } from '../src/components/worldmap/markerIcons';

const loc = (over: Partial<ClanLocation> = {}): ClanLocation => ({
  id: 'l1',
  clanId: 'c1',
  name: 'Nhà thờ họ',
  locationType: 'ANCESTRAL_HALL',
  address: '1 Đường Làng',
  latitude: 21.0,
  longitude: 105.8,
  privacyLevel: 'CLAN_ONLY',
  ...over,
});

const burial = (over: Partial<PersonBurial> = {}): PersonBurial => ({
  burialId: 'b1',
  personId: 'p1',
  cemeteryName: 'Nghĩa trang A',
  address: 'Xã B',
  latitude: 16.0,
  longitude: 108.0,
  privacyLevel: 'CLAN_ONLY',
  ...over,
});

describe('isValidCoordinate', () => {
  it('chấp nhận tọa độ thật, kể cả vĩ độ/kinh độ âm', () => {
    assert.equal(isValidCoordinate(21, 105), true);
    assert.equal(isValidCoordinate(-33.86, 151.2), true);
    assert.equal(isValidCoordinate(37.3, -121.8), true);
  });
  it('loại NaN, Infinity, ngoài miền, (0,0) và kiểu không phải số', () => {
    assert.equal(isValidCoordinate(NaN, 1), false);
    assert.equal(isValidCoordinate(1, Infinity), false);
    assert.equal(isValidCoordinate(91, 0), false);
    assert.equal(isValidCoordinate(0, 181), false);
    assert.equal(isValidCoordinate(0, 0), false);
    assert.equal(isValidCoordinate('21' as unknown, 105), false);
    assert.equal(isValidCoordinate(null, null), false);
  });
  it('cho phép vĩ độ 0 hoặc kinh độ 0 riêng lẻ (xích đạo / kinh tuyến gốc)', () => {
    assert.equal(isValidCoordinate(0, 105), true);
    assert.equal(isValidCoordinate(51.5, 0), true);
  });
});

describe('locationsToPoints', () => {
  it('đổi địa điểm dòng họ thành điểm bản đồ, giữ loại/tên/địa chỉ/tọa độ, không có ảnh bìa/ngày an táng', () => {
    const [p] = locationsToPoints([loc()]);
    assert.deepEqual(p, {
      id: 'loc:l1',
      kind: 'clan-location',
      category: 'ANCESTRAL_HALL',
      name: 'Nhà thờ họ',
      address: '1 Đường Làng',
      latitude: 21.0,
      longitude: 105.8,
      coverPhotoUrl: null,
      burialDateIso: null,
    });
  });
  it('lấy ảnh đầu tiên khác rỗng trong photoUrls làm ảnh bìa', () => {
    const [p] = locationsToPoints([loc({ photoUrls: ['  ', 'https://x/a.jpg', 'https://x/b.jpg'] })]);
    assert.equal(p.coverPhotoUrl, 'https://x/a.jpg');
  });
  it('bỏ bản ghi thiếu/sai tọa độ, chịu được null/undefined', () => {
    const out = locationsToPoints([loc({ id: 'ok' }), loc({ id: 'x', latitude: 0, longitude: 0 }), loc({ id: 'y', latitude: NaN })]);
    assert.deepEqual(out.map((p) => p.id), ['loc:ok']);
    assert.deepEqual(locationsToPoints(null), []);
    assert.deepEqual(locationsToPoints(undefined), []);
  });
  it('loại địa điểm lạ hoặc "BURIAL" giả mạo rơi về OTHER; tên rỗng có tên thay thế', () => {
    const [a, b] = locationsToPoints([
      loc({ id: 'a', locationType: 'WHATEVER' as never }),
      loc({ id: 'b', locationType: 'BURIAL' as never, name: '   ' }),
    ]);
    assert.equal(a.category, 'OTHER');
    assert.equal(b.category, 'OTHER');
    assert.equal(b.name, 'Địa điểm chưa đặt tên');
  });
});

describe('burialsToPoints', () => {
  it('đặt tên theo người, nếu không có thì theo nghĩa trang, cuối cùng là "Mộ phần"', () => {
    const out = burialsToPoints([
      { burial: burial({ burialId: '1' }), personName: 'Nguyễn Văn A' },
      { burial: burial({ burialId: '2' }) },
      { burial: burial({ burialId: '3', cemeteryName: null }) },
    ]);
    assert.deepEqual(out.map((p) => p.name), ['Mộ Nguyễn Văn A', 'Nghĩa trang A', 'Mộ phần']);
    assert.ok(out.every((p) => p.kind === 'burial' && p.category === 'BURIAL'));
  });
  it('mang theo ảnh bìa và ngày an táng (ISO) để popup hiển thị', () => {
    const [p] = burialsToPoints([{ burial: burial({ photoUrls: ['https://x/mo.jpg'], burialDate: '1998-03-02' }) }]);
    assert.equal(p.coverPhotoUrl, 'https://x/mo.jpg');
    assert.equal(p.burialDateIso, '1998-03-02');
  });
  it('bỏ mộ chưa có tọa độ', () => {
    assert.deepEqual(burialsToPoints([{ burial: burial({ latitude: 0, longitude: 0 }) }]), []);
    assert.deepEqual(burialsToPoints(undefined), []);
  });
});

describe('mergePoints', () => {
  it('nối các lớp và bỏ điểm trùng id (giữ điểm đến trước)', () => {
    const a = locationsToPoints([loc({ id: '1', name: 'Một' })]);
    const b = locationsToPoints([loc({ id: '1', name: 'Trùng' }), loc({ id: '2', name: 'Hai' })]);
    const out = mergePoints(a, null, b);
    assert.deepEqual(out.map((p) => p.name), ['Một', 'Hai']);
  });
  it('lớp mộ phần thêm vào mà không đổi lớp địa điểm', () => {
    const locs = locationsToPoints([loc()]);
    const graves = burialsToPoints([{ burial: burial() }]);
    assert.equal(mergePoints(locs, graves).length, 2);
    assert.equal(mergePoints(locs).length, 1);
  });
});

describe('filterPointsByCategory (chip chú giải dùng để bật/tắt lớp)', () => {
  const pts = mergePoints(
    locationsToPoints([loc({ id: '1', locationType: 'ANCESTRAL_HALL' }), loc({ id: '2', locationType: 'HOMELAND' })]),
    burialsToPoints([{ burial: burial() }]),
  );
  it('hidden rỗng/undefined/null -> giữ nguyên tất cả', () => {
    assert.equal(filterPointsByCategory(pts, new Set()).length, 3);
    assert.equal(filterPointsByCategory(pts, undefined).length, 3);
    assert.equal(filterPointsByCategory(pts, null).length, 3);
  });
  it('ẩn đúng loại được chọn, giữ nguyên các loại khác', () => {
    const out = filterPointsByCategory(pts, new Set(['BURIAL']));
    assert.equal(out.length, 2);
    assert.ok(out.every((p) => p.category !== 'BURIAL'));
  });
  it('ẩn nhiều loại cùng lúc', () => {
    const out = filterPointsByCategory(pts, new Set(['BURIAL', 'HOMELAND']));
    assert.deepEqual(out.map((p) => p.category), ['ANCESTRAL_HALL']);
  });
});

describe('toFeatureCollection', () => {
  it('GeoJSON dùng thứ tự [kinh độ, vĩ độ], mang theo icon/ảnh bìa/ngày an táng cho popup', () => {
    const fc = toFeatureCollection(locationsToPoints([loc({ latitude: 21, longitude: 105.8 })]));
    assert.equal(fc.type, 'FeatureCollection');
    assert.deepEqual(fc.features[0].geometry.coordinates, [105.8, 21]);
    assert.equal(fc.features[0].properties.category, 'ANCESTRAL_HALL');
    assert.equal(fc.features[0].properties.name, 'Nhà thờ họ');
    assert.equal(fc.features[0].properties.icon, 'hall');
    assert.equal(fc.features[0].properties.coverPhotoUrl, null);
  });
  it('icon suy ra đúng từ category: cùng nhóm hall dùng chung 1 icon id', () => {
    const [a, b] = toFeatureCollection(
      locationsToPoints([
        loc({ id: 'a', locationType: 'ANCESTRAL_HALL' }),
        loc({ id: 'b', locationType: 'BRANCH_HALL' }),
      ]),
    ).features;
    assert.equal(a.properties.icon, 'hall');
    assert.equal(b.properties.icon, 'hall');
  });
  it('rỗng cho danh sách rỗng', () => {
    assert.deepEqual(toFeatureCollection([]).features, []);
  });
});

describe('computeBounds', () => {
  it('null khi không có điểm', () => {
    assert.equal(computeBounds([]), null);
  });
  it('ôm trọn các điểm trên nhiều quốc gia, kể cả tọa độ âm', () => {
    const pts = locationsToPoints([
      loc({ id: '1', latitude: 21, longitude: 105.8 }),
      loc({ id: '2', latitude: 37.3, longitude: -121.9 }),
      loc({ id: '3', latitude: -33.9, longitude: 151.2 }),
    ]);
    assert.deepEqual(computeBounds(pts), [
      [-121.9, -33.9],
      [151.2, 37.3],
    ]);
  });
  it('một điểm cho khung suy biến (tây = đông, nam = bắc)', () => {
    const b = computeBounds(locationsToPoints([loc()]));
    assert.deepEqual(b, [
      [105.8, 21],
      [105.8, 21],
    ]);
  });
});

// THAY ĐỔI CÓ CHỦ ĐÍCH (nhiệm vụ "dễ dùng cho người lớn tuổi, trọng tâm mộ phần"): buildLegend quay lại chỉ
// liệt kê loại CÓ dữ liệu (ẩn hẳn — không làm mờ — loại 0 điểm), và CATEGORY_ORDER nay đặt "Mộ phần" lên đầu
// để chip "Mộ phần" luôn đứng đầu chú giải.
describe('buildLegend (chỉ liệt kê loại có dữ liệu — ẩn hẳn loại 0 điểm; Mộ phần luôn đứng đầu)', () => {
  it('"Mộ phần" đứng đầu CATEGORY_ORDER', () => {
    assert.equal(CATEGORY_ORDER[0], 'BURIAL');
    assert.equal(DEFAULT_VISIBLE_CATEGORY, 'BURIAL');
  });
  it('chỉ liệt kê loại có điểm, đúng thứ tự CATEGORY_ORDER (Mộ phần trước), đếm đúng', () => {
    const pts = mergePoints(
      locationsToPoints([
        loc({ id: '1', locationType: 'HOMELAND' }),
        loc({ id: '2', locationType: 'ANCESTRAL_HALL' }),
        loc({ id: '3', locationType: 'HOMELAND' }),
      ]),
      burialsToPoints([{ burial: burial() }]),
    );
    const legend = buildLegend(pts);
    assert.deepEqual(
      legend.map((e) => [e.category, e.count]),
      [
        ['BURIAL', 1],
        ['ANCESTRAL_HALL', 1],
        ['HOMELAND', 2],
      ],
    );
    assert.equal(legend[0].label, 'Mộ phần');
  });
  it('rỗng khi không có điểm nào (không còn chip mờ)', () => {
    assert.deepEqual(buildLegend([]), []);
  });
  it('loại 0 điểm bị bỏ hẳn khỏi danh sách, kể cả khi các loại khác có dữ liệu', () => {
    const legend = buildLegend(burialsToPoints([{ burial: burial() }]));
    assert.deepEqual(legend.map((e) => e.category), ['BURIAL']);
  });
  it('bảng màu: nhà thờ/từ đường tím, mộ phần đỏ, quê hương/di tích chung 1 màu riêng — không trùng 2 màu kia', () => {
    const { ANCESTRAL_HALL, BRANCH_HALL, HOMELAND, HISTORIC_SITE, BURIAL } = CATEGORY_META;
    assert.equal(ANCESTRAL_HALL.color, BRANCH_HALL.color, 'nhà thờ và từ đường cùng màu');
    assert.equal(HOMELAND.color, HISTORIC_SITE.color, 'quê hương và di tích cùng màu');
    assert.notEqual(BURIAL.color, ANCESTRAL_HALL.color);
    assert.notEqual(BURIAL.color, HOMELAND.color);
    assert.notEqual(ANCESTRAL_HALL.color, HOMELAND.color);
  });
});

// THAY ĐỔI CÓ CHỦ ĐÍCH: thống kê nay ưu tiên mộ phần ("N mộ phần" mặc định), chỉ nói thêm địa điểm dòng họ khi
// có bật thêm lớp đó. Nhận điểm ĐÃ LỌC theo chú giải (visiblePoints), không phải toàn bộ điểm.
describe('formatMapStats (ưu tiên mộ phần — mặc định chỉ "N mộ phần")', () => {
  it('chỉ có mộ phần đang hiện -> "N mộ phần" (không có "· 0 địa điểm")', () => {
    const pts = burialsToPoints([
      { burial: burial({ burialId: '1' }) },
      { burial: burial({ burialId: '2' }) },
      { burial: burial({ burialId: '3' }) },
    ]);
    assert.equal(formatMapStats(pts), '3 mộ phần');
  });
  it('có bật thêm địa điểm dòng họ -> "N mộ phần · M địa điểm dòng họ"', () => {
    const pts = mergePoints(
      locationsToPoints([loc({ id: '1' }), loc({ id: '2', locationType: 'HOMELAND' })]),
      burialsToPoints([{ burial: burial() }]),
    );
    assert.equal(formatMapStats(pts), '1 mộ phần · 2 địa điểm dòng họ');
  });
  it('0 điểm -> "0 mộ phần"', () => {
    assert.equal(formatMapStats([]), '0 mộ phần');
  });
  it('chỉ có địa điểm dòng họ, không có mộ phần nào đang hiện -> "0 mộ phần · M địa điểm dòng họ"', () => {
    assert.equal(formatMapStats(locationsToPoints([loc()])), '0 mộ phần · 1 địa điểm dòng họ');
  });
});

describe('computeDefaultViewport (khung nhìn mặc định — CHỈ tính theo mộ phần)', () => {
  const hanoi = burial({ burialId: 'hanoi', latitude: 21.0285, longitude: 105.8542 });
  const hcmc = burial({ burialId: 'hcmc', latitude: 10.7769, longitude: 106.7009 });
  const paris = burial({ burialId: 'paris', latitude: 48.8566, longitude: 2.3522 });

  it('không có mộ nào -> khung Việt Nam, không giới hạn zoom riêng, CÓ maxBounds Đông Nam Á, isVietnamFallback=true', () => {
    assert.deepEqual(computeDefaultViewport([]), {
      bounds: VIETNAM_BOUNDS,
      maxZoom: undefined,
      maxBounds: SOUTHEAST_ASIA_MAX_BOUNDS,
      isVietnamFallback: true,
    });
  });
  it('1 mộ trong nước -> khung suy biến về đúng điểm đó, giới hạn maxZoom ~12-13 để còn thấy tỉnh/thành, có maxBounds', () => {
    const [p] = burialsToPoints([{ burial: hanoi }]);
    const v = computeDefaultViewport([p]);
    assert.deepEqual(v.bounds, [
      [105.8542, 21.0285],
      [105.8542, 21.0285],
    ]);
    assert.equal(v.maxZoom, DEFAULT_VIEWPORT_MAX_ZOOM);
    assert.ok(DEFAULT_VIEWPORT_MAX_ZOOM >= 12 && DEFAULT_VIEWPORT_MAX_ZOOM <= 13, 'maxZoom phải trong khoảng 12-13');
    assert.deepEqual(v.maxBounds, SOUTHEAST_ASIA_MAX_BOUNDS);
    assert.equal(v.isVietnamFallback, false);
  });
  it('nhiều mộ trong nước nhưng rất gần nhau (cùng 1 khu) -> vẫn giới hạn maxZoom như 1 mộ, có maxBounds', () => {
    const pts = burialsToPoints([
      { burial: { ...hanoi, burialId: 'a', latitude: 21.02, longitude: 105.85 } },
      { burial: { ...hanoi, burialId: 'b', latitude: 21.05, longitude: 105.88 } },
    ]);
    const v = computeDefaultViewport(pts);
    assert.equal(v.maxZoom, DEFAULT_VIEWPORT_MAX_ZOOM);
    assert.deepEqual(v.maxBounds, SOUTHEAST_ASIA_MAX_BOUNDS);
  });
  it('mộ trong nước trải rộng (Hà Nội & TP.HCM) -> khung ôm đúng 2 điểm đó (tự nhiên nằm trong khung VN), không giới hạn maxZoom riêng nhưng vẫn có maxBounds (toàn bộ mộ trong nước)', () => {
    const pts = burialsToPoints([{ burial: hanoi }, { burial: hcmc }]);
    const v = computeDefaultViewport(pts);
    assert.deepEqual(v.bounds, [
      [105.8542, 10.7769],
      [106.7009, 21.0285],
    ]);
    assert.equal(v.maxZoom, undefined);
    assert.deepEqual(v.maxBounds, SOUTHEAST_ASIA_MAX_BOUNDS);
    // "không zoom ra quá khung Việt Nam": khung ôm mộ luôn là tập con của khung Việt Nam khi mộ trong nước.
    assert.ok(v.bounds[0][0] >= VIETNAM_BOUNDS[0][0] && v.bounds[1][0] <= VIETNAM_BOUNDS[1][0]);
    assert.ok(v.bounds[0][1] >= VIETNAM_BOUNDS[0][1] && v.bounds[1][1] <= VIETNAM_BOUNDS[1][1]);
  });
  it('có mộ hải ngoại -> ôm hết mọi mộ (kể cả ngoài khung Việt Nam), không giới hạn maxZoom, KHÔNG có maxBounds (không khoá kéo bản đồ)', () => {
    const pts = burialsToPoints([{ burial: hanoi }, { burial: paris }]);
    const v = computeDefaultViewport(pts);
    assert.deepEqual(v.bounds, [
      [2.3522, 21.0285],
      [105.8542, 48.8566],
    ]);
    assert.equal(v.maxZoom, undefined);
    assert.equal(v.maxBounds, undefined);
  });
  it('1 mộ hải ngoại lẻ -> khung suy biến, KHÔNG giới hạn maxZoom lẫn maxBounds (chỉ áp dụng cho mộ trong nước)', () => {
    const [p] = burialsToPoints([{ burial: paris }]);
    const v = computeDefaultViewport([p]);
    assert.equal(v.maxZoom, undefined);
    assert.equal(v.maxBounds, undefined);
  });
  it('trộn nhiều mộ trong nước + 1 mộ hải ngoại -> chỉ cần 1 mộ hải ngoại là bỏ maxBounds cho toàn bộ', () => {
    const pts = burialsToPoints([{ burial: hanoi }, { burial: hcmc }, { burial: paris }]);
    assert.equal(computeDefaultViewport(pts).maxBounds, undefined);
  });
  it('không tính địa điểm dòng họ (chỉ mộ phần) — hàm chỉ nhận đúng mảng được truyền vào, không tự lọc kind', () => {
    // Lưu ý: việc "chỉ truyền mộ phần vào" là trách nhiệm của nơi gọi (WorldMapView lọc theo kind === 'burial'
    // trước khi gọi); hàm này thuần theo input, test này khẳng định hợp đồng đó qua ví dụ cụ thể.
    const [grave] = burialsToPoints([{ burial: hanoi }]);
    const [hall] = locationsToPoints([loc({ latitude: 48.0, longitude: 2.0 })]);
    const v = computeDefaultViewport([grave]); // đúng cách dùng: chỉ truyền mộ phần
    assert.ok(v.bounds[0][0] !== hall.longitude);
  });
});

describe('isWithinVietnam', () => {
  it('toạ độ trong khung Việt Nam (lng 102-110, lat 8-24) -> true', () => {
    assert.equal(isWithinVietnam(21.0285, 105.8542), true); // Hà Nội
    assert.equal(isWithinVietnam(10.7769, 106.7009), true); // TP.HCM
    assert.equal(isWithinVietnam(8, 102), true); // biên dưới
    assert.equal(isWithinVietnam(24, 110), true); // biên trên
  });
  it('toạ độ ngoài khung -> false', () => {
    assert.equal(isWithinVietnam(48.8566, 2.3522), false); // Paris
    assert.equal(isWithinVietnam(37.3, -121.9), false); // California
    assert.equal(isWithinVietnam(7.9, 106), false); // dưới biên lat một chút
  });
});

describe('clusterSizeBucket', () => {
  it('1-9 -> small, 10-49 -> medium, 50+ -> large (đúng ranh giới)', () => {
    assert.equal(clusterSizeBucket(1), 'small');
    assert.equal(clusterSizeBucket(9), 'small');
    assert.equal(clusterSizeBucket(10), 'medium');
    assert.equal(clusterSizeBucket(49), 'medium');
    assert.equal(clusterSizeBucket(50), 'large');
    assert.equal(clusterSizeBucket(500), 'large');
  });
});

describe('formatBurialDate', () => {
  it('ISO "yyyy-mm-dd" (có hoặc không có giờ) -> "dd/mm/yyyy"', () => {
    assert.equal(formatBurialDate('1998-03-02'), '02/03/1998');
    assert.equal(formatBurialDate('1998-03-02T00:00:00Z'), '02/03/1998');
  });
  it('rỗng/null/chuỗi hỏng -> null (không hiện dòng ngày an táng)', () => {
    assert.equal(formatBurialDate(null), null);
    assert.equal(formatBurialDate(undefined), null);
    assert.equal(formatBurialDate(''), null);
    assert.equal(formatBurialDate('không phải ngày'), null);
  });
});

describe('formatCoordinatesText (nút "Sao chép tọa độ")', () => {
  it('6 số thập phân, dạng "vĩ độ, kinh độ"', () => {
    assert.equal(formatCoordinatesText(21.0985, 105.4712), '21.098500, 105.471200');
    assert.equal(formatCoordinatesText(-33.86, 151.2), '-33.860000, 151.200000');
  });
});

describe('popup', () => {
  const p = locationsToPoints([loc({ latitude: 21.5, longitude: 105.25 })])[0];

  it('model có tên, loại, địa chỉ, link chỉ đường, văn bản tọa độ để sao chép', () => {
    const m = buildPopupModel(p);
    assert.equal(m.title, 'Nhà thờ họ');
    assert.equal(m.categoryLabel, 'Nhà thờ đại tộc');
    assert.equal(m.address, '1 Đường Làng');
    assert.equal(m.directionsUrl, 'https://www.google.com/maps/dir/?api=1&destination=21.5,105.25');
    assert.equal(m.directionsLabel, 'Chỉ đường');
    assert.equal(m.coordinatesText, '21.500000, 105.250000');
    assert.equal(m.coverPhotoUrl, null);
    assert.equal(m.burialDateLabel, null);
  });
  it('địa chỉ trống -> dòng "Chưa cập nhật địa chỉ"', () => {
    assert.equal(buildPopupModel({ ...p, address: '  ' }).address, NO_ADDRESS_TEXT);
  });
  it('mộ phần có ngày an táng -> burialDateLabel định dạng dd/mm/yyyy; địa điểm dòng họ thì luôn null dù có truyền ISO', () => {
    const grave = buildPopupModel({ ...p, category: 'BURIAL', burialDateIso: '2001-12-25' });
    assert.equal(grave.burialDateLabel, '25/12/2001');
    const hall = buildPopupModel({ ...p, category: 'ANCESTRAL_HALL', burialDateIso: '2001-12-25' });
    assert.equal(hall.burialDateLabel, null);
  });
  it('HTML chứa nút Chỉ đường mở tab mới an toàn và nút Sao chép tọa độ (data-coordinates)', () => {
    const html = renderPopupHtml(buildPopupModel(p));
    assert.match(html, /<a class="wm-popup-dir" href="https:\/\/www\.google\.com\/maps\/dir\/\?api=1&amp;destination=21\.5,105\.25" target="_blank" rel="noopener noreferrer">Chỉ đường<\/a>/);
    assert.match(html, /Nhà thờ đại tộc/);
    assert.match(html, /<button type="button" class="wm-popup-copy" data-coordinates="21\.500000, 105\.250000">Sao chép tọa độ<\/button>/);
  });
  it('có ảnh bìa -> chèn <div class="wm-popup-cover"> với <img> dự phòng khi lỗi (onerror)', () => {
    const html = renderPopupHtml(buildPopupModel({ ...p, coverPhotoUrl: 'https://x/anh.jpg' }));
    assert.match(html, /<div class="wm-popup-cover"><img src="https:\/\/x\/anh\.jpg" alt="" loading="lazy" onerror="[^"]+"\s*\/><\/div>/);
  });
  it('không có ảnh bìa -> không chèn khối wm-popup-cover', () => {
    const html = renderPopupHtml(buildPopupModel(p));
    assert.ok(!html.includes('wm-popup-cover'));
  });
  it('mộ phần có ngày an táng -> HTML có dòng ngày; địa điểm/mộ không ngày thì không có dòng đó', () => {
    const withDate = renderPopupHtml(buildPopupModel({ ...p, category: 'BURIAL', burialDateIso: '2001-12-25' }));
    assert.match(withDate, /Ngày an táng: <strong>25\/12\/2001<\/strong>/);
    assert.ok(!renderPopupHtml(buildPopupModel(p)).includes('wm-popup-date'));
  });
  it('escape dữ liệu người dùng nhập (chống chèn HTML/script) — cả tên/địa chỉ lẫn URL ảnh bìa', () => {
    const evil = {
      ...p,
      name: '<img src=x onerror=alert(1)>',
      address: '"><script>alert(2)</script> & \'x\'',
      coverPhotoUrl: '"><script>alert(3)</script>',
    };
    const html = renderPopupHtml(buildPopupModel(evil));
    assert.ok(!html.includes('<img src=x'));
    assert.ok(!html.includes('<script'));
    assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
    assert.match(html, /&amp; &#39;x&#39;/);
  });
  it('escapeHtml xử lý đủ 5 ký tự', () => {
    assert.equal(escapeHtml(`<>&"'`), '&lt;&gt;&amp;&quot;&#39;');
  });
});

describe('buildMarkerIconSvg (hình ghim SVG nhúng sẵn, không tải ảnh ngoài)', () => {
  it('ráp đủ 1 SVG hợp lệ, có màu truyền vào, không có <script> hay request mạng (chỉ data nội tuyến)', () => {
    const svg = buildMarkerIconSvg('hall', '#7c3aed');
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    assert.ok(svg.includes('#7c3aed'));
    assert.ok(!svg.includes('<script'));
    assert.ok(!svg.includes('<img'), 'không được tải ảnh ngoài bằng thẻ <img> trong SVG');
    assert.ok(!/https?:\/\//.test(svg.replace(/xmlns="http:\/\/www\.w3\.org\/2000\/svg"/g, '')), 'không có URL mạng nào ngoài namespace SVG chuẩn');
  });
  it('mỗi icon id ra một glyph khác nhau (không trả cùng 1 chuỗi cho mọi loại)', () => {
    const variants = new Set((['hall', 'grave', 'heritage', 'event', 'other'] as const).map((i) => buildMarkerIconSvg(i, '#000')));
    assert.equal(variants.size, 5);
  });
});

describe('chế độ ?demo=1', () => {
  it('chỉ bật khi demo đúng bằng 1', () => {
    assert.equal(isDemoRequested('?demo=1'), true);
    assert.equal(isDemoRequested('?a=2&demo=1'), true);
    assert.equal(isDemoRequested('?demo=0'), false);
    assert.equal(isDemoRequested('?demo=true'), false);
    assert.equal(isDemoRequested(''), false);
  });
  it('dữ liệu demo hợp lệ, có địa điểm lẫn mộ phần, trải trên nhiều châu lục', () => {
    const pts = mergePoints(locationsToPoints(DEMO_LOCATIONS), burialsToPoints(DEMO_BURIALS));
    assert.equal(pts.length, DEMO_LOCATIONS.length + DEMO_BURIALS.length);
    assert.ok(pts.some((p) => p.kind === 'burial'));
    assert.ok(pts.some((p) => p.kind === 'clan-location'));
    const b = computeBounds(pts)!;
    assert.ok(b[0][0] < -100 && b[1][0] > 100, 'phải có cả điểm ở Mỹ và châu Á/Úc');
  });
  it('mọi điểm demo ghi rõ là demo (không lẫn với dữ liệu thật)', () => {
    const pts = mergePoints(locationsToPoints(DEMO_LOCATIONS), burialsToPoints(DEMO_BURIALS));
    assert.ok(pts.every((p) => /demo/i.test(p.name)));
  });
  it('dữ liệu demo vẫn dựng được legend đủ loại và thống kê không lỗi (không có field mới nào undefined gây vỡ)', () => {
    const pts: WorldMapPoint[] = mergePoints(locationsToPoints(DEMO_LOCATIONS), burialsToPoints(DEMO_BURIALS));
    assert.doesNotThrow(() => buildLegend(pts));
    assert.doesNotThrow(() => formatMapStats(pts));
    assert.doesNotThrow(() => toFeatureCollection(pts));
  });
});

describe('khung nhìn an toàn (gốc lỗi "Invalid LngLat (NaN, NaN)")', () => {
  const pt = (id: string, latitude: number, longitude: number): WorldMapPoint => ({
    id,
    kind: 'burial',
    category: 'BURIAL',
    name: id,
    address: '',
    latitude,
    longitude,
    coverPhotoUrl: null,
    burialDateIso: null,
  });
  const bad = (id: string, latitude: unknown, longitude: unknown) => pt(id, latitude as number, longitude as number);

  it('computeBounds loại điểm tọa độ không hữu hạn (NaN, Infinity, null, chuỗi, ngoài miền)', () => {
    const pts = [
      pt('ok1', 10, 106),
      pt('ok2', 21, 105),
      bad('nan', NaN, 106),
      bad('inf', 10, Infinity),
      bad('null', null, null),
      bad('str', '10', '106'),
      bad('range', 95, 106),
    ];
    assert.deepEqual(computeBounds(pts), [
      [105, 10],
      [106, 21],
    ]);
  });
  it('computeBounds: toàn điểm hỏng -> null', () => {
    assert.equal(computeBounds([bad('a', NaN, NaN), bad('b', undefined, 5)]), null);
  });
  it('computeDefaultViewport: toàn điểm hỏng -> khung Việt Nam dự phòng (không sinh bounds NaN)', () => {
    const v = computeDefaultViewport([bad('a', NaN, NaN), bad('b', Infinity, 100)]);
    assert.deepEqual(v.bounds, VIETNAM_BOUNDS);
    assert.equal(v.isVietnamFallback, true);
    assert.deepEqual(v.maxBounds, SOUTHEAST_ASIA_MAX_BOUNDS);
  });
  it('computeDefaultViewport: điểm hỏng không phá khung của các mộ hợp lệ và không làm mất maxBounds', () => {
    const v = computeDefaultViewport([pt('hn', 21, 105.8), bad('x', NaN, 106)]);
    assert.deepEqual(v.bounds, [
      [105.8, 21],
      [105.8, 21],
    ]);
    assert.deepEqual(v.maxBounds, SOUTHEAST_ASIA_MAX_BOUNDS);
    assert.ok(v.bounds.flat().every(Number.isFinite));
  });
  it('mộ hải ngoại (kể cả lẫn điểm hỏng) -> không có maxBounds', () => {
    const v = computeDefaultViewport([pt('hn', 21, 105.8), pt('paris', 48.8, 2.3), bad('x', NaN, 1)]);
    assert.equal(v.maxBounds, undefined);
  });

  it('hasUsableSize: chỉ true khi cả hai chiều hữu hạn và >= 1px', () => {
    assert.equal(hasUsableSize(800, 600), true);
    assert.equal(hasUsableSize(0, 600), false);
    assert.equal(hasUsableSize(800, 0), false);
    assert.equal(hasUsableSize(NaN, 600), false);
    assert.equal(hasUsableSize(undefined, 600), false);
    assert.equal(hasUsableSize(Infinity, 600), false);
  });

  it('clampViewportPadding: giới hạn theo cạnh ngắn của khung, padding*2 luôn nhỏ hơn width và height', () => {
    assert.equal(clampViewportPadding(72, 1200, 680), 72);
    for (const [w, h] of [
      [100, 100],
      [60, 500],
      [320, 40],
      [1, 1],
    ] as const) {
      const p = clampViewportPadding(72, w, h);
      assert.ok(p * 2 < Math.min(w, h) || p === 0, `${w}x${h} -> ${p}`);
    }
    assert.equal(clampViewportPadding(72, 100, 100), 30);
  });
  it('clampViewportPadding: khung chưa có kích thước hoặc padding hỏng -> 0', () => {
    assert.equal(clampViewportPadding(72, 0, 600), 0);
    assert.equal(clampViewportPadding(NaN, 800, 600), 0);
    assert.equal(clampViewportPadding(-5, 800, 600), 0);
  });
  it('viewportPaddingFor: khung Việt Nam dự phòng dùng padding nhỏ (28), còn lại dùng 72; cả hai đều bị giới hạn theo khung', () => {
    assert.equal(viewportPaddingFor({ isVietnamFallback: true }, 1200, 680), VIEWPORT_PADDING_VIETNAM_FALLBACK);
    assert.equal(viewportPaddingFor({ isVietnamFallback: false }, 1200, 680), VIEWPORT_PADDING);
    assert.ok(VIEWPORT_PADDING_VIETNAM_FALLBACK < VIEWPORT_PADDING);
    assert.equal(viewportPaddingFor({ isVietnamFallback: false }, 100, 100), 30);
    assert.equal(viewportPaddingFor({ isVietnamFallback: true }, 50, 50), 15);
  });

  it('buildFitBoundsOptions: KHÔNG có key maxZoom khi viewport không có maxZoom (MapLibre extend() sẽ biến thành NaN)', () => {
    const o = buildFitBoundsOptions({ isVietnamFallback: true, maxZoom: undefined }, 1000, 680, 0);
    assert.equal('maxZoom' in o, false);
    assert.deepEqual(o, { padding: VIEWPORT_PADDING_VIETNAM_FALLBACK, duration: 0 });
  });
  it('buildFitBoundsOptions: có maxZoom hữu hạn thì giữ; NaN thì bỏ', () => {
    const base = { isVietnamFallback: false };
    assert.equal(buildFitBoundsOptions({ ...base, maxZoom: 12.5 }, 1000, 680, 800).maxZoom, 12.5);
    assert.equal('maxZoom' in buildFitBoundsOptions({ ...base, maxZoom: NaN }, 1000, 680, 800), false);
  });
  it('buildFitBoundsOptions: không bao giờ có giá trị undefined/NaN trong kết quả', () => {
    for (const vp of [computeDefaultViewport([]), computeDefaultViewport([pt('a', 21, 105), pt('b', 10, 106)])]) {
      const o = buildFitBoundsOptions(vp, 900, 640, 0);
      assert.ok(Object.values(o).every((x) => typeof x === 'number' && Number.isFinite(x)));
    }
  });
});
