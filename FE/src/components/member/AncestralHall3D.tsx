import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Html, OrbitControls } from '@react-three/drei';
import {
  CanvasTexture,
  MathUtils,
  RepeatWrapping,
  SRGBColorSpace,
  type Group,
  type Mesh,
  type MeshBasicMaterial,
  type MeshStandardMaterial,
  type PerspectiveCamera,
  type PointLight,
} from 'three';
import './AncestralHall3D.css';

export interface Hall3DAncestor {
  id: string;
  name: string;
  generation: number;
  lifespan?: string;
}

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
}

export const DEFAULT_EMPTY_HINT = 'Bàn thờ đang chờ dữ liệu tiền nhân';

/* ------------------------------------------------------------------ */
/* Kiểm tra WebGL                                                      */
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

/* ------------------------------------------------------------------ */
/* Hằng số bố cục                                                      */
/* ------------------------------------------------------------------ */

const PAGE_SIZE = 9;
const TABLET_SPACING = 0.7;
const MAX_INCENSE = 9;
const EMPTY_SLOT_COUNT = 5;
const EMPTY_SLOT_IDS = Array.from({ length: EMPTY_SLOT_COUNT }, (_, i) => i);

const BACK_TABLE = { z: -2.7, w: 6.6, h: 0.9, d: 0.9 } as const;
const FRONT_TABLE = { z: -1.55, w: 3.4, h: 0.68, d: 0.8 } as const;
const BACK_TOP = BACK_TABLE.h + 0.01;
const FRONT_TOP = FRONT_TABLE.h + 0.01;

const CAMERA_POSITION: [number, number, number] = [0, 2.1, 5.0];
const ORBIT_TARGET: [number, number, number] = [0, 1.4, -2];

const COLOR = {
  bg: '#120a07',
  gold: '#d9ad45',
  goldDark: '#8a6420',
  red: '#a3201a',
  redDark: '#7a1713',
  tabletBody: '#6b2218',
  tabletFace: '#ead9a6',
  wood: '#5b2e1b',
  woodTop: '#74391f',
  wall: '#8a5e3c',
  wallSide: '#7d5435',
  bronze: '#b8832f',
} as const;

// Vị trí các nén hương trong lư (tính sẵn, không tạo lại mỗi lần render).
const INCENSE_LAYOUT = Array.from({ length: MAX_INCENSE }, (_, i) => {
  const angle = ((i - 1) / (MAX_INCENSE - 1)) * Math.PI * 2;
  const radius = i === 0 ? 0 : 0.16;
  return {
    x: Math.cos(angle) * radius,
    z: Math.sin(angle) * radius,
    tiltX: Math.sin(i * 1.7) * 0.07,
    tiltZ: Math.cos(i * 2.3) * 0.07,
  };
});

const SMOKE_IDS = [0, 1, 2, 3, 4, 5];

const clampIndex = (index: number, length: number): number => {
  if (length <= 0) return 0;
  if (!Number.isFinite(index)) return 0;
  return Math.min(Math.max(Math.trunc(index), 0), length - 1);
};

const tabletX = (localIndex: number, count: number): number =>
  (localIndex - (count - 1) / 2) * TABLET_SPACING;

/* ------------------------------------------------------------------ */
/* Texture sàn gỗ dựng bằng code                                       */
/* ------------------------------------------------------------------ */

const createFloorTexture = (): CanvasTexture => {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const plankColors = ['#7d5532', '#725029', '#86593a', '#76512f'];
    const plankHeight = size / plankColors.length;
    plankColors.forEach((color, row) => {
      const y = row * plankHeight;
      ctx.fillStyle = color;
      ctx.fillRect(0, y, size, plankHeight);
      // vân gỗ
      for (let g = 0; g < 7; g += 1) {
        ctx.fillStyle = g % 2 === 0 ? 'rgba(255,230,190,0.06)' : 'rgba(40,20,5,0.10)';
        ctx.fillRect(0, y + ((g * 9 + row * 5) % plankHeight), size, 1);
      }
      // mối ghép
      ctx.fillStyle = 'rgba(25,12,4,0.55)';
      ctx.fillRect(0, y, size, 2);
      ctx.fillRect((row * 83 + 40) % size, y, 2, plankHeight);
    });
  }
  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(4, 4);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
};

/* ------------------------------------------------------------------ */
/* Các thành phần của phòng                                            */
/* ------------------------------------------------------------------ */

const Room: React.FC = () => {
  const floorTexture = useMemo(createFloorTexture, []);
  useEffect(() => () => floorTexture.dispose(), [floorTexture]);

  return (
    <group>
      {/* Sàn gỗ */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0.5]} receiveShadow>
        <planeGeometry args={[9, 10]} />
        <meshStandardMaterial map={floorTexture} roughness={0.8} />
      </mesh>

      {/* Tường hậu */}
      <mesh position={[0, 2.2, -3.45]} receiveShadow>
        <planeGeometry args={[9, 4.4]} />
        <meshStandardMaterial color={COLOR.wall} roughness={0.9} />
      </mesh>
      {/* Tường bên trái */}
      <mesh position={[-4.5, 2.2, 0.5]} rotation={[0, Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[10, 4.4]} />
        <meshStandardMaterial color={COLOR.wallSide} roughness={0.9} />
      </mesh>
      {/* Tường bên phải */}
      <mesh position={[4.5, 2.2, 0.5]} rotation={[0, -Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[10, 4.4]} />
        <meshStandardMaterial color={COLOR.wallSide} roughness={0.9} />
      </mesh>

      {/* Hoành phi */}
      <mesh position={[0, 3.3, -3.38]} castShadow>
        <boxGeometry args={[3.3, 0.66, 0.08]} />
        <meshStandardMaterial color={COLOR.gold} roughness={0.45} metalness={0.3} />
      </mesh>
      <mesh position={[0, 3.3, -3.33]}>
        <boxGeometry args={[3.08, 0.5, 0.06]} />
        <meshStandardMaterial color={COLOR.red} roughness={0.6} />
      </mesh>
      <mesh position={[0, 3.3, -3.295]}>
        <boxGeometry args={[1.5, 0.05, 0.02]} />
        <meshStandardMaterial color={COLOR.gold} roughness={0.45} metalness={0.3} emissive="#6b4a10" emissiveIntensity={0.4} />
      </mesh>

      {/* Hai cột đỏ */}
      {[-3.85, 3.85].map((x) => (
        <group key={x} position={[x, 0, -3.0]}>
          <mesh position={[0, 0.1, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[0.24, 0.27, 0.2, 20]} />
            <meshStandardMaterial color={COLOR.gold} roughness={0.5} metalness={0.3} />
          </mesh>
          <mesh position={[0, 2.1, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[0.16, 0.18, 3.9, 20]} />
            <meshStandardMaterial color={COLOR.red} roughness={0.55} />
          </mesh>
          <mesh position={[0, 4.1, 0]} castShadow>
            <cylinderGeometry args={[0.24, 0.2, 0.2, 20]} />
            <meshStandardMaterial color={COLOR.gold} roughness={0.5} metalness={0.3} />
          </mesh>
        </group>
      ))}
    </group>
  );
};

interface AltarTableProps {
  z: number;
  width: number;
  height: number;
  depth: number;
}

const AltarTable: React.FC<AltarTableProps> = ({ z, width, height, depth }) => (
  <group position={[0, 0, z]}>
    {/* Thân bàn */}
    <mesh position={[0, (height - 0.06) / 2, 0]} castShadow receiveShadow>
      <boxGeometry args={[width - 0.12, height - 0.06, depth - 0.12]} />
      <meshStandardMaterial color={COLOR.wood} roughness={0.75} />
    </mesh>
    {/* Viền vàng quanh mặt bàn */}
    <mesh position={[0, height - 0.04, 0]} castShadow receiveShadow>
      <boxGeometry args={[width, 0.08, depth]} />
      <meshStandardMaterial color={COLOR.gold} roughness={0.45} metalness={0.3} emissive="#6b4a10" emissiveIntensity={0.35} />
    </mesh>
    {/* Mặt bàn */}
    <mesh position={[0, height - 0.01, 0]} receiveShadow>
      <boxGeometry args={[width - 0.14, 0.04, depth - 0.14]} />
      <meshStandardMaterial color={COLOR.woodTop} roughness={0.7} />
    </mesh>
  </group>
);

interface TabletProps {
  x: number;
  globalIndex: number;
  selected: boolean;
  hovered: boolean;
  onSelect: (index: number) => void;
  onHover: (index: number | null) => void;
}

const Tablet: React.FC<TabletProps> = ({ x, globalIndex, selected, hovered, onSelect, onHover }) => {
  const liftRef = useRef<Group>(null);
  const bodyMatRef = useRef<MeshStandardMaterial>(null);
  const faceMatRef = useRef<MeshStandardMaterial>(null);

  useFrame((_, delta) => {
    const lift = liftRef.current;
    if (lift) lift.position.y = MathUtils.damp(lift.position.y, selected ? 0.12 : 0, 8, delta);
    const glow = selected ? 0.6 : hovered ? 0.28 : 0;
    const body = bodyMatRef.current;
    if (body) body.emissiveIntensity = MathUtils.damp(body.emissiveIntensity, glow, 8, delta);
    const face = faceMatRef.current;
    if (face) face.emissiveIntensity = MathUtils.damp(face.emissiveIntensity, glow * 0.9, 8, delta);
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
    <group position={[x, BACK_TOP, BACK_TABLE.z]} onClick={handleClick} onPointerOver={handleOver} onPointerOut={handleOut}>
      <group ref={liftRef}>
        {/* Đế gỗ */}
        <mesh position={[0, 0.05, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.44, 0.1, 0.28]} />
          <meshStandardMaterial color="#4a2614" roughness={0.8} />
        </mesh>
        {/* Thân bài vị */}
        <mesh position={[0, 0.52, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.36, 0.84, 0.09]} />
          <meshStandardMaterial ref={bodyMatRef} color={COLOR.tabletBody} roughness={0.6} emissive="#ff7a30" emissiveIntensity={0} />
        </mesh>
        {/* Mặt kem */}
        <mesh position={[0, 0.5, 0.047]}>
          <boxGeometry args={[0.28, 0.62, 0.012]} />
          <meshStandardMaterial ref={faceMatRef} color={COLOR.tabletFace} roughness={0.85} emissive="#ffd27a" emissiveIntensity={0} />
        </mesh>
        {/* Vạch đỏ giữa */}
        <mesh position={[0, 0.5, 0.055]}>
          <boxGeometry args={[0.035, 0.5, 0.006]} />
          <meshStandardMaterial color={COLOR.red} roughness={0.7} />
        </mesh>
        {/* Viền vàng phía trên */}
        <mesh position={[0, 0.97, 0]} castShadow>
          <boxGeometry args={[0.4, 0.07, 0.12]} />
          <meshStandardMaterial color={COLOR.gold} roughness={0.45} metalness={0.3} emissive="#6b4a10" emissiveIntensity={0.35} />
        </mesh>
      </group>
    </group>
  );
};

// Ô bài vị trống: cùng kích thước bài vị, bán trong suốt, không tương tác.
const EmptyTabletSlot: React.FC<{ x: number }> = ({ x }) => (
  <group position={[x, BACK_TOP, BACK_TABLE.z]}>
    <mesh position={[0, 0.05, 0]}>
      <boxGeometry args={[0.44, 0.1, 0.28]} />
      <meshStandardMaterial color="#4a2614" transparent opacity={0.25} depthWrite={false} />
    </mesh>
    <mesh position={[0, 0.52, 0]}>
      <boxGeometry args={[0.36, 0.84, 0.09]} />
      <meshStandardMaterial color={COLOR.tabletFace} transparent opacity={0.25} depthWrite={false} />
    </mesh>
    {/* Viền vàng mảnh quanh mặt trước */}
    {[0.1, 0.94].map((py) => (
      <mesh key={py} position={[0, py, 0.048]}>
        <boxGeometry args={[0.36, 0.012, 0.006]} />
        <meshBasicMaterial color={COLOR.gold} transparent opacity={0.7} />
      </mesh>
    ))}
    {[-0.18, 0.18].map((px) => (
      <mesh key={px} position={[px, 0.52, 0.048]}>
        <boxGeometry args={[0.012, 0.84, 0.006]} />
        <meshBasicMaterial color={COLOR.gold} transparent opacity={0.7} />
      </mesh>
    ))}
  </group>
);

interface CandleProps {
  x: number;
  phase: number;
}

const Candle: React.FC<CandleProps> = ({ x, phase }) => {
  const lightRef = useRef<PointLight>(null);
  const flameRef = useRef<Mesh>(null);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const flicker = 1 + Math.sin(t * 9 + phase) * 0.1 + Math.sin(t * 23 + phase * 2) * 0.07;
    if (lightRef.current) lightRef.current.intensity = 4.5 * flicker;
    if (flameRef.current) flameRef.current.scale.set(0.8, 1.7 * flicker, 0.8);
  });

  return (
    <group position={[x, FRONT_TOP, FRONT_TABLE.z + 0.05]}>
      <mesh position={[0, 0.03, 0]} castShadow>
        <cylinderGeometry args={[0.07, 0.08, 0.06, 14]} />
        <meshStandardMaterial color={COLOR.gold} roughness={0.45} metalness={0.3} />
      </mesh>
      <mesh position={[0, 0.22, 0]} castShadow>
        <cylinderGeometry args={[0.04, 0.045, 0.32, 14]} />
        <meshStandardMaterial color="#f1e2c4" roughness={0.8} />
      </mesh>
      <mesh ref={flameRef} position={[0, 0.42, 0]}>
        <sphereGeometry args={[0.035, 10, 10]} />
        <meshBasicMaterial color="#ffd77a" />
      </mesh>
      <pointLight ref={lightRef} position={[0, 0.5, 0.05]} color="#ffb45c" intensity={4.5} distance={6} decay={2} />
    </group>
  );
};

interface LanternProps {
  x: number;
}

const Lantern: React.FC<LanternProps> = ({ x }) => (
  <group position={[x, 0, -2.3]}>
    <mesh position={[0, 3.55, 0]}>
      <cylinderGeometry args={[0.008, 0.008, 1.0, 6]} />
      <meshStandardMaterial color="#2b1a10" />
    </mesh>
    <mesh position={[0, 3.0, 0]}>
      <cylinderGeometry args={[0.1, 0.12, 0.08, 14]} />
      <meshStandardMaterial color={COLOR.gold} roughness={0.45} metalness={0.3} />
    </mesh>
    <mesh position={[0, 2.72, 0]} scale={[1, 1.15, 1]}>
      <sphereGeometry args={[0.27, 18, 14]} />
      <meshStandardMaterial color="#d42a1c" emissive="#ff2a14" emissiveIntensity={0.9} roughness={0.5} />
    </mesh>
    <mesh position={[0, 2.4, 0]}>
      <cylinderGeometry args={[0.1, 0.08, 0.07, 14]} />
      <meshStandardMaterial color={COLOR.gold} roughness={0.45} metalness={0.3} />
    </mesh>
    <mesh position={[0, 2.25, 0]}>
      <cylinderGeometry args={[0.012, 0.012, 0.2, 6]} />
      <meshStandardMaterial color="#d42a1c" />
    </mesh>
    <pointLight position={[0, 2.7, 0.2]} color="#ff4a2a" intensity={2.2} distance={4.5} decay={2} />
  </group>
);

const Smoke: React.FC<{ active: boolean }> = ({ active }) => {
  const meshRefs = useRef<Array<Mesh | null>>([]);

  useFrame(({ clock }) => {
    if (!active) return;
    const t = clock.elapsedTime;
    for (let i = 0; i < SMOKE_IDS.length; i += 1) {
      const mesh = meshRefs.current[i];
      if (!mesh) continue;
      const p = (t * 0.2 + i / SMOKE_IDS.length) % 1;
      mesh.position.set(Math.sin(p * 5 + i * 1.7) * 0.07 * p, p * 1.15, Math.cos(p * 4 + i * 2.1) * 0.05 * p);
      mesh.scale.setScalar(0.04 + p * 0.15);
      (mesh.material as MeshBasicMaterial).opacity = (1 - p) * Math.min(1, p * 6) * 0.3;
    }
  });

  return (
    <group visible={active} position={[0, 0.74, 0]}>
      {SMOKE_IDS.map((id) => (
        <mesh
          key={id}
          ref={(el) => {
            meshRefs.current[id] = el;
          }}
        >
          <sphereGeometry args={[1, 10, 10]} />
          <meshBasicMaterial color="#e8e1d6" transparent opacity={0} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
};

const IncenseBurner: React.FC<{ count: number }> = ({ count }) => (
  <group position={[0, FRONT_TOP, FRONT_TABLE.z]}>
    {/* Chân lư */}
    <mesh position={[0, 0.03, 0]} castShadow>
      <cylinderGeometry args={[0.2, 0.24, 0.06, 20]} />
      <meshStandardMaterial color={COLOR.bronze} roughness={0.4} metalness={0.45} />
    </mesh>
    {/* Thân lư */}
    <mesh position={[0, 0.18, 0]} castShadow receiveShadow>
      <cylinderGeometry args={[0.31, 0.2, 0.24, 24]} />
      <meshStandardMaterial color={COLOR.bronze} roughness={0.4} metalness={0.45} emissive="#4a2f08" emissiveIntensity={0.3} />
    </mesh>
    {/* Miệng lư */}
    <mesh position={[0, 0.3, 0]} rotation={[Math.PI / 2, 0, 0]}>
      <torusGeometry args={[0.31, 0.02, 8, 28]} />
      <meshStandardMaterial color={COLOR.gold} roughness={0.4} metalness={0.4} />
    </mesh>
    {/* Tro hương */}
    <mesh position={[0, 0.29, 0]}>
      <cylinderGeometry args={[0.29, 0.29, 0.02, 24]} />
      <meshStandardMaterial color="#8a8074" roughness={1} />
    </mesh>
    {/* Nén hương */}
    {INCENSE_LAYOUT.slice(0, count).map((stick, i) => (
      <group key={i} position={[stick.x, 0.3, stick.z]} rotation={[stick.tiltX, 0, stick.tiltZ]}>
        <mesh position={[0, 0.22, 0]}>
          <cylinderGeometry args={[0.011, 0.011, 0.44, 6]} />
          <meshStandardMaterial color="#6b4220" roughness={0.9} />
        </mesh>
        <mesh position={[0, 0.45, 0]}>
          <sphereGeometry args={[0.026, 8, 8]} />
          <meshBasicMaterial color="#ff6a28" />
        </mesh>
      </group>
    ))}
    <Smoke active={count > 0} />
  </group>
);

/* ------------------------------------------------------------------ */
/* Camera thích ứng màn hình hẹp                                       */
/* ------------------------------------------------------------------ */

const BASE_FOV = 50;
const MAX_FOV = 85;
const MIN_HORIZONTAL_FOV_RAD = (60 * Math.PI) / 180;

// Màn hình dọc (điện thoại): tăng fov dọc để vẫn thấy đủ bề ngang bàn thờ. Màn hình rộng giữ fov 50.
const ResponsiveCamera: React.FC = () => {
  const camera = useThree((state) => state.camera) as PerspectiveCamera;
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
}

const HallScene: React.FC<HallSceneProps> = ({ ancestors, selectedIndex, onSelect, incenseCount, isBurning }) => {
  const [hovered, setHovered] = useState<number | null>(null);

  const safeSelected = clampIndex(selectedIndex, ancestors.length);
  const pageStart = Math.floor(safeSelected / PAGE_SIZE) * PAGE_SIZE;
  const pageItems = useMemo(() => ancestors.slice(pageStart, pageStart + PAGE_SIZE), [ancestors, pageStart]);
  const isEmpty = ancestors.length === 0;
  // Bàn thờ trống thì không có nén hương nào.
  const incenseSticks = isEmpty ? 0 : Math.min(Math.max(0, incenseCount) + (isBurning ? 1 : 0), MAX_INCENSE);

  // Con trỏ pointer khi rê chuột lên bài vị; trả về mặc định khi rời đi/unmount.
  useEffect(() => {
    document.body.style.cursor = hovered !== null ? 'pointer' : '';
    return () => {
      document.body.style.cursor = '';
    };
  }, [hovered]);

  // Chuyển trang thì bỏ trạng thái rê chuột cũ.
  useEffect(() => {
    setHovered(null);
  }, [pageStart]);

  const activeIndex = hovered !== null && hovered >= pageStart && hovered < pageStart + pageItems.length ? hovered : safeSelected;
  const activeAncestor = ancestors[activeIndex];

  return (
    <>
      <color attach="background" args={[COLOR.bg]} />
      <fog attach="fog" args={[COLOR.bg, 10, 24]} />

      <ambientLight intensity={0.8} color="#ffe9cc" />
      <hemisphereLight args={['#ffe8c2', '#3b2415', 0.9]} />
      <directionalLight
        position={[3, 6, 4]}
        intensity={1.6}
        color="#fff0d6"
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-near={1}
        shadow-camera-far={20}
        shadow-camera-left={-6}
        shadow-camera-right={6}
        shadow-camera-top={6}
        shadow-camera-bottom={-6}
        shadow-bias={-0.0005}
      />

      <ResponsiveCamera />
      <Room />
      <AltarTable z={BACK_TABLE.z} width={BACK_TABLE.w} height={BACK_TABLE.h} depth={BACK_TABLE.d} />
      <AltarTable z={FRONT_TABLE.z} width={FRONT_TABLE.w} height={FRONT_TABLE.h} depth={FRONT_TABLE.d} />

      {isEmpty &&
        EMPTY_SLOT_IDS.map((slot) => <EmptyTabletSlot key={slot} x={tabletX(slot, EMPTY_SLOT_COUNT)} />)}

      {pageItems.map((ancestor, localIndex) => {
        const globalIndex = pageStart + localIndex;
        return (
          <Tablet
            key={ancestor.id}
            x={tabletX(localIndex, pageItems.length)}
            globalIndex={globalIndex}
            selected={globalIndex === safeSelected}
            hovered={globalIndex === hovered}
            onSelect={onSelect}
            onHover={setHovered}
          />
        );
      })}

      {activeAncestor && activeIndex >= pageStart && activeIndex < pageStart + pageItems.length && (
        <Html
          position={[tabletX(activeIndex - pageStart, pageItems.length), BACK_TOP + 1.45, BACK_TABLE.z]}
          center
          distanceFactor={6.5}
          pointerEvents="none"
          style={{ pointerEvents: 'none' }}
        >
          <div className="hall3d-label">
            <strong>{activeAncestor.name}</strong>
            <span>Đời thứ {activeAncestor.generation}</span>
            {activeAncestor.lifespan && <small>{activeAncestor.lifespan}</small>}
          </div>
        </Html>
      )}

      <Candle x={-1.2} phase={0} />
      <Candle x={1.2} phase={1.9} />
      <Lantern x={-2.4} />
      <Lantern x={2.4} />
      <IncenseBurner count={incenseSticks} />

      <OrbitControls
        enablePan={false}
        minDistance={2.5}
        maxDistance={9}
        minPolarAngle={Math.PI / 4}
        maxPolarAngle={Math.PI / 2.05}
        minAzimuthAngle={-Math.PI / 3}
        maxAzimuthAngle={Math.PI / 3}
        target={ORBIT_TARGET}
      />
    </>
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
}) => {
  const webglOk = useMemo(() => isWebGLAvailable(), []);
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

  const safeSelected = clampIndex(selectedIndex, ancestors.length);
  const isEmpty = ancestors.length === 0;
  const totalPages = Math.max(1, Math.ceil(ancestors.length / PAGE_SIZE));
  const currentPage = Math.floor(safeSelected / PAGE_SIZE) + 1;

  return (
    <Hall3DErrorBoundary fallback={fallback} onError={onError}>
      <div className="hall3d-root">
        <div className="hall3d-wrap">
          <Canvas
            shadows
            dpr={[1, 1.5]}
            camera={{ position: CAMERA_POSITION, fov: BASE_FOV }}
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
            />
          </Canvas>
        </div>
        <p className="hall3d-hint">
          {isEmpty ? (
            emptyHint
          ) : (
            <>
              Kéo chuột để xoay · Cuộn để phóng to · Bấm bài vị để chọn
              {totalPages > 1 ? ` · Trang ${currentPage}/${totalPages}` : ''}
            </>
          )}
        </p>
      </div>
    </Hall3DErrorBoundary>
  );
};

export default AncestralHall3D;
