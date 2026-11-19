import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  ARRANGEMENT_HIGH,
  ARRANGEMENT_LOW,
  NECK_STEM_RADIUS,
  VASE_RIM_Y,
  buildArrangement,
  mulberry32,
  stemPointAt,
} from '../src/components/member/hall3d/flowerArrangement';
import {
  VASE_PROFILE,
  buildBouquet,
  countTriangles,
  createFloraGeometries,
  createVaseGeometry,
  estimateVaseTriangles,
  paintVaseTexture,
  petalsPerChrysanthemum,
  petalsPerLily,
  vForHeight,
  vaseProfilePoints,
} from '../src/components/member/hall3d/flowerBuild';

const root = process.cwd();
const source = (rel: string) => readFileSync(join(root, rel), 'utf8').replace(/\r\n/g, '\n');
const radial = (p: readonly number[]) => Math.hypot(p[0], p[2]);
const stdev = (xs: number[]) => {
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
};

describe('Bố cục hoa (cố định theo seed)', () => {
  it('cùng seed ra đúng cùng một bó hoa (không random lại); khác seed hoặc khác phía nghiêng thì khác', () => {
    const a = buildArrangement(7, -1);
    const b = buildArrangement(7, -1);
    assert.deepEqual(a, b);
    assert.notDeepEqual(buildArrangement(8, -1), a);
    assert.notDeepEqual(buildArrangement(7, 1), a);
    const rng1 = mulberry32(5);
    const rng2 = mulberry32(5);
    assert.deepEqual([rng1(), rng1(), rng1()], [rng2(), rng2(), rng2()]);
  });

  it('đủ số bông, nụ, cành lá và lá theo từng chế độ chất lượng', () => {
    for (const [config, name] of [[ARRANGEMENT_HIGH, 'high'], [ARRANGEMENT_LOW, 'low']] as const) {
      const arr = buildArrangement(7, -1, config);
      assert.equal(arr.blooms.filter((b) => b.kind === 'chrysanthemum').length, config.chrysanthemums, name);
      assert.equal(arr.blooms.filter((b) => b.kind === 'lily').length, config.lilies, name);
      assert.equal(arr.buds.length, config.buds, name);
      assert.equal(arr.leaves.length, config.leaves, name);
      assert.equal(arr.stems.length, arr.blooms.length + arr.buds.length + config.foliageStems, name);
      assert.ok(arr.buds.length >= 3, 'có vài nụ chưa nở');
    }
    assert.ok(ARRANGEMENT_LOW.chrysanthemums < ARRANGEMENT_HIGH.chrysanthemums && ARRANGEMENT_LOW.leaves < ARRANGEMENT_HIGH.leaves);
  });

  it('cành chui qua cổ bình trong bán kính cổ, rồi mới xòe ra', () => {
    const arr = buildArrangement(19, 1);
    for (const stem of arr.stems) {
      assert.equal(stem.points.length, 4);
      assert.ok(stem.points[0][1] < VASE_RIM_Y, 'gốc cành nằm trong bình');
      assert.ok(radial(stem.points[0]) <= 0.0121);
      assert.ok(Math.abs(stem.points[1][1] - VASE_RIM_Y) < 1e-9, 'điểm thứ hai đúng ở miệng bình');
      assert.ok(radial(stem.points[1]) <= NECK_STEM_RADIUS, `bán kính ở miệng ${radial(stem.points[1])}`);
      assert.ok(stem.points[3][1] > VASE_RIM_Y + 0.02, 'đầu cành cao hơn miệng bình');
    }
  });

  it('bông cao thấp khác nhau, cắm lệch nhẹ theo phía nghiêng, nụ nằm ở rìa', () => {
    const left = buildArrangement(7, -1);
    const right = buildArrangement(7, 1);
    const heads = (arr: ReturnType<typeof buildArrangement>) => arr.blooms.map((b) => stemPointAt(arr.stems[b.stem], 1));
    const hl = heads(left);
    const hr = heads(right);
    assert.ok(stdev(hl.map((p) => p[1])) > 0.03, 'độ cao các bông chênh nhau');
    const meanX = (hs: ReturnType<typeof heads>) => hs.reduce((s, p) => s + p[0], 0) / hs.length;
    assert.ok(meanX(hl) < -0.01 && meanX(hr) > 0.01, 'cặp bình nghiêng đối xứng ra hai phía');
    assert.ok(Math.abs(meanX(hl) + meanX(hr)) < 0.02, 'hai bình đối xứng gần như gương');
    const meanBudR = left.buds.reduce((s, b) => s + radial(stemPointAt(left.stems[b.stem], 1)), 0) / left.buds.length;
    const meanBloomR = hl.reduce((s, p) => s + radial(p), 0) / hl.length;
    assert.ok(meanBudR > meanBloomR - 0.02, 'nụ ở rìa bó');
    for (const p of hl) assert.ok(p[1] < 0.84, 'bó không quá cao (không che ảnh thờ phía sau)');
  });

  it('màu hơi khác nhau giữa các bông; mặt hoa và hướng là vector đơn vị', () => {
    const arr = buildArrangement(7, -1);
    assert.ok(new Set(arr.blooms.map((b) => b.hsl.map((x) => x.toFixed(3)).join())).size === arr.blooms.length, 'mỗi bông một sắc độ riêng');
    assert.ok(arr.blooms.some((b) => b.hsl[1] > 0.7) && arr.blooms.some((b) => b.hsl[2] > 0.88), 'có cả bông vàng và bông trắng');
    for (const b of arr.blooms) assert.ok(Math.abs(Math.hypot(...b.face) - 1) < 1e-9);
    for (const l of arr.leaves) {
      assert.ok(l.t >= 0 && l.t <= 1 && l.length > 0 && l.width > 0);
      assert.ok(l.hsl[0] > 0.2 && l.hsl[0] < 0.4, 'lá màu xanh');
    }
    assert.ok(stdev(arr.leaves.map((l) => l.tilt)) > 0.1, 'lá nghiêng khác nhau');
  });
});

describe('Bình hoa tròn xoay', () => {
  it('đường viền cong: chân đế hẹp, bụng phình nhất, cổ thon, miệng loe', () => {
    const r = (y: number) => VASE_PROFILE.reduce((best, p) => (Math.abs(p[1] - y) < Math.abs(best[1] - y) ? p : best))[0];
    const belly = Math.max(...VASE_PROFILE.map((p) => p[0]));
    assert.equal(belly, r(0.215));
    assert.ok(r(0.405) < belly * 0.45, 'cổ thon hơn nhiều so với bụng');
    assert.ok(r(0.438) > r(0.405) * 1.5, 'miệng loe ra');
    assert.ok(r(0.04) < r(0.01) && r(0.04) < r(0.1), 'chân đế có chỗ thắt');
    const top = Math.max(...VASE_PROFILE.map((p) => p[1]));
    assert.ok(top >= VASE_RIM_Y && top < 0.47);
  });

  it('tọa độ v của họa tiết tăng theo độ cao và khớp với số điểm của đường viền', () => {
    const pts = vaseProfilePoints(64);
    assert.equal(pts.length, 65);
    let prev = -1;
    for (const y of [0.01, 0.05, 0.1, 0.2, 0.3, 0.4, 0.44]) {
      const v = vForHeight(pts, y);
      assert.ok(v > prev && v >= 0 && v <= 1, `y=${y} v=${v}`);
      prev = v;
    }
  });

  it('vẽ họa tiết men bằng canvas giả không lỗi và chỉ dùng thao tác vẽ 2D', () => {
    const calls: string[] = [];
    const gradient = { addColorStop: () => undefined };
    const ctx = new Proxy({} as Record<string, unknown>, {
      get: (target, key: string) => {
        if (key === 'createLinearGradient') return () => gradient;
        return (target[key] as unknown) ?? ((..._args: unknown[]) => { calls.push(key); });
      },
      set: (target, key: string, value) => { target[key] = value; return true; },
    }) as unknown as CanvasRenderingContext2D;
    assert.doesNotThrow(() => paintVaseTexture(ctx, 512, 1024, vaseProfilePoints(64)));
    assert.ok(calls.includes('fillRect') && calls.includes('stroke') && calls.includes('arc'));
  });
});

describe('Hình học và hiệu năng', () => {
  const measure = (high: boolean) => {
    const geos = createFloraGeometries(high);
    const vase = createVaseGeometry(high);
    const arr = buildArrangement(7, -1, high ? ARRANGEMENT_HIGH : ARRANGEMENT_LOW);
    const bouquet = buildBouquet(arr, high);
    const triangles = estimateVaseTriangles(bouquet, geos, vase);
    return { geos, vase, arr, bouquet, triangles };
  };

  it('mỗi bình không quá ~20k tam giác (high và low)', (t) => {
    const high = measure(true);
    const low = measure(false);
    t.diagnostic(
      `high: tổng ${high.triangles} (bình ${countTriangles(high.vase)}, cành ${countTriangles(high.bouquet.stems)}, ` +
        `cánh ${high.bouquet.petals.count}×${countTriangles(high.geos.petal)}, lá ${high.bouquet.leaves.count}×${countTriangles(high.geos.leaf)}, ` +
        `nụ ${high.bouquet.buds.count}, nhụy ${high.bouquet.centers.count})`
    );
    t.diagnostic(`low: tổng ${low.triangles}`);
    assert.ok(high.triangles <= 20000, `high ${high.triangles}`);
    assert.ok(low.triangles <= 20000 && low.triangles < high.triangles, `low ${low.triangles}`);
    assert.ok(high.triangles > 4000, 'bình và hoa không bị rỗng');
  });

  it('số cánh hoa đúng theo số lớp cánh (cúc nhiều lớp, huệ 9 cánh)', () => {
    for (const high of [true, false]) {
      const { arr, bouquet } = measure(high);
      const expected =
        arr.blooms.filter((b) => b.kind === 'chrysanthemum').length * petalsPerChrysanthemum(high) +
        arr.blooms.filter((b) => b.kind === 'lily').length * petalsPerLily();
      assert.equal(bouquet.petals.count, expected, high ? 'high' : 'low');
      assert.equal(bouquet.centers.count, arr.blooms.length);
      assert.equal(bouquet.buds.count, arr.buds.length);
      assert.equal(bouquet.leaves.count, arr.leaves.length);
    }
    assert.ok(petalsPerChrysanthemum(true) >= 30, 'cúc nhiều lớp cánh');
  });

  it('ma trận và màu instance hợp lệ (không NaN), màu trong [0,1]', () => {
    const { bouquet } = measure(true);
    for (const batch of [bouquet.petals, bouquet.centers, bouquet.buds, bouquet.leaves]) {
      assert.equal(batch.matrices.length, batch.count * 16);
      assert.equal(batch.colors.length, batch.count * 3);
      assert.ok(batch.matrices.every(Number.isFinite));
      assert.ok(batch.colors.every((c) => c >= 0 && c <= 1));
      for (let i = 0; i < batch.count; i += 1) assert.equal(batch.matrices[i * 16 + 15], 1, 'hàng cuối của ma trận affine');
    }
    const distinct = new Set(Array.from({ length: bouquet.petals.count }, (_, i) => bouquet.petals.colors[i * 3 + 1].toFixed(3)));
    assert.ok(distinct.size > 12, 'cánh có nhiều sắc độ khác nhau');
  });

  it('cành gộp thành một geometry hợp lệ, hai lần dựng cùng seed cho cùng kết quả', () => {
    const a = measure(true).bouquet;
    const b = measure(true).bouquet;
    assert.ok(a.stems.attributes.position.count > 100);
    assert.ok((a.stems.attributes.position.array as Float32Array).every(Number.isFinite));
    assert.deepEqual(Array.from(a.petals.matrices.slice(0, 64)), Array.from(b.petals.matrices.slice(0, 64)));
    assert.deepEqual(Array.from(a.leaves.colors), Array.from(b.leaves.colors));
    a.stems.dispose();
    b.stems.dispose();
  });
});

describe('Cách nối vào cảnh 3D', () => {
  const scene = source('src/components/member/AncestralHall3D.tsx');
  const vaseBlock = scene.slice(scene.indexOf('const FlowerVase: React.FC'), scene.indexOf('const CUP_OFFSETS'));

  it('không dùng Math.random ở bất kỳ file hoa nào; không còn lớp hoa cũ (cầu dẹt + vòm lá)', () => {
    for (const file of ['flowerArrangement.ts', 'flowerBuild.ts']) assert.doesNotMatch(source(`src/components/member/hall3d/${file}`), /Math\.random/, file);
    assert.doesNotMatch(vaseBlock, /Math\.random/);
    assert.doesNotMatch(scene, /FLOWER_LAYOUT/);
    assert.doesNotMatch(vaseBlock, /mat\.porcelain/);
  });

  it('dùng LatheGeometry + MeshPhysicalMaterial (men gốm) và InstancedMesh cho cánh, nhụy, nụ, lá', () => {
    assert.match(source('src/components/member/hall3d/flowerBuild.ts'), /new LatheGeometry\(/);
    assert.match(scene, /vase: track\(\s*new MeshPhysicalMaterial\(\{\s*map: vaseTex,\s*roughness: 0\.14,[\s\S]*?clearcoat: high \? 0\.5 : 0,/);
    for (const name of ['petal', 'center', 'bud', 'leaf']) {
      assert.match(vaseBlock, new RegExp(`<instancedMesh ref=\\{\\w+Ref\\} args=\\{\\[geo\\.${name}, `), name);
    }
    assert.equal((scene.match(/createFloraGeometries\(high\)/g) || []).length, 1, 'geometry hoa tạo một lần và dùng chung hai bình');
    assert.equal((vaseBlock.match(/<instancedMesh/g) || []).length, 4);
    assert.match(source('src/components/member/hall3d/flowerBuild.ts'), /new TubeGeometry\(curves\[i\]/);
    assert.match(source('src/components/member/hall3d/flowerBuild.ts'), /new CatmullRomCurve3\(/);
  });

  it('useFrame của bình không tạo object, gió chỉ ở chế độ high và khi không giảm chuyển động', () => {
    const frame = vaseBlock.slice(vaseBlock.indexOf('useFrame('), vaseBlock.indexOf('return (\n    <group position'));
    assert.ok(frame.length > 80);
    assert.doesNotMatch(frame, /\bnew\b|\.clone\(|Vector3\(|Quaternion\(|Matrix4\(|\[\s*\.\.\./);
    assert.match(frame, /if \(!group \|\| !high \|\| reduced\) return;/);
    assert.match(frame, /rotation\.z = Math\.sin\(/);
  });

  it('dispose phần riêng của bình khi gỡ; geometry/vật liệu dùng chung do res.dispose lo', () => {
    assert.match(vaseBlock, /bouquet\.stems\.dispose\(\);/);
    assert.match(vaseBlock, /meshes\.forEach\(\(mesh\) => mesh\?\.dispose\(\)\);/);
    assert.match(scene, /petal: track\(flora\.petal\)/);
    assert.match(scene, /const vaseTex = \(\(\) => \{[\s\S]*?return track\(toTexture\(canvas\)\);/);
  });

  it('cặp bình đối xứng hai bên bát hương vẫn còn, nghiêng đối xứng', () => {
    assert.match(scene, /<FlowerVase x=\{-2\.0\} seed=\{7\} lean=\{-1\} \/>/);
    assert.match(scene, /<FlowerVase x=\{2\.0\} seed=\{19\} lean=\{1\} \/>/);
  });

  it('các tính năng cũ vẫn còn trong cảnh', () => {
    for (const kept of [/geometry=\{geo\.frameRim\}/, /material=\{mat\.glassStreak\}/, /<MemorialDecor/, /zoomReducer/, /onPointerMissed=/, /<IncenseBurner/, /<FirstPersonRig/, /<CupsAndWine \/>/]) {
      assert.match(scene, kept, String(kept));
    }
  });
});
