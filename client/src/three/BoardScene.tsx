// 3D-сцена монополии: доска из board.json, фигурки, кубики, домики,
// машина гаишников, дрон. Сервер остаётся единственным источником событий.
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { RoomSnapshot } from '../../../shared/src/types';
import { BOARD_SIZE, tilePlacement } from './placement';
import { centerTexture, craterSideTexture, dieFaceTexture, speedFaceTexture, tileTopTexture } from './textures';
import { FigureMesh } from './figures';
import { AnimQueue } from './anim';

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const DARK = '#26262b';
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

// ---------- Кубики ----------

// ---------- Фигурки ----------

function Figures({ snap, anim, figureRefs }: { snap: RoomSnapshot; anim: AnimQueue; figureRefs: React.MutableRefObject<Map<string, THREE.Group>> }) {
  return (
    <>
      {snap.players.map((p) => (
        <group
          key={p.id}
          ref={(g) => {
            if (g) figureRefs.current.set(p.id, g);
            else figureRefs.current.delete(p.id);
          }}
        >
          <FigureMesh figure={p.figure} color={p.color} />
        </group>
      ))}
      <FigureAnimator anim={anim} figureRefs={figureRefs} snap={snap} />
    </>
  );
}

function FigureAnimator({ anim, figureRefs, snap }: { anim: AnimQueue; figureRefs: React.MutableRefObject<Map<string, THREE.Group>>; snap: RoomSnapshot }) {
  useFrame(() => {
    const now = performance.now();
    anim.pump(now, snap);
    for (const p of snap.players) {
      const g = figureRefs.current.get(p.id);
      if (!g) continue;
      if (p.bankrupt) {
        g.visible = false;
        continue;
      }
      g.visible = true;
      const f = anim.figures.get(p.id);
      if (!f) continue;
      let x = f.x;
      let z = f.z;
      let y = 0.3;
      let sy = 1;
      const hop = anim.hop;
      if (hop && hop.player === p.id) {
        const t = clamp01((now - hop.start) / hop.dur);
        x = lerp(hop.from.x, hop.to.x, t);
        z = lerp(hop.from.z, hop.to.z, t);
        y = 0.3 + Math.sin(Math.PI * t) * (hop.glide ? 1.1 : 0.5);
        if (t > 0.82) sy = 0.78 + 0.22 * ((t - 0.82) / 0.18);
      }
      g.position.set(x, y, z);
      g.scale.set(1, sy, 1);
      // idle-покачивание
      g.rotation.y = Math.sin(now * 0.0015 + x * 3) * 0.06;
    }
  });
  return null;
}

// ---------- Домики ----------

function Houses({ snap, anim }: { snap: RoomSnapshot; anim: AnimQueue }) {
  const items: { tile: number; houses: number; hotel: boolean }[] = [];
  snap.board.tiles.forEach((t, i) => {
    if (t.type !== 'street') return;
    const ps = snap.state.properties[i];
    if (!ps || !ps.owner || ps.houses === 0) return;
    items.push({ tile: i, houses: ps.houses, hotel: ps.houses >= 5 });
  });
  return (
    <>
      {items.map(({ tile, houses, hotel }) => (
        <HouseGroup key={tile} snap={snap} tile={tile} houses={houses} hotel={hotel} anim={anim} />
      ))}
    </>
  );
}

function HouseGroup({ snap, tile, houses, hotel, anim }: { snap: RoomSnapshot; tile: number; houses: number; hotel: boolean; anim: AnimQueue }) {
  const ref = useRef<THREE.Group>(null);
  const prev = useRef(houses);
  const p = tilePlacement(tile);
  // домики ставятся со стороны центра доски
  const dir = new THREE.Vector3(-p.x, 0, -p.z).normalize();
  useEffect(() => {
    if (houses > prev.current) {
      const g = ref.current;
      if (g) g.scale.setScalar(0.05);
    }
    prev.current = houses;
  }, [houses]);
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    const s = g.scale.x;
    if (s < 1) g.scale.setScalar(Math.min(1, s + 0.08));
  });
  const inner = 0.5;
  const bx = p.x + dir.x * inner;
  const bz = p.z + dir.z * inner;
  const perp = { x: -dir.z, z: dir.x };
  void anim;
  const cells = [];
  for (let k = 0; k < houses; k++) {
    const off = hotel ? 0 : (k - (houses - 1) / 2) * 0.2;
    cells.push(
      hotel ? (
        <mesh key={k} position={[bx + perp.x * off, 0.48, bz + perp.z * off]} castShadow>
          <boxGeometry args={[0.34, 0.22, 0.26]} />
          <meshStandardMaterial color="#c62828" roughness={0.4} />
        </mesh>
      ) : (
        <mesh key={k} position={[bx + perp.x * off, 0.42, bz + perp.z * off]} castShadow>
          <boxGeometry args={[0.16, 0.14, 0.16]} />
          <meshStandardMaterial color="#1a7a2e" roughness={0.4} />
        </mesh>
      ),
    );
  }
  return <group ref={ref}>{cells}</group>;
}

// ---------- Менты: машина и мигалки ----------

function Cops({ anim }: { anim: AnimQueue }) {
  const carRef = useRef<THREE.Group>(null);
  const markersRef = useRef<THREE.Group>(null);
  useFrame(() => {
    const now = performance.now();
    const c = anim.cops;
    const car = carRef.current;
    if (!car) return;
    if (c && now - c.start < 2400) {
      car.visible = true;
      const t = clamp01((now - c.start) / 2400);
      const x = t < 0.5 ? lerp(-7, 7, t * 2) : lerp(7, -7, (t - 0.5) * 2);
      car.position.set(x, 0.35, BOARD_SIZE / 2 + 0.8);
      car.rotation.y = t < 0.5 ? 0 : Math.PI;
    } else car.visible = false;
    const m = markersRef.current;
    if (m) {
      const show = !!(c && now - c.start >= 2300);
      m.visible = show;
      if (show) {
        m.children.forEach((child, k) => {
          const mat = (child as THREE.Mesh).material as THREE.MeshStandardMaterial;
          mat.emissiveIntensity = 0.6 + Math.sin(now * 0.012 + k * 1.7) * 0.4;
        });
      }
    }
  });
  const tiles = anim.cops?.tiles ?? [];
  return (
    <>
      <group ref={carRef} visible={false}>
        <Box3 p={[0, 0.18, 0]} s={[0.6, 0.16, 0.32]} c="#f2f0e8" />
        <Box3 p={[0, 0.34, 0]} s={[0.3, 0.14, 0.28]} c="#22344a" />
        <mesh position={[0, 0.47, 0]}>
          <boxGeometry args={[0.16, 0.07, 0.2]} />
          <meshStandardMaterial color="#ff1744" emissive="#ff1744" emissiveIntensity={2} />
        </mesh>
        <Cyl p={[0.18, 0.1, 0.17]} r={0.08} h={0.06} c={DARK} rot={[0, 0, Math.PI / 2]} />
        <Cyl p={[-0.18, 0.1, 0.17]} r={0.08} h={0.06} c={DARK} rot={[0, 0, Math.PI / 2]} />
      </group>
      <group ref={markersRef} visible={false}>
        {tiles.map((t, k) => {
          const p = tilePlacement(t);
          return (
            <mesh key={k} position={[p.x, 0.5, p.z]}>
              <sphereGeometry args={[0.14, 12, 10]} />
              <meshStandardMaterial color={k % 2 ? '#2979ff' : '#ff1744'} emissive={k % 2 ? '#2979ff' : '#ff1744'} emissiveIntensity={1.5} />
            </mesh>
          );
        })}
      </group>
    </>
  );
}

function Box3({ p, s, c }: { p: [number, number, number]; s: [number, number, number]; c: string }) {
  return (
    <mesh position={p} castShadow>
      <boxGeometry args={s} />
      <meshStandardMaterial color={c} roughness={0.4} />
    </mesh>
  );
}
function Cyl({ p, r, h, c, rot }: { p: [number, number, number]; r: number; h: number; c: string; rot?: [number, number, number] }) {
  return (
    <mesh position={p} rotation={rot} castShadow>
      <cylinderGeometry args={[r, r, h, 16]} />
      <meshStandardMaterial color={c} roughness={0.4} />
    </mesh>
  );
}

// ---------- Дрон ----------

function Drone({ anim }: { anim: AnimQueue }) {
  const ref = useRef<THREE.Group>(null);
  const rotorsRef = useRef<THREE.Group>(null);
  const boomRef = useRef<THREE.Mesh>(null);
  useFrame(() => {
    const now = performance.now();
    const d = anim.drone;
    const g = ref.current;
    const rot = rotorsRef.current;
    const boom = boomRef.current;
    if (!g || !d) {
      if (g) g.visible = false;
      return;
    }
    g.visible = true;
    const t = now - d.start;
    const target = tilePlacement(d.tile);
    if (t < 2200) {
      const k = clamp01(t / 2200);
      const ex = -BOARD_SIZE / 2 - 2;
      const ez = -BOARD_SIZE / 2 - 2;
      g.position.set(lerp(ex, target.x, k), lerp(5, 1.1, Math.sin(k * Math.PI * 0.6)), lerp(ez, target.z, k));
      g.rotation.y = lerp(-2.2, 0.6, k);
    } else {
      // парит над кратером
      g.position.set(target.x, 1.05 + Math.sin(now * 0.003) * 0.06, target.z);
      g.rotation.y = Math.sin(now * 0.001) * 0.3;
    }
    if (rot) rot.children.forEach((r, k) => (r.rotation.y = now * (0.02 + k * 0.005)));
    if (boom) {
      const bt = t - 2200;
      boom.visible = bt > 0 && bt < 700;
      if (boom.visible) boom.scale.setScalar(1 + bt * 0.004);
    }
  });
  return (
    <group ref={ref} visible={false}>
      <Box3 p={[0, 0, 0]} s={[0.34, 0.12, 0.34]} c="#22344a" />
      <group ref={rotorsRef}>
        {[[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]].map(([px, pz], k) => (
          <mesh key={k} position={[px, 0.09, pz]}>
            <cylinderGeometry args={[0.14, 0.14, 0.02, 16]} />
            <meshStandardMaterial color="#9fb3c8" transparent opacity={0.55} />
          </mesh>
        ))}
      </group>
      <mesh ref={boomRef} position={[0, 0, 0]} visible={false}>
        <sphereGeometry args={[0.55, 16, 12]} />
        <meshStandardMaterial color="#ffb300" emissive="#ff6d00" emissiveIntensity={2.5} transparent opacity={0.85} />
      </mesh>
    </group>
  );
}

// ---------- Подсветка активной клетки ----------

function LandingGlow({ snap, anim }: { snap: RoomSnapshot; anim: AnimQueue }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(() => {
    const m = ref.current;
    if (!m) return;
    const turn = snap.state.turnPlayer;
    if (!turn) {
      m.visible = false;
      return;
    }
    const f = anim.figures.get(turn);
    if (!f) {
      m.visible = false;
      return;
    }
    m.visible = true;
    m.position.set(f.x, 0.32, f.z);
    const mat = m.material as THREE.MeshBasicMaterial;
    mat.opacity = 0.35 + Math.sin(performance.now() * 0.005) * 0.2;
  });
  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
      <ringGeometry args={[0.34, 0.5, 28]} />
      <meshBasicMaterial color="#8ef58e" transparent opacity={0.4} side={THREE.DoubleSide} />
    </mesh>
  );
}

// ---------- Камера ----------

function CameraRig({ anim, snap, follow }: { anim: AnimQueue; snap: RoomSnapshot; follow: boolean }) {
  const controlsRef = useRef<any>(null);
  const { camera } = useThree();
  useEffect(() => {
    camera.position.set(0, 16.5, 12.5);
    camera.lookAt(0, 0, 0);
    if (controlsRef.current) controlsRef.current.update();
  }, [camera]);
  const tmp = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, dt) => {
    const controls = controlsRef.current;
    if (!controls) return;
    if (follow) {
      const turn = snap.state.turnPlayer;
      const f = turn ? anim.figures.get(turn) : null;
      if (f) {
        tmp.set(f.x, 0.3, f.z);
        controls.target.lerp(tmp, 1 - Math.pow(0.002, dt));
        camera.position.lerp(new THREE.Vector3(f.x + 2.2, 4.2, f.z + 3.4), 1 - Math.pow(0.01, dt));
        controls.update();
      }
    }
  });
  return <OrbitControls ref={controlsRef} makeDefault maxPolarAngle={Math.PI / 2.15} minDistance={3} maxDistance={30} enablePan />;
}

// ---------- Клетки ----------

function Tiles({ snap, onSelectTile, onPickTile, pickMode }: { snap: RoomSnapshot; onSelectTile?: (idx: number) => void; onPickTile?: (idx: number) => void; pickMode: boolean }) {
  const hoverRef = useRef<THREE.MeshStandardMaterial | null>(null);
  return (
    <>
      {snap.board.tiles.map((tile, idx) => {
        const p = tilePlacement(idx);
        const destroyed = snap.state.drone?.tile === idx;
        const topMap = destroyed ? craterSideTexture() : tileTopTexture(snap.board, idx, false);
        return (
          <mesh
            key={idx}
            position={[p.x, 0.15, p.z]}
            castShadow
            receiveShadow
            onClick={(e) => {
              e.stopPropagation();
              if (pickMode && onPickTile) onPickTile(idx);
              else if (!destroyed) onSelectTile?.(idx);
            }}
            onPointerOver={(e) => {
              e.stopPropagation();
              if (!destroyed) {
                hoverRef.current = (e.object as THREE.Mesh).material as THREE.MeshStandardMaterial;
                (e.object as THREE.Mesh).scale.setScalar(1.04);
              }
            }}
            onPointerOut={(e) => {
              (e.object as THREE.Mesh).scale.setScalar(1);
              hoverRef.current = null;
            }}
          >
            <boxGeometry args={[p.w, 0.3, p.d]} />
            <meshStandardMaterial attach="material-2" map={topMap} roughness={0.55} />
            <meshStandardMaterial attach="material-0" color="#d9d4c5" roughness={0.7} />
            <meshStandardMaterial attach="material-1" color="#c9c4b5" roughness={0.7} />
            <meshStandardMaterial attach="material-3" color="#8a8578" roughness={0.8} />
            <meshStandardMaterial attach="material-4" color={tile.type === 'street' ? snap.board.groups[tile.group]?.color ?? '#d9d4c5' : '#d9d4c5'} roughness={0.7} />
            <meshStandardMaterial attach="material-5" color="#b5b0a0" roughness={0.7} />
          </mesh>
        );
      })}
    </>
  );
}

// ---------- Сцена ----------

export default function BoardScene({
  snap,
  follow,
  onSelectTile,
  onPickTile,
  pickMode,
}: {
  snap: RoomSnapshot;
  follow: boolean;
  onSelectTile?: (idx: number) => void;
  onPickTile?: (idx: number) => void;
  pickMode: boolean;
}) {
  const anim = useMemo(() => new AnimQueue(), []);
  const figureRefs = useRef(new Map<string, THREE.Group>());
  const prevRef = useRef<RoomSnapshot | null>(null);
  const syncedRef = useRef(false);

  useEffect(() => {
    if (!syncedRef.current) {
      anim.syncInstant(snap);
      syncedRef.current = true;
      prevRef.current = snap;
      return;
    }
    anim.pushFromDiff(prevRef.current!, snap);
    prevRef.current = snap;
  }, [snap, anim]);

  return (
    <Canvas shadows camera={{ position: [0, 15.5, 14.5], fov: 45 }} dpr={[1, 2]}>
      <color attach="background" args={['#101418']} />
      <fog attach="fog" args={['#101418', 26, 46]} />
      <ambientLight intensity={0.55} />
      <directionalLight
        position={[7, 14, 5]}
        intensity={1.4}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-14}
        shadow-camera-right={14}
        shadow-camera-top={14}
        shadow-camera-bottom={-14}
      />
      <pointLight position={[-8, 6, -6]} intensity={40} color="#88aaff" />

      {/* стол */}
      <mesh position={[0, -0.35, 0]} receiveShadow>
        <boxGeometry args={[BOARD_SIZE + 5, 0.4, BOARD_SIZE + 5]} />
        <meshStandardMaterial color="#274a2f" roughness={0.85} />
      </mesh>
      <mesh position={[0, -0.08, 0]} receiveShadow>
        <boxGeometry args={[BOARD_SIZE + 1.2, 0.22, BOARD_SIZE + 1.2]} />
        <meshStandardMaterial color="#9a6b3f" roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.02, 0]} receiveShadow>
        <boxGeometry args={[BOARD_SIZE - 4.2, 0.06, BOARD_SIZE - 4.2]} />
        <meshStandardMaterial map={centerTexture()} roughness={0.8} />
      </mesh>

      <Tiles snap={snap} onSelectTile={onSelectTile} onPickTile={onPickTile} pickMode={pickMode} />
      <Houses snap={snap} anim={anim} />
      <Figures snap={snap} anim={anim} figureRefs={figureRefs} />
      <DicePair anim={anim} />
      {snap.state.speedDie && <SpeedDie3D anim={anim} />}
      <Cops anim={anim} />
      <Drone anim={anim} />
      <LandingGlow snap={snap} anim={anim} />

      <CameraRig anim={anim} snap={snap} follow={follow} />
    </Canvas>
  );
}

const SPEED_FACES: string[] = ['1', '2', '3', 'bus', 'm1', 'bus'];

function SpeedDie3D({ anim }: { anim: AnimQueue }) {
  const ref = useRef<THREE.Group>(null);
  const initialized = useRef(false);
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    const now = performance.now();
    const d = anim.dice;
    if (!d || !d.speed) {
      g.visible = false;
      return;
    }
    initialized.current = true;
    const t = now - d.start - 500;
    if (t < 0) {
      g.visible = false;
      return;
    }
    g.visible = true;
    const dur = 850;
    const faceIdx = Math.max(0, SPEED_FACES.indexOf(d.speed));
    if (t < dur) {
      const tt = t / 1000;
      g.position.set(1.45 + Math.sin(tt * 8) * 0.25, 0.8 + Math.abs(Math.sin(tt * 6)) * 0.7, Math.sin(tt * 4) * 0.15);
      g.rotation.set(tt * 11, tt * 13, tt * 4);
    } else {
      g.position.set(1.45, 0.25, 0);
      g.rotation.set(...TOP_ROT[(faceIdx % 6) + 1]);
    }
  });
  return (
    <group ref={ref} visible={false}>
      {SPEED_FACES.map((f, k) => {
        const cfg: Record<number, [number, number, number, number]> = {
          1: [0, 0.21, 0, -Math.PI / 2],
          2: [0.21, 0, 0, 0],
          3: [0, 0, 0.21, 0],
          4: [0, 0, -0.21, 0],
          5: [-0.21, 0, 0, 0],
          6: [0, -0.21, 0, Math.PI / 2],
        };
        const [px, py, pz, rx] = cfg[k + 1];
        return (
          <mesh key={k} position={[px, py, pz]} rotation={[rx, 0, 0]}>
            <planeGeometry args={[0.4, 0.4]} />
            <meshStandardMaterial map={speedFaceTexture(f)} roughness={0.35} />
          </mesh>
        );
      })}
      <mesh>
        <boxGeometry args={[0.42, 0.42, 0.42]} />
        <meshStandardMaterial color="#e6f4e6" transparent opacity={0.92} />
      </mesh>
    </group>
  );
}

const TOP_ROT: Record<number, [number, number, number]> = {
  1: [0, 0, 0],
  2: [0, 0, Math.PI / 2],
  3: [-Math.PI / 2, 0, 0],
  4: [Math.PI / 2, 0, 0],
  5: [0, 0, -Math.PI / 2],
  6: [Math.PI, 0, 0],
};

function DicePair({ anim }: { anim: AnimQueue }) {
  const g1 = useRef<THREE.Group>(null);
  const g2 = useRef<THREE.Group>(null);
  const initialized = useRef(false);
  useFrame(() => {
    const a = g1.current;
    const b = g2.current;
    if (!a || !b) return;
    const now = performance.now();
    const d = anim.dice ?? (anim.lastDice ? { start: -99999, v1: anim.lastDice.v1, v2: anim.lastDice.v2 } : null);
    if (!d) {
      a.visible = false;
      b.visible = false;
      return;
    }
    initialized.current = true;
    const place = (g: THREE.Group, delay: number, xOff: number, value: number) => {
      const t = now - d.start - delay;
      if (t < 0) {
        g.visible = false;
        return;
      }
      g.visible = true;
      const dur = 850;
      if (d.start < 0 || t < dur) {
        const tt = Math.max(0, t) / 1000;
        g.position.set(xOff + Math.sin(tt * 9) * 0.3, 0.85 + Math.abs(Math.sin(tt * 6.5)) * 0.85, Math.sin(tt * 5) * 0.2);
        g.rotation.set(tt * 13, tt * 10, tt * 5);
      } else {
        g.position.set(xOff, 0.3, 0);
        g.rotation.set(...TOP_ROT[value]);
      }
    };
    place(a, 0, -0.5, d.v1);
    place(b, 250, 0.5, d.v2);
  });
  return (
    <>
      <group ref={g1}>
        <DieFaces />
      </group>
      <group ref={g2}>
        <DieFaces />
      </group>
    </>
  );
}

function DieFaces() {
  return (
    <>
      {[1, 2, 3, 4, 5, 6].map((v) => {
        const cfg: Record<number, [number, number, number, number]> = {
          1: [0, 0.31, 0, -Math.PI / 2],
          2: [0.31, 0, 0, 0],
          3: [0, 0, 0.31, 0],
          4: [0, 0, -0.31, 0],
          5: [-0.31, 0, 0, 0],
          6: [0, -0.31, 0, Math.PI / 2],
        };
        const [px, py, pz, rx] = cfg[v];
        return (
          <mesh key={v} position={[px, py, pz]} rotation={[rx, 0, 0]}>
            <planeGeometry args={[0.58, 0.58]} />
            <meshStandardMaterial map={dieFaceTexture(String(v))} roughness={0.35} />
          </mesh>
        );
      })}
      <mesh>
        <boxGeometry args={[0.6, 0.6, 0.6]} />
        <meshStandardMaterial color="#e8e4d8" transparent opacity={0.92} />
      </mesh>
    </>
  );
}
