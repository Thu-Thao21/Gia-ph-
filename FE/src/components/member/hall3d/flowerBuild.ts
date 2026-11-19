/*
 * Dựng hình học cho bình hoa (three): bình tròn xoay có đường viền cong, họa tiết men vẽ bằng canvas, cánh hoa / lá / nụ dùng
 * chung geometry, cành là TubeGeometry theo CatmullRomCurve3 (gộp thành MỘT geometry), cánh + lá + nụ + nhụy là InstancedMesh.
 *
 * Mọi thứ được tính MỘT LẦN khi dựng (không dùng số ngẫu nhiên của hệ thống, không tạo object trong useFrame). Dữ liệu bố cục nằm ở
 * flowerArrangement.ts (thuần, cố định theo seed).
 */
import {
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  InstancedBufferAttribute,
  LatheGeometry,
  Matrix4,
  PlaneGeometry,
  Quaternion,
  SphereGeometry,
  SplineCurve,
  TubeGeometry,
  Vector2,
  Vector3,
  type InstancedMesh,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry32, type Arrangement, type Hsl, type Vec3 } from './flowerArrangement';

/* ------------------------------------------------------------------ */
/* Bình                                                                 */
/* ------------------------------------------------------------------ */

/**
 * Đường viền ngoài của bình [bán kính, độ cao]: chân đế (vòng chân + thắt), bụng phình, vai thu, cổ thon, miệng loe;
 * rồi quay vào trong lòng bình (đáy kín ở y = 0.36 để không nhìn xuyên qua).
 */
export const VASE_PROFILE: ReadonlyArray<readonly [number, number]> = [
  [0, 0], [0.06, 0.002], [0.068, 0.01], [0.064, 0.024], [0.05, 0.04], [0.062, 0.075], [0.1, 0.145], [0.125, 0.215],
  [0.121, 0.275], [0.088, 0.335], [0.056, 0.38], [0.046, 0.405], [0.052, 0.425], [0.08, 0.438], [0.088, 0.444],
  [0.08, 0.446], [0.044, 0.42], [0.04, 0.38], [0, 0.36],
];

/** Các điểm lấy mẫu đều trên đường cong (dùng chung cho hình học và để định vị họa tiết trên texture). */
export function vaseProfilePoints(samples: number): Vector2[] {
  const curve = new SplineCurve(VASE_PROFILE.map(([r, y]) => new Vector2(Math.max(0, r), y)));
  return curve.getPoints(samples).map((p) => new Vector2(Math.max(0, p.x), p.y));
}

export function createVaseGeometry(high: boolean): LatheGeometry {
  return new LatheGeometry(vaseProfilePoints(high ? 64 : 28), high ? 40 : 18);
}

/** Tọa độ v (0..1, từ đáy lên) trên texture của LatheGeometry ứng với độ cao `y` của thân ngoài. */
export function vForHeight(points: ReadonlyArray<Vector2>, y: number): number {
  let top = 0;
  points.forEach((p, i) => {
    if (p.y > points[top].y) top = i;
  });
  for (let i = 1; i <= top; i += 1) {
    if (points[i].y >= y) {
      const a = points[i - 1];
      const b = points[i];
      const f = b.y === a.y ? 0 : (y - a.y) / (b.y - a.y);
      return (i - 1 + f) / (points.length - 1);
    }
  }
  return top / (points.length - 1);
}

/**
 * Vẽ men gốm xanh ngọc + họa tiết đơn giản lên canvas 2D (u quanh bình, v từ đáy lên; canvas lật trục dọc):
 * dải chân đế, hàng cánh sen quanh bụng, dải mây cuộn ở vai, vành cổ và viền miệng thếp vàng.
 * Số lần lặp ngang là số nguyên nên không lộ đường nối.
 */
export function paintVaseTexture(ctx: CanvasRenderingContext2D, w: number, h: number, points: ReadonlyArray<Vector2>): void {
  const row = (y: number) => (1 - vForHeight(points, y)) * h; // độ cao bình -> hàng canvas
  const jade = '#2f6f63';
  const gold = '#d9b45a';
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#cfe5da');
  sky.addColorStop(0.55, '#b9d8ca');
  sky.addColorStop(1, '#a3c8b8');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  const band = (y0: number, y1: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(0, row(y1), w, row(y0) - row(y1));
  };
  const line = (y: number, color: string, width: number) => {
    ctx.fillStyle = color;
    ctx.fillRect(0, row(y) - width / 2, w, width);
  };

  // chân đế
  band(0, 0.044, '#4f8f7e');
  line(0.046, gold, 5);

  // hàng cánh sen quanh phần dưới bụng (8 cánh)
  const petals = 8;
  const base = row(0.075);
  const tip = row(0.185);
  for (let i = 0; i < petals; i += 1) {
    const cx = ((i + 0.5) / petals) * w;
    const half = (w / petals) * 0.46;
    ctx.beginPath();
    ctx.moveTo(cx - half, base);
    ctx.quadraticCurveTo(cx - half, tip + (base - tip) * 0.35, cx, tip);
    ctx.quadraticCurveTo(cx + half, tip + (base - tip) * 0.35, cx + half, base);
    ctx.closePath();
    ctx.fillStyle = '#eaf4ef';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = jade;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - half * 0.55, base);
    ctx.quadraticCurveTo(cx - half * 0.55, tip + (base - tip) * 0.5, cx, tip + (base - tip) * 0.18);
    ctx.quadraticCurveTo(cx + half * 0.55, tip + (base - tip) * 0.5, cx + half * 0.55, base);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(47,111,99,0.7)';
    ctx.stroke();
  }
  line(0.2, jade, 6);
  line(0.212, gold, 3);

  // dải mây cuộn ở vai (16 vòng xoắn)
  const clouds = 16;
  const y0 = row(0.235);
  const y1 = row(0.3);
  const mid = (y0 + y1) / 2;
  const radius = Math.abs(y0 - y1) * 0.32;
  ctx.strokeStyle = jade;
  ctx.lineWidth = 3.5;
  for (let i = 0; i < clouds; i += 1) {
    const cx = ((i + 0.5) / clouds) * w;
    ctx.beginPath();
    ctx.arc(cx, mid, radius, 0.2 * Math.PI, 1.85 * Math.PI);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx + radius * 0.5, mid, radius * 0.45, 0.4 * Math.PI, 1.7 * Math.PI);
    ctx.stroke();
  }
  line(0.226, jade, 4);
  line(0.31, jade, 4);

  // cổ và miệng
  line(0.35, jade, 5);
  line(0.356, gold, 2.5);
  band(0.425, 0.447, '#4f8f7e');
  line(0.444, gold, 5);
}

/* ------------------------------------------------------------------ */
/* Cánh hoa, lá, nụ, nhụy (dùng chung giữa mọi bông và hai bình)         */
/* ------------------------------------------------------------------ */

function reshape(geometry: PlaneGeometry, profile: (t: number) => number, z: (t: number, nx: number) => number): void {
  geometry.translate(0, 0.5, 0); // đáy ở y = 0, đầu ở y = 1
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i += 1) {
    const t = pos.getY(i);
    const nx = pos.getX(i) * 2; // -1..1 theo bề ngang
    const width = profile(t);
    pos.setX(i, pos.getX(i) * width);
    pos.setZ(i, z(t, nx * width));
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();
}

/** Cánh hoa: thon, hơi lõm, đầu cuộn nhẹ về phía mặt hoa. Dài 1 theo +Y, rộng 1 theo X (co giãn khi gắn vào bông). */
export function createPetalGeometry(): PlaneGeometry {
  const g = new PlaneGeometry(1, 1, 2, 4);
  reshape(
    g,
    (t) => 0.25 + 0.75 * Math.sin(Math.PI * Math.pow(t, 0.8)),
    (t, nx) => -0.1 * nx * nx * 4 * 0.25 - 0.2 * t * t // lõm hai mép + đầu cuộn lên
  );
  return g;
}

/** Lá: hình mác, gân giữa gập nhẹ, đầu lá rủ xuống. */
export function createLeafGeometry(): PlaneGeometry {
  const g = new PlaneGeometry(1, 1, 2, 5);
  reshape(
    g,
    (t) => Math.max(0.05, Math.pow(Math.sin(Math.PI * Math.pow(t, 0.75)), 0.85)),
    (t, nx) => -0.12 * Math.abs(nx) - 0.28 * t * t
  );
  return g;
}

export interface FloraGeometries {
  petal: PlaneGeometry;
  leaf: PlaneGeometry;
  bud: SphereGeometry;
  center: SphereGeometry;
}

export function createFloraGeometries(high: boolean): FloraGeometries {
  return {
    petal: createPetalGeometry(),
    leaf: createLeafGeometry(),
    bud: new SphereGeometry(1, high ? 8 : 6, high ? 6 : 4),
    center: new SphereGeometry(1, 6, 4),
  };
}

/* ------------------------------------------------------------------ */
/* Dựng bó hoa                                                          */
/* ------------------------------------------------------------------ */

export interface InstanceBatch {
  count: number;
  /** count × 16 số (ma trận 4×4). */
  matrices: Float32Array;
  /** count × 3 số (RGB tuyến tính). */
  colors: Float32Array;
}

export interface Bouquet {
  /** Mọi cành gộp thành một geometry (một lần vẽ). Riêng từng bình: cần dispose khi gỡ. */
  stems: BufferGeometry;
  petals: InstanceBatch;
  centers: InstanceBatch;
  buds: InstanceBatch;
  leaves: InstanceBatch;
}

interface Ring {
  n: number;
  /** Góc nghiêng cánh so với trục mặt hoa (rad): 0 = khép, ~π/2 = xòe phẳng. */
  phi: number;
  len: number;
  w: number;
  /** Lớp trong tối hơn một chút. */
  lShift: number;
}

const CHRYSANTHEMUM_HIGH: Ring[] = [
  { n: 14, phi: 1.2, len: 0.042, w: 0.0125, lShift: 0 },
  { n: 11, phi: 0.85, len: 0.036, w: 0.0118, lShift: -0.02 },
  { n: 8, phi: 0.5, len: 0.029, w: 0.0105, lShift: -0.04 },
  { n: 5, phi: 0.22, len: 0.02, w: 0.0095, lShift: -0.06 },
];
const CHRYSANTHEMUM_LOW: Ring[] = [
  { n: 10, phi: 1.1, len: 0.042, w: 0.0145, lShift: 0 },
  { n: 7, phi: 0.65, len: 0.033, w: 0.0125, lShift: -0.03 },
  { n: 4, phi: 0.25, len: 0.022, w: 0.0105, lShift: -0.06 },
];
const LILY: Ring[] = [
  { n: 6, phi: 0.95, len: 0.088, w: 0.036, lShift: 0 },
  { n: 3, phi: 0.6, len: 0.07, w: 0.03, lShift: -0.03 },
];

export const petalsPerChrysanthemum = (high: boolean): number => (high ? CHRYSANTHEMUM_HIGH : CHRYSANTHEMUM_LOW).reduce((s, r) => s + r.n, 0);
export const petalsPerLily = (): number => LILY.reduce((s, r) => s + r.n, 0);

const AXIS_Y = new Vector3(0, 1, 0);
const AXIS_X = new Vector3(1, 0, 0);

class Batch {
  private readonly m = new Matrix4();
  private readonly color = new Color();
  private readonly matrices: number[] = [];
  private readonly colors: number[] = [];
  private readonly scl = new Vector3();

  push(position: Vector3, quaternion: Quaternion, sx: number, sy: number, sz: number, hsl: Hsl, lShift = 0): void {
    this.scl.set(sx, sy, sz);
    this.m.compose(position, quaternion, this.scl);
    this.matrices.push(...this.m.elements);
    this.color.setHSL(hsl[0], hsl[1], Math.min(1, Math.max(0, hsl[2] + lShift)));
    this.colors.push(this.color.r, this.color.g, this.color.b);
  }

  finish(): InstanceBatch {
    return { count: this.colors.length / 3, matrices: new Float32Array(this.matrices), colors: new Float32Array(this.colors) };
  }
}

const v3 = (v: Vec3) => new Vector3(v[0], v[1], v[2]);

/**
 * Từ bố cục (dữ liệu thuần) dựng: geometry cành + 4 lô instance (cánh hoa, nhụy, nụ, lá).
 * Chỉ chạy một lần mỗi bình (useMemo), không chạy trong vòng lặp vẽ.
 */
export function buildBouquet(arrangement: Arrangement, high: boolean): Bouquet {
  const curves = arrangement.stems.map((s) => new CatmullRomCurve3(s.points.map(v3), false, 'centripetal'));
  const tubes = arrangement.stems.map(
    (s, i) => new TubeGeometry(curves[i], high ? 8 : 5, s.radius, high ? 5 : 3, false)
  );
  const stems = mergeGeometries(tubes) ?? tubes[0];
  tubes.forEach((t) => {
    if (t !== stems) t.dispose();
  });

  const petals = new Batch();
  const centers = new Batch();
  const budBatch = new Batch();
  const leaves = new Batch();
  const rings = high ? CHRYSANTHEMUM_HIGH : CHRYSANTHEMUM_LOW;

  const qFrame = new Quaternion();
  const qAz = new Quaternion();
  const qTilt = new Quaternion();
  const q = new Quaternion();
  const position = new Vector3();
  const face = new Vector3();

  arrangement.blooms.forEach((bloom, index) => {
    const head = curves[bloom.stem].getPoint(1);
    face.set(bloom.face[0], bloom.face[1], bloom.face[2]);
    qFrame.setFromUnitVectors(AXIS_Y, face);
    const rng = mulberry32(0x9e3779b1 ^ (index * 7919 + 17));
    const ringSet = bloom.kind === 'lily' ? LILY : rings;
    ringSet.forEach((ring, ringIndex) => {
      const offset = ringIndex * 0.45 + bloom.twist;
      for (let k = 0; k < ring.n; k += 1) {
        const az = offset + (k / ring.n) * Math.PI * 2 + (rng() - 0.5) * 0.18;
        const phi = ring.phi + (rng() - 0.5) * 0.16;
        const len = ring.len * bloom.scale * (0.92 + rng() * 0.16);
        qAz.setFromAxisAngle(AXIS_Y, az);
        qTilt.setFromAxisAngle(AXIS_X, phi);
        q.copy(qFrame).multiply(qAz).multiply(qTilt);
        // cúc vàng: lớp trong ngả cam
        const hsl: Hsl = [bloom.hsl[0] - ringIndex * (bloom.hsl[1] > 0.5 ? 0.006 : 0), bloom.hsl[1], bloom.hsl[2]];
        petals.push(head, q, ring.w * bloom.scale * (len / ring.len), len, len, hsl, ring.lShift);
      }
    });
    // nhụy: đĩa dẹt (cúc) hoặc cụm nhỏ (huệ) nằm ngay tâm
    const lift = bloom.kind === 'lily' ? 0.012 : 0.006;
    position.copy(head).addScaledVector(face, lift * bloom.scale);
    const r = bloom.kind === 'lily' ? 0.009 : 0.013;
    centers.push(position, qFrame, r * bloom.scale, (bloom.kind === 'lily' ? 0.012 : 0.007) * bloom.scale, r * bloom.scale, bloom.center);
  });

  arrangement.buds.forEach((bud) => {
    const head = curves[bud.stem].getPoint(1);
    face.set(bud.face[0], bud.face[1], bud.face[2]);
    qFrame.setFromUnitVectors(AXIS_Y, face);
    const h = 0.026 * bud.scale;
    position.copy(head).addScaledVector(face, h * 0.8);
    budBatch.push(position, qFrame, 0.014 * bud.scale, h, 0.014 * bud.scale, bud.hsl);
  });

  const tangent = new Vector3();
  const helper = new Vector3();
  const u = new Vector3();
  const w = new Vector3();
  const dir = new Vector3();
  const qDir = new Quaternion();
  const qRoll = new Quaternion();
  arrangement.leaves.forEach((leaf) => {
    const curve = curves[leaf.stem];
    curve.getPoint(leaf.t, position);
    curve.getTangent(leaf.t, tangent);
    helper.set(Math.abs(tangent.y) < 0.9 ? 0 : 1, Math.abs(tangent.y) < 0.9 ? 1 : 0, 0);
    u.crossVectors(tangent, helper).normalize();
    w.crossVectors(tangent, u).normalize();
    dir
      .copy(tangent)
      .multiplyScalar(Math.cos(leaf.tilt))
      .addScaledVector(u, Math.cos(leaf.azimuth) * Math.sin(leaf.tilt))
      .addScaledVector(w, Math.sin(leaf.azimuth) * Math.sin(leaf.tilt))
      .normalize();
    qDir.setFromUnitVectors(AXIS_Y, dir);
    qRoll.setFromAxisAngle(AXIS_Y, leaf.roll);
    q.copy(qDir).multiply(qRoll);
    leaves.push(position, q, leaf.length * leaf.width, leaf.length, leaf.length, leaf.hsl);
  });

  return { stems, petals: petals.finish(), centers: centers.finish(), buds: budBatch.finish(), leaves: leaves.finish() };
}

/** Đổ một lô instance vào InstancedMesh đã tạo với đúng `count` (gọi trong useLayoutEffect). */
export function applyBatch(mesh: InstancedMesh, batch: InstanceBatch): void {
  mesh.instanceMatrix.array.set(batch.matrices);
  mesh.instanceMatrix.needsUpdate = true;
  mesh.instanceColor = new InstancedBufferAttribute(batch.colors.slice(), 3);
  mesh.count = batch.count;
}

/** Số tam giác của một geometry (đã gồm chỉ mục nếu có). */
export function countTriangles(geometry: BufferGeometry): number {
  return (geometry.index ? geometry.index.count : geometry.attributes.position.count) / 3;
}

/** Tổng số tam giác của MỘT bình ở một chế độ chất lượng: bình + cành + mọi instance (cánh, nhụy, nụ, lá). */
export function estimateVaseTriangles(bouquet: Bouquet, geos: FloraGeometries, vase: BufferGeometry): number {
  return (
    countTriangles(vase) +
    countTriangles(bouquet.stems) +
    bouquet.petals.count * countTriangles(geos.petal) +
    bouquet.centers.count * countTriangles(geos.center) +
    bouquet.buds.count * countTriangles(geos.bud) +
    bouquet.leaves.count * countTriangles(geos.leaf)
  );
}
