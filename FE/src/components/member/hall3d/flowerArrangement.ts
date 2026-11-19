/*
 * Bố cục cắm hoa trong bình (thuần dữ liệu, KHÔNG import three): vị trí cành, bông, nụ và lá được sinh MỘT LẦN từ seed
 * cố định (mulberry32), nên cùng seed luôn ra đúng cùng một bó hoa. Không dùng số ngẫu nhiên của hệ thống: không đổi giữa các lần render,
 * không "nhảy" khi dựng lại cảnh.
 *
 * Hệ tọa độ: gốc ở đáy bình, trục y hướng lên (đơn vị mét như cảnh). Miệng bình cao ~0.44, cổ bình bán kính ~0.046:
 * mọi cành đều đi qua cổ bình trong bán kính 0.032 rồi mới xòe ra.
 */

export type Vec3 = readonly [number, number, number];
export type Hsl = readonly [number, number, number];

/** Cao miệng bình (khớp VASE_PROFILE trong flowerBuild.ts). */
export const VASE_RIM_Y = 0.44;
/** Bán kính tối đa của cành khi đi qua cổ bình. */
export const NECK_STEM_RADIUS = 0.032;

export interface StemSpec {
  /** 4 điểm điều khiển của đường cong CatmullRom: gốc (trong bình) → miệng bình → giữa → đầu cành. */
  points: Vec3[];
  radius: number;
  kind: 'bloom' | 'bud' | 'foliage';
}

export interface BloomSpec {
  /** Chỉ số cành trong `stems`. */
  stem: number;
  kind: 'chrysanthemum' | 'lily';
  /** Hướng mặt hoa (vector đơn vị). */
  face: Vec3;
  /** Xoay quanh trục mặt hoa (rad). */
  twist: number;
  scale: number;
  /** Màu cánh (HSL, mỗi bông hơi khác nhau). */
  hsl: Hsl;
  /** Màu nhụy. */
  center: Hsl;
}

export interface BudSpec {
  stem: number;
  face: Vec3;
  scale: number;
  hsl: Hsl;
}

export interface LeafSpec {
  stem: number;
  /** Vị trí gắn lá trên cành (0 = gốc, 1 = đầu cành). */
  t: number;
  /** Góc quanh cành (rad) và độ nghiêng so với cành (rad). */
  azimuth: number;
  tilt: number;
  /** Xoay quanh trục lá để mặt lõm hướng khác nhau (rad). */
  roll: number;
  length: number;
  width: number;
  hsl: Hsl;
}

export interface Arrangement {
  stems: StemSpec[];
  blooms: BloomSpec[];
  buds: BudSpec[];
  leaves: LeafSpec[];
}

export interface ArrangementConfig {
  chrysanthemums: number;
  lilies: number;
  buds: number;
  foliageStems: number;
  leaves: number;
}

/** Chế độ high: bó đầy đặn; chế độ nhẹ: ít bông / lá hơn nhưng cùng bố cục. */
export const ARRANGEMENT_HIGH: ArrangementConfig = { chrysanthemums: 9, lilies: 3, buds: 5, foliageStems: 4, leaves: 44 };
export const ARRANGEMENT_LOW: ArrangementConfig = { chrysanthemums: 6, lilies: 2, buds: 3, foliageStems: 3, leaves: 18 };

export const mulberry32 = (seed: number): (() => number) => {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const normalize = (v: Vec3): Vec3 => {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
};

const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/**
 * Sinh bó hoa. `lean` = -1 / +1: cả bó nghiêng nhẹ về một phía (cặp bình đối xứng: bình trái nghiêng trái, bình phải nghiêng phải).
 */
export function buildArrangement(seed: number, lean: -1 | 1, config: ArrangementConfig = ARRANGEMENT_HIGH): Arrangement {
  const rng = mulberry32(seed);
  const between = (min: number, max: number) => min + rng() * (max - min);
  const stems: StemSpec[] = [];
  const blooms: BloomSpec[] = [];
  const buds: BudSpec[] = [];
  const leaves: LeafSpec[] = [];

  const R = 0.2; // bán kính xòe của bó
  const total = config.chrysanthemums + config.lilies;

  // Bông cắm theo hình vòm lệch nhẹ: giữa cao, rìa thấp, có nhiễu nhỏ để bông cao thấp khác nhau.
  const lilyIdx = new Set<number>();
  for (let k = 0; k < config.lilies; k += 1) lilyIdx.add(1 + k * Math.max(2, Math.floor(total / Math.max(1, config.lilies))));

  const makeStem = (head: Vec3, radius: number, kind: StemSpec['kind']): number => {
    const a = between(0, Math.PI * 2);
    const base: Vec3 = [Math.cos(a) * 0.012, 0.3, Math.sin(a) * 0.012];
    // Qua miệng bình: gom về tâm, bán kính nhỏ hơn cổ bình để cành không xuyên thành bình.
    const rim: Vec3 = [base[0] * 0.8 + head[0] * 0.1, VASE_RIM_Y, base[2] * 0.8 + head[2] * 0.1];
    const mid0 = lerp3(rim, head, 0.55);
    const bow = between(-0.03, 0.03); // cành cong nhẹ, mỗi cành một kiểu
    const mid: Vec3 = [mid0[0] + bow, mid0[1] + Math.abs(bow) * 0.4, mid0[2] - bow * 0.6];
    stems.push({ points: [base, rim, mid, head], radius, kind });
    return stems.length - 1;
  };

  const faceOf = (stemIndex: number, upBlend: number): Vec3 => {
    const p = stems[stemIndex].points;
    const dir = normalize([p[3][0] - p[2][0], p[3][1] - p[2][1], p[3][2] - p[2][2]]);
    return normalize([dir[0] * (1 - upBlend), dir[1] * (1 - upBlend) + upBlend, dir[2] * (1 - upBlend)]);
  };

  for (let i = 0; i < total; i += 1) {
    const angle = i * 2.39996 + between(-0.25, 0.25);
    const r = Math.sqrt((i + 0.55) / total) * R * between(0.72, 1);
    const dome = 1 - (r / R) ** 2;
    const lily = lilyIdx.has(i);
    const y = 0.56 + dome * 0.2 + between(-0.035, 0.035) + (lily ? 0.04 : 0);
    const head: Vec3 = [Math.cos(angle) * r + lean * 0.035 + between(-0.008, 0.008), y, Math.sin(angle) * r * 0.8];
    const stem = makeStem(head, 0.0042, 'bloom');
    const yellow = i % 2 === 0;
    const hsl: Hsl = lily
      ? [between(0.1, 0.15), between(0.12, 0.3), between(0.9, 0.96)]
      : yellow
        ? [between(0.115, 0.14), between(0.82, 0.97), between(0.5, 0.58)]
        : [between(0.1, 0.15), between(0.06, 0.22), between(0.9, 0.97)];
    blooms.push({
      stem,
      kind: lily ? 'lily' : 'chrysanthemum',
      face: faceOf(stem, lily ? 0.25 : 0.4),
      twist: between(0, Math.PI * 2),
      scale: lily ? between(0.95, 1.15) : between(0.82, 1.18),
      hsl,
      center: lily ? [0.12, 0.8, 0.6] : [between(0.07, 0.1), between(0.7, 0.9), between(0.38, 0.46)],
    });
  }

  // Nụ chưa nở: ở rìa, cành mảnh, hướng ra ngoài và lên.
  for (let k = 0; k < config.buds; k += 1) {
    const angle = (k / Math.max(1, config.buds)) * Math.PI * 2 + between(0.1, 0.9);
    const r = between(0.13, 0.215);
    const head: Vec3 = [Math.cos(angle) * r + lean * 0.03, between(0.47, 0.74), Math.sin(angle) * r * 0.8];
    const stem = makeStem(head, 0.0032, 'bud');
    buds.push({
      stem,
      face: faceOf(stem, 0.15),
      scale: between(0.8, 1.2),
      hsl: [between(0.13, 0.22), between(0.35, 0.6), between(0.6, 0.78)],
    });
  }

  // Cành chỉ có lá (làm nền xanh cho bó).
  const foliage: number[] = [];
  for (let k = 0; k < config.foliageStems; k += 1) {
    const angle = (k / Math.max(1, config.foliageStems)) * Math.PI * 2 + between(0, 1);
    const r = between(0.1, 0.22);
    const head: Vec3 = [Math.cos(angle) * r + lean * 0.03, between(0.5, 0.68), Math.sin(angle) * r * 0.8];
    foliage.push(makeStem(head, 0.0034, 'foliage'));
  }

  // Lá: cành lá được nhiều lá hơn; còn lại rải đều lên các cành hoa. Mỗi lá có tư thế riêng, cố định theo seed.
  const leafShade = (): Hsl => [between(0.25, 0.33), between(0.4, 0.62), between(0.2, 0.34)];
  const addLeaf = (stem: number, t: number, foliageStem: boolean, tipLeaf = false) => {
    leaves.push({
      stem,
      t,
      azimuth: between(0, Math.PI * 2),
      tilt: tipLeaf ? between(0.1, 0.3) : between(0.6, 1.25),
      roll: between(-0.7, 0.7),
      length: foliageStem ? between(0.09, 0.15) : between(0.07, 0.115),
      width: between(0.36, 0.55),
      hsl: leafShade(),
    });
  };
  const bloomStems = blooms.map((b) => b.stem);
  let remaining = config.leaves;
  foliage.forEach((stem) => {
    const per = Math.max(2, Math.floor((config.leaves * 0.45) / Math.max(1, foliage.length)));
    for (let n = 0; n < per && remaining > 0; n += 1) {
      const last = n === per - 1;
      addLeaf(stem, last ? 1 : 0.4 + (0.55 * n) / Math.max(1, per - 1), true, last);
      remaining -= 1;
    }
  });
  for (let n = 0; remaining > 0 && bloomStems.length > 0; n += 1, remaining -= 1) {
    addLeaf(bloomStems[n % bloomStems.length], between(0.42, 0.85), false);
  }

  return { stems, blooms, buds, leaves };
}

/** Điểm trên cành (nội suy tuyến tính giữa các điểm điều khiển: đủ để kiểm tra ràng buộc hình học trong test). */
export function stemPointAt(stem: StemSpec, t: number): Vec3 {
  const segs = stem.points.length - 1;
  const f = Math.min(Math.max(t, 0), 1) * segs;
  const i = Math.min(segs - 1, Math.floor(f));
  return lerp3(stem.points[i], stem.points[i + 1], f - i);
}
