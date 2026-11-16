import React, { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Environment, Lightformer } from '@react-three/drei';
import {
  AdditiveBlending,
  BackSide,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  CylinderGeometry,
  DoubleSide,
  EdgesGeometry,
  ExtrudeGeometry,
  Float32BufferAttribute,
  LatheGeometry,
  LineBasicMaterial,
  MathUtils,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  PointsMaterial,
  QuadraticBezierCurve3,
  RepeatWrapping,
  Shape,
  SphereGeometry,
  SplineCurve,
  SpriteMaterial,
  SRGBColorSpace,
  TextureLoader,
  TubeGeometry,
  Vector2,
  Vector3,
  type Group,
  type InstancedMesh,
  type Material,
  type Mesh,
  type PerspectiveCamera,
  type PointLight,
  type Sprite,
  type Texture,
} from 'three';
import { AncestorInfoCard } from './hall3d/AncestorInfoCard';
import {
  CLICK_DRAG_THRESHOLD,
  exceedsDragThreshold,
  garlandLayout,
  pickLitMemorials,
  pickPortraitUrls,
  zoomDistance,
  zoomReducer,
} from './hall3d/hallInteraction';
import { formatSolarDate, memorialIdsOf, memorialLabel, vietnamToday, type SolarDate } from './hall3d/lunarCalendar';
import {
  PORTRAIT_PROGRAM_KEY,
  createPortraitUniforms,
  patchPortraitShader,
  setPortraitGrayscale,
} from './hall3d/portraitShader';
import './AncestralHall3D.css';

export interface Hall3DAncestor {
  id: string;
  name: string;
  generation: number;
  lifespan?: string;
  /** Ảnh bản nhỏ (512px) dùng trong cảnh 3D. Thiếu thì dùng portraitUrl. */
  thumbnailUrl?: string | null;
  /** Ảnh gốc: chỉ được tải khi người dùng phóng to ảnh. Không có ảnh nào hoặc tải lỗi thì dùng ảnh mặc định vẽ bằng canvas. */
  portraitUrl?: string | null;
  /** Ngày mất thô (PersonItem.deathDate, dạng yyyy-mm-dd hoặc chỉ có năm). Đủ ngày thì tính được ngày giỗ âm lịch. */
  deathDate?: string | null;
  /** Ngày sinh thô, hiện trên thẻ thông tin khi phóng to. */
  birthDate?: string | null;
  /** Ghi chú, hiện trên thẻ thông tin khi phóng to. */
  note?: string | null;
}

/** Một tầng bàn thờ (tầng đầu = đời cao nhất, đặt trên cùng). `tablets` là các bài vị của trang đang xem (tối đa 9). */
export interface Hall3DTier {
  id: string;
  /** Nhãn nhỏ của tầng, ví dụ "Đời 1". */
  label: string;
  tablets: Hall3DAncestor[];
  /** Trang đang xem (bắt đầu từ 1) và tổng số trang của tầng (mỗi trang tối đa 9 khung). */
  page: number;
  pageCount: number;
  /** Đang tải trang khác của tầng này. */
  pageLoading?: boolean;
}

export type HallQuality = 'high' | 'low';

export interface AncestralHall3DProps {
  /** Các tầng, từ trên xuống (tối đa 6). Rỗng hoặc mọi tầng không có bài vị: bàn thờ trống 5 khung mờ. */
  tiers: Hall3DTier[];
  /** id bài vị đang chọn (null: không chọn). */
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Chuyển trang trong một tầng (page bắt đầu từ 1). */
  onTierPage?: (tierId: string, page: number) => void;
  /** Số nén hương đã dâng của người đang chọn. */
  incenseCount?: number;
  /** Đang dâng hương (hiệu ứng ~1,6s): hiện thêm 1 nén hương tạm. */
  isBurning?: boolean;
  /** Hiển thị khi không có WebGL hoặc cảnh 3D bị lỗi. */
  fallback?: React.ReactNode;
  /** Gọi khi cảnh 3D bị lỗi lúc chạy. */
  onError?: () => void;
  /** Dòng gợi ý dưới canvas khi chưa có tiền nhân nào (ancestors rỗng). */
  emptyHint?: string;
  /** Chữ trên hoành phi (ví dụ tên dòng họ). Mặc định "ĐỨC LƯU QUANG". */
  hallTitle?: string;
  /** Ép chất lượng đồ họa; mặc định tự chọn theo thiết bị. */
  quality?: HallQuality;
  /** Tăng 1 mỗi lần thắp hương THÀNH CÔNG: cảnh 3D chạy chuỗi animation thắp hương (~2,5s). */
  offeringToken?: number;
  /** true: ảnh thờ hiện đen trắng, viền tối mờ ở góc (làm trong shader, không xử lý lại tệp ảnh). */
  portraitGrayscale?: boolean;
  /** Gọi khi người dùng phóng to một ảnh (id) hoặc trở lại cảnh chung (null): trang dùng để tải ảnh gốc đúng lúc. */
  onZoomChange?: (id: string | null) => void;
  /** Thời điểm "hôm nay" để tính ngày giỗ (mặc định: bây giờ). Chỉ để thử / minh họa. */
  today?: Date;
}

export const DEFAULT_EMPTY_HINT = 'Bàn thờ đang chờ dữ liệu tiền nhân';
export const DEFAULT_HALL_TITLE = 'ĐỨC LƯU QUANG';

/* ------------------------------------------------------------------ */
/* Kiểm tra WebGL, chất lượng, tùy chọn người dùng                     */
/* ------------------------------------------------------------------ */

export const isWebGLAvailable = (): boolean => {
  try {
    if (typeof window === 'undefined' || typeof document === 'undefined') return false;
    if (!(window as unknown as { WebGLRenderingContext?: unknown }).WebGLRenderingContext) return false;
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl2') ||
      canvas.getContext('webgl') ||
      canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
    if (!gl) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
};

const detectQuality = (): HallQuality => {
  try {
    if (window.innerWidth < 768) return 'low';
    const cores = navigator.hardwareConcurrency;
    if (typeof cores === 'number' && cores <= 4) return 'low';
  } catch {
    /* dùng mặc định */
  }
  return 'high';
};

const usePrefersReducedMotion = (): boolean => {
  const [reduced, setReduced] = useState<boolean>(() => {
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      return false;
    }
  });
  useEffect(() => {
    let media: MediaQueryList;
    try {
      media = window.matchMedia('(prefers-reduced-motion: reduce)');
    } catch {
      return undefined;
    }
    const onChange = () => setReduced(media.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);
  return reduced;
};

// Tab ẩn thì dừng vòng lặp render để không tốn pin/CPU.
const usePageVisible = (): boolean => {
  const [visible, setVisible] = useState<boolean>(() => typeof document === 'undefined' || document.visibilityState !== 'hidden');
  useEffect(() => {
    const onChange = () => setVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);
  return visible;
};

/* ------------------------------------------------------------------ */
/* Hằng số bố cục                                                      */
/* ------------------------------------------------------------------ */

const TABLET_SPACING = 0.95;
const MAX_TIERS = 6;
// Giá bậc thang khi có từ 2 tầng: đáy giá cao hơn nến, bình hoa, lư hương ở bàn trước; đỉnh sát hoành phi (thấp nhất ở y 3.35).
const RACK_BOTTOM_Y = 1.3;
const RACK_TOP_Y = 3.3;
const RACK_ROW_GAP = 0.1; // ván giá + khoảng thở giữa hai hàng (và dưới hàng trên cùng)
const RACK_SHIFT_Z = -0.1; // các hàng trên lùi sát tường
const RACK_DEPTH = 0.42;
const FRAME_UNIT_H = 0.86; // cao khung + đế ở cỡ 1
const TIER_SCALE_MAX = 1.5; // chừa chỗ cho nhãn tầng ở đầu hàng, không đụng hạc đồng ở hai đầu bàn
const MAX_INCENSE = 9;
const EMPTY_SLOT_COUNT = 5;
const EMPTY_SLOT_IDS = Array.from({ length: EMPTY_SLOT_COUNT }, (_, i) => i);

// Ba tầng: bàn sau (bài vị) > bàn giữa (ngũ quả, hoa, nến) > hương án (lư hương).
const BACK = { z: -2.9, w: 9.6, h: 1.0, d: 0.75 } as const;
const MID = { z: -2.15, w: 6.4, h: 0.78, d: 0.7 } as const;
const FRONT = { z: -1.4, w: 3.6, h: 0.62, d: 0.8 } as const;
const TOP_Y = { back: BACK.h + 0.015, mid: MID.h + 0.015, front: FRONT.h + 0.015 } as const;

// Khung ảnh thờ (kích thước trước khi nhân TABLET_SCALE): ảnh 3:4 ở trên, bảng tên ở dưới.
const FRAME_W = 0.46;
const FRAME_H = 0.8;
const PHOTO_W = 0.34;
const PHOTO_H = (PHOTO_W * 4) / 3;
const PHOTO_Y = FRAME_H - 0.045 - PHOTO_H / 2;
const PLATE_W = 0.36;
const PLATE_H = 0.2;
const PLATE_Y = 0.05 + PLATE_H / 2;
const TABLET_SCALE = 1.8;

// Kích thước phòng: MỌI THỨ (tường, sàn, trần, đồ thờ, camera) đều tính từ đây.
const ROOM = { w: 12, d: 9, h: 4.8, zBack: -6, zFront: 3 } as const;
const HX = ROOM.w / 2;
const ROOM_CENTER_Z = (ROOM.zBack + ROOM.zFront) / 2;
// Bộ bàn thờ được dựng trong hệ tọa độ riêng (tường sau ở z = -3.45) rồi dời sát tường sau của phòng.
const ALTAR_Z = ROOM.zBack + 3.45;

// Góc nhìn người đứng trong phòng.
const EYE_Y = 1.6;
const START_Z = ROOM.zFront - 1.4; // đứng cách tường cửa 1.4
const DOOR_Z = ROOM.zFront - 0.3; // điểm bước vào lúc mở đầu
const FRONT_EDGE_Z = ALTAR_Z + FRONT.z + FRONT.d / 2; // mép trước hương án
const STOP_Z = FRONT_EDGE_Z + 3.2; // tiến tối đa: cách bàn thờ 3.2
const MAX_X = 0.8;
const DEG = Math.PI / 180;
const YAW_LIMIT = 55 * DEG;
const PITCH_MIN = -18 * DEG;
const PITCH_MAX = 28 * DEG;
const DRAG_THRESHOLD = CLICK_DRAG_THRESHOLD; // px: vượt ngưỡng này là kéo, không phải bấm
const ZOOM_MAX_X = BACK.w / 2; // khi phóng to, camera được dịch ngang tới tận hai đầu hàng ảnh
const ZOOM_MIN_GAP = 0.45; // không tiến sát hơn mức này tới mặt ảnh
const ZOOM_MIN_Y = 1.35; // không hạ camera thấp hơn đồ thờ trên bàn
const ZOOM_MAX_Y = 3.0;
const INTRO_DURATION = 1.8;
const BASE_FOV = 66;
const MAX_FOV = 85;
const MIN_HORIZONTAL_FOV_RAD = 80 * DEG;

const COLOR = {
  bg: '#2a160d',
  gold: '#d9ad45',
  red: '#8f1b14',
  redDark: '#5a100c',
} as const;

const FONT_FAMILY = "'Times New Roman', Georgia, 'Noto Serif', serif";
const COUPLET_LEFT = 'TỔ TÔNG CÔNG ĐỨC LƯU THIÊN CỔ';
const COUPLET_RIGHT = 'TỬ HIẾU TÔN HIỀN THẾ VẠN NIÊN';

type V3 = [number, number, number];

// Thắp hương: mỗi lần cắm 3 nén, tối đa 9 nén trên lư; đủ rồi thì thay nhóm cũ nhất.
const STICKS_PER_OFFERING = 3;
const OFFER_DURATION = 2.5;
const OFFER_TAIL = 7; // sau đó khói về mức thường
// 9 vị trí cắm chia 3 nhóm; mỗi nhóm 3 nén tỏa ra ba hướng (cách nhau 120°), hơi ngả ra ngoài.
const INCENSE_SLOTS = Array.from({ length: MAX_INCENSE }, (_, i) => {
  const group = Math.floor(i / 3);
  const angle = (((i % 3) * 120 + group * 40 + 15) * Math.PI) / 180;
  const radius = 0.06 + group * 0.035;
  const tilt = 0.13 + group * 0.03;
  return {
    x: Math.cos(angle) * radius,
    z: Math.sin(angle) * radius,
    rx: Math.sin(angle) * tilt,
    rz: -Math.cos(angle) * tilt,
    spin: i * 1.3,
  };
});

// Hoa cúc cắm trong bình (vị trí cố định trên mặt vòm lá).
const FLOWER_LAYOUT = Array.from({ length: 11 }, (_, i) => {
  const angle = i * 2.399;
  const radius = i === 0 ? 0 : 0.045 + (i % 3) * 0.032;
  const dome = Math.sqrt(Math.max(0, 1 - (radius / 0.17) ** 2)) * 0.1;
  return { x: Math.cos(angle) * radius * 1.5, y: dome + 0.02, z: Math.sin(angle) * radius * 1.5, white: i % 2 === 0 };
});


// Khoảng cách giữa các khung tỉ lệ theo cỡ khung (cỡ 1.8 là cỡ gốc).
const tabletX = (localIndex: number, count: number, scale: number = TABLET_SCALE): number =>
  (localIndex - (count - 1) / 2) * TABLET_SPACING * (scale / TABLET_SCALE);

interface TierLayout {
  /** Cỡ khung ảnh thờ của mọi hàng. */
  scale: number;
  /** Độ cao mặt đế của từng hàng (hàng 0 = tầng trên cùng). */
  baseY: number[];
  /** Có giá bậc thang (từ 2 tầng trở lên). */
  rack: boolean;
  /** z của hàng khung (một tầng: trên mặt bàn sau; nhiều tầng: trên ván giá sát tường). */
  rowZ: number[];
}

/**
 * Bố cục các tầng: tầng 1 trên cùng. Khoảng cao dùng được từ mặt bàn sau tới sát hoành phi chia đều cho các tầng;
 * nhiều tầng thì giảm cỡ khung (không vượt bàn thờ). Một tầng: giữ nguyên bố cục gốc (cỡ 1.8, đứng trên bàn).
 */
const computeTierLayout = (count: number): TierLayout => {
  const rows = Math.max(1, Math.min(MAX_TIERS, count));
  if (rows === 1) {
    return { scale: TABLET_SCALE, baseY: [TOP_Y.back], rack: false, rowZ: [BACK.z] };
  }
  const fit = (RACK_TOP_Y - RACK_BOTTOM_Y - RACK_ROW_GAP * (rows - 1)) / (FRAME_UNIT_H * rows);
  const scale = Math.min(TIER_SCALE_MAX, Math.max(0.25, fit));
  const pitch = FRAME_UNIT_H * scale + RACK_ROW_GAP;
  const baseY = Array.from({ length: rows }, (_, i) => RACK_BOTTOM_Y + (rows - 1 - i) * pitch);
  const rowZ = baseY.map(() => BACK.z + RACK_SHIFT_Z);
  return { scale, baseY, rack: true, rowZ };
};

const easeInOutCubic = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/* ------------------------------------------------------------------ */
/* Vẽ texture bằng canvas (không tải gì từ ngoài)                      */
/* ------------------------------------------------------------------ */

const mulberry32 = (seed: number) => {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const makeCanvas = (width: number, height: number) => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D không khả dụng');
  return { canvas, ctx };
};

const toTexture = (canvas: HTMLCanvasElement, repeat?: [number, number]): CanvasTexture => {
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  if (repeat) {
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
    texture.repeat.set(repeat[0], repeat[1]);
  }
  return texture;
};

const goldGradient = (ctx: CanvasRenderingContext2D, w: number, h: number): CanvasGradient => {
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#f7de8e');
  g.addColorStop(0.5, '#d6a53a');
  g.addColorStop(1, '#f0cd73');
  return g;
};

// Chọn cỡ chữ vừa khít bề rộng cho phép.
const fitFontSize = (ctx: CanvasRenderingContext2D, text: string, weight: number, maxWidth: number, maxSize: number, minSize: number): number => {
  ctx.font = `${weight} 100px ${FONT_FAMILY}`;
  const width = ctx.measureText(text).width || 1;
  return Math.max(minSize, Math.min(maxSize, (maxWidth / width) * 100));
};

// Quá dài so với cỡ chữ nhỏ nhất thì rút gọn bằng dấu …
const truncateToFit = (ctx: CanvasRenderingContext2D, text: string, font: string, maxWidth: number): string => {
  ctx.font = font;
  if (ctx.measureText(text).width <= maxWidth) return text;
  let result = text;
  while (result.length > 1 && ctx.measureText(`${result}…`).width > maxWidth) result = result.slice(0, -1);
  return `${result.trimEnd()}…`;
};

const createTileTexture = (): CanvasTexture => {
  const size = 512;
  const tiles = 4;
  const tile = size / tiles;
  const { canvas, ctx } = makeCanvas(size, size);
  const rnd = mulberry32(7);
  const palette = ['#a4512d', '#9a4828', '#ad5a34', '#a24f2b', '#b2603a'];
  for (let row = 0; row < tiles; row += 1) {
    for (let col = 0; col < tiles; col += 1) {
      const x = col * tile;
      const y = row * tile;
      ctx.fillStyle = palette[Math.floor(rnd() * palette.length)];
      ctx.fillRect(x, y, tile, tile);
      for (let i = 0; i < 70; i += 1) {
        ctx.fillStyle = rnd() > 0.5 ? 'rgba(255,225,180,0.07)' : 'rgba(40,15,5,0.09)';
        ctx.fillRect(x + rnd() * tile, y + rnd() * tile, 1 + rnd() * 3, 1 + rnd() * 3);
      }
      ctx.fillStyle = 'rgba(255,220,170,0.2)';
      ctx.fillRect(x, y, tile, 2);
      ctx.fillRect(x, y, 2, tile);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(x, y + tile - 2, tile, 2);
      ctx.fillRect(x + tile - 2, y, 2, tile);
    }
  }
  ctx.strokeStyle = '#2c1a10';
  ctx.lineWidth = 4;
  for (let i = 0; i <= tiles; i += 1) {
    ctx.beginPath();
    ctx.moveTo(i * tile, 0);
    ctx.lineTo(i * tile, size);
    ctx.moveTo(0, i * tile);
    ctx.lineTo(size, i * tile);
    ctx.stroke();
  }
  return toTexture(canvas, [4.5, 5]);
};

const createWoodTexture = (): CanvasTexture => {
  const size = 256;
  const { canvas, ctx } = makeCanvas(size, size);
  const rnd = mulberry32(21);
  const g = ctx.createLinearGradient(0, 0, size, 0);
  g.addColorStop(0, '#4a2616');
  g.addColorStop(0.5, '#56301c');
  g.addColorStop(1, '#46231a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 110; i += 1) {
    const x = rnd() * size;
    const w = 0.5 + rnd() * 1.8;
    ctx.fillStyle = rnd() > 0.45 ? `rgba(20,8,3,${0.08 + rnd() * 0.16})` : `rgba(190,120,70,${0.05 + rnd() * 0.1})`;
    ctx.fillRect(x, 0, w, size);
  }
  for (let i = 0; i < 4; i += 1) {
    const cx = rnd() * size;
    const cy = rnd() * size;
    ctx.strokeStyle = 'rgba(25,10,4,0.35)';
    ctx.lineWidth = 1.2;
    for (let r = 3; r < 14; r += 3) {
      ctx.beginPath();
      ctx.ellipse(cx, cy, r * 0.6, r * 1.8, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  return toTexture(canvas, [1, 1]);
};

const createWallTexture = (): CanvasTexture => {
  const { canvas, ctx } = makeCanvas(8, 256);
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#5a3322');
  g.addColorStop(0.45, '#85573a');
  g.addColorStop(1, '#a06e48');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 8, 256);
  return toTexture(canvas);
};

const createRugTexture = (): CanvasTexture => {
  const w = 512;
  const h = 256;
  const { canvas, ctx } = makeCanvas(w, h);
  ctx.fillStyle = '#7a1410';
  ctx.fillRect(0, 0, w, h);
  const gold = goldGradient(ctx, w, h);
  ctx.strokeStyle = gold;
  ctx.lineWidth = 8;
  ctx.strokeRect(14, 14, w - 28, h - 28);
  ctx.lineWidth = 2;
  ctx.strokeRect(30, 30, w - 60, h - 60);
  ctx.fillStyle = gold;
  for (let x = 60; x < w - 50; x += 36) {
    ctx.beginPath();
    ctx.moveTo(x, h / 2 - 12);
    ctx.lineTo(x + 12, h / 2);
    ctx.lineTo(x, h / 2 + 12);
    ctx.lineTo(x - 12, h / 2);
    ctx.closePath();
    ctx.globalAlpha = 0.75;
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  const rnd = mulberry32(3);
  for (let i = 0; i < 400; i += 1) {
    ctx.fillStyle = rnd() > 0.5 ? 'rgba(255,200,160,0.04)' : 'rgba(0,0,0,0.07)';
    ctx.fillRect(rnd() * w, rnd() * h, 2, 2);
  }
  return toTexture(canvas);
};

const createClothTexture = (): CanvasTexture => {
  const w = 256;
  const h = 160;
  const { canvas, ctx } = makeCanvas(w, h);
  ctx.fillStyle = '#8c1613';
  ctx.fillRect(0, 0, w, h);
  const gold = goldGradient(ctx, w, h);
  ctx.fillStyle = gold;
  ctx.fillRect(0, 0, w, 6);
  ctx.fillRect(0, 12, w, 2);
  ctx.fillRect(0, 0, 6, h);
  ctx.fillRect(w - 6, 0, 6, h);
  for (let x = 12; x < w - 8; x += 20) {
    ctx.beginPath();
    ctx.moveTo(x, 30);
    ctx.lineTo(x + 8, 40);
    ctx.lineTo(x, 50);
    ctx.lineTo(x - 8, 40);
    ctx.closePath();
    ctx.globalAlpha = 0.7;
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = gold;
  ctx.fillRect(0, h - 26, w, 3);
  for (let x = 4; x < w; x += 8) ctx.fillRect(x, h - 20, 3, 20);
  return toTexture(canvas);
};

const createApronTexture = (): CanvasTexture => {
  const w = 128;
  const h = 32;
  const { canvas, ctx } = makeCanvas(w, h);
  ctx.fillStyle = '#5a100c';
  ctx.fillRect(0, 0, w, h);
  const gold = goldGradient(ctx, w, h);
  ctx.fillStyle = gold;
  ctx.fillRect(0, 0, w, 3);
  ctx.fillRect(0, h - 3, w, 3);
  ctx.strokeStyle = gold;
  ctx.lineWidth = 2;
  for (let x = 16; x < w; x += 32) {
    ctx.beginPath();
    ctx.arc(x, h / 2, 8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, h / 2, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x + 10, h / 2);
    ctx.quadraticCurveTo(x + 16, h / 2 - 9, x + 22, h / 2);
    ctx.quadraticCurveTo(x + 16, h / 2 + 9, x + 10, h / 2);
    ctx.stroke();
  }
  return toTexture(canvas, [1, 1]);
};

const createSoftDotTexture = (): CanvasTexture => {
  const size = 64;
  const { canvas, ctx } = makeCanvas(size, size);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return toTexture(canvas);
};

const drawCornerOrnaments = (ctx: CanvasRenderingContext2D, w: number, h: number, inset: number) => {
  const size = Math.min(w, h) * 0.12;
  ctx.fillStyle = goldGradient(ctx, w, h);
  const corners: Array<[number, number, number, number]> = [
    [inset, inset, 1, 1],
    [w - inset, inset, -1, 1],
    [inset, h - inset, 1, -1],
    [w - inset, h - inset, -1, -1],
  ];
  corners.forEach(([x, y, sx, sy]) => {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + sx * size, y);
    ctx.lineTo(x + sx * size * 0.55, y + sy * size * 0.18);
    ctx.lineTo(x + sx * size * 0.18, y + sy * size * 0.55);
    ctx.lineTo(x, y + sy * size);
    ctx.closePath();
    ctx.fill();
  });
};

const createPlaqueTexture = (rawText: string): CanvasTexture => {
  const w = 1024;
  const h = 191;
  const { canvas, ctx } = makeCanvas(w, h);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#8e1a14');
  g.addColorStop(1, '#6a100c');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const gold = goldGradient(ctx, w, h);
  ctx.strokeStyle = gold;
  ctx.lineWidth = 7;
  ctx.strokeRect(12, 12, w - 24, h - 24);
  ctx.lineWidth = 2;
  ctx.strokeRect(26, 26, w - 52, h - 52);
  drawCornerOrnaments(ctx, w, h, 14);
  const text = (rawText.trim() || DEFAULT_HALL_TITLE).toLocaleUpperCase('vi-VN');
  const maxWidth = w - 260;
  const size = fitFontSize(ctx, text, 700, maxWidth, 112, 40);
  const font = `700 ${size}px ${FONT_FAMILY}`;
  const shown = truncateToFit(ctx, text, font, maxWidth);
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 3;
  ctx.fillStyle = gold;
  ctx.fillText(shown, w / 2, h / 2 + 4);
  return toTexture(canvas);
};

const createCoupletTexture = (phrase: string, w = 128, h = 1067): CanvasTexture => {
  const { canvas, ctx } = makeCanvas(w, h);
  const g = ctx.createLinearGradient(0, 0, w, 0);
  g.addColorStop(0, '#6e110d');
  g.addColorStop(0.5, '#8e1a14');
  g.addColorStop(1, '#6e110d');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const gold = goldGradient(ctx, w, h);
  ctx.strokeStyle = gold;
  ctx.lineWidth = 5;
  ctx.strokeRect(6, 6, w - 12, h - 12);
  ctx.lineWidth = 1.5;
  ctx.strokeRect(14, 14, w - 28, h - 28);
  const words = phrase.split(' ');
  const cell = (h - 80) / words.length;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = gold;
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 3;
  words.forEach((word, i) => {
    const size = fitFontSize(ctx, word, 700, w - 44, 54, 24);
    ctx.font = `700 ${size}px ${FONT_FAMILY}`;
    ctx.fillText(word, w / 2, 40 + cell * (i + 0.5));
  });
  return toTexture(canvas);
};

/** "1941-03-12" -> "12/03/1941"; chỉ có năm thì trả năm; không rõ thì trả chuỗi rỗng. */
export const formatDeathDate = (raw?: string | null): string => formatSolarDate(raw);

// Bảng tên dưới ảnh thờ: HỌ TÊN (đậm) + "Mất: dd/mm/yyyy". Chữ ngang, tự co, quá dài thì rút gọn bằng …
const createNamePlateTexture = (name: string, deathText: string): CanvasTexture => {
  const w = 512;
  const h = 284;
  const { canvas, ctx } = makeCanvas(w, h);
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#5e1310');
  bg.addColorStop(1, '#3d0b09');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  const gold = goldGradient(ctx, w, h);
  ctx.strokeStyle = gold;
  ctx.lineWidth = 7;
  ctx.strokeRect(10, 10, w - 20, h - 20);
  ctx.lineWidth = 2;
  ctx.strokeRect(22, 22, w - 44, h - 44);

  const maxWidth = w - 76;
  const upperName = (name.trim() || '—').toLocaleUpperCase('vi-VN');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 4;
  ctx.fillStyle = gold;
  const size = fitFontSize(ctx, upperName, 700, maxWidth, 74, 34);
  const font = `700 ${size}px ${FONT_FAMILY}`;
  const shown = truncateToFit(ctx, upperName, font, maxWidth);
  ctx.font = font;
  ctx.fillText(shown, w / 2, deathText ? 108 : h / 2 + 2);
  if (deathText) {
    const line = `Mất: ${deathText}`;
    const subSize = fitFontSize(ctx, line, 500, maxWidth, 46, 28);
    ctx.font = `500 ${subSize}px ${FONT_FAMILY}`;
    ctx.fillText(line, w / 2, 198);
  }
  return toTexture(canvas);
};

// Nhãn tầng nhỏ ("Đời 1") đặt ở đầu mỗi hàng ảnh thờ.
const createTierLabelTexture = (text: string): CanvasTexture => {
  const w = 256;
  const h = 102;
  const { canvas, ctx } = makeCanvas(w, h);
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#6a1410');
  bg.addColorStop(1, '#430c09');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  const gold = goldGradient(ctx, w, h);
  ctx.strokeStyle = gold;
  ctx.lineWidth = 6;
  ctx.strokeRect(6, 6, w - 12, h - 12);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = gold;
  const label = text.trim() || '—';
  const size = fitFontSize(ctx, label, 700, w - 40, 58, 22);
  const font = `700 ${size}px ${FONT_FAMILY}`;
  ctx.font = font;
  ctx.fillText(truncateToFit(ctx, label, font, w - 40), w / 2, h / 2 + 2);
  return toTexture(canvas);
};

// Ảnh thờ mặc định khi chưa có ảnh: nền ấm, bóng người chân dung trang nghiêm.
const createDefaultPortraitTexture = (): CanvasTexture => {
  const w = 300;
  const h = 400;
  const { canvas, ctx } = makeCanvas(w, h);
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#c9b08a');
  bg.addColorStop(1, '#8a6b4c');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  const halo = ctx.createRadialGradient(w / 2, 150, 20, w / 2, 170, 230);
  halo.addColorStop(0, 'rgba(255,240,205,0.55)');
  halo.addColorStop(1, 'rgba(255,240,205,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, w, h);
  const body = ctx.createLinearGradient(0, 120, 0, h);
  body.addColorStop(0, '#5a4130');
  body.addColorStop(1, '#3a2a1f');
  ctx.fillStyle = body;
  // vai và áo
  ctx.beginPath();
  ctx.moveTo(18, h);
  ctx.bezierCurveTo(22, 292, 88, 262, 150, 258);
  ctx.bezierCurveTo(212, 262, 278, 292, 282, h);
  ctx.closePath();
  ctx.fill();
  // cổ + đầu
  ctx.fillRect(128, 210, 44, 56);
  ctx.beginPath();
  ctx.ellipse(150, 158, 58, 70, 0, 0, Math.PI * 2);
  ctx.fill();
  // cổ áo
  ctx.strokeStyle = 'rgba(230,205,160,0.5)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(118, 270);
  ctx.lineTo(150, 318);
  ctx.lineTo(182, 270);
  ctx.stroke();
  const vignette = ctx.createRadialGradient(w / 2, h / 2, 120, w / 2, h / 2, 290);
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(30,15,5,0.5)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, w, h);
  return toTexture(canvas);
};

// Hoa văn nhẹ trên thân đỉnh đồng (nhân với màu đồng của vật liệu).
const createBronzeTexture = (): CanvasTexture => {
  const w = 256;
  const h = 128;
  const { canvas, ctx } = makeCanvas(w, h);
  ctx.fillStyle = '#e4e4e4';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(70,45,10,0.5)';
  ctx.fillRect(0, 18, w, 4);
  ctx.fillRect(0, 96, w, 4);
  ctx.fillRect(0, 108, w, 2);
  ctx.strokeStyle = 'rgba(70,45,10,0.55)';
  ctx.lineWidth = 3;
  // dải hồi văn
  for (let x = 0; x < w; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x + 4, 82);
    ctx.lineTo(x + 4, 38);
    ctx.lineTo(x + 26, 38);
    ctx.lineTo(x + 26, 70);
    ctx.lineTo(x + 13, 70);
    ctx.lineTo(x + 13, 52);
    ctx.stroke();
  }
  const texture = toTexture(canvas, [6, 1]);
  return texture;
};

// Vệt phản chiếu ánh nến trên lớp kính: hai dải sáng chéo ấm, mờ dần. Cộng sáng (additive) nên chỗ đen là trong suốt.
const createGlassStreakTexture = (): CanvasTexture => {
  const w = 128;
  const h = 192;
  const { canvas, ctx } = makeCanvas(w, h);
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, w, h);
  const band = (offset: number, width: number, alpha: number) => {
    const g = ctx.createLinearGradient(offset, 0, offset + width, h * 0.55);
    g.addColorStop(0, 'rgba(255,214,150,0)');
    g.addColorStop(0.5, `rgba(255,222,165,${alpha})`);
    g.addColorStop(1, 'rgba(255,214,150,0)');
    ctx.fillStyle = g;
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(-0.42);
    ctx.translate(-w / 2, -h / 2);
    ctx.fillRect(offset - 20, -40, width, h + 80);
    ctx.restore();
  };
  band(-6, 34, 0.55);
  band(46, 14, 0.35);
  // mờ dần về phía dưới để ảnh phía dưới không bị che
  const fade = ctx.createLinearGradient(0, 0, 0, h);
  fade.addColorStop(0, 'rgba(0,0,0,0)');
  fade.addColorStop(1, 'rgba(0,0,0,0.75)');
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, w, h);
  return toTexture(canvas);
};

// Cắt ảnh kiểu "cover" cho khung có tỉ lệ rộng/cao cho trước (ưu tiên giữ phần trên của ảnh chân dung).
const applyCoverCrop = (texture: Texture, targetAspect: number) => {
  const image = texture.image as { width?: number; height?: number } | undefined;
  const iw = image?.width ?? 0;
  const ih = image?.height ?? 0;
  if (!iw || !ih) return;
  const aspect = iw / ih;
  if (aspect > targetAspect) {
    texture.repeat.set(targetAspect / aspect, 1);
    texture.offset.set((1 - texture.repeat.x) / 2, 0);
  } else {
    texture.repeat.set(1, aspect / targetAspect);
    texture.offset.set(0, (1 - texture.repeat.y) * 0.7);
  }
};

/* ------------------------------------------------------------------ */
/* Hình học dùng chung                                                 */
/* ------------------------------------------------------------------ */

// Hình chữ nhật bo góc: x từ -w/2..w/2, y từ y0..y0+h.
const roundedRectShape = (w: number, h: number, r: number, y0 = -h / 2): Shape => {
  const x0 = -w / 2;
  const radius = Math.max(0.001, Math.min(r, w / 2 - 0.001, h / 2 - 0.001));
  const shape = new Shape();
  shape.moveTo(x0 + radius, y0);
  shape.lineTo(x0 + w - radius, y0);
  shape.absarc(x0 + w - radius, y0 + radius, radius, -Math.PI / 2, 0, false);
  shape.lineTo(x0 + w, y0 + h - radius);
  shape.absarc(x0 + w - radius, y0 + h - radius, radius, 0, Math.PI / 2, false);
  shape.lineTo(x0 + radius, y0 + h);
  shape.absarc(x0 + radius, y0 + h - radius, radius, Math.PI / 2, Math.PI, false);
  shape.lineTo(x0, y0 + radius);
  shape.absarc(x0 + radius, y0 + radius, radius, Math.PI, Math.PI * 1.5, false);
  return shape;
};

// Hộp bo cạnh (thay BoxGeometry cho đồ gỗ): góc tròn + vát mép, tâm ở gốc tọa độ.
const createRoundedBox = (w: number, h: number, d: number, r: number, high: boolean): ExtrudeGeometry => {
  const bevel = Math.max(0.002, Math.min(r * 0.6, h * 0.3, 0.02));
  const geometry = new ExtrudeGeometry(roundedRectShape(w - bevel * 2, d - bevel * 2, r), {
    depth: Math.max(0.001, h - bevel * 2),
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: high ? 3 : 1,
    curveSegments: high ? 6 : 3,
  });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, -(h - bevel * 2) / 2, 0);
  return geometry;
};

// Tròn xoay từ đường cong hồ sơ mượt (spline qua các điểm [bán kính, cao]).
const latheSmooth = (points: Array<[number, number]>, segments: number, samples: number): LatheGeometry => {
  const curve = new SplineCurve(points.map(([x, y]) => new Vector2(Math.max(0, x), y)));
  const profile = curve.getPoints(samples).map((p) => new Vector2(Math.max(0, p.x), p.y));
  return new LatheGeometry(profile, segments);
};

const bell = (x: number): number => (x <= 0 || x >= 1 ? 0 : Math.sin(Math.PI * x));

const lathe = (points: Array<[number, number]>, segments = 24): LatheGeometry =>
  new LatheGeometry(points.map(([x, y]) => new Vector2(x, y)), segments);

/* ------------------------------------------------------------------ */
/* Tài nguyên dùng chung (tạo một lần, giải phóng khi unmount)         */
/* ------------------------------------------------------------------ */

const createResources = (quality: HallQuality) => {
  const disposables: Array<{ dispose: () => void }> = [];
  const track = <T extends { dispose: () => void }>(item: T): T => {
    disposables.push(item);
    return item;
  };
  const high = quality === 'high';

  const tileTex = track(createTileTexture());
  tileTex.repeat.set((ROOM.w + 2) / 2, (ROOM.d + 2) / 2); // ô gạch ~0.5 m
  const woodTex = track(createWoodTexture());
  const ceilingTex = track(woodTex.clone());
  ceilingTex.repeat.set(6, 5);
  ceilingTex.wrapS = RepeatWrapping;
  ceilingTex.wrapT = RepeatWrapping;
  const wallTex = track(createWallTexture());
  const rugTex = track(createRugTexture());
  const clothTex = track(createClothTexture());
  const apronTex = track(createApronTexture());
  const softTex = track(createSoftDotTexture());
  const defaultPortrait = track(createDefaultPortraitTexture());
  const bronzeTex = track(createBronzeTexture());
  const glassStreakTex = track(createGlassStreakTexture());

  const apron = (width: number) => {
    const t = track(apronTex.clone());
    t.wrapS = RepeatWrapping;
    t.wrapT = RepeatWrapping;
    t.repeat.set(Math.max(2, Math.round(width * 3.5)), 1);
    return track(new MeshStandardMaterial({ map: t, roughness: 0.5, metalness: 0.3 }));
  };

  const std = (params: ConstructorParameters<typeof MeshStandardMaterial>[0]) => track(new MeshStandardMaterial(params));

  const mat = {
    gold: std({ color: COLOR.gold, metalness: 0.9, roughness: 0.35 }),
    lacquer: std({ color: COLOR.red, metalness: 0.1, roughness: 0.25 }),
    lacquerDark: std({ color: COLOR.redDark, metalness: 0.1, roughness: 0.3 }),
    wood: std({ map: woodTex, roughness: 0.6, metalness: 0.05 }),
    woodDark: std({ map: woodTex, color: '#b8947a', emissive: '#3a1c0e', emissiveIntensity: 0.5, roughness: 0.65, metalness: 0.05 }),
    ceiling: std({ map: ceilingTex, color: '#c9a58a', emissive: '#4a2814', emissiveIntensity: 0.7, roughness: 0.8 }),
    bronze: std({ color: '#b07a2c', metalness: 0.85, roughness: 0.38, side: DoubleSide }),
    porcelain: std({ color: '#efeee8', roughness: 0.25, metalness: 0, side: DoubleSide }),
    stone: std({ color: '#7a746b', roughness: 0.9 }),
    floor: std({ map: tileTex, roughness: 0.38, metalness: 0.05 }),
    wall: std({ map: wallTex, roughness: 0.95 }),
    rug: std({ map: rugTex, roughness: 0.95 }),
    cloth: std({ map: clothTex, roughness: 0.85, side: DoubleSide }),
    clothPlain: std({ color: '#8c1613', roughness: 0.85 }),
    foliage: std({ color: '#3d6b2a', roughness: 0.9 }),
    flowerYellow: std({ color: '#f2c230', roughness: 0.7 }),
    flowerWhite: std({ color: '#f7f3e8', roughness: 0.7 }),
    candle: std({ color: '#b01e16', roughness: 0.55 }),
    stickFoot: std({ color: '#a3241a', roughness: 0.85 }),
    stickBody: std({ color: '#b98a3a', roughness: 0.9 }),
    ashGray: std({ color: '#a39e95', roughness: 1 }),
    ash: std({ color: '#8a8174', roughness: 1 }),
    bronzeOrn: std({ map: bronzeTex, color: '#b07a2c', metalness: 0.85, roughness: 0.35, side: DoubleSide }),
    banana: std({ color: '#a4c23e', roughness: 0.55 }),
    pomelo: std({ color: '#d9cc55', roughness: 0.6 }),
    orange: std({ color: '#ef8a1f', roughness: 0.5 }),
    apple: std({ color: '#c8231c', roughness: 0.35 }),
    mango: std({ color: '#f2b632', roughness: 0.45 }),
    stem: std({ color: '#4a3220', roughness: 0.9 }),
    lantern: std({ color: '#d42a1c', emissive: '#ff2a14', emissiveIntensity: 0.85, roughness: 0.5 }),
    craneWhite: std({ color: '#f6f3ec', roughness: 0.6 }),
    craneDark: std({ color: '#2a2420', roughness: 0.7 }),
    craneBeak: std({ color: '#e08a2a', roughness: 0.6 }),
    apronBack: apron(BACK.w),
    apronMid: apron(MID.w),
    apronFront: apron(FRONT.w),
    ember: track(new MeshBasicMaterial({ color: '#ff5a1f' })),
    // Nhóm nhang vừa cắm: màu và độ sáng do animation thắp hương điều khiển.
    emberNew: track(new MeshBasicMaterial({ color: '#ff5a1f' })),
    emberGlowNew: track(
      new SpriteMaterial({ map: softTex, color: '#ff6a30', transparent: true, opacity: 0.9, blending: AdditiveBlending, depthWrite: false })
    ),
    offerFlash: track(
      new SpriteMaterial({ map: softTex, color: '#ffd07a', transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false })
    ),
    flame: track(new MeshBasicMaterial({ color: '#ffd77a' })),
    flameGlow: track(
      new SpriteMaterial({ map: softTex, color: '#ffb25a', transparent: true, opacity: 0.8, blending: AdditiveBlending, depthWrite: false })
    ),
    emberGlow: track(
      new SpriteMaterial({ map: softTex, color: '#ff6a30', transparent: true, opacity: 0.9, blending: AdditiveBlending, depthWrite: false })
    ),
    ghost: track(new MeshStandardMaterial({ color: '#ead9a6', transparent: true, opacity: 0.25, depthWrite: false })),
    ghostLine: track(new LineBasicMaterial({ color: COLOR.gold, transparent: true, opacity: 0.7 })),
    // Lớp kính mỏng phủ ảnh thờ: phản chiếu môi trường ấm (Lightformer) và ánh nến; chỉ ở chế độ high.
    glass: track(
      new MeshPhysicalMaterial({
        color: '#ffffff',
        transparent: true,
        opacity: 0.16,
        roughness: 0.04,
        metalness: 0,
        clearcoat: 1,
        clearcoatRoughness: 0.05,
        envMapIntensity: 1.6,
        depthWrite: false,
      })
    ),
    // Vệt sáng ánh nến trên kính (cộng sáng): độ sáng dao động nhẹ theo ngọn nến, tắt dao động ở chế độ nhẹ / giảm chuyển động.
    glassStreak: track(
      new MeshBasicMaterial({ map: glassStreakTex, color: '#ffd9a0', transparent: true, opacity: 0.2, blending: AdditiveBlending, depthWrite: false })
    ),
    // Vỏ bao ngoài phòng (nhìn từ trong): nếu có khe hở thì chỉ thấy màu tường tối ấm.
    shell: std({ color: COLOR.bg, side: BackSide, roughness: 1 }),
    window: std({ color: '#7a5230', emissive: '#ffb060', emissiveIntensity: 0.55, roughness: 1 }),
    doorDark: std({ color: '#150a06', emissive: '#2e1509', emissiveIntensity: 0.5, roughness: 1 }),
  };

  const seg = high ? 40 : 18; // số múi tròn xoay
  const smp = high ? 28 : 12; // số điểm lấy mẫu trên đường cong hồ sơ

  // Khung ảnh thờ: viền vàng bo góc phía ngoài, lòng sơn son phía trong.
  const frameOuter = track(
    new ExtrudeGeometry(roundedRectShape(FRAME_W, FRAME_H, 0.035, 0), {
      depth: 0.052, // khung dày hơn (thân sâu ra phía sau, mặt trước giữ nguyên)
      bevelEnabled: true,
      bevelThickness: 0.008,
      bevelSize: 0.008,
      bevelSegments: high ? 3 : 1,
      curveSegments: high ? 8 : 4,
    })
  );
  frameOuter.translate(0, 0, -0.042);
  const frameInner = track(
    new ExtrudeGeometry(roundedRectShape(FRAME_W - 0.045, FRAME_H - 0.045, 0.022, 0.0225), {
      depth: 0.03,
      bevelEnabled: true,
      bevelThickness: 0.006,
      bevelSize: 0.006,
      bevelSegments: high ? 2 : 1,
      curveSegments: high ? 8 : 4,
    })
  );
  frameInner.translate(0, 0, -0.012);
  // Gờ viền vàng nổi quanh lòng khung: ảnh nằm lõm sau gờ, nhìn khung dày và có chiều sâu.
  const rimShape = roundedRectShape(FRAME_W - 0.03, FRAME_H - 0.03, 0.026, 0.015);
  rimShape.holes.push(roundedRectShape(FRAME_W - 0.072, FRAME_H - 0.072, 0.018, 0.036));
  const frameRim = track(
    new ExtrudeGeometry(rimShape, {
      depth: 0.008,
      bevelEnabled: true,
      bevelThickness: 0.004,
      bevelSize: 0.003,
      bevelSegments: high ? 2 : 1,
      curveSegments: high ? 8 : 4,
    })
  );
  frameRim.translate(0, 0, 0.02);

  const legCurve = new CatmullRomCurve3([new Vector3(0, 0.13, 0), new Vector3(0.05, 0.1, 0), new Vector3(0.072, 0.045, 0), new Vector3(0.045, 0, 0)]);
  const bananaCurve = new QuadraticBezierCurve3(new Vector3(0, 0.05, 0), new Vector3(0, -0.012, 0.09), new Vector3(0, 0.03, 0.17));
  const ashCurve = new QuadraticBezierCurve3(new Vector3(0, 0, 0), new Vector3(0, 0.035, 0), new Vector3(0.018, 0.055, 0));

  const rboxCache = new Map<string, ExtrudeGeometry>();
  const rbox = (w: number, h: number, d: number, r: number): ExtrudeGeometry => {
    const key = `${w.toFixed(3)}|${h.toFixed(3)}|${d.toFixed(3)}|${r.toFixed(3)}`;
    let geometry = rboxCache.get(key);
    if (!geometry) {
      geometry = track(createRoundedBox(w, h, d, r, high));
      rboxCache.set(key, geometry);
    }
    return geometry;
  };

  const geo = {
    box: track(new BoxGeometry(1, 1, 1)),
    cyl: track(new CylinderGeometry(1, 1, 1, high ? 24 : 14)),
    sph: track(new SphereGeometry(1, high ? 20 : 12, high ? 14 : 8)),
    plane: track(new BoxGeometry(1, 1, 0.001)),
    frameOuter,
    frameInner,
    frameRim,
    glass: track(new PlaneGeometry(PHOTO_W + 0.02, PHOTO_H + 0.02)),
    frameEdges: track(new EdgesGeometry(frameOuter, 40)),
    photo: track(new PlaneGeometry(PHOTO_W, PHOTO_H)),
    photoBorder: track(new PlaneGeometry(PHOTO_W + 0.024, PHOTO_H + 0.024)),
    plate: track(new PlaneGeometry(PLATE_W, PLATE_H)),
    // Chân quỳ cong (cao 1 đơn vị, kéo giãn theo chiều cao bàn).
    leg: track(latheSmooth([[0, 0], [0.072, 0.004], [0.078, 0.04], [0.042, 0.11], [0.034, 0.32], [0.046, 0.68], [0.076, 0.9], [0.066, 0.985], [0, 1]], high ? 20 : 12, smp)),
    // Đỉnh đồng: đáy thu, bụng phình, cổ thắt, miệng loe.
    burner: track(
      latheSmooth(
        [[0, 0.02], [0.1, 0.022], [0.17, 0.04], [0.25, 0.085], [0.305, 0.15], [0.325, 0.22], [0.305, 0.285], [0.262, 0.325], [0.25, 0.348], [0.272, 0.372], [0.332, 0.396], [0.346, 0.408], [0.33, 0.414], [0.292, 0.402]],
        seg,
        smp * 2
      )
    ),
    burnerLeg: track(new TubeGeometry(legCurve, high ? 12 : 6, 0.03, high ? 10 : 6, false)),
    burnerHandle: track(new TubeGeometry(new CatmullRomCurve3([new Vector3(0, -0.07, 0), new Vector3(0.07, -0.04, 0), new Vector3(0.085, 0.03, 0), new Vector3(0.04, 0.085, 0), new Vector3(-0.01, 0.07, 0)]), high ? 16 : 8, 0.017, high ? 8 : 5, false)),
    // Đĩa có chân (mâm bồng).
    dish: track(latheSmooth([[0, 0], [0.11, 0.002], [0.122, 0.016], [0.062, 0.042], [0.046, 0.09], [0.075, 0.118], [0.2, 0.142], [0.272, 0.176], [0.282, 0.188], [0.262, 0.184], [0.18, 0.158], [0, 0.152]], seg, smp * 2)),
    vase: track(latheSmooth([[0, 0], [0.07, 0.002], [0.086, 0.02], [0.12, 0.1], [0.136, 0.19], [0.116, 0.28], [0.072, 0.34], [0.056, 0.39], [0.076, 0.43], [0.102, 0.456], [0.09, 0.458], [0.062, 0.412]], seg, smp * 2)),
    candleHolder: track(latheSmooth([[0, 0], [0.085, 0.002], [0.092, 0.016], [0.046, 0.032], [0.028, 0.07], [0.046, 0.1], [0.028, 0.13], [0.031, 0.158], [0.076, 0.18], [0.082, 0.192], [0.046, 0.192], [0, 0.186]], seg, smp * 2)),
    candleBody: track(new CylinderGeometry(0.033, 0.038, 0.28, high ? 20 : 10)),
    // Ngọn lửa hình giọt nước.
    flame: track(latheSmooth([[0, 0], [0.017, 0.01], [0.025, 0.03], [0.019, 0.056], [0.008, 0.082], [0, 0.102]], high ? 16 : 8, smp)),
    cup: track(latheSmooth([[0, 0], [0.026, 0.002], [0.03, 0.01], [0.04, 0.03], [0.052, 0.056], [0.054, 0.064], [0.049, 0.064], [0.036, 0.034], [0, 0.026]], high ? 24 : 12, smp)),
    // Đài rượu có chân.
    wineCup: track(latheSmooth([[0, 0], [0.03, 0.002], [0.032, 0.009], [0.012, 0.02], [0.01, 0.05], [0.03, 0.066], [0.04, 0.09], [0.042, 0.1], [0.038, 0.1], [0.028, 0.072], [0, 0.066]], high ? 24 : 12, smp)),
    banana: track(new TubeGeometry(bananaCurve, high ? 10 : 5, 0.018, high ? 8 : 5, false)),
    // Nén nhang: chân nhang đỏ mảnh, thân vàng nâu thuôn, đoạn tro xám cong nhẹ.
    stickFoot: track(new CylinderGeometry(0.0055, 0.0055, 0.17, 6)),
    stickBody: track(new CylinderGeometry(0.0075, 0.011, 0.28, 8)),
    stickAsh: track(new TubeGeometry(ashCurve, 5, 0.006, 5, false)),
  };

  // Hạt bụi dùng chung texture mềm.
  const dustMaterial = track(
    new PointsMaterial({ map: softTex, size: 0.06, color: '#ffdca0', transparent: true, opacity: 0.55, depthWrite: false, blending: AdditiveBlending })
  );

  return {
    mat,
    geo,
    rbox,
    soft: softTex,
    defaultPortrait,
    dustMaterial,
    dispose: () => disposables.forEach((item) => item.dispose()),
  };
};

type Resources = ReturnType<typeof createResources>;

interface DragState {
  wasDrag: boolean;
  dragging: boolean;
}

// Tiến độ animation thắp hương: t tính bằng giây kể từ lúc bắt đầu (>= OFFER_TAIL nghĩa là không chạy).
interface OfferState {
  t: number;
}

interface HallContextValue {
  res: Resources;
  high: boolean;
  reduced: boolean;
  /** Ảnh thờ hiện đen trắng (cài đặt của phòng thờ). */
  grayscale: boolean;
  drag: React.MutableRefObject<DragState>;
  offer: React.MutableRefObject<OfferState>;
}

const HallContext = React.createContext<HallContextValue | null>(null);

const useHall = (): HallContextValue => {
  const value = React.useContext(HallContext);
  if (!value) throw new Error('HallContext chưa được cung cấp');
  return value;
};

/* ------------------------------------------------------------------ */
/* Các khối cơ bản                                                     */
/* ------------------------------------------------------------------ */

interface PrimProps {
  p?: V3;
  s?: V3;
  r?: V3;
  m: Material;
  cast?: boolean;
  recv?: boolean;
}

const Box: React.FC<PrimProps> = ({ p, s, r, m, cast, recv }) => {
  const { res, high } = useHall();
  return <mesh geometry={res.geo.box} material={m} position={p} scale={s} rotation={r} castShadow={cast && high} receiveShadow={recv && high} />;
};

const Cyl: React.FC<PrimProps> = ({ p, s, r, m, cast, recv }) => {
  const { res, high } = useHall();
  return <mesh geometry={res.geo.cyl} material={m} position={p} scale={s} rotation={r} castShadow={cast && high} receiveShadow={recv && high} />;
};

const Sph: React.FC<PrimProps> = ({ p, s, r, m, cast }) => {
  const { res, high } = useHall();
  return <mesh geometry={res.geo.sph} material={m} position={p} scale={s} rotation={r} castShadow={cast && high} />;
};

/* ------------------------------------------------------------------ */
/* Phòng: sàn, tường, cột, xà, trần                                    */
/* ------------------------------------------------------------------ */

const COLUMN_H = ROOM.h - 0.45;

const Column: React.FC<{ x: number; z: number }> = ({ x, z }) => {
  const { res } = useHall();
  const { mat } = res;
  return (
    <group position={[x, 0, z]}>
      {/* Đá tảng kê cột */}
      <Cyl p={[0, 0.09, 0]} s={[0.3, 0.18, 0.3]} m={mat.stone} cast recv />
      <Cyl p={[0, 0.2, 0]} s={[0.23, 0.04, 0.23]} m={mat.stone} />
      {/* Thân cột tròn sơn son sẫm */}
      <Cyl p={[0, 0.2 + (COLUMN_H - 0.2) / 2, 0]} s={[0.17, COLUMN_H - 0.2, 0.17]} m={mat.lacquerDark} cast recv />
      <Cyl p={[0, 0.55, 0]} s={[0.185, 0.04, 0.185]} m={mat.gold} />
      <Cyl p={[0, COLUMN_H - 0.5, 0]} s={[0.185, 0.04, 0.185]} m={mat.gold} />
      {/* Đầu cột đỡ xà */}
      <Box p={[0, COLUMN_H + 0.08, 0]} s={[0.34, 0.16, 0.34]} m={mat.woodDark} />
    </group>
  );
};

// Cột chính hai hàng dọc hai bên; hàng gần tường sau mang câu đối.
const COLUMN_X = 5.3;
const COLUMN_ZS_HIGH = [ROOM.zBack + 0.45, -2.1, 1.3];
const COLUMN_ZS_LOW = [ROOM.zBack + 0.45, -2.1];
const BEAM_Y = ROOM.h - 0.3;
// Đố gỗ trên tường bên và vị trí cửa sổ/cuốn thư nằm giữa các đố.
const POST_ZS = Array.from({ length: 5 }, (_, i) => ROOM.zBack + 0.1 + (i * (ROOM.d - 0.2)) / 4);
const WINDOW_ZS = [(POST_ZS[0] + POST_ZS[1]) / 2, (POST_ZS[1] + POST_ZS[2]) / 2, (POST_ZS[3] + POST_ZS[4]) / 2];
const SCROLL_Z = (POST_ZS[2] + POST_ZS[3]) / 2;

const Room = React.memo(function Room() {
  const { res, high } = useHall();
  const { mat } = res;
  const ext = 1; // mặt phẳng phủ dư ra ngoài các góc để không hở khe
  const columnZs = high ? COLUMN_ZS_HIGH : COLUMN_ZS_LOW;
  const beamLen = ROOM.d - 0.2;
  return (
    <group>
      {/* Vỏ bao ngoài: nếu có khe hở thì chỉ thấy màu tường tối ấm, không bao giờ thấy nền ngoài */}
      <mesh position={[0, ROOM.h / 2, ROOM_CENTER_Z]} material={mat.shell}>
        <boxGeometry args={[ROOM.w + 3, ROOM.h + 3, ROOM.d + 3]} />
      </mesh>

      {/* Sàn gạch Bát Tràng phủ hết phòng */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, ROOM_CENTER_Z]} receiveShadow={high} material={mat.floor}>
        <planeGeometry args={[ROOM.w + ext * 2, ROOM.d + ext * 2]} />
      </mesh>
      {/* Thảm đỏ dẫn thẳng từ cửa tới bàn thờ */}
      <mesh rotation={[-Math.PI / 2, 0, Math.PI / 2]} position={[0, 0.008, (FRONT_EDGE_Z - 0.05 + ROOM.zFront - 0.5) / 2]} receiveShadow={high} material={mat.rug}>
        <planeGeometry args={[ROOM.zFront - 0.5 - FRONT_EDGE_Z + 0.05, 3]} />
      </mesh>
      {/* Trần gỗ phủ hết phòng */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, ROOM.h, ROOM_CENTER_Z]} material={mat.ceiling}>
        <planeGeometry args={[ROOM.w + ext * 2, ROOM.d + ext * 2]} />
      </mesh>

      {/* Bốn bức tường kín (cao dư lên trần và xuống sàn, dài dư ra các góc) */}
      <mesh position={[0, ROOM.h / 2, ROOM.zBack]} receiveShadow={high} material={mat.wall}>
        <planeGeometry args={[ROOM.w + ext * 2, ROOM.h + 0.6]} />
      </mesh>
      <mesh position={[0, ROOM.h / 2, ROOM.zFront]} rotation={[0, Math.PI, 0]} material={mat.wall}>
        <planeGeometry args={[ROOM.w + ext * 2, ROOM.h + 0.6]} />
      </mesh>
      <mesh position={[-HX, ROOM.h / 2, ROOM_CENTER_Z]} rotation={[0, Math.PI / 2, 0]} receiveShadow={high} material={mat.wall}>
        <planeGeometry args={[ROOM.d + ext * 2, ROOM.h + 0.6]} />
      </mesh>
      <mesh position={[HX, ROOM.h / 2, ROOM_CENTER_Z]} rotation={[0, -Math.PI / 2, 0]} receiveShadow={high} material={mat.wall}>
        <planeGeometry args={[ROOM.d + ext * 2, ROOM.h + 0.6]} />
      </mesh>

      {/* Gờ chân tường, ốp gỗ lửng và đường chỉ vàng: tường sau, tường cửa, hai tường bên */}
      {[ROOM.zBack + 0.035, ROOM.zFront - 0.035].map((z) => (
        <group key={z}>
          <Box p={[0, 0.08, z]} s={[ROOM.w, 0.16, 0.07]} m={mat.woodDark} />
          <Box p={[0, 0.55, z]} s={[ROOM.w, 0.9, 0.04]} m={mat.wood} />
          <Box p={[0, 1.02, z]} s={[ROOM.w, 0.05, 0.06]} m={mat.gold} />
        </group>
      ))}
      {[-HX + 0.035, HX - 0.035].map((x) => (
        <group key={x}>
          <Box p={[x, 0.08, ROOM_CENTER_Z]} s={[0.07, 0.16, ROOM.d]} m={mat.woodDark} />
          <Box p={[x, 0.55, ROOM_CENTER_Z]} s={[0.04, 0.9, ROOM.d]} m={mat.wood} />
          <Box p={[x, 1.02, ROOM_CENTER_Z]} s={[0.06, 0.05, ROOM.d]} m={mat.gold} />
          {/* Đố gỗ đứng giữa các ô tường */}
          {POST_ZS.map((pz) => (
            <Box key={pz} p={[x, ROOM.h / 2 + 0.2, pz]} s={[0.07, ROOM.h - 0.7, 0.2]} m={mat.woodDark} />
          ))}
          {/* Thanh ngang trên đầu tường */}
          <Box p={[x, ROOM.h - 0.45, ROOM_CENTER_Z]} s={[0.07, 0.16, ROOM.d]} m={mat.woodDark} />
        </group>
      ))}

      {/* Xà ngang, xà dọc */}
      {columnZs.map((z) => (
        <Box key={z} p={[0, BEAM_Y, z]} s={[ROOM.w - 0.1, 0.26, 0.26]} m={mat.woodDark} />
      ))}
      {[-COLUMN_X, -3.4, 3.4, COLUMN_X].map((x) => (
        <Box key={x} p={[x, BEAM_Y, ROOM_CENTER_Z]} s={[0.24, 0.24, beamLen]} m={mat.woodDark} />
      ))}

      {/* Hai hàng cột */}
      {[-COLUMN_X, COLUMN_X].flatMap((x) => columnZs.map((z) => <Column key={`${x}:${z}`} x={x} z={z} />))}
    </group>
  );
});

/** Dải chấn song cửa sổ: một InstancedMesh cho cả cửa. */
const LatticeBars: React.FC<{ count: number; width: number; height: number }> = ({ count, width, height }) => {
  const { res } = useHall();
  const { mat, geo } = res;
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const dummy = new Object3D();
    for (let i = 0; i < count; i += 1) {
      dummy.position.set(-width / 2 + (width * (i + 0.5)) / count, 0, 0);
      dummy.scale.set(0.035, height, 0.045);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, [count, width, height]);
  return <instancedMesh ref={ref} args={[geo.box, mat.lacquer, count]} />;
};

/** Cửa sổ chấn song sơn đỏ trên tường bên (local +z hướng vào phòng). */
const LatticeWindow: React.FC<{ x: number; z: number }> = ({ x, z }) => {
  const { res } = useHall();
  const { mat } = res;
  const side = x < 0 ? 1 : -1;
  return (
    <group position={[x, 0, z]} rotation={[0, (side * Math.PI) / 2, 0]}>
      <mesh position={[0, 2.2, 0.012]} material={mat.window}>
        <planeGeometry args={[1.3, 1.7]} />
      </mesh>
      <Box p={[0, 3.1, 0.05]} s={[1.6, 0.1, 0.1]} m={mat.lacquer} />
      <Box p={[0, 1.3, 0.07]} s={[1.65, 0.12, 0.14]} m={mat.lacquer} />
      <Box p={[-0.72, 2.2, 0.05]} s={[0.1, 1.9, 0.1]} m={mat.lacquer} />
      <Box p={[0.72, 2.2, 0.05]} s={[0.1, 1.9, 0.1]} m={mat.lacquer} />
      <Box p={[0, 2.2, 0.05]} s={[1.3, 0.05, 0.05]} m={mat.lacquer} />
      <group position={[0, 2.2, 0.05]}>
        <LatticeBars count={7} width={1.3} height={1.7} />
      </group>
      <Box p={[0, 3.2, 0.03]} s={[1.75, 0.06, 0.07]} m={mat.gold} />
    </group>
  );
};

/** Cuốn thư treo tường bên. */
const WallScroll: React.FC<{ x: number; z: number; phrase: string }> = ({ x, z, phrase }) => {
  const { res } = useHall();
  const { mat } = res;
  const side = x < 0 ? 1 : -1;
  const tex = useMemo(() => createCoupletTexture(phrase, 256, 800), [phrase]);
  useEffect(() => () => tex.dispose(), [tex]);
  return (
    <group position={[x, 0, z]} rotation={[0, (side * Math.PI) / 2, 0]}>
      <Box p={[0, 2.35, 0.02]} s={[0.78, 2.3, 0.03]} m={mat.gold} />
      <mesh position={[0, 2.35, 0.038]}>
        <planeGeometry args={[0.66, 2.06]} />
        <meshStandardMaterial map={tex} emissiveMap={tex} emissive="#ffffff" emissiveIntensity={0.25} roughness={0.5} />
      </mesh>
      <Cyl p={[0, 3.52, 0.03]} s={[0.035, 0.9, 0.035]} r={[0, 0, Math.PI / 2]} m={mat.woodDark} />
      <Cyl p={[0, 1.18, 0.03]} s={[0.035, 0.9, 0.035]} r={[0, 0, Math.PI / 2]} m={mat.woodDark} />
    </group>
  );
};

/** Chi tiết hai tường bên: cửa sổ chấn song + cuốn thư. */
const SideWallDetails = React.memo(function SideWallDetails() {
  return (
    <group>
      {[-HX, HX].map((x) => (
        <group key={x}>
          {WINDOW_ZS.map((z) => (
            <LatticeWindow key={z} x={x} z={z} />
          ))}
          <WallScroll x={x} z={SCROLL_Z} phrase={x < 0 ? 'UỐNG NƯỚC NHỚ NGUỒN' : 'ĂN QUẢ NHỚ KẺ TRỒNG CÂY'} />
        </group>
      ))}
    </group>
  );
});

/** Tường cửa (sau lưng người xem): khung cửa lớn mở ra phía tối, có vật liệu chắn kín. */
const DoorWall = React.memo(function DoorWall() {
  const { res } = useHall();
  const { mat } = res;
  return (
    <group position={[0, 0, ROOM.zFront]} rotation={[0, Math.PI, 0]}>
      <mesh position={[0, 1.8, 0.02]} material={mat.doorDark}>
        <planeGeometry args={[3.0, 3.6]} />
      </mesh>
      <Box p={[-1.6, 1.95, 0.1]} s={[0.26, 3.9, 0.22]} m={mat.lacquerDark} />
      <Box p={[1.6, 1.95, 0.1]} s={[0.26, 3.9, 0.22]} m={mat.lacquerDark} />
      <Box p={[0, 3.85, 0.1]} s={[3.7, 0.36, 0.24]} m={mat.lacquer} />
      <Box p={[0, 3.62, 0.11]} s={[3.5, 0.06, 0.26]} m={mat.gold} />
      <Box p={[0, 0.05, 0.1]} s={[3.4, 0.1, 0.3]} m={mat.stone} />
    </group>
  );
});

/** Hai hàng đèn lồng treo dọc hai bên đường vào. */
const LanternRows = React.memo(function LanternRows() {
  const { high } = useHall();
  const zs = high ? [-3.4, -1.9, -0.4] : [-3.4, -1.4];
  return (
    <group>
      {[-3.4, 3.4].flatMap((x, side) =>
        zs.map((z, i) => <Lantern key={`${x}:${z}`} x={x} z={z} phase={i * 1.3 + side * 0.9} />)
      )}
    </group>
  );
});

/** Hoành phi và câu đối: chữ vẽ bằng canvas, đổi theo hallTitle. */
const Inscriptions: React.FC<{ hallTitle: string }> = ({ hallTitle }) => {
  const { res } = useHall();
  const { mat } = res;
  const plaqueTex = useMemo(() => createPlaqueTexture(hallTitle), [hallTitle]);
  const leftTex = useMemo(() => createCoupletTexture(COUPLET_LEFT), []);
  const rightTex = useMemo(() => createCoupletTexture(COUPLET_RIGHT), []);
  useEffect(() => () => plaqueTex.dispose(), [plaqueTex]);
  useEffect(() => () => leftTex.dispose(), [leftTex]);
  useEffect(() => () => rightTex.dispose(), [rightTex]);

  return (
    <group>
      {/* Hoành phi treo cao chính giữa */}
      <Box p={[0, 3.8, -3.4]} s={[4.4, 0.9, 0.08]} m={mat.gold} cast />
      <mesh position={[0, 3.8, -3.358]}>
        <planeGeometry args={[4.1, 0.76]} />
        <meshStandardMaterial map={plaqueTex} emissiveMap={plaqueTex} emissive="#ffffff" emissiveIntensity={0.3} roughness={0.4} metalness={0.15} />
      </mesh>
      {/* Hai sợi dây treo hoành phi lên xà */}
      <Cyl p={[-1.8, 4.5, -3.38]} s={[0.012, 0.55, 0.012]} m={mat.craneDark} />
      <Cyl p={[1.8, 4.5, -3.38]} s={[0.012, 0.55, 0.012]} m={mat.craneDark} />

      {/* Câu đối trên hai cột sau */}
      <Box p={[-COLUMN_X, 2.3, -2.78]} s={[0.42, 3.12, 0.04]} m={mat.gold} />
      <mesh position={[-COLUMN_X, 2.3, -2.755]}>
        <planeGeometry args={[0.36, 3.0]} />
        <meshStandardMaterial map={leftTex} emissiveMap={leftTex} emissive="#ffffff" emissiveIntensity={0.25} roughness={0.45} />
      </mesh>
      <Box p={[COLUMN_X, 2.3, -2.78]} s={[0.42, 3.12, 0.04]} m={mat.gold} />
      <mesh position={[COLUMN_X, 2.3, -2.755]}>
        <planeGeometry args={[0.36, 3.0]} />
        <meshStandardMaterial map={rightTex} emissiveMap={rightTex} emissive="#ffffff" emissiveIntensity={0.25} roughness={0.45} />
      </mesh>
    </group>
  );
};

/* ------------------------------------------------------------------ */
/* Bàn thờ (bo cạnh, chân quỳ cong, diềm chạm)                         */
/* ------------------------------------------------------------------ */

interface RBoxProps {
  p?: V3;
  size: V3;
  radius?: number;
  m: Material;
  cast?: boolean;
  recv?: boolean;
}

/** Hộp bo cạnh dùng chung geometry theo kích thước (cache trong resources). */
const RBox: React.FC<RBoxProps> = ({ p, size, radius = 0.03, m, cast, recv }) => {
  const { res, high } = useHall();
  return <mesh geometry={res.rbox(size[0], size[1], size[2], radius)} material={m} position={p} castShadow={cast && high} receiveShadow={recv && high} />;
};

/** Diềm lượn sóng dưới mép bàn: một InstancedMesh các nửa đĩa tròn. */
const ScallopRow: React.FC<{ width: number; y: number; z: number; m: Material }> = ({ width, y, z, m }) => {
  const { res } = useHall();
  const ref = useRef<InstancedMesh>(null);
  const count = Math.max(3, Math.round(width / 0.3));
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const dummy = new Object3D();
    const step = width / count;
    for (let i = 0; i < count; i += 1) {
      dummy.position.set(-width / 2 + step * (i + 0.5), y, z);
      dummy.rotation.set(Math.PI / 2, 0, 0);
      dummy.scale.set(step * 0.46, 0.018, 0.055);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, [count, width, y, z]);
  return <instancedMesh ref={ref} args={[res.geo.cyl, m, count]} />;
};

interface AltarTableProps {
  z: number;
  width: number;
  height: number;
  depth: number;
  apronMat: Material;
  solid?: boolean;
  drape?: boolean;
}

const AltarTable: React.FC<AltarTableProps> = ({ z, width, height, depth, apronMat, solid, drape }) => {
  const { res, high } = useHall();
  const { mat, geo } = res;
  const legX = width / 2 - 0.16;
  const legZ = depth / 2 - 0.12;
  const bodyY = (height - 0.21 + 0.12) / 2;
  return (
    <group position={[0, 0, z]}>
      {/* Mặt bàn bo góc: viền vàng + lòng sơn son */}
      <RBox p={[0, height - 0.035, 0]} size={[width, 0.07, depth]} radius={0.06} m={mat.gold} cast recv />
      <RBox p={[0, height + 0.005, 0]} size={[width - 0.12, 0.02, depth - 0.12]} radius={0.045} m={mat.lacquerDark} recv />
      {/* Diềm chạm dưới mặt bàn */}
      <RBox p={[0, height - 0.14, 0]} size={[width - 0.08, 0.14, depth - 0.08]} radius={0.04} m={mat.woodDark} />
      <mesh position={[0, height - 0.14, depth / 2 - 0.039]} material={apronMat} geometry={geo.plane} scale={[width - 0.2, 0.11, 1]} />
      {!drape && <ScallopRow width={width - 0.5} y={height - 0.215} z={depth / 2 - 0.05} m={mat.gold} />}
      {solid ? (
        <>
          {/* Thân ngai bo cạnh, mặt trước chia ô sơn son */}
          <RBox p={[0, bodyY, 0]} size={[width - 0.2, height - 0.33, depth - 0.2]} radius={0.05} m={mat.wood} cast recv />
          {[-0.4, -0.2, 0, 0.2, 0.4].map((k) => (
            <RBox key={k} p={[k * (width - 0.6), bodyY - 0.02, depth / 2 - 0.1]} size={[(width - 0.8) / 5, height - 0.56, 0.02]} radius={0.05} m={mat.lacquer} />
          ))}
          <RBox p={[0, 0.125, 0]} size={[width - 0.14, 0.03, depth - 0.14]} radius={0.05} m={mat.gold} />
          {[-1, 1].flatMap((sx) =>
            [-1, 1].map((sz) => (
              <Sph key={`${sx}${sz}`} p={[sx * (width / 2 - 0.15), 0.065, sz * (depth / 2 - 0.12)]} s={[0.11, 0.07, 0.11]} m={mat.gold} />
            ))
          )}
        </>
      ) : (
        <>
          {/* Bốn chân quỳ cong + thanh giằng bo tròn */}
          {[-legX, legX].flatMap((lx) =>
            [-legZ, legZ].map((lz) => (
              <mesh key={`${lx}${lz}`} geometry={geo.leg} material={mat.woodDark} position={[lx, 0, lz]} scale={[1, height - 0.2, 1]} castShadow={high} />
            ))
          )}
          <RBox p={[0, height * 0.42, legZ]} size={[width - 0.36, 0.05, 0.05]} radius={0.02} m={mat.woodDark} />
          <RBox p={[0, height * 0.42, -legZ]} size={[width - 0.36, 0.05, 0.05]} radius={0.02} m={mat.woodDark} />
        </>
      )}
      {drape && (
        <>
          {/* Khăn phủ đỏ viền vàng buông phía trước + khăn trải mặt bàn */}
          <mesh position={[0, height / 2 + 0.03, depth / 2 + 0.012]} material={mat.cloth} geometry={geo.plane} scale={[width - 0.14, height - 0.1, 1]} />
          <RBox p={[0, height + 0.018, 0]} size={[width - 0.3, 0.01, depth - 0.2]} radius={0.04} m={mat.clothPlain} />
        </>
      )}
    </group>
  );
};

const Altar = React.memo(function Altar() {
  const { res } = useHall();
  const { mat } = res;
  return (
    <group>
      <AltarTable z={BACK.z} width={BACK.w} height={BACK.h} depth={BACK.d} apronMat={mat.apronBack} solid />
      <AltarTable z={MID.z} width={MID.w} height={MID.h} depth={MID.d} apronMat={mat.apronMid} />
      <AltarTable z={FRONT.z} width={FRONT.w} height={FRONT.h} depth={FRONT.d} apronMat={mat.apronFront} solid drape />
    </group>
  );
});

/* ------------------------------------------------------------------ */
/* Ảnh thờ: khung gỗ sơn son viền vàng, ảnh 3:4 phía trên, bảng tên    */
/* ------------------------------------------------------------------ */

/** Ngày giỗ hôm nay của một bài vị: nến bên bài vị sáng hơn và có dải hoa nhỏ. */
const MemorialDecor: React.FC<{ withLight: boolean }> = ({ withLight }) => {
  const { res, high, reduced } = useHall();
  const { mat, geo } = res;
  const flames = useRef<Array<Mesh | null>>([]);
  const glows = useRef<Array<Sprite | null>>([]);
  const lights = useRef<Array<PointLight | null>>([]);
  // Dải hoa võng dọc mặt trước đế; chế độ nhẹ dùng ít hoa hơn.
  const flowers = useMemo(() => garlandLayout(high ? 11 : 6, 0.42, 0.03), [high]);
  const tones = [mat.flowerWhite, mat.flowerYellow, mat.apple];

  useFrame(({ clock }) => {
    // Chỉ nhấp nháy ở chế độ high và khi không bật giảm chuyển động; còn lại sáng đều.
    const animate = high && !reduced;
    const t = clock.elapsedTime;
    [0, 1].forEach((i) => {
      const flicker = animate ? 1 + Math.sin(t * 6.3 + i * 1.7) * 0.07 + Math.sin(t * 13.1 + i) * 0.04 : 1;
      flames.current[i]?.scale.set(1, flicker, 1);
      glows.current[i]?.scale.setScalar(0.3 * flicker);
      const light = lights.current[i];
      if (light) light.intensity = 0.9 * flicker;
    });
  });

  return (
    <group>
      {[-0.215, 0.215].map((cx, i) => (
        <group key={cx} position={[cx, 0.05, 0.065]}>
          <Cyl p={[0, 0.045, 0]} s={[0.014, 0.09, 0.014]} m={mat.candle} />
          <Cyl p={[0, 0.093, 0]} s={[0.003, 0.012, 0.003]} m={mat.craneDark} />
          <mesh
            ref={(node) => { flames.current[i] = node; }}
            geometry={geo.flame}
            material={mat.flame}
            position={[0, 0.098, 0]}
            scale={[0.5, 0.5, 0.5]}
          />
          <sprite ref={(node) => { glows.current[i] = node; }} material={mat.flameGlow} position={[0, 0.125, 0.012]} scale={[0.3, 0.3, 1]} />
          {withLight && (
            <pointLight ref={(node) => { lights.current[i] = node; }} position={[0, 0.14, 0.05]} color="#ffb45c" intensity={0.9} distance={1.6} decay={2} />
          )}
        </group>
      ))}
      <group position={[0, 0.046, 0.103]}>
        {flowers.map((flower, i) => (
          <Sph key={i} p={[flower.x, flower.y, flower.z]} s={[0.011, 0.011, 0.011]} m={tones[flower.tone]} />
        ))}
      </group>
    </group>
  );
};

interface PortraitFrameProps {
  ancestor: Hall3DAncestor;
  x: number;
  /** Độ cao mặt đế và z của hàng chứa khung. */
  y: number;
  z: number;
  scale: number;
  selected: boolean;
  hovered: boolean;
  /** Đang được phóng to: lúc này mới tải ảnh gốc. */
  zoomed: boolean;
  /** Hôm nay là ngày giỗ (âm lịch) của bài vị này. */
  memorial: boolean;
  /** Ngày giỗ và còn "ngân sách" đèn: bật đèn điểm ở nến (chỉ chế độ high). */
  memorialLight: boolean;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
}

/** Nạp một ảnh làm texture ảnh thờ (cắt kiểu cover 3:4). Trả về hàm hủy. */
const loadPortraitTexture = (url: string, onLoad: (texture: Texture) => void): (() => void) => {
  let cancelled = false;
  try {
    const loader = new TextureLoader();
    loader.setCrossOrigin('anonymous');
    loader.load(
      url,
      (texture) => {
        if (cancelled) {
          texture.dispose();
          return;
        }
        texture.colorSpace = SRGBColorSpace;
        texture.anisotropy = 4;
        applyCoverCrop(texture, PHOTO_W / PHOTO_H);
        onLoad(texture);
      },
      undefined,
      () => {
        /* tải lỗi: giữ ảnh đang có / ảnh mặc định */
      }
    );
  } catch {
    /* URL không hợp lệ: giữ ảnh mặc định */
  }
  return () => {
    cancelled = true;
  };
};

const PortraitFrame: React.FC<PortraitFrameProps> = ({
  ancestor, x, y, z, scale, selected, hovered, zoomed, memorial, memorialLight, onSelect, onHover,
}) => {
  const { res, high, reduced, drag, grayscale } = useHall();
  const { mat, geo, soft, defaultPortrait } = res;
  const liftRef = useRef<Group>(null);
  const haloRef = useRef<Sprite>(null);
  const brightness = useRef(0.86);

  const deathText = formatDeathDate(ancestor.deathDate);
  const plateTex = useMemo(() => createNamePlateTexture(ancestor.name, deathText), [ancestor.name, deathText]);
  const plateMat = useMemo(
    () => new MeshStandardMaterial({ map: plateTex, emissiveMap: plateTex, emissive: '#ffffff', emissiveIntensity: 0.25, roughness: 0.5, metalness: 0.1 }),
    [plateTex]
  );
  // Ảnh không chịu ánh sáng cảnh để luôn nhìn rõ mặt người. Đen trắng + viền tối góc làm trong shader (uniform).
  const portraitUniforms = useMemo(createPortraitUniforms, []);
  const photoMat = useMemo(() => {
    const material = new MeshBasicMaterial({ map: defaultPortrait, color: '#dbd5c8' });
    material.onBeforeCompile = (shader) => patchPortraitShader(shader, portraitUniforms);
    material.customProgramCacheKey = () => PORTRAIT_PROGRAM_KEY;
    return material;
  }, [defaultPortrait, portraitUniforms]);
  useEffect(() => {
    setPortraitGrayscale(portraitUniforms, grayscale);
  }, [portraitUniforms, grayscale]);
  const frameMat = useMemo(() => new MeshStandardMaterial({ color: COLOR.gold, metalness: 0.9, roughness: 0.35, emissive: '#ffb830', emissiveIntensity: 0 }), []);
  const haloMat = useMemo(
    () => new SpriteMaterial({ map: soft, color: '#ffd27a', transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false }),
    [soft]
  );
  useEffect(() => () => { plateTex.dispose(); plateMat.dispose(); }, [plateTex, plateMat]);
  useEffect(() => () => { frameMat.dispose(); haloMat.dispose(); photoMat.dispose(); }, [frameMat, haloMat, photoMat]);

  // Ảnh: cảnh 3D dùng bản nhỏ (thumbnailUrl, thiếu thì portraitUrl); ảnh gốc chỉ được tải khi phóng to.
  // Lỗi tải thì giữ ảnh đang có / ảnh mặc định, không làm vỡ cảnh.
  const urls = pickPortraitUrls(ancestor, zoomed);
  const thumbTexture = useRef<Texture | null>(null);
  const fullTexture = useRef<Texture | null>(null);
  useEffect(() => {
    if (!urls.thumb) return undefined;
    let loaded: Texture | null = null;
    const cancel = loadPortraitTexture(urls.thumb, (texture) => {
      loaded = texture;
      thumbTexture.current = texture;
      if (!fullTexture.current) {
        photoMat.map = texture;
        photoMat.needsUpdate = true;
      }
    });
    return () => {
      cancel();
      if (loaded) {
        if (photoMat.map === loaded) {
          photoMat.map = defaultPortrait;
          photoMat.needsUpdate = true;
        }
        if (thumbTexture.current === loaded) thumbTexture.current = null;
        loaded.dispose();
      }
    };
  }, [urls.thumb, photoMat, defaultPortrait]);
  useEffect(() => {
    if (!urls.wantFull) return undefined;
    let loaded: Texture | null = null;
    const cancel = loadPortraitTexture(urls.full, (texture) => {
      loaded = texture;
      fullTexture.current = texture;
      photoMat.map = texture;
      photoMat.needsUpdate = true;
    });
    return () => {
      cancel();
      if (loaded) {
        if (fullTexture.current === loaded) fullTexture.current = null;
        if (photoMat.map === loaded) {
          photoMat.map = thumbTexture.current ?? defaultPortrait;
          photoMat.needsUpdate = true;
        }
        loaded.dispose();
      }
    };
  }, [urls.wantFull, urls.full, photoMat, defaultPortrait]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const lift = liftRef.current;
    if (lift) lift.position.y = MathUtils.damp(lift.position.y, selected ? 0.06 : 0, 7, dt);
    const glow = selected ? 1 : hovered ? 0.55 : 0;
    frameMat.emissiveIntensity = MathUtils.damp(frameMat.emissiveIntensity, glow * 0.9, 8, dt);
    plateMat.emissiveIntensity = MathUtils.damp(plateMat.emissiveIntensity, 0.25 + glow * 0.4, 8, dt);
    brightness.current = MathUtils.damp(brightness.current, 0.86 + glow * 0.14, 8, dt);
    photoMat.color.setRGB(brightness.current, brightness.current * 0.975, brightness.current * 0.93);
    // Ngày giỗ: quầng sáng ấm luôn có (nhẹ hơn ở chế độ nhẹ), sáng hơn khi rê chuột / chọn.
    const memorialBase = memorial ? (high ? 0.3 : 0.18) : 0;
    haloMat.opacity = MathUtils.damp(haloMat.opacity, Math.max(glow * 0.5, memorialBase), 6, dt);
    const halo = haloRef.current;
    if (halo) halo.visible = haloMat.opacity > 0.01;
  });

  // Bấm (nhả chuột/ngón tay mà KHÔNG kéo) chỉ để xem thông tin người đó.
  const handleUp = (event: ThreeEvent<PointerEvent>) => {
    if (drag.current.wasDrag) return;
    event.stopPropagation();
    onSelect(ancestor.id);
  };
  const handleOver = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    if (drag.current.dragging) return;
    onHover(ancestor.id);
  };
  const handleOut = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    onHover(null);
  };

  return (
    <group position={[x, y, z]} onPointerUp={handleUp} onPointerOver={handleOver} onPointerOut={handleOut}>
      <group scale={scale}>
        <group>
          <group ref={liftRef}>
            {/* Đế gỗ bo cạnh */}
            <RBox p={[0, 0.025, 0]} size={[0.52, 0.05, 0.2]} radius={0.03} m={mat.woodDark} cast recv />
            <RBox p={[0, 0.056, 0]} size={[0.46, 0.014, 0.15]} radius={0.02} m={mat.gold} />
            {/* Khung ảnh hơi ngả ra sau */}
            <group position={[0, 0.06, 0]} rotation={[-0.06, 0, 0]}>
              <mesh geometry={geo.frameOuter} material={frameMat} castShadow={high} />
              <mesh geometry={geo.frameInner} material={mat.lacquer} />
              <mesh geometry={geo.frameRim} material={frameMat} />
              <mesh geometry={geo.photoBorder} material={mat.gold} position={[0, PHOTO_Y, 0.0262]} />
              <mesh geometry={geo.photo} material={photoMat} position={[0, PHOTO_Y, 0.0275]} />
              <mesh geometry={geo.plate} material={plateMat} position={[0, PLATE_Y, 0.0275]} />
              {/* Lớp kính mỏng: phản chiếu môi trường ấm (chỉ high) + vệt sáng ánh nến (cả hai chế độ, tĩnh ở chế độ nhẹ) */}
              {high && <mesh geometry={geo.glass} material={mat.glass} position={[0, PHOTO_Y, 0.0295]} renderOrder={2} />}
              <mesh geometry={geo.glass} material={mat.glassStreak} position={[0, PHOTO_Y, 0.0297]} renderOrder={3} />
              <sprite ref={haloRef} material={haloMat} position={[0, 0.42, -0.08]} scale={[1.15, 1.45, 1]} visible={false} />
            </group>
            {memorial && <MemorialDecor withLight={memorialLight && high && !reduced} />}
          </group>
        </group>
      </group>
    </group>
  );
};

/** Nhãn tầng nhỏ (đứng ở đầu hàng ảnh thờ). */
const TierLabel: React.FC<{ text: string; x: number; y: number; z: number }> = ({ text, x, y, z }) => {
  const { res } = useHall();
  const tex = useMemo(() => createTierLabelTexture(text), [text]);
  useEffect(() => () => tex.dispose(), [tex]);
  return (
    <group position={[x, y + 0.12, z]} rotation={[-0.08, 0, 0]}>
      <Box p={[0, 0, -0.012]} s={[0.54, 0.24, 0.02]} m={res.mat.gold} />
      <mesh>
        <planeGeometry args={[0.5, 0.2]} />
        <meshStandardMaterial map={tex} emissiveMap={tex} emissive="#ffffff" emissiveIntensity={0.3} roughness={0.5} />
      </mesh>
    </group>
  );
};

/** Giá bậc thang đỡ các hàng ảnh thờ phía trên (từ 2 tầng): hai trụ sơn son + ván từng hàng. */
const TierRack: React.FC<{ layout: TierLayout }> = ({ layout }) => {
  const { res } = useHall();
  const { mat } = res;
  const topShelf = layout.baseY[0];
  const postH = topShelf - TOP_Y.back + 0.1;
  const postX = BACK.w / 2 - 0.3;
  return (
    <group>
      {[-postX, postX].map((px) => (
        <group key={px}>
          <RBox p={[px, TOP_Y.back + postH / 2, BACK.z + RACK_SHIFT_Z]} size={[0.12, postH, RACK_DEPTH - 0.02]} radius={0.03} m={mat.lacquerDark} cast recv />
          <RBox p={[px, TOP_Y.back + postH + 0.015, BACK.z + RACK_SHIFT_Z]} size={[0.16, 0.03, RACK_DEPTH + 0.02]} radius={0.02} m={mat.gold} />
        </group>
      ))}
      {layout.baseY.map((by) => (
        <group key={by}>
          <RBox p={[0, by - 0.025, BACK.z + RACK_SHIFT_Z]} size={[BACK.w - 0.5, 0.05, RACK_DEPTH]} radius={0.02} m={mat.lacquerDark} cast recv />
          <RBox p={[0, by - 0.02, BACK.z + RACK_SHIFT_Z + RACK_DEPTH / 2 - 0.006]} size={[BACK.w - 0.5, 0.034, 0.014]} radius={0.006} m={mat.gold} />
        </group>
      ))}
    </group>
  );
};

/** Khung ảnh mờ khi bàn thờ chưa có tiền nhân: không bấm được, không nhãn. */
const EmptyTabletSlot: React.FC<{ x: number; y?: number; z?: number; scale?: number }> = ({
  x,
  y = TOP_Y.back,
  z = BACK.z,
  scale = TABLET_SCALE,
}) => {
  const { res } = useHall();
  const { mat, geo } = res;
  return (
    <group position={[x, y, z]} scale={scale}>
      <RBox p={[0, 0.025, 0]} size={[0.52, 0.05, 0.2]} radius={0.03} m={mat.ghost} />
      <group position={[0, 0.06, 0]} rotation={[-0.06, 0, 0]}>
        <mesh geometry={geo.frameOuter} material={mat.ghost} />
        <lineSegments geometry={geo.frameEdges} material={mat.ghostLine} />
        <mesh geometry={geo.photo} material={mat.ghost} position={[0, PHOTO_Y, 0.03]} />
        <mesh geometry={geo.plate} material={mat.ghost} position={[0, PLATE_Y, 0.03]} />
      </group>
    </group>
  );
};

/* ------------------------------------------------------------------ */
/* Đồ thờ: nến, đèn lồng, hạc, ngũ quả, bình hoa, chén nước, đài rượu  */
/* ------------------------------------------------------------------ */

const Candle: React.FC<{ x: number; phase: number; withLight: boolean }> = ({ x, phase, withLight }) => {
  const { res, high, reduced, offer } = useHall();
  const { mat, geo } = res;
  const lightRef = useRef<PointLight>(null);
  const glowRef = useRef<Sprite>(null);
  const flameRef = useRef<Mesh>(null);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const amp = reduced ? 0.3 : 1;
    // Dao động mềm: tổng hợp vài sóng sin tần số thấp, tránh giật.
    const flicker = 1 + (Math.sin(t * 5.1 + phase) * 0.08 + Math.sin(t * 11.7 + phase * 2) * 0.04) * amp;
    // Lúc thắp hương, nến sáng lên nhẹ trong khoảng 1 giây.
    const boost = 1 + bell((offer.current.t - 1.1) / 1.0) * 0.5;
    if (lightRef.current) lightRef.current.intensity = 2.6 * flicker * boost;
    if (flameRef.current) flameRef.current.scale.set(1, flicker * (0.9 + boost * 0.1), 1);
    if (glowRef.current) glowRef.current.scale.setScalar(0.34 * flicker * boost);
  });

  return (
    <group position={[x, TOP_Y.mid, MID.z]}>
      {/* Chân nến tiện tròn */}
      <mesh geometry={geo.candleHolder} material={mat.bronze} castShadow={high} />
      <mesh geometry={geo.candleBody} material={mat.candle} position={[0, 0.33, 0]} castShadow={high} />
      {/* Sáp chảy */}
      <Sph p={[0.033, 0.425, 0.008]} s={[0.009, 0.032, 0.009]} m={mat.candle} />
      <Sph p={[-0.02, 0.405, 0.028]} s={[0.008, 0.045, 0.008]} m={mat.candle} />
      <Sph p={[-0.004, 0.44, -0.034]} s={[0.009, 0.022, 0.009]} m={mat.candle} />
      <Cyl p={[0, 0.471, 0]} s={[0.036, 0.008, 0.036]} m={mat.candle} />
      <Cyl p={[0, 0.488, 0]} s={[0.003, 0.03, 0.003]} m={mat.craneDark} />
      {/* Ngọn lửa hình giọt nước */}
      <mesh ref={flameRef} geometry={geo.flame} material={mat.flame} position={[0, 0.492, 0]} />
      <sprite ref={glowRef} material={mat.flameGlow} position={[0, 0.54, 0.02]} scale={[0.34, 0.34, 1]} />
      {withLight && <pointLight ref={lightRef} position={[0, 0.62, 0.12]} color="#ffb45c" intensity={2.6} distance={5} decay={2} />}
    </group>
  );
};

const Lantern: React.FC<{ x: number; z: number; phase: number }> = ({ x, z, phase }) => {
  const { res, reduced } = useHall();
  const { mat } = res;
  const swayRef = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (reduced || !swayRef.current) return;
    const t = clock.elapsedTime;
    swayRef.current.rotation.z = Math.sin(t * 0.7 + phase) * 0.035;
    swayRef.current.rotation.x = Math.sin(t * 0.5 + phase * 1.7) * 0.02;
  });
  return (
    <group position={[x, BEAM_Y - 0.1, z]}>
      <group ref={swayRef}>
        <Cyl p={[0, -0.35, 0]} s={[0.006, 0.7, 0.006]} m={mat.craneDark} />
        <Cyl p={[0, -0.75, 0]} s={[0.11, 0.07, 0.11]} m={mat.gold} />
        <Sph p={[0, -1.05, 0]} s={[0.27, 0.31, 0.27]} m={mat.lantern} />
        <Cyl p={[0, -1.36, 0]} s={[0.1, 0.06, 0.1]} m={mat.gold} />
        <Cyl p={[0, -1.52, 0]} s={[0.012, 0.28, 0.012]} m={mat.lacquer} />
        <Sph p={[0, -1.68, 0]} s={[0.035, 0.05, 0.035]} m={mat.lacquer} />
      </group>
    </group>
  );
};

const Crane: React.FC<{ x: number; flip: number }> = ({ x, flip }) => {
  const { res } = useHall();
  const { mat } = res;
  return (
    <group position={[x, TOP_Y.back, BACK.z + 0.02]} rotation={[0, flip * 0.5, 0]}>
      <Sph p={[0, 0.06, 0]} s={[0.24, 0.07, 0.17]} m={mat.bronze} cast />
      <Sph p={[0.2 * flip, 0.07, 0.02]} s={[0.05, 0.04, 0.04]} m={mat.bronze} />
      <Cyl p={[-0.04, 0.24, 0]} s={[0.012, 0.3, 0.012]} m={mat.craneBeak} />
      <Cyl p={[0.04, 0.24, 0]} s={[0.012, 0.3, 0.012]} m={mat.craneBeak} />
      <Sph p={[0, 0.5, 0]} s={[0.1, 0.085, 0.2]} m={mat.craneWhite} cast />
      <Sph p={[0, 0.46, -0.17]} s={[0.04, 0.03, 0.09]} m={mat.craneDark} />
      <Cyl p={[0, 0.7, 0.1]} s={[0.018, 0.3, 0.018]} r={[-0.35, 0, 0]} m={mat.craneWhite} />
      <Sph p={[0, 0.86, 0.18]} s={[0.032, 0.03, 0.038]} m={mat.craneWhite} />
      <Cyl p={[0, 0.855, 0.27]} s={[0.008, 0.07, 0.008]} r={[Math.PI / 2 + 0.2, 0, 0]} m={mat.craneBeak} />
    </group>
  );
};

// Mâm ngũ quả đặt lệch sang phải để không bị lư hương che khi nhìn từ cửa.
const FRUIT_X = 0.62;
const BANANA_ANGLES = [-0.62, -0.37, -0.12, 0.12, 0.37, 0.62];

/** Mâm ngũ quả trên đĩa có chân: nải chuối xanh, bưởi vàng, cam, táo đỏ, xoài. */
const FruitTray: React.FC = () => {
  const { res, high } = useHall();
  const { mat, geo } = res;
  return (
    <group position={[FRUIT_X, TOP_Y.mid, MID.z]}>
      <mesh geometry={geo.dish} material={mat.bronze} castShadow={high} receiveShadow={high} />
      {/* Nải chuối xanh: các quả cong xòe hình quạt ôm phía trước */}
      <group position={[0, 0.165, 0.01]} scale={1.3}>
        <Cyl p={[0, 0.06, -0.005]} s={[0.014, 0.04, 0.014]} m={mat.stem} />
        {BANANA_ANGLES.map((angle) => (
          <group key={angle} rotation={[0, angle, 0]}>
            <mesh geometry={geo.banana} material={mat.banana} castShadow={high} />
            <Sph p={[0, 0.032, 0.172]} s={[0.012, 0.012, 0.016]} m={mat.stem} />
          </group>
        ))}
      </group>
      {/* Bưởi vàng hơi dẹt ở giữa, có cuống và lá */}
      <Sph p={[0, 0.262, -0.07]} s={[0.092, 0.084, 0.092]} m={mat.pomelo} cast />
      <Cyl p={[0, 0.352, -0.07]} s={[0.006, 0.02, 0.006]} m={mat.stem} />
      <Sph p={[0.03, 0.352, -0.06]} s={[0.034, 0.006, 0.018]} r={[0, 0.5, 0.25]} m={mat.foliage} />
      {/* Cam */}
      <Sph p={[-0.155, 0.212, -0.03]} s={[0.054, 0.051, 0.054]} m={mat.orange} cast />
      <Cyl p={[-0.155, 0.264, -0.03]} s={[0.006, 0.008, 0.006]} m={mat.foliage} />
      <Sph p={[-0.085, 0.208, -0.175]} s={[0.052, 0.049, 0.052]} m={mat.orange} />
      {/* Táo đỏ */}
      <Sph p={[0.155, 0.21, -0.03]} s={[0.052, 0.048, 0.052]} m={mat.apple} cast />
      <Cyl p={[0.155, 0.262, -0.03]} s={[0.004, 0.022, 0.004]} r={[0, 0, 0.3]} m={mat.stem} />
      <Sph p={[0.09, 0.206, -0.175]} s={[0.05, 0.046, 0.05]} m={mat.apple} />
      {/* Xoài chín nằm nghiêng phía trên */}
      <Sph p={[0.012, 0.372, -0.065]} s={[0.04, 0.036, 0.074]} r={[0.25, 0.9, 0]} m={mat.mango} cast />
    </group>
  );
};

const FlowerVase: React.FC<{ x: number }> = ({ x }) => {
  const { res, high } = useHall();
  const { mat, geo } = res;
  const flowersRef = useRef<InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = flowersRef.current;
    if (!mesh) return;
    const dummy = new Object3D();
    const yellow = mat.flowerYellow.color;
    const white = mat.flowerWhite.color;
    FLOWER_LAYOUT.forEach((flower, i) => {
      dummy.position.set(flower.x, flower.y, flower.z);
      dummy.scale.set(0.05, 0.028, 0.05);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, flower.white ? white : yellow);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [mat]);

  return (
    <group position={[x, TOP_Y.mid, MID.z]}>
      <mesh geometry={geo.vase} material={mat.porcelain} castShadow={high} />
      <Sph p={[0, 0.5, 0]} s={[0.17, 0.1, 0.17]} m={mat.foliage} />
      <group position={[0, 0.5, 0]}>
        <instancedMesh ref={flowersRef} args={[geo.sph, mat.flowerWhite, FLOWER_LAYOUT.length]} />
      </group>
    </group>
  );
};

const CUP_OFFSETS = [-0.14, 0, 0.14];

/** Ba chén nước (bên phải) và ba đài rượu (bên trái) trên hương án. */
const CupsAndWine: React.FC = () => {
  const { res } = useHall();
  const { mat, geo } = res;
  return (
    <group position={[0, TOP_Y.front + 0.008, FRONT.z]}>
      {CUP_OFFSETS.map((cx) => (
        <mesh key={`w${cx}`} geometry={geo.cup} material={mat.porcelain} position={[1.15 + cx, 0, 0]} />
      ))}
      {CUP_OFFSETS.map((cx) => (
        <mesh key={`r${cx}`} geometry={geo.wineCup} material={mat.porcelain} position={[-1.15 + cx, 0, 0]} />
      ))}
    </group>
  );
};

/** Đồ thờ tĩnh: không phụ thuộc dữ liệu tiền nhân nên chỉ render một lần. */
const Offerings = React.memo(function Offerings({ showCranes }: { showCranes: boolean }) {
  const { high } = useHall();
  return (
    <group>
      <FruitTray />
      <FlowerVase x={-2.0} />
      <FlowerVase x={2.0} />
      <Candle x={-1.1} phase={0} withLight />
      <Candle x={1.1} phase={1.9} withLight={high} />
      <CupsAndWine />
      {high && showCranes && <Crane x={-4.45} flip={1} />}
      {high && showCranes && <Crane x={4.45} flip={-1} />}
    </group>
  );
});

/* ------------------------------------------------------------------ */
/* Lư hương (đỉnh đồng), nén nhang, khói, animation thắp hương         */
/* ------------------------------------------------------------------ */

const BURNER_LIFT = 0.1;
const ASH_Y = BURNER_LIFT + 0.385;
const STICK_TOP = 0.445;

const Smoke: React.FC<{ strength: number }> = ({ strength }) => {
  const { res, high, reduced, offer } = useHall();
  const count = high ? 14 : 7;
  const spritesRef = useRef<Array<Sprite | null>>([]);
  const level = useRef(0);
  const materials = useMemo(
    () => Array.from({ length: count }, () => new SpriteMaterial({ map: res.soft, color: '#e8e2d8', transparent: true, opacity: 0, depthWrite: false })),
    [count, res.soft]
  );
  useEffect(() => () => materials.forEach((m) => m.dispose()), [materials]);

  useFrame(({ clock }, delta) => {
    const dt = Math.min(delta, 0.05);
    // Sau khi cắm nhang mới, khói đậm hơn vài giây rồi về mức thường.
    const ot = offer.current.t;
    const boost = ot < 1.3 ? 0 : ot < OFFER_DURATION ? (ot - 1.3) / (OFFER_DURATION - 1.3) : Math.max(0, 1 - (ot - OFFER_DURATION) / (OFFER_TAIL - OFFER_DURATION));
    const target = strength > 0 ? Math.min(1, strength + boost * 0.6) : 0;
    level.current = MathUtils.damp(level.current, target, 2.2, dt);
    const t = clock.elapsedTime * (reduced ? 0.5 : 1);
    for (let i = 0; i < count; i += 1) {
      const sprite = spritesRef.current[i];
      if (!sprite) continue;
      const p = (t * 0.15 + i / count) % 1;
      const fade = MathUtils.clamp(level.current * count - i, 0, 1);
      const sway = Math.sin(p * 5 + i * 1.7) * 0.06 * (0.3 + p);
      sprite.position.set(sway, p * 1.25, Math.cos(p * 4 + i * 2.1) * 0.04 * p);
      sprite.scale.setScalar(0.12 + p * 0.5);
      materials[i].opacity = fade * Math.pow(1 - p, 1.3) * Math.min(1, p * 8) * 0.3;
      sprite.visible = materials[i].opacity > 0.004;
    }
  });

  return (
    <group>
      {materials.map((material, i) => (
        <sprite
          key={i}
          ref={(el) => {
            spritesRef.current[i] = el;
          }}
          material={material}
          visible={false}
        />
      ))}
    </group>
  );
};

interface IncenseBurnerProps {
  /** Số nén đang cắm (0..9). */
  count: number;
  /** Nhóm 3 nén vừa cắm trong lần thắp gần nhất (-1 nếu chưa thắp lần nào). */
  newGroup: number;
  smokeStrength: number;
}

const IncenseBurner: React.FC<IncenseBurnerProps> = ({ count, newGroup, smokeStrength }) => {
  const { res, high, reduced, offer } = useHall();
  const { mat, geo } = res;
  const newRefs = useRef<Array<Group | null>>([null, null, null]);
  const flashRef = useRef<Sprite>(null);

  // Chuỗi thắp hương theo tiến độ offer.t (giây):
  // 0.5–1.1 nhang hạ xuống cắm vào lư; 1.1–1.9 đầu nhang sáng dần; ~1.15–1.55 chớp lửa nhỏ (chỉ ở high).
  useFrame(() => {
    if (newGroup < 0) return;
    const t = offer.current.t;
    const drop = reduced ? 1 : MathUtils.clamp((t - 0.5) / 0.6, 0, 1);
    const offsetY = Math.pow(1 - drop, 3) * 0.8;
    for (let k = 0; k < STICKS_PER_OFFERING; k += 1) {
      const stick = newRefs.current[k];
      if (!stick) continue;
      stick.position.y = ASH_Y + offsetY;
      stick.visible = reduced || t >= 0.5;
    }
    const heat = MathUtils.clamp((t - (reduced ? 0 : 1.1)) / 0.8, 0, 1);
    mat.emberNew.color.setRGB(MathUtils.lerp(0.12, 1, heat), MathUtils.lerp(0.04, 0.33, heat), MathUtils.lerp(0.02, 0.1, heat));
    mat.emberGlowNew.opacity = heat * 0.9;
    const flash = high && !reduced ? bell((t - 1.15) / 0.4) : 0;
    mat.offerFlash.opacity = flash * 0.95;
    if (flashRef.current) {
      flashRef.current.visible = flash > 0.01;
      flashRef.current.scale.setScalar(0.12 + flash * 0.34);
    }
  });

  return (
    <group position={[0, TOP_Y.front + 0.008, FRONT.z]}>
      {/* Ba chân cong */}
      {[0, 1, 2].map((i) => (
        <group key={i} rotation={[0, (i / 3) * Math.PI * 2 + 0.5, 0]}>
          <mesh geometry={geo.burnerLeg} material={mat.bronze} position={[0.13, 0, 0]} castShadow={high} />
          <Sph p={[0.178, 0.014, 0]} s={[0.042, 0.02, 0.042]} m={mat.bronze} />
        </group>
      ))}
      {/* Thân đỉnh: đáy thu, bụng phình, cổ thắt, miệng loe; có dải hoa văn */}
      <mesh geometry={geo.burner} material={mat.bronzeOrn} position={[0, BURNER_LIFT, 0]} castShadow={high} receiveShadow={high} />
      {/* Hai quai uốn */}
      <mesh geometry={geo.burnerHandle} material={mat.bronze} position={[0.31, BURNER_LIFT + 0.33, 0]} castShadow={high} />
      <mesh geometry={geo.burnerHandle} material={mat.bronze} position={[-0.31, BURNER_LIFT + 0.33, 0]} rotation={[0, Math.PI, 0]} castShadow={high} />
      {/* Mặt tro bên trong */}
      <Cyl p={[0, ASH_Y - 0.01, 0]} s={[0.268, 0.02, 0.268]} m={mat.ash} />
      {/* Nhang: chân đỏ, thân vàng nâu, đầu cháy đỏ phát sáng, đoạn tro cong; cắm tỏa ra các hướng */}
      {INCENSE_SLOTS.slice(0, count).map((slot, i) => {
        const isNew = newGroup >= 0 && Math.floor(i / STICKS_PER_OFFERING) === newGroup;
        return (
          <group
            key={i}
            position={[slot.x, ASH_Y, slot.z]}
            rotation={[slot.rx, 0, slot.rz]}
            ref={
              isNew
                ? (el) => {
                    newRefs.current[i % STICKS_PER_OFFERING] = el;
                  }
                : undefined
            }
          >
            <mesh geometry={geo.stickFoot} material={mat.stickFoot} position={[0, 0.085, 0]} />
            <mesh geometry={geo.stickBody} material={mat.stickBody} position={[0, 0.305, 0]} />
            <Sph p={[0, STICK_TOP, 0]} s={[0.011, 0.011, 0.011]} m={isNew ? mat.emberNew : mat.ember} />
            <mesh geometry={geo.stickAsh} material={mat.ashGray} position={[0, STICK_TOP + 0.006, 0]} rotation={[0, slot.spin, 0]} />
            <sprite material={isNew ? mat.emberGlowNew : mat.emberGlow} position={[0, STICK_TOP, 0]} scale={[0.085, 0.085, 1]} />
          </group>
        );
      })}
      <sprite ref={flashRef} material={mat.offerFlash} position={[0, ASH_Y + STICK_TOP + 0.02, 0.02]} visible={false} />
      <group position={[0, ASH_Y + STICK_TOP + 0.04, 0]}>
        <Smoke strength={count > 0 ? smokeStrength : 0} />
      </group>
    </group>
  );
};

/* ------------------------------------------------------------------ */
/* Bụi sáng lơ lửng                                                    */
/* ------------------------------------------------------------------ */

const DustMotes: React.FC<{ count: number }> = ({ count }) => {
  const { res, reduced } = useHall();
  const { geometry, seeds } = useMemo(() => {
    const rnd = mulberry32(99);
    const positions = new Float32Array(count * 3);
    const seedValues = new Float32Array(count * 2);
    for (let i = 0; i < count; i += 1) {
      positions[i * 3] = (rnd() - 0.5) * 9;
      positions[i * 3 + 1] = 0.8 + rnd() * 2.8;
      positions[i * 3 + 2] = ROOM.zBack + 0.8 + rnd() * 6;
      seedValues[i * 2] = rnd() * Math.PI * 2;
      seedValues[i * 2 + 1] = 0.02 + rnd() * 0.04;
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(positions, 3));
    return { geometry: g, seeds: seedValues };
  }, [count]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame(({ clock }, delta) => {
    const dt = Math.min(delta, 0.05) * (reduced ? 0.4 : 1);
    const t = clock.elapsedTime;
    const attr = geometry.attributes.position;
    const arr = attr.array as Float32Array;
    for (let i = 0; i < count; i += 1) {
      const seed = seeds[i * 2];
      const speed = seeds[i * 2 + 1];
      arr[i * 3] += Math.sin(t * 0.25 + seed) * 0.05 * dt;
      arr[i * 3 + 1] += speed * dt;
      arr[i * 3 + 2] += Math.cos(t * 0.2 + seed) * 0.04 * dt;
      if (arr[i * 3 + 1] > 3.8) arr[i * 3 + 1] = 0.8;
    }
    attr.needsUpdate = true;
  });

  return <points geometry={geometry} material={res.dustMaterial} frustumCulled={false} />;
};

/* ------------------------------------------------------------------ */
/* Góc nhìn người đứng trong phòng: nhìn quanh, tiến/lùi, tự lia       */
/* ------------------------------------------------------------------ */

interface RigApi {
  move: (dz: number) => void;
  reset: () => void;
}

interface RigFocus {
  x: number;
  y: number;
  z: number;
  token: number;
}

/** Phóng to một ảnh: camera tiến sát, ngang tầm khung ảnh. x, y, z là tâm khung (thế giới), height là chiều cao khung. */
interface RigZoom {
  x: number;
  y: number;
  z: number;
  height: number;
}

interface FirstPersonRigProps {
  apiRef: React.MutableRefObject<RigApi | null>;
  focus: RigFocus | null;
  zoom: RigZoom | null;
  /** Người dùng tự thoát khỏi chế độ phóng to (Esc, "Về cửa"). */
  onExitZoom: () => void;
  hovered: string | null;
  offeringToken: number;
}

const FirstPersonRig: React.FC<FirstPersonRigProps> = ({ apiRef, focus, zoom, onExitZoom, hovered, offeringToken }) => {
  const { reduced, drag } = useHall();
  const onExitRef = useRef(onExitZoom);
  onExitRef.current = onExitZoom;
  // Phóng to: lưu tư thế cũ để trả lại khi thoát; chuyển động nhanh (gần như tức thì) khi bật giảm chuyển động.
  const zoomRef = useRef<{ active: boolean; saved: { xT: number; zT: number; yawT: number; pitchT: number } | null; minZ: number }>({
    active: false,
    saved: null,
    minZ: STOP_Z,
  });
  const fastRef = useRef(false);
  const offerCam = useRef(false);
  const prevOffering = useRef(offeringToken);
  const camera = useThree((state) => state.camera) as unknown as PerspectiveCamera;
  const gl = useThree((state) => state.gl);
  const height = useThree((state) => state.size.height);
  const heightRef = useRef(height);
  heightRef.current = height;
  const hoveredRef = useRef(hovered);
  const prevToken = useRef<number | null>(focus ? focus.token : null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef({ startX: 0, startY: 0, pinch: 0 });
  // Pose hiện tại (yaw/pitch/x/z) và mục tiêu (…T). Yaw dương = quay sang phải, pitch dương = ngẩng lên.
  const pose = useRef({
    yaw: 0,
    pitch: 0,
    yawT: 0,
    pitchT: 0,
    x: 0,
    xT: 0,
    y: EYE_Y,
    yT: EYE_Y,
    z: reduced ? START_Z : DOOR_Z,
    zT: START_Z,
    intro: reduced ? INTRO_DURATION : 0,
  });

  useLayoutEffect(() => {
    camera.rotation.order = 'YXZ';
    camera.position.set(pose.current.x, pose.current.y, pose.current.z);
    camera.rotation.set(0, 0, 0);
  }, [camera]);

  // Con trỏ: grab khi rê, grabbing khi kéo, pointer khi trên bài vị.
  useEffect(() => {
    hoveredRef.current = hovered;
    gl.domElement.style.cursor = drag.current.dragging ? 'grabbing' : hovered !== null ? 'pointer' : 'grab';
  }, [hovered, gl, drag]);

  useEffect(() => {
    const el = gl.domElement;
    const s = pose.current;
    const clampPose = () => {
      s.yawT = MathUtils.clamp(s.yawT, -YAW_LIMIT, YAW_LIMIT);
      s.pitchT = MathUtils.clamp(s.pitchT, PITCH_MIN, PITCH_MAX);
      const zoomed = zoomRef.current.active;
      const maxX = zoomed ? ZOOM_MAX_X : MAX_X;
      s.xT = MathUtils.clamp(s.xT, -maxX, maxX);
      s.zT = MathUtils.clamp(s.zT, zoomed ? zoomRef.current.minZ : STOP_Z, START_Z);
    };
    const cursor = () => {
      el.style.cursor = drag.current.dragging ? 'grabbing' : hoveredRef.current !== null ? 'pointer' : 'grab';
    };
    const reset = () => {
      s.xT = 0;
      s.yT = EYE_Y;
      s.zT = START_Z;
      s.yawT = 0;
      s.pitchT = 0;
      if (zoomRef.current.active) {
        zoomRef.current.saved = null; // về cửa: không trả lại tư thế cũ
        onExitRef.current();
      }
    };
    // Kéo cảnh theo ngón tay (kiểu street view): kéo sang trái -> nhìn sang phải; kéo xuống -> nhìn lên.
    const radPerPx = () => (camera.fov * DEG) / Math.max(1, heightRef.current);

    const onDown = (e: PointerEvent) => {
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* không bắt buộc */
      }
      if (pointers.current.size === 1) {
        gesture.current.startX = e.clientX;
        gesture.current.startY = e.clientY;
        drag.current.wasDrag = false;
        drag.current.dragging = false;
      } else if (pointers.current.size === 2) {
        const [a, b] = Array.from(pointers.current.values());
        gesture.current.pinch = Math.hypot(a.x - b.x, a.y - b.y);
        drag.current.wasDrag = true;
        drag.current.dragging = true;
      }
      try {
        el.focus({ preventScroll: true });
      } catch {
        /* bỏ qua */
      }
      cursor();
    };
    const onMove = (e: PointerEvent) => {
      const p = pointers.current.get(e.pointerId);
      if (!p) return;
      if (pointers.current.size >= 2) {
        p.x = e.clientX;
        p.y = e.clientY;
        const [a, b] = Array.from(pointers.current.values());
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        s.zT -= (dist - gesture.current.pinch) * 0.012; // mở hai ngón = tiến lại gần
        gesture.current.pinch = dist;
        clampPose();
        return;
      }
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      if (!drag.current.dragging) {
        if (!exceedsDragThreshold(gesture.current.startX, gesture.current.startY, e.clientX, e.clientY, DRAG_THRESHOLD)) return;
        drag.current.dragging = true;
        drag.current.wasDrag = true;
        if (offerCam.current) {
          // Người dùng kéo tay: hủy phần lia camera của animation thắp hương (nhang vẫn cắm xong).
          offerCam.current = false;
          s.zT = s.z;
          s.xT = s.x;
        }
        cursor();
      }
      const k = radPerPx();
      s.yawT -= dx * k;
      s.pitchT += dy * k;
      clampPose();
    };
    const onUp = (e: PointerEvent) => {
      pointers.current.delete(e.pointerId);
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        /* bỏ qua */
      }
      if (pointers.current.size === 0) drag.current.dragging = false;
      cursor();
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const unit = e.deltaMode === 1 ? 0.06 : e.deltaMode === 2 ? 0.5 : 0.0025;
      s.zT += e.deltaY * unit;
      clampPose();
    };
    const onKey = (e: KeyboardEvent) => {
      let handled = true;
      switch (e.key) {
        case 'ArrowLeft':
        case 'a':
        case 'A':
          s.yawT -= 0.1;
          break;
        case 'ArrowRight':
        case 'd':
        case 'D':
          s.yawT += 0.1;
          break;
        case 'ArrowUp':
        case 'w':
        case 'W':
          s.zT -= 0.4;
          break;
        case 'ArrowDown':
        case 's':
        case 'S':
          s.zT += 0.4;
          break;
        case 'Home':
          reset();
          break;
        case 'Escape':
          onExitRef.current();
          break;
        default:
          handled = false;
      }
      if (handled) {
        e.preventDefault();
        clampPose();
      }
    };

    el.tabIndex = 0;
    el.setAttribute('aria-label', 'Phòng thờ 3D. Kéo để nhìn quanh, mũi tên trái phải để quay, W S hoặc mũi tên lên xuống để tiến lùi, Home để về cửa, Esc để thu nhỏ ảnh thờ đang xem sát.');
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('keydown', onKey);
    apiRef.current = {
      move: (dz) => {
        s.zT += dz;
        clampPose();
      },
      reset,
    };
    cursor();
    const pointerMap = pointers.current;
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('keydown', onKey);
      apiRef.current = null;
      pointerMap.clear();
      el.style.cursor = '';
    };
  }, [gl, camera, drag, apiRef]);

  // Chọn bài vị khác: quay đầu nhẹ về phía đó (không đổi vị trí quá ~1 đơn vị). Kéo tay sẽ ghi đè.
  useEffect(() => {
    if (!focus) {
      prevToken.current = null;
      return;
    }
    if (prevToken.current === null) {
      prevToken.current = focus.token;
      return;
    }
    if (prevToken.current === focus.token) return;
    prevToken.current = focus.token;
    if (zoomRef.current.active) return; // đang xem sát: camera do chế độ phóng to điều khiển
    const s = pose.current;
    s.xT = MathUtils.clamp(focus.x * 0.12, -MAX_X, MAX_X);
    const dx = focus.x - s.xT;
    const dz = focus.z - s.zT;
    s.yawT = MathUtils.clamp(Math.atan2(dx, -dz) * 0.85, -YAW_LIMIT, YAW_LIMIT);
    s.pitchT = MathUtils.clamp(Math.atan2(focus.y - EYE_Y, Math.hypot(dx, dz)) * 0.6, PITCH_MIN, PITCH_MAX);
  }, [focus]);

  // Phóng to / thu nhỏ một ảnh thờ. Tiến sát, ngang tầm khung, nhìn thẳng vào ảnh; thoát thì trả lại tư thế cũ.
  useEffect(() => {
    const s = pose.current;
    const state = zoomRef.current;
    if (zoom) {
      if (!state.active) state.saved = { xT: s.xT, zT: s.zT, yawT: s.yawT, pitchT: s.pitchT };
      state.active = true;
      state.minZ = zoom.z + ZOOM_MIN_GAP;
      s.xT = MathUtils.clamp(zoom.x, -ZOOM_MAX_X, ZOOM_MAX_X);
      s.yT = MathUtils.clamp(zoom.y, ZOOM_MIN_Y, ZOOM_MAX_Y);
      s.zT = Math.max(state.minZ, Math.min(START_Z, zoom.z + zoomDistance(zoom.height, camera.fov)));
      s.yawT = 0;
      s.pitchT = 0;
      offerCam.current = false;
      fastRef.current = reduced;
    } else if (state.active) {
      state.active = false;
      s.yT = EYE_Y;
      const saved = state.saved;
      state.saved = null;
      if (saved) {
        s.xT = saved.xT;
        s.zT = saved.zT;
        s.yawT = saved.yawT;
        s.pitchT = saved.pitchT;
      }
      fastRef.current = reduced;
    }
  }, [zoom, camera, reduced]);

  // Thắp hương: quay nhẹ về lư hương và tiến gần thêm một chút (vẫn trong giới hạn camera).
  useEffect(() => {
    if (prevOffering.current === offeringToken) return;
    prevOffering.current = offeringToken;
    if (reduced || zoomRef.current.active) return;
    const s = pose.current;
    s.xT = 0;
    s.zT = MathUtils.clamp(s.zT - 0.9, STOP_Z, START_Z);
    const dz = FRONT.z + ALTAR_Z - s.zT;
    s.yawT = 0;
    s.pitchT = MathUtils.clamp(Math.atan2(TOP_Y.front + 0.55 - EYE_Y, Math.abs(dz)), PITCH_MIN, PITCH_MAX);
    offerCam.current = true;
  }, [offeringToken, reduced]);

  useFrame((_, delta) => {
    const s = pose.current;
    const dt = Math.min(delta, 0.05);
    if (s.intro < INTRO_DURATION) {
      // Bước từ cửa vào, easing; bỏ qua tiến/lùi trong lúc này.
      s.intro = Math.min(INTRO_DURATION, s.intro + dt);
      s.zT = START_Z;
      s.z = MathUtils.lerp(DOOR_Z, START_Z, easeInOutCubic(s.intro / INTRO_DURATION));
      s.x = MathUtils.damp(s.x, s.xT, 6, dt);
    } else {
      const rate = fastRef.current ? 24 : 6;
      s.x = MathUtils.damp(s.x, s.xT, rate, dt);
      s.z = MathUtils.damp(s.z, s.zT, rate, dt);
      s.y = MathUtils.damp(s.y, s.yT, rate, dt);
      if (fastRef.current && Math.abs(s.x - s.xT) + Math.abs(s.y - s.yT) + Math.abs(s.z - s.zT) < 0.01) fastRef.current = false;
    }
    const turn = reduced ? 40 : 9;
    s.yaw = MathUtils.damp(s.yaw, s.yawT, turn, dt);
    s.pitch = MathUtils.damp(s.pitch, s.pitchT, turn, dt);
    camera.position.set(s.x, s.y, s.z);
    camera.rotation.set(s.pitch, -s.yaw, 0);
  });

  return null;
};

// Màn hình dọc (điện thoại): tăng fov dọc để vẫn thấy đủ bề ngang bàn thờ. Màn hình rộng giữ fov gốc.
const ResponsiveCamera: React.FC = () => {
  const camera = useThree((state) => state.camera) as unknown as { fov: number; updateProjectionMatrix: () => void };
  const width = useThree((state) => state.size.width);
  const height = useThree((state) => state.size.height);

  useEffect(() => {
    if (width <= 0 || height <= 0) return;
    const aspect = width / height;
    const needed = (2 * Math.atan(Math.tan(MIN_HORIZONTAL_FOV_RAD / 2) / aspect) * 180) / Math.PI;
    camera.fov = Math.min(MAX_FOV, Math.max(BASE_FOV, needed));
    camera.updateProjectionMatrix();
  }, [camera, width, height]);

  return null;
};

/* ------------------------------------------------------------------ */
/* Cảnh chính                                                          */
/* ------------------------------------------------------------------ */

interface HallSceneProps {
  tiers: Hall3DTier[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  incenseCount: number;
  isBurning: boolean;
  hallTitle: string;
  quality: HallQuality;
  reduced: boolean;
  hovered: string | null;
  onHover: (id: string | null) => void;
  rigApi: React.MutableRefObject<RigApi | null>;
  offeringToken: number;
  /** Trạng thái kéo/bấm dùng chung với Canvas (để phân biệt bấm ra ngoài với kéo). */
  drag: React.MutableRefObject<DragState>;
  grayscale: boolean;
  /** id bài vị đang được phóng to (null: cảnh chung). */
  zoomId: string | null;
  onExitZoom: () => void;
  /** id các bài vị có ngày giỗ hôm nay. */
  memorialIds: ReadonlySet<string>;
}

const HallScene: React.FC<HallSceneProps> = ({
  tiers,
  selectedId,
  onSelect,
  incenseCount,
  isBurning,
  hallTitle,
  quality,
  reduced,
  hovered,
  onHover,
  rigApi,
  offeringToken,
  drag,
  grayscale,
  zoomId,
  onExitZoom,
  memorialIds,
}) => {
  const high = quality === 'high';
  const res = useMemo(() => createResources(quality), [quality]);
  useEffect(() => () => res.dispose(), [res]);
  const offer = useRef<OfferState>({ t: OFFER_TAIL });
  const context = useMemo<HallContextValue>(() => ({ res, high, reduced, grayscale, drag, offer }), [res, high, reduced, grayscale, drag]);

  // Vệt sáng ánh nến trên kính dao động nhẹ cùng ngọn nến; sáng đều ở chế độ nhẹ hoặc khi giảm chuyển động.
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const flicker = high && !reduced ? 1 + Math.sin(t * 5.1) * 0.08 + Math.sin(t * 11.7) * 0.04 : 1;
    res.mat.glassStreak.opacity = 0.2 * flicker;
  });

  // Đồng hồ của animation thắp hương (một nguồn thời gian chung cho nhang, nến, khói).
  useFrame((_, delta) => {
    // Bám thời gian thật để khớp với thông báo "Đã thắp hương" của trang.
    if (offer.current.t < OFFER_TAIL) offer.current.t += Math.min(delta, 0.5);
  });

  // Nhang trên lư: tối đa 9 nén. Mỗi lần thắp cắm 3 nén mới; đã đủ 9 thì thay nhóm cũ nhất.
  const [sticks, setSticks] = useState(() => ({ count: Math.min(Math.max(0, Math.floor(incenseCount)), MAX_INCENSE), newGroup: -1 }));
  const replaceGroup = useRef(0);
  const prevOffering = useRef(offeringToken);
  useEffect(() => {
    if (prevOffering.current === offeringToken) return;
    prevOffering.current = offeringToken;
    offer.current.t = 0;
    setSticks((current) => {
      if (current.count + STICKS_PER_OFFERING <= MAX_INCENSE) {
        const group = Math.ceil(current.count / STICKS_PER_OFFERING);
        return { count: (group + 1) * STICKS_PER_OFFERING, newGroup: group };
      }
      const group = replaceGroup.current;
      replaceGroup.current = (group + 1) % (MAX_INCENSE / STICKS_PER_OFFERING);
      return { count: MAX_INCENSE, newGroup: group };
    });
  }, [offeringToken]);
  // Số nén từ bên ngoài đổi (đổi dòng họ, nạp lại...) khi không có animation đang chạy: đồng bộ lại.
  useEffect(() => {
    if (offer.current.t < OFFER_DURATION) return;
    const target = Math.min(Math.max(0, Math.floor(incenseCount)), MAX_INCENSE);
    setSticks((current) => (current.count === target ? current : { count: target, newGroup: -1 }));
  }, [incenseCount]);

  const scene = useThree((state) => state.scene);
  useEffect(() => {
    scene.environmentIntensity = 0.75;
  }, [scene]);

  const spotTarget = useMemo(() => new Object3D(), []);

  // Phần tử Environment được giữ cố định: nếu children đổi identity mỗi lần render thì drei dựng lại cubemap
  // mỗi khi chọn/rê chuột lên bài vị. Ánh sáng tự dựng bằng Lightformer, không tải HDR ngoài.
  const environment = useMemo(
    () => (
      <Environment resolution={high ? 64 : 32} frames={1}>
        <Lightformer form="rect" intensity={2.4} color="#ffe2b0" scale={[10, 4, 1]} position={[0, 5, 0]} target={[0, 0, 0]} />
        <Lightformer form="rect" intensity={1.3} color="#ff9a5a" scale={[6, 3, 1]} position={[-5, 1.5, 1]} target={[0, 0, 0]} />
        <Lightformer form="rect" intensity={1.3} color="#ff9a5a" scale={[6, 3, 1]} position={[5, 1.5, 1]} target={[0, 0, 0]} />
        <Lightformer form="rect" intensity={1.1} color="#fff0d8" scale={[8, 3, 1]} position={[0, 2, 6]} target={[0, 0, 0]} />
        <Lightformer form="circle" intensity={2} color="#ffcf80" scale={3} position={[0, 1, -5]} target={[0, 0, 0]} />
      </Environment>
    ),
    [high]
  );

  // Chỉ vẽ tối đa 6 tầng. Không tầng nào có bài vị: bàn thờ trống (5 khung mờ), không vẽ tầng.
  const shownTiers = useMemo(() => tiers.slice(0, MAX_TIERS), [tiers]);
  const isEmpty = !shownTiers.some((tier) => tier.tablets.length > 0);
  const layout = useMemo(() => (isEmpty ? null : computeTierLayout(shownTiers.length)), [isEmpty, shownTiers.length]);
  // Có nén hương thì khói mảnh; lúc thắp hương khói đậm hơn vài giây (Smoke tự cộng theo đồng hồ offer).
  const smokeStrength = sticks.count > 0 ? (isBurning ? 0.7 : 0.4) : 0;

  // Chuyển trang trong tầng thì bỏ trạng thái rê chuột cũ.
  const pagesKey = shownTiers.map((tier) => `${tier.id}:${tier.page}`).join('|');
  useEffect(() => {
    onHover(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagesKey]);

  // Ảnh thờ đang chọn (tọa độ thế giới) để camera quay đầu về phía đó.
  const focus = useMemo<RigFocus | null>(() => {
    if (!layout || !selectedId) return null;
    for (let row = 0; row < shownTiers.length; row += 1) {
      const items = shownTiers[row].tablets;
      const col = items.findIndex((item) => item.id === selectedId);
      if (col >= 0) {
        return {
          x: tabletX(col, items.length, layout.scale),
          y: layout.baseY[row] + 0.555 * layout.scale,
          z: layout.rowZ[row] + ALTAR_Z,
          token: row * 16 + col,
        };
      }
    }
    return null;
  }, [layout, shownTiers, selectedId]);

  // Phóng to ảnh đang chọn: camera tiến sát, ngang tầm tâm khung.
  const zoom = useMemo<RigZoom | null>(() => {
    if (!layout || !zoomId) return null;
    for (let row = 0; row < shownTiers.length; row += 1) {
      const items = shownTiers[row].tablets;
      const col = items.findIndex((item) => item.id === zoomId);
      if (col >= 0) {
        return {
          x: tabletX(col, items.length, layout.scale),
          y: layout.baseY[row] + 0.5 * layout.scale,
          z: layout.rowZ[row] + ALTAR_Z,
          height: FRAME_H * layout.scale,
        };
      }
    }
    return null;
  }, [layout, shownTiers, zoomId]);

  // Tối đa 2 bài vị giỗ có đèn điểm ở nến (đèn thật rất tốn); còn lại chỉ có ánh sáng giả (sprite).
  const litMemorials = useMemo(
    () => pickLitMemorials(shownTiers.flatMap((tier) => tier.tablets.map((item) => item.id)), memorialIds, high),
    [shownTiers, memorialIds, high]
  );

  return (
    <HallContext.Provider value={context}>
      <color attach="background" args={[COLOR.bg]} />
      <fog attach="fog" args={[COLOR.bg, 10, 28]} />

      {environment}

      {/* Ánh sáng: nền nhẹ + một đèn rọi ấm có bóng từ trên + ánh nến (+ hai đèn rửa tường ở chế độ high) */}
      <ambientLight intensity={0.35} color="#ffe9cc" />
      <hemisphereLight args={['#ffe2b8', '#3b2415', 0.4]} />
      <primitive object={spotTarget} position={[0, 1.3, ALTAR_Z - 2.8]} />
      <spotLight
        position={[0, 4.3, ALTAR_Z + 2.4]}
        target={spotTarget}
        angle={0.85}
        penumbra={0.7}
        intensity={high ? 110 : 90}
        distance={16}
        decay={2}
        color="#ffd9a0"
        castShadow={high}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-near={1}
        shadow-camera-far={14}
        shadow-bias={-0.0004}
      />
      {high && <pointLight position={[-HX + 1.6, 3.4, -2.2]} color="#ffcf90" intensity={7} distance={11} decay={2} />}
      {high && <pointLight position={[HX - 1.6, 3.4, -2.2]} color="#ffcf90" intensity={7} distance={11} decay={2} />}

      <ResponsiveCamera />
      <Room />
      <SideWallDetails />
      <DoorWall />
      <LanternRows />

      {/* Bộ bàn thờ dựng ở hệ tọa độ riêng, dời sát tường sau */}
      <group position={[0, 0, ALTAR_Z]}>
        <Inscriptions hallTitle={hallTitle} />
        <Altar />
        <Offerings showCranes={!layout?.rack} />

        {isEmpty && EMPTY_SLOT_IDS.map((slot) => <EmptyTabletSlot key={slot} x={tabletX(slot, EMPTY_SLOT_COUNT)} />)}

        {layout?.rack && <TierRack layout={layout} />}
        {layout &&
          shownTiers.map((tier, row) => {
            const y = layout.baseY[row];
            const z = layout.rowZ[row];
            const items = tier.tablets;
            // Nhãn tầng đứng ở đầu hàng: sát hàng khi hàng hẹp, nhưng ngoài bình hoa (x=±2) và trong hạc đồng ở đầu bàn.
            const labelX = -Math.min(3.95, Math.max(2.6, 2.37 * layout.scale + 0.45));
            return (
              <group key={tier.id}>
                <TierLabel text={tier.label} x={labelX} y={y} z={z + 0.05} />
                {items.length === 0 &&
                  [0, 1, 2].map((slot) => (
                    <EmptyTabletSlot key={slot} x={tabletX(slot, 3, layout.scale)} y={y} z={z} scale={layout.scale} />
                  ))}
                {items.map((ancestor, col) => (
                  <PortraitFrame
                    key={ancestor.id}
                    ancestor={ancestor}
                    x={tabletX(col, items.length, layout.scale)}
                    y={y}
                    z={z}
                    scale={layout.scale}
                    selected={ancestor.id === selectedId}
                    hovered={ancestor.id === hovered}
                    zoomed={ancestor.id === zoomId}
                    memorial={memorialIds.has(ancestor.id)}
                    memorialLight={litMemorials.has(ancestor.id)}
                    onSelect={onSelect}
                    onHover={onHover}
                  />
                ))}
              </group>
            );
          })}

        <IncenseBurner count={sticks.count} newGroup={sticks.newGroup} smokeStrength={smokeStrength} />
      </group>

      <DustMotes count={high ? 60 : 20} />
      <FirstPersonRig apiRef={rigApi} focus={focus} zoom={zoom} onExitZoom={onExitZoom} hovered={hovered} offeringToken={offeringToken} />
    </HallContext.Provider>
  );
};

/* ------------------------------------------------------------------ */
/* Error Boundary                                                      */
/* ------------------------------------------------------------------ */

interface Hall3DErrorBoundaryProps {
  fallback?: React.ReactNode;
  onError?: () => void;
  children: React.ReactNode;
}

class Hall3DErrorBoundary extends React.Component<Hall3DErrorBoundaryProps, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error('Phòng thờ 3D gặp lỗi:', error);
    this.props.onError?.();
  }

  render() {
    if (this.state.hasError) return <>{this.props.fallback ?? null}</>;
    return this.props.children;
  }
}

/* ------------------------------------------------------------------ */
/* Component xuất ra ngoài                                             */
/* ------------------------------------------------------------------ */

export const AncestralHall3D: React.FC<AncestralHall3DProps> = ({
  tiers,
  selectedId,
  onSelect,
  onTierPage,
  incenseCount = 0,
  isBurning = false,
  fallback = null,
  onError,
  emptyHint = DEFAULT_EMPTY_HINT,
  hallTitle = DEFAULT_HALL_TITLE,
  quality: qualityProp,
  offeringToken = 0,
  portraitGrayscale = false,
  onZoomChange,
  today,
}) => {
  const webglOk = useMemo(() => isWebGLAvailable(), []);
  const quality = useMemo<HallQuality>(() => qualityProp ?? detectQuality(), [qualityProp]);
  const reduced = usePrefersReducedMotion();
  const pageVisible = usePageVisible();
  const [hovered, setHovered] = useState<string | null>(null);
  const rigApi = useRef<RigApi | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  // Bấm vào ảnh -> phóng to ảnh đó; bấm ra ngoài / Đóng / Esc / Về cửa -> trở lại. Kéo không bao giờ được tính là bấm.
  const [zoomId, dispatchZoom] = useReducer(zoomReducer, null);
  const dragRef = useRef<DragState>({ wasDrag: false, dragging: false });
  const exitZoom = React.useCallback(() => dispatchZoom({ type: 'reset' }), []);
  const handleSelect = (id: string) => {
    dispatchZoom({ type: 'click', id, wasDrag: false }); // PortraitFrame đã loại các lần kéo trước khi gọi
    onSelect(id);
  };

  // Ngày giỗ (âm lịch) của các bài vị đang hiển thị, theo ngày giờ Việt Nam. Không đổi được thì không có hiệu ứng.
  const todayVn: SolarDate = vietnamToday(today ?? new Date());
  const todayKey = `${todayVn.y}-${todayVn.m}-${todayVn.d}`;
  const memorialIds = useMemo(
    () => memorialIdsOf(tiers.slice(0, MAX_TIERS).flatMap((tier) => tier.tablets), todayVn),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tiers, todayKey]
  );

  // Danh sách ảnh đang hiển thị đổi (chuyển trang...) mà ảnh đang xem sát không còn: thu nhỏ lại.
  const visibleIds = tiers.slice(0, MAX_TIERS).flatMap((tier) => tier.tablets.map((item) => item.id));
  const visibleKey = visibleIds.join('|');
  useEffect(() => {
    dispatchZoom({ type: 'available', ids: visibleIds });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleKey]);
  // Chọn ảnh khác từ bên ngoài (danh sách của trang) khi đang xem sát: chuyển sang ảnh đó.
  useEffect(() => {
    if (zoomId !== null && selectedId && selectedId !== zoomId && visibleIds.includes(selectedId)) {
      dispatchZoom({ type: 'click', id: selectedId, wasDrag: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);
  // Esc thu nhỏ lại (kể cả khi tiêu điểm đang ở nút Đóng, không ở canvas).
  useEffect(() => {
    if (zoomId === null) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dispatchZoom({ type: 'escape' });
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [zoomId]);
  // Báo cho trang để tải ảnh gốc đúng lúc phóng to.
  const onZoomChangeRef = useRef(onZoomChange);
  onZoomChangeRef.current = onZoomChange;
  const prevZoom = useRef<string | null>(null);
  useEffect(() => {
    if (prevZoom.current === zoomId) return;
    const closed = prevZoom.current !== null && zoomId === null;
    prevZoom.current = zoomId;
    onZoomChangeRef.current?.(zoomId);
    // Thẻ thông tin biến mất kéo theo tiêu điểm: trả tiêu điểm về canvas để phím điều hướng vẫn dùng được.
    if (closed && (document.activeElement === document.body || document.activeElement === null)) {
      wrapRef.current?.querySelector('canvas')?.focus({ preventScroll: true });
    }
  }, [zoomId]);

  const onErrorRef = useRef(onError);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  // Khi unmount, R3F chủ động hủy WebGL context (sự kiện webglcontextlost) -> không được coi là lỗi.
  const mountedRef = useRef(true);
  useLayoutEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  if (!webglOk) return <>{fallback}</>;

  const high = quality === 'high';
  const isEmpty = !tiers.some((tier) => tier.tablets.length > 0);
  const zoomedAncestor = zoomId !== null ? tiers.flatMap((tier) => tier.tablets).find((item) => item.id === zoomId) : undefined;
  const hoveredAncestor =
    zoomId === null && hovered !== null && hovered !== selectedId
      ? tiers.flatMap((tier) => tier.tablets).find((item) => item.id === hovered)
      : undefined;
  // Mỗi tầng có nhiều hơn 9 bài vị thì có bộ chuyển trang riêng.
  const pagedTiers = tiers.slice(0, MAX_TIERS).filter((tier) => tier.pageCount > 1);

  return (
    <Hall3DErrorBoundary fallback={fallback} onError={onError}>
      <div className="hall3d-root">
        <div className="hall3d-wrap" ref={wrapRef}>
          <Canvas
            shadows={high}
            dpr={high ? [1, 1.75] : [1, 1.25]}
            frameloop={pageVisible ? 'always' : 'never'}
            camera={{ position: [0, EYE_Y, DOOR_Z], fov: BASE_FOV }}
            gl={{ antialias: high, powerPreference: 'high-performance' }}
            // Bấm ra ngoài (không trúng ảnh nào, không phải kéo) thì thu nhỏ lại.
            onPointerMissed={() => dispatchZoom({ type: 'missed', wasDrag: dragRef.current.wasDrag })}
            onCreated={({ gl }) => {
              gl.domElement.addEventListener('webglcontextlost', (event) => {
                event.preventDefault();
                if (mountedRef.current) onErrorRef.current?.();
              });
            }}
          >
            <HallScene
              tiers={tiers}
              selectedId={selectedId}
              onSelect={handleSelect}
              incenseCount={incenseCount}
              isBurning={isBurning}
              hallTitle={hallTitle}
              quality={quality}
              reduced={reduced}
              hovered={hovered}
              onHover={setHovered}
              rigApi={rigApi}
              offeringToken={offeringToken}
              drag={dragRef}
              grayscale={portraitGrayscale}
              zoomId={zoomId}
              onExitZoom={exitZoom}
              memorialIds={memorialIds}
            />
          </Canvas>
          {zoomedAncestor && (
            <AncestorInfoCard
              ancestor={zoomedAncestor}
              memorialToday={memorialIds.has(zoomedAncestor.id) ? memorialLabel(zoomedAncestor.deathDate) : null}
              onClose={() => dispatchZoom({ type: 'close' })}
            />
          )}
          {hoveredAncestor && (
            <div className="hall3d-hovercard" aria-hidden="true">
              <strong>{hoveredAncestor.name}</strong>
              <span>Đời thứ {hoveredAncestor.generation}</span>
              {hoveredAncestor.lifespan && <small>{hoveredAncestor.lifespan}</small>}
            </div>
          )}
        </div>
        <div className="hall3d-footer">
          <p className="hall3d-hint">
            {isEmpty ? emptyHint : 'Kéo để nhìn quanh · Cuộn hoặc W/S để tiến lùi · Bấm ảnh thờ để xem sát, bấm ra ngoài hoặc Esc để quay lại'}
          </p>
          <div className="hall3d-controls" role="group" aria-label="Điều khiển góc nhìn">
            <button type="button" onClick={() => rigApi.current?.move(-0.9)}>
              Tiến vào
            </button>
            <button type="button" onClick={() => rigApi.current?.move(0.9)}>
              Lùi ra
            </button>
            <button type="button" onClick={() => rigApi.current?.reset()}>
              Về cửa
            </button>
          </div>
        </div>
        {pagedTiers.length > 0 && (
          <div className="hall3d-tier-pagers">
            {pagedTiers.map((tier) => (
              <div key={tier.id} className="hall3d-pager" role="group" aria-label={`Chuyển trang ảnh thờ ${tier.label}`}>
                <b>{tier.label}</b>
                <button
                  type="button"
                  onClick={() => onTierPage?.(tier.id, tier.page - 1)}
                  disabled={tier.page <= 1 || tier.pageLoading}
                  aria-label={`${tier.label}: trang trước`}
                >
                  ‹
                </button>
                <span aria-live="polite">{tier.pageLoading ? 'Đang tải…' : `${tier.page}/${tier.pageCount}`}</span>
                <button
                  type="button"
                  onClick={() => onTierPage?.(tier.id, tier.page + 1)}
                  disabled={tier.page >= tier.pageCount || tier.pageLoading}
                  aria-label={`${tier.label}: trang sau`}
                >
                  ›
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Hall3DErrorBoundary>
  );
};

export default AncestralHall3D;
