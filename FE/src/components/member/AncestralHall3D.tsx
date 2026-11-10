import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Environment, Lightformer, OrbitControls } from '@react-three/drei';
import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  CylinderGeometry,
  DoubleSide,
  EdgesGeometry,
  ExtrudeGeometry,
  Float32BufferAttribute,
  LatheGeometry,
  LineBasicMaterial,
  MathUtils,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PointsMaterial,
  RepeatWrapping,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  SpriteMaterial,
  SRGBColorSpace,
  Vector2,
  type Group,
  type InstancedMesh,
  type Material,
  type Mesh,
  type PointLight,
  type Sprite,
} from 'three';
import './AncestralHall3D.css';

export interface Hall3DAncestor {
  id: string;
  name: string;
  generation: number;
  lifespan?: string;
}

export type HallQuality = 'high' | 'low';

export interface AncestralHall3DProps {
  ancestors: Hall3DAncestor[];
  selectedIndex: number;
  onSelect: (index: number) => void;
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

const PAGE_SIZE = 9;
const TABLET_SPACING = 0.7;
const MAX_INCENSE = 9;
const EMPTY_SLOT_COUNT = 5;
const EMPTY_SLOT_IDS = Array.from({ length: EMPTY_SLOT_COUNT }, (_, i) => i);

// Ba tầng: bàn sau (bài vị) > bàn giữa (ngũ quả, hoa, nến) > hương án (lư hương).
const BACK = { z: -2.9, w: 7.0, h: 1.0, d: 0.75 } as const;
const MID = { z: -2.15, w: 5.2, h: 0.78, d: 0.7 } as const;
const FRONT = { z: -1.4, w: 3.4, h: 0.62, d: 0.8 } as const;
const TOP_Y = { back: BACK.h + 0.015, mid: MID.h + 0.015, front: FRONT.h + 0.015 } as const;

const BODY_W = 0.34;
const BODY_H = 0.8;
const FRAME_W = 0.4;
const FRAME_H = 0.86;
const FACE_W = 0.28;
const FACE_H = 0.7;
const TABLET_SCALE = 1.3;

const CAMERA_POSITION: [number, number, number] = [0, 2.1, 5.0];
const INTRO_START: [number, number, number] = [0, 2.7, 7.9];
const ORBIT_TARGET: [number, number, number] = [0, 1.4, -2];
const INTRO_DURATION = 1.8;
const BASE_FOV = 50;
const MAX_FOV = 85;
const MIN_HORIZONTAL_FOV_RAD = (60 * Math.PI) / 180;

const COLOR = {
  bg: '#1a0d08',
  gold: '#d9ad45',
  red: '#8f1b14',
  redDark: '#5a100c',
} as const;

const FONT_FAMILY = "'Times New Roman', Georgia, 'Noto Serif', serif";
const COUPLET_LEFT = 'TỔ TÔNG CÔNG ĐỨC LƯU THIÊN CỔ';
const COUPLET_RIGHT = 'TỬ HIẾU TÔN HIỀN THẾ VẠN NIÊN';

type V3 = [number, number, number];

// Vị trí các nén hương trong lư (tính sẵn).
const INCENSE_LAYOUT = Array.from({ length: MAX_INCENSE }, (_, i) => {
  const angle = ((i - 1) / (MAX_INCENSE - 1)) * Math.PI * 2;
  const radius = i === 0 ? 0 : 0.17;
  return {
    x: Math.cos(angle) * radius,
    z: Math.sin(angle) * radius,
    tiltX: Math.sin(i * 1.7) * 0.07,
    tiltZ: Math.cos(i * 2.3) * 0.07,
  };
});

// Hoa cúc cắm trong bình (vị trí cố định trên mặt vòm lá).
const FLOWER_LAYOUT = Array.from({ length: 11 }, (_, i) => {
  const angle = i * 2.399;
  const radius = i === 0 ? 0 : 0.045 + (i % 3) * 0.032;
  const dome = Math.sqrt(Math.max(0, 1 - (radius / 0.17) ** 2)) * 0.1;
  return { x: Math.cos(angle) * radius * 1.5, y: dome + 0.02, z: Math.sin(angle) * radius * 1.5, white: i % 2 === 0 };
});

const FRUIT_LAYOUT: Array<{ p: V3; mat: number }> = [
  { p: [0, 0.16, 0], mat: 0 },
  { p: [0.1, 0.07, 0], mat: 1 },
  { p: [-0.1, 0.07, 0], mat: 2 },
  { p: [0, 0.07, 0.1], mat: 3 },
  { p: [0, 0.07, -0.1], mat: 4 },
];

const clampIndex = (index: number, length: number): number => {
  if (length <= 0) return 0;
  if (!Number.isFinite(index)) return 0;
  return Math.min(Math.max(Math.trunc(index), 0), length - 1);
};

const tabletX = (localIndex: number, count: number): number => (localIndex - (count - 1) / 2) * TABLET_SPACING;

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

const createCoupletTexture = (phrase: string): CanvasTexture => {
  const w = 128;
  const h = 1067;
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

// Rút gọn lifespan ("Sinh 1868 · Mất 1941") thành "1868 – 1941".
const lifespanToYears = (lifespan?: string): string => {
  if (!lifespan) return '';
  const years = lifespan.match(/\d{4}/g);
  if (years && years.length >= 2) return `${years[0]} – ${years[1]}`;
  if (years && years.length === 1) return `${years[0]} – …`;
  return lifespan.trim();
};

const createTabletFaceTexture = (name: string, lifespan?: string): CanvasTexture => {
  const w = 256;
  const h = 640;
  const { canvas, ctx } = makeCanvas(w, h);
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#5a1210');
  bg.addColorStop(1, '#3a0a08');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  const gold = goldGradient(ctx, w, h);

  // Viền vòm hai lớp.
  const outline = (inset: number, lineWidth: number, alpha: number) => {
    const r = (w - inset * 2) / 2;
    ctx.beginPath();
    ctx.moveTo(inset, h - inset);
    ctx.lineTo(w - inset, h - inset);
    ctx.lineTo(w - inset, inset + r);
    ctx.arc(w / 2, inset + r, r, 0, Math.PI, true);
    ctx.lineTo(inset, h - inset);
    ctx.closePath();
    ctx.globalAlpha = alpha;
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = gold;
    ctx.stroke();
    ctx.globalAlpha = 1;
  };
  outline(12, 6, 1);
  outline(26, 2, 0.6);

  // Hoa văn nhỏ phía trên.
  ctx.fillStyle = gold;
  ctx.beginPath();
  ctx.arc(w / 2, 92, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = gold;
  ctx.lineWidth = 2;
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2;
    ctx.beginPath();
    ctx.ellipse(w / 2 + Math.cos(a) * 17, 92 + Math.sin(a) * 17, 7, 3, a, 0, Math.PI * 2);
    ctx.stroke();
  }

  const years = lifespanToYears(lifespan);
  const top = 150;
  const bottom = h - 52;
  const length = bottom - top;
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 4;
  ctx.fillStyle = gold;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';

  // Viết dọc: xoay chữ 90° để đọc từ trên xuống.
  const drawVertical = (text: string, cx: number, weight: number, maxSize: number, minSize: number) => {
    const size = fitFontSize(ctx, text, weight, length, maxSize, minSize);
    const font = `${weight} ${size}px ${FONT_FAMILY}`;
    const shown = truncateToFit(ctx, text, font, length);
    ctx.font = font;
    const textWidth = ctx.measureText(shown).width;
    ctx.save();
    ctx.translate(cx, top + (length - textWidth) / 2);
    ctx.rotate(Math.PI / 2);
    ctx.fillText(shown, 0, 0);
    ctx.restore();
  };

  const upperName = (name.trim() || '—').toLocaleUpperCase('vi-VN');
  if (years) {
    drawVertical(upperName, 96, 700, 64, 34);
    drawVertical(years, 180, 500, 40, 26);
  } else {
    drawVertical(upperName, w / 2, 700, 64, 34);
  }
  return toTexture(canvas);
};

/* ------------------------------------------------------------------ */
/* Hình học dùng chung                                                 */
/* ------------------------------------------------------------------ */

const archShape = (width: number, height: number): Shape => {
  const r = width / 2;
  const shape = new Shape();
  shape.moveTo(-r, 0);
  shape.lineTo(r, 0);
  shape.lineTo(r, height - r);
  shape.absarc(0, height - r, r, 0, Math.PI, false);
  shape.lineTo(-r, 0);
  return shape;
};

const normalizeArchUv = (geometry: ShapeGeometry, width: number, height: number) => {
  const pos = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  for (let i = 0; i < pos.count; i += 1) uv.setXY(i, (pos.getX(i) + width / 2) / width, pos.getY(i) / height);
  uv.needsUpdate = true;
};

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
  const woodTex = track(createWoodTexture());
  const ceilingTex = track(woodTex.clone());
  ceilingTex.repeat.set(5, 4);
  ceilingTex.wrapS = RepeatWrapping;
  ceilingTex.wrapT = RepeatWrapping;
  const wallTex = track(createWallTexture());
  const rugTex = track(createRugTexture());
  const clothTex = track(createClothTexture());
  const apronTex = track(createApronTexture());
  const softTex = track(createSoftDotTexture());

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
    woodDark: std({ map: woodTex, color: '#b8947a', roughness: 0.65, metalness: 0.05 }),
    ceiling: std({ map: ceilingTex, color: '#a58872', roughness: 0.8 }),
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
    stick: std({ color: '#6b4220', roughness: 0.9 }),
    ash: std({ color: '#8a8174', roughness: 1 }),
    lantern: std({ color: '#d42a1c', emissive: '#ff2a14', emissiveIntensity: 0.85, roughness: 0.5 }),
    craneWhite: std({ color: '#f6f3ec', roughness: 0.6 }),
    craneDark: std({ color: '#2a2420', roughness: 0.7 }),
    craneBeak: std({ color: '#e08a2a', roughness: 0.6 }),
    fruit: [
      std({ color: '#d62b1f', roughness: 0.45 }),
      std({ color: '#f0b429', roughness: 0.45 }),
      std({ color: '#ef7d1a', roughness: 0.45 }),
      std({ color: '#7bb33a', roughness: 0.45 }),
      std({ color: '#8e3b8f', roughness: 0.45 }),
    ],
    apronBack: apron(BACK.w),
    apronMid: apron(MID.w),
    apronFront: apron(FRONT.w),
    ember: track(new MeshBasicMaterial({ color: '#ff5a1f' })),
    flame: track(new MeshBasicMaterial({ color: '#ffd77a' })),
    flameGlow: track(
      new SpriteMaterial({ map: softTex, color: '#ffb25a', transparent: true, opacity: 0.8, blending: AdditiveBlending, depthWrite: false })
    ),
    emberGlow: track(
      new SpriteMaterial({ map: softTex, color: '#ff6a30', transparent: true, opacity: 0.9, blending: AdditiveBlending, depthWrite: false })
    ),
    ghost: track(new MeshStandardMaterial({ color: '#ead9a6', transparent: true, opacity: 0.25, depthWrite: false })),
    ghostLine: track(new LineBasicMaterial({ color: COLOR.gold, transparent: true, opacity: 0.7 })),
  };

  const tabletBody = track(new ExtrudeGeometry(archShape(BODY_W, BODY_H), { depth: 0.07, bevelEnabled: false, curveSegments: high ? 16 : 8 }));
  tabletBody.translate(0, 0, -0.035);
  const tabletFrame = track(new ExtrudeGeometry(archShape(FRAME_W, FRAME_H), { depth: 0.07, bevelEnabled: false, curveSegments: high ? 16 : 8 }));
  tabletFrame.translate(0, -0.03, -0.04);
  const tabletFace = track(new ShapeGeometry(archShape(FACE_W, FACE_H), high ? 16 : 8));
  normalizeArchUv(tabletFace, FACE_W, FACE_H);

  const geo = {
    box: track(new BoxGeometry(1, 1, 1)),
    cyl: track(new CylinderGeometry(1, 1, 1, high ? 24 : 14)),
    sph: track(new SphereGeometry(1, high ? 20 : 12, high ? 14 : 8)),
    plane: track(new BoxGeometry(1, 1, 0.001)),
    tabletBody,
    tabletFrame,
    tabletFace,
    tabletEdges: track(new EdgesGeometry(tabletBody, 30)),
    vase: track(
      lathe([[0, 0], [0.08, 0], [0.1, 0.03], [0.13, 0.14], [0.11, 0.26], [0.06, 0.31], [0.07, 0.36], [0.1, 0.4], [0.09, 0.4]], high ? 24 : 14)
    ),
    cup: track(lathe([[0, 0], [0.03, 0], [0.035, 0.01], [0.05, 0.05], [0.05, 0.058], [0.045, 0.058]], 16)),
    burner: track(
      lathe(
        [[0, 0], [0.16, 0], [0.2, 0.03], [0.26, 0.06], [0.32, 0.14], [0.35, 0.22], [0.34, 0.28], [0.375, 0.3], [0.375, 0.33], [0.33, 0.33]],
        high ? 28 : 16
      )
    ),
  };

  // Hạt bụi dùng chung texture mềm.
  const dustMaterial = track(
    new PointsMaterial({ map: softTex, size: 0.06, color: '#ffdca0', transparent: true, opacity: 0.55, depthWrite: false, blending: AdditiveBlending })
  );

  return {
    mat,
    geo,
    soft: softTex,
    dustMaterial,
    dispose: () => disposables.forEach((item) => item.dispose()),
  };
};

type Resources = ReturnType<typeof createResources>;

interface HallContextValue {
  res: Resources;
  high: boolean;
  reduced: boolean;
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

const Column: React.FC<{ x: number; z: number }> = ({ x, z }) => {
  const { res } = useHall();
  const { mat } = res;
  return (
    <group position={[x, 0, z]}>
      {/* Đá tảng kê cột */}
      <Cyl p={[0, 0.09, 0]} s={[0.3, 0.18, 0.3]} m={mat.stone} cast recv />
      <Cyl p={[0, 0.2, 0]} s={[0.23, 0.04, 0.23]} m={mat.stone} />
      {/* Thân cột sơn son */}
      <Cyl p={[0, 2.1, 0]} s={[0.17, 3.8, 0.17]} m={mat.lacquerDark} cast recv />
      <Cyl p={[0, 0.5, 0]} s={[0.185, 0.04, 0.185]} m={mat.gold} />
      <Cyl p={[0, 3.6, 0]} s={[0.185, 0.04, 0.185]} m={mat.gold} />
      {/* Đầu cột đỡ xà */}
      <Box p={[0, 4.0, 0]} s={[0.34, 0.16, 0.34]} m={mat.woodDark} />
    </group>
  );
};

const Room = React.memo(function Room() {
  const { res, high } = useHall();
  const { mat } = res;
  return (
    <group>
      {/* Sàn gạch Bát Tràng */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0.5]} receiveShadow={high} material={mat.floor}>
        <planeGeometry args={[9, 10]} />
      </mesh>
      {/* Chiếu/thảm đỏ trước bàn thờ */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.008, -0.1]} receiveShadow={high} material={mat.rug}>
        <planeGeometry args={[4.4, 2.2]} />
      </mesh>

      {/* Tường hậu + hai tường bên */}
      <mesh position={[0, 2.2, -3.45]} receiveShadow={high} material={mat.wall}>
        <planeGeometry args={[9, 4.4]} />
      </mesh>
      <mesh position={[-4.5, 2.2, 0.5]} rotation={[0, Math.PI / 2, 0]} receiveShadow={high} material={mat.wall}>
        <planeGeometry args={[10, 4.4]} />
      </mesh>
      <mesh position={[4.5, 2.2, 0.5]} rotation={[0, -Math.PI / 2, 0]} receiveShadow={high} material={mat.wall}>
        <planeGeometry args={[10, 4.4]} />
      </mesh>

      {/* Gờ chân tường */}
      <Box p={[0, 0.08, -3.42]} s={[9, 0.16, 0.07]} m={mat.woodDark} />
      <Box p={[-4.47, 0.08, 0.5]} s={[0.07, 0.16, 10]} m={mat.woodDark} />
      <Box p={[4.47, 0.08, 0.5]} s={[0.07, 0.16, 10]} m={mat.woodDark} />
      {/* Ốp gỗ lửng tường hậu */}
      <Box p={[0, 0.55, -3.43]} s={[9, 0.9, 0.04]} m={mat.wood} />
      <Box p={[0, 1.02, -3.42]} s={[9, 0.05, 0.06]} m={mat.gold} />

      {/* Trần gỗ + xà ngang/xà dọc */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 4.4, 0.5]} material={mat.ceiling}>
        <planeGeometry args={[9, 10]} />
      </mesh>
      <Box p={[0, 3.98, -3.2]} s={[9, 0.26, 0.26]} m={mat.woodDark} />
      <Box p={[-3.78, 3.98, 0.5]} s={[0.26, 0.26, 10]} m={mat.woodDark} />
      <Box p={[3.78, 3.98, 0.5]} s={[0.26, 0.26, 10]} m={mat.woodDark} />
      <Box p={[0, 4.2, -0.6]} s={[9, 0.2, 0.2]} m={mat.woodDark} />
      <Box p={[0, 4.2, 2.0]} s={[9, 0.2, 0.2]} m={mat.woodDark} />

      {/* Hai cột sơn son hai bên bàn thờ */}
      <Column x={-3.78} z={-3.0} />
      <Column x={3.78} z={-3.0} />
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
      {/* Hoành phi */}
      <Box p={[0, 3.3, -3.4]} s={[3.3, 0.68, 0.08]} m={mat.gold} cast />
      <mesh position={[0, 3.3, -3.358]}>
        <planeGeometry args={[3.0, 0.56]} />
        <meshStandardMaterial map={plaqueTex} emissiveMap={plaqueTex} emissive="#ffffff" emissiveIntensity={0.3} roughness={0.4} metalness={0.15} />
      </mesh>
      {/* Hai sợi dây treo hoành phi */}
      <Cyl p={[-1.3, 3.84, -3.38]} s={[0.012, 0.4, 0.012]} m={mat.craneDark} />
      <Cyl p={[1.3, 3.84, -3.38]} s={[0.012, 0.4, 0.012]} m={mat.craneDark} />

      {/* Câu đối trên hai cột */}
      <Box p={[-3.78, 2.0, -2.78]} s={[0.34, 2.62, 0.04]} m={mat.gold} />
      <mesh position={[-3.78, 2.0, -2.755]}>
        <planeGeometry args={[0.3, 2.5]} />
        <meshStandardMaterial map={leftTex} emissiveMap={leftTex} emissive="#ffffff" emissiveIntensity={0.25} roughness={0.45} />
      </mesh>
      <Box p={[3.78, 2.0, -2.78]} s={[0.34, 2.62, 0.04]} m={mat.gold} />
      <mesh position={[3.78, 2.0, -2.755]}>
        <planeGeometry args={[0.3, 2.5]} />
        <meshStandardMaterial map={rightTex} emissiveMap={rightTex} emissive="#ffffff" emissiveIntensity={0.25} roughness={0.45} />
      </mesh>
    </group>
  );
};

/* ------------------------------------------------------------------ */
/* Bàn thờ                                                             */
/* ------------------------------------------------------------------ */

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
  const { res } = useHall();
  const { mat } = res;
  const legX = width / 2 - 0.16;
  const legZ = depth / 2 - 0.12;
  return (
    <group position={[0, 0, z]}>
      {/* Mặt bàn: viền vàng + lòng sơn son */}
      <Box p={[0, height - 0.035, 0]} s={[width, 0.07, depth]} m={mat.gold} cast recv />
      <Box p={[0, height + 0.005, 0]} s={[width - 0.12, 0.02, depth - 0.12]} m={mat.lacquerDark} recv />
      {/* Diềm chạm dưới mặt bàn */}
      <Box p={[0, height - 0.14, 0]} s={[width - 0.08, 0.14, depth - 0.08]} m={mat.woodDark} />
      <mesh position={[0, height - 0.14, depth / 2 - 0.039]} material={apronMat} geometry={res.geo.plane} scale={[width - 0.1, 0.12, 1]} />
      {solid ? (
        <>
          {/* Thân ngai đặc có phần panel sơn son */}
          <Box p={[0, (height - 0.21 + 0.12) / 2, 0]} s={[width - 0.2, height - 0.33, depth - 0.2]} m={mat.wood} cast recv />
          {[-0.4, -0.2, 0, 0.2, 0.4].map((k) => (
            <Box key={k} p={[k * (width - 0.6), (height - 0.21 + 0.12) / 2, depth / 2 - 0.095]} s={[(width - 0.8) / 5, height - 0.5, 0.012]} m={mat.lacquer} />
          ))}
          <Box p={[0, height - 0.215, 0]} s={[width - 0.16, 0.025, depth - 0.16]} m={mat.gold} />
          <Box p={[0, 0.125, 0]} s={[width - 0.16, 0.025, depth - 0.16]} m={mat.gold} />
        </>
      ) : (
        <>
          {/* Bốn chân quỳ + thanh giằng */}
          {[-legX, legX].flatMap((lx) =>
            [-legZ, legZ].map((lz) => (
              <group key={`${lx}${lz}`} position={[lx, 0, lz]}>
                <mesh position={[0, (height - 0.21) / 2 + 0.06, 0]} material={mat.woodDark} geometry={res.geo.cyl} scale={[0.055, height - 0.21 - 0.06, 0.055]} />
                <Sph p={[0, 0.07, 0]} s={[0.095, 0.07, 0.095]} m={mat.gold} />
              </group>
            ))
          )}
          <Box p={[0, height * 0.45, legZ]} s={[width - 0.3, 0.05, 0.05]} m={mat.woodDark} />
          <Box p={[0, height * 0.45, -legZ]} s={[width - 0.3, 0.05, 0.05]} m={mat.woodDark} />
        </>
      )}
      {solid && [-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => (
          <Sph key={`${sx}${sz}`} p={[sx * (width / 2 - 0.15), 0.065, sz * (depth / 2 - 0.12)]} s={[0.11, 0.07, 0.11]} m={mat.gold} />
        ))
      )}
      {drape && (
        <>
          {/* Khăn phủ đỏ viền vàng buông phía trước + khăn trải mặt bàn */}
          <mesh position={[0, height / 2 + 0.03, depth / 2 + 0.012]} material={mat.cloth} geometry={res.geo.plane} scale={[width - 0.1, height - 0.1, 1]} />
          <Box p={[0, height + 0.018, 0]} s={[width - 0.3, 0.008, depth - 0.2]} m={mat.clothPlain} />
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
/* Bài vị                                                              */
/* ------------------------------------------------------------------ */

interface TabletProps {
  ancestor: Hall3DAncestor;
  x: number;
  raise: number;
  globalIndex: number;
  selected: boolean;
  hovered: boolean;
  onSelect: (index: number) => void;
  onHover: (index: number | null) => void;
}

const Tablet: React.FC<TabletProps> = ({ ancestor, x, raise, globalIndex, selected, hovered, onSelect, onHover }) => {
  const { res, high } = useHall();
  const { mat, geo, soft } = res;
  const liftRef = useRef<Group>(null);
  const haloRef = useRef<Sprite>(null);

  const faceTex = useMemo(() => createTabletFaceTexture(ancestor.name, ancestor.lifespan), [ancestor.name, ancestor.lifespan]);
  const faceMat = useMemo(
    () => new MeshStandardMaterial({ map: faceTex, emissiveMap: faceTex, emissive: '#ffffff', emissiveIntensity: 0.18, roughness: 0.5, metalness: 0.1 }),
    [faceTex]
  );
  const frameMat = useMemo(() => new MeshStandardMaterial({ color: COLOR.gold, metalness: 0.9, roughness: 0.35, emissive: '#ffb830', emissiveIntensity: 0 }), []);
  const haloMat = useMemo(
    () => new SpriteMaterial({ map: soft, color: '#ffd27a', transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false }),
    [soft]
  );
  useEffect(() => () => { faceTex.dispose(); faceMat.dispose(); }, [faceTex, faceMat]);
  useEffect(() => () => { frameMat.dispose(); haloMat.dispose(); }, [frameMat, haloMat]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const lift = liftRef.current;
    if (lift) lift.position.y = MathUtils.damp(lift.position.y, selected ? 0.1 : 0, 7, dt);
    const glow = selected ? 1 : hovered ? 0.55 : 0;
    frameMat.emissiveIntensity = MathUtils.damp(frameMat.emissiveIntensity, glow * 0.9, 8, dt);
    faceMat.emissiveIntensity = MathUtils.damp(faceMat.emissiveIntensity, 0.18 + glow * 0.5, 8, dt);
    haloMat.opacity = MathUtils.damp(haloMat.opacity, glow * 0.5, 6, dt);
    const halo = haloRef.current;
    if (halo) halo.visible = haloMat.opacity > 0.01;
  });

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    onSelect(globalIndex);
  };
  const handleOver = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    onHover(globalIndex);
  };
  const handleOut = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    onHover(null);
  };

  return (
    <group position={[x, TOP_Y.back, BACK.z]} onClick={handleClick} onPointerOver={handleOver} onPointerOut={handleOut}>
      <group scale={TABLET_SCALE}>
      {raise > 0.01 && (
        <>
          <Box p={[0, raise / 2, 0]} s={[0.5, raise, 0.34]} m={mat.lacquerDark} cast recv />
          <Box p={[0, raise + 0.005, 0]} s={[0.52, 0.015, 0.36]} m={mat.gold} />
        </>
      )}
      <group position={[0, raise, 0]}>
        <group ref={liftRef}>
          {/* Đế bậc */}
          <Box p={[0, 0.025, 0]} s={[0.46, 0.05, 0.3]} m={mat.woodDark} cast recv />
          <Box p={[0, 0.075, 0]} s={[0.4, 0.05, 0.25]} m={mat.gold} cast />
          {/* Bảng đầu vòm: khung vàng, thân đỏ sẫm, mặt chữ */}
          <mesh geometry={geo.tabletFrame} material={frameMat} position={[0, 0.1, 0]} castShadow={high} />
          <mesh geometry={geo.tabletBody} material={mat.lacquerDark} position={[0, 0.1, 0]} castShadow={high} />
          <mesh geometry={geo.tabletFace} material={faceMat} position={[0, 0.15, 0.0358]} />
          <sprite ref={haloRef} material={haloMat} position={[0, 0.58, -0.07]} scale={[1.05, 1.5, 1]} visible={false} />
        </group>
      </group>
      </group>
    </group>
  );
};

const EmptyTabletSlot: React.FC<{ x: number }> = ({ x }) => {
  const { res } = useHall();
  const { mat, geo } = res;
  return (
    <group position={[x, TOP_Y.back, BACK.z]} scale={TABLET_SCALE}>
      <Box p={[0, 0.025, 0]} s={[0.46, 0.05, 0.3]} m={mat.ghost} />
      <Box p={[0, 0.075, 0]} s={[0.4, 0.05, 0.25]} m={mat.ghost} />
      <mesh geometry={geo.tabletBody} material={mat.ghost} position={[0, 0.1, 0]} />
      <lineSegments geometry={geo.tabletEdges} material={mat.ghostLine} position={[0, 0.1, 0]} />
    </group>
  );
};

/* ------------------------------------------------------------------ */
/* Đồ thờ: nến, đèn lồng, hạc, ngũ quả, bình hoa, chén nước            */
/* ------------------------------------------------------------------ */

const Candle: React.FC<{ x: number; phase: number; withLight: boolean }> = ({ x, phase, withLight }) => {
  const { res, reduced } = useHall();
  const { mat } = res;
  const lightRef = useRef<PointLight>(null);
  const glowRef = useRef<Sprite>(null);
  const flameRef = useRef<Mesh>(null);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const amp = reduced ? 0.3 : 1;
    // Dao động mềm: tổng hợp vài sóng sin tần số thấp, tránh giật.
    const flicker = 1 + (Math.sin(t * 5.1 + phase) * 0.08 + Math.sin(t * 11.7 + phase * 2) * 0.04) * amp;
    if (lightRef.current) lightRef.current.intensity = 2.6 * flicker;
    if (flameRef.current) flameRef.current.scale.set(0.028, 0.06 * flicker, 0.028);
    if (glowRef.current) glowRef.current.scale.setScalar(0.34 * flicker);
  });

  return (
    <group position={[x, TOP_Y.mid, MID.z]}>
      <Cyl p={[0, 0.03, 0]} s={[0.075, 0.06, 0.075]} m={mat.gold} cast />
      <Cyl p={[0, 0.2, 0]} s={[0.04, 0.28, 0.04]} m={mat.candle} cast />
      <Cyl p={[0, 0.34, 0]} s={[0.044, 0.025, 0.044]} m={mat.gold} />
      <mesh ref={flameRef} geometry={res.geo.sph} material={mat.flame} position={[0, 0.4, 0]} scale={[0.028, 0.06, 0.028]} />
      <sprite ref={glowRef} material={mat.flameGlow} position={[0, 0.42, 0.02]} scale={[0.34, 0.34, 1]} />
      {withLight && <pointLight ref={lightRef} position={[0, 0.5, 0.12]} color="#ffb45c" intensity={2.6} distance={5} decay={2} />}
    </group>
  );
};

const Lantern: React.FC<{ x: number; phase: number }> = ({ x, phase }) => {
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
    <group position={[x, 4.0, -2.3]}>
      <group ref={swayRef}>
        <Cyl p={[0, -0.45, 0]} s={[0.006, 0.9, 0.006]} m={mat.craneDark} />
        <Cyl p={[0, -0.95, 0]} s={[0.11, 0.07, 0.11]} m={mat.gold} />
        <Sph p={[0, -1.25, 0]} s={[0.27, 0.31, 0.27]} m={mat.lantern} />
        <Cyl p={[0, -1.56, 0]} s={[0.1, 0.06, 0.1]} m={mat.gold} />
        <Cyl p={[0, -1.72, 0]} s={[0.012, 0.28, 0.012]} m={mat.lacquer} />
        <Sph p={[0, -1.88, 0]} s={[0.035, 0.05, 0.035]} m={mat.lacquer} />
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

const FruitTray: React.FC = () => {
  const { res } = useHall();
  const { mat } = res;
  return (
    <group position={[0, TOP_Y.mid, MID.z]}>
      <Cyl p={[0, 0.03, 0]} s={[0.17, 0.06, 0.17]} m={mat.bronze} cast />
      <Cyl p={[0, 0.1, 0]} s={[0.05, 0.1, 0.05]} m={mat.bronze} />
      <Cyl p={[0, 0.16, 0]} s={[0.27, 0.03, 0.27]} m={mat.bronze} cast />
      {FRUIT_LAYOUT.map((fruit, i) => (
        <Sph key={i} p={[fruit.p[0], fruit.p[1] + 0.22, fruit.p[2]]} s={[0.068, 0.068, 0.068]} m={mat.fruit[fruit.mat]} cast />
      ))}
    </group>
  );
};

const FlowerVase: React.FC<{ x: number }> = ({ x }) => {
  const { res } = useHall();
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
      <mesh geometry={geo.vase} material={mat.porcelain} castShadow />
      <Sph p={[0, 0.44, 0]} s={[0.17, 0.1, 0.17]} m={mat.foliage} />
      <group position={[0, 0.44, 0]}>
        <instancedMesh ref={flowersRef} args={[geo.sph, mat.flowerWhite, FLOWER_LAYOUT.length]} />
      </group>
    </group>
  );
};

const WaterCups: React.FC = () => {
  const { res } = useHall();
  const { mat, geo } = res;
  return (
    <group position={[0.95, TOP_Y.front, FRONT.z]}>
      {[-0.14, 0, 0.14].map((cx) => (
        <mesh key={cx} geometry={geo.cup} material={mat.porcelain} position={[cx, 0, 0]} />
      ))}
    </group>
  );
};

/** Đồ thờ tĩnh: không phụ thuộc dữ liệu tiền nhân nên chỉ render một lần. */
const Offerings = React.memo(function Offerings() {
  const { high } = useHall();
  return (
    <group>
      <FruitTray />
      <FlowerVase x={-1.5} />
      <FlowerVase x={1.5} />
      <Candle x={-0.85} phase={0} withLight />
      <Candle x={0.85} phase={1.9} withLight={high} />
      <WaterCups />
      {high && <Crane x={-3.25} flip={1} />}
      {high && <Crane x={3.25} flip={-1} />}
      <Lantern x={-2.5} phase={0} />
      <Lantern x={2.5} phase={2.1} />
    </group>
  );
});

/* ------------------------------------------------------------------ */
/* Lư hương, nén hương, khói                                           */
/* ------------------------------------------------------------------ */

const BURNER_LIFT = 0.12;

const Smoke: React.FC<{ strength: number }> = ({ strength }) => {
  const { res, high, reduced } = useHall();
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
    level.current = MathUtils.damp(level.current, strength, 2.2, dt);
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

const IncenseBurner: React.FC<{ count: number; smokeStrength: number }> = ({ count, smokeStrength }) => {
  const { res } = useHall();
  const { mat, geo } = res;
  return (
    <group position={[0, TOP_Y.front, FRONT.z]}>
      {/* Chân lư (ba chân) */}
      {[0, 1, 2].map((i) => {
        const a = (i / 3) * Math.PI * 2 + 0.5;
        return (
          <group key={i} position={[Math.cos(a) * 0.2, 0, Math.sin(a) * 0.2]}>
            <Cyl p={[0, 0.06, 0]} s={[0.035, 0.12, 0.035]} m={mat.bronze} cast />
            <Sph p={[0, 0.02, 0]} s={[0.05, 0.03, 0.05]} m={mat.bronze} />
          </group>
        );
      })}
      {/* Thân lư */}
      <mesh geometry={geo.burner} material={mat.bronze} position={[0, BURNER_LIFT, 0]} castShadow receiveShadow />
      {/* Quai lư */}
      <mesh position={[0.375, BURNER_LIFT + 0.26, 0]} rotation={[0, 0, -Math.PI / 2]} material={mat.bronze} castShadow>
        <torusGeometry args={[0.09, 0.02, 8, 18, Math.PI]} />
      </mesh>
      <mesh position={[-0.375, BURNER_LIFT + 0.26, 0]} rotation={[0, 0, Math.PI / 2]} material={mat.bronze} castShadow>
        <torusGeometry args={[0.09, 0.02, 8, 18, Math.PI]} />
      </mesh>
      {/* Cát/tro hương */}
      <Cyl p={[0, BURNER_LIFT + 0.3, 0]} s={[0.32, 0.03, 0.32]} m={mat.ash} />
      {/* Nén hương: que nâu + đầu cháy đỏ phát sáng */}
      {INCENSE_LAYOUT.slice(0, count).map((stick, i) => (
        <group key={i} position={[stick.x, BURNER_LIFT + 0.31, stick.z]} rotation={[stick.tiltX, 0, stick.tiltZ]}>
          <Cyl p={[0, 0.225, 0]} s={[0.011, 0.45, 0.011]} m={mat.stick} />
          <Sph p={[0, 0.455, 0]} s={[0.022, 0.022, 0.022]} m={mat.ember} />
          <sprite material={mat.emberGlow} position={[0, 0.455, 0]} scale={[0.1, 0.1, 1]} />
        </group>
      ))}
      <group position={[0, BURNER_LIFT + 0.31 + 0.45, 0]}>
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
      positions[i * 3] = (rnd() - 0.5) * 5.5;
      positions[i * 3 + 1] = 0.8 + rnd() * 2.8;
      positions[i * 3 + 2] = -3 + rnd() * 3.6;
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
/* Camera: dolly vào + lia nhẹ tới bài vị đang chọn                    */
/* ------------------------------------------------------------------ */

const CameraRig: React.FC<{ panX: number }> = ({ panX }) => {
  const { reduced } = useHall();
  const controlsRef = useRef<React.ElementRef<typeof OrbitControls>>(null);
  const camera = useThree((state) => state.camera);
  const introTime = useRef(reduced ? INTRO_DURATION : 0);

  useLayoutEffect(() => {
    if (reduced) return;
    camera.position.set(INTRO_START[0], INTRO_START[1], INTRO_START[2]);
    camera.lookAt(ORBIT_TARGET[0], ORBIT_TARGET[1], ORBIT_TARGET[2]);
    if (controlsRef.current) controlsRef.current.enabled = false;
    // Chỉ chạy một lần khi cảnh được dựng.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFrame((_, delta) => {
    const controls = controlsRef.current;
    if (!controls) return;
    const dt = Math.min(delta, 0.05);
    if (introTime.current < INTRO_DURATION) {
      introTime.current = Math.min(INTRO_DURATION, introTime.current + dt);
      const k = easeInOutCubic(introTime.current / INTRO_DURATION);
      camera.position.set(
        MathUtils.lerp(INTRO_START[0], CAMERA_POSITION[0], k),
        MathUtils.lerp(INTRO_START[1], CAMERA_POSITION[1], k),
        MathUtils.lerp(INTRO_START[2], CAMERA_POSITION[2], k)
      );
      camera.lookAt(ORBIT_TARGET[0], ORBIT_TARGET[1], ORBIT_TARGET[2]);
      if (introTime.current >= INTRO_DURATION) {
        controls.enabled = true;
        controls.update();
      }
      return;
    }
    if (!reduced) controls.target.x = MathUtils.damp(controls.target.x, panX, 2.5, dt);
  });

  return (
    <OrbitControls
      ref={controlsRef}
      enablePan={false}
      minDistance={2.5}
      maxDistance={9}
      minPolarAngle={Math.PI / 4}
      maxPolarAngle={Math.PI / 2.05}
      minAzimuthAngle={-Math.PI / 3}
      maxAzimuthAngle={Math.PI / 3}
      target={ORBIT_TARGET}
    />
  );
};

// Màn hình dọc (điện thoại): tăng fov dọc để vẫn thấy đủ bề ngang bàn thờ. Màn hình rộng giữ fov 50.
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
  ancestors: Hall3DAncestor[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  incenseCount: number;
  isBurning: boolean;
  hallTitle: string;
  quality: HallQuality;
  reduced: boolean;
  hovered: number | null;
  onHover: (index: number | null) => void;
}

const HallScene: React.FC<HallSceneProps> = ({
  ancestors,
  selectedIndex,
  onSelect,
  incenseCount,
  isBurning,
  hallTitle,
  quality,
  reduced,
  hovered,
  onHover,
}) => {
  const high = quality === 'high';
  const res = useMemo(() => createResources(quality), [quality]);
  useEffect(() => () => res.dispose(), [res]);
  const context = useMemo<HallContextValue>(() => ({ res, high, reduced }), [res, high, reduced]);

  const scene = useThree((state) => state.scene);
  useEffect(() => {
    scene.environmentIntensity = 0.75;
  }, [scene]);

  const spotTarget = useMemo(() => new Object3D(), []);

  const safeSelected = clampIndex(selectedIndex, ancestors.length);
  const pageStart = Math.floor(safeSelected / PAGE_SIZE) * PAGE_SIZE;
  const pageItems = useMemo(() => ancestors.slice(pageStart, pageStart + PAGE_SIZE), [ancestors, pageStart]);
  const isEmpty = ancestors.length === 0;
  const incenseSticks = isEmpty ? 0 : Math.min(Math.max(0, incenseCount) + (isBurning ? 1 : 0), MAX_INCENSE);
  // Có nén hương thì khói mảnh; đang dâng hương thì khói đậm.
  const smokeStrength = isEmpty ? 0 : isBurning ? 1 : incenseSticks > 0 ? 0.4 : 0;

  // Thế hệ cao (đời nhỏ) được nâng lên bệ cao hơn, tối đa 2 bậc.
  const raises = useMemo(() => {
    const gens = pageItems.map((a) => (Number.isFinite(a.generation) ? a.generation : 1));
    const minGen = gens.length ? Math.min(...gens) : 1;
    const levels = gens.map((g) => Math.min(2, Math.max(0, g - minGen)));
    const lowest = levels.length ? Math.max(...levels) : 0;
    return levels.map((level) => (lowest - level) * 0.14);
  }, [pageItems]);

  // Con trỏ pointer khi rê chuột lên bài vị; trả về mặc định khi rời đi/unmount.
  useEffect(() => {
    document.body.style.cursor = hovered !== null ? 'pointer' : '';
    return () => {
      document.body.style.cursor = '';
    };
  }, [hovered]);

  // Chuyển trang thì bỏ trạng thái rê chuột cũ.
  useEffect(() => {
    onHover(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageStart]);

  const panX = isEmpty ? 0 : tabletX(safeSelected - pageStart, pageItems.length) * 0.25;

  return (
    <HallContext.Provider value={context}>
      <color attach="background" args={[COLOR.bg]} />
      <fog attach="fog" args={['#24120a', 9, 22]} />

      {/* Môi trường tự dựng bằng Lightformer: cho vàng/đồng ánh phản chiếu, không tải HDR ngoài. */}
      <Environment resolution={high ? 64 : 32} frames={1}>
        <Lightformer form="rect" intensity={2.4} color="#ffe2b0" scale={[10, 4, 1]} position={[0, 5, 0]} target={[0, 0, 0]} />
        <Lightformer form="rect" intensity={1.3} color="#ff9a5a" scale={[6, 3, 1]} position={[-5, 1.5, 1]} target={[0, 0, 0]} />
        <Lightformer form="rect" intensity={1.3} color="#ff9a5a" scale={[6, 3, 1]} position={[5, 1.5, 1]} target={[0, 0, 0]} />
        <Lightformer form="rect" intensity={1.1} color="#fff0d8" scale={[8, 3, 1]} position={[0, 2, 6]} target={[0, 0, 0]} />
        <Lightformer form="circle" intensity={2} color="#ffcf80" scale={3} position={[0, 1, -5]} target={[0, 0, 0]} />
      </Environment>

      {/* Ánh sáng ba lớp: nền nhẹ + đèn rọi ấm từ trên + ánh nến */}
      <ambientLight intensity={0.3} color="#ffe9cc" />
      <hemisphereLight args={['#ffe2b8', '#3b2415', 0.35]} />
      <primitive object={spotTarget} position={[0, 1.3, -2.8]} />
      <spotLight
        position={[0, 4.2, 2.4]}
        target={spotTarget}
        angle={0.62}
        penumbra={0.7}
        intensity={high ? 95 : 80}
        distance={14}
        decay={2}
        color="#ffd9a0"
        castShadow={high}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-near={1}
        shadow-camera-far={12}
        shadow-bias={-0.0004}
      />

      <ResponsiveCamera />
      <Room />
      <Inscriptions hallTitle={hallTitle} />
      <Altar />
      <Offerings />

      {isEmpty && EMPTY_SLOT_IDS.map((slot) => <EmptyTabletSlot key={slot} x={tabletX(slot, EMPTY_SLOT_COUNT)} />)}

      {pageItems.map((ancestor, localIndex) => {
        const globalIndex = pageStart + localIndex;
        return (
          <Tablet
            key={ancestor.id}
            ancestor={ancestor}
            x={tabletX(localIndex, pageItems.length)}
            raise={raises[localIndex] ?? 0}
            globalIndex={globalIndex}
            selected={globalIndex === safeSelected}
            hovered={globalIndex === hovered}
            onSelect={onSelect}
            onHover={onHover}
          />
        );
      })}

      <IncenseBurner count={incenseSticks} smokeStrength={smokeStrength} />
      <DustMotes count={high ? 60 : 20} />
      <CameraRig panX={panX} />
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
  ancestors,
  selectedIndex,
  onSelect,
  incenseCount = 0,
  isBurning = false,
  fallback = null,
  onError,
  emptyHint = DEFAULT_EMPTY_HINT,
  hallTitle = DEFAULT_HALL_TITLE,
  quality: qualityProp,
}) => {
  const webglOk = useMemo(() => isWebGLAvailable(), []);
  const quality = useMemo<HallQuality>(() => qualityProp ?? detectQuality(), [qualityProp]);
  const reduced = usePrefersReducedMotion();
  const pageVisible = usePageVisible();
  const [hovered, setHovered] = useState<number | null>(null);

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
  const isEmpty = ancestors.length === 0;
  const safeSelected = clampIndex(selectedIndex, ancestors.length);
  const totalPages = Math.max(1, Math.ceil(ancestors.length / PAGE_SIZE));
  const currentPage = Math.floor(safeSelected / PAGE_SIZE) + 1;
  const hoveredAncestor = hovered !== null && hovered !== safeSelected ? ancestors[hovered] : undefined;

  const goToPage = (page: number) => {
    const target = Math.min(Math.max(page, 1), totalPages);
    if (target === currentPage) return;
    onSelect((target - 1) * PAGE_SIZE);
  };

  return (
    <Hall3DErrorBoundary fallback={fallback} onError={onError}>
      <div className="hall3d-root">
        <div className="hall3d-wrap">
          <Canvas
            shadows={high}
            dpr={high ? [1, 1.75] : [1, 1.25]}
            frameloop={pageVisible ? 'always' : 'never'}
            camera={{ position: CAMERA_POSITION, fov: BASE_FOV }}
            gl={{ antialias: high, powerPreference: 'high-performance' }}
            onCreated={({ gl }) => {
              gl.domElement.addEventListener('webglcontextlost', (event) => {
                event.preventDefault();
                if (mountedRef.current) onErrorRef.current?.();
              });
            }}
          >
            <HallScene
              ancestors={ancestors}
              selectedIndex={safeSelected}
              onSelect={onSelect}
              incenseCount={incenseCount}
              isBurning={isBurning}
              hallTitle={hallTitle}
              quality={quality}
              reduced={reduced}
              hovered={hovered}
              onHover={setHovered}
            />
          </Canvas>
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
            {isEmpty ? emptyHint : 'Kéo chuột để xoay · Cuộn để phóng to · Bấm bài vị để chọn'}
          </p>
          {totalPages > 1 && (
            <div className="hall3d-pager" role="group" aria-label="Chuyển trang bài vị">
              <button type="button" onClick={() => goToPage(currentPage - 1)} disabled={currentPage <= 1} aria-label="Trang bài vị trước">
                ‹
              </button>
              <span>Trang {currentPage}/{totalPages}</span>
              <button type="button" onClick={() => goToPage(currentPage + 1)} disabled={currentPage >= totalPages} aria-label="Trang bài vị sau">
                ›
              </button>
            </div>
          )}
        </div>
      </div>
    </Hall3DErrorBoundary>
  );
};

export default AncestralHall3D;
