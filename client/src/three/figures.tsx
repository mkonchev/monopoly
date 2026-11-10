// 3D-фигурки игроков: low-poly из примитивов, основной цвет — цвет игрока.


interface P {
  figure: string | null;
  color: string;
}

// Примитивы как JSX-фабрики (R3F)
function Box({ p, s, c }: { p: [number, number, number]; s: [number, number, number]; c: string }) {
  return (
    <mesh position={p} castShadow>
      <boxGeometry args={s} />
      <meshStandardMaterial color={c} roughness={0.4} />
    </mesh>
  );
}
function Ball({ p, r, c, sx = 1, sy = 1, sz = 1 }: { p: [number, number, number]; r: number; c: string; sx?: number; sy?: number; sz?: number }) {
  return (
    <mesh position={p} scale={[sx, sy, sz]} castShadow>
      <sphereGeometry args={[r, 20, 16]} />
      <meshStandardMaterial color={c} roughness={0.4} />
    </mesh>
  );
}
function Cyl({ p, r, h, c, rot }: { p: [number, number, number]; r: number; h: number; c: string; rot?: [number, number, number] }) {
  return (
    <mesh position={p} rotation={rot} castShadow>
      <cylinderGeometry args={[r, r, h, 20]} />
      <meshStandardMaterial color={c} roughness={0.4} />
    </mesh>
  );
}
function Cone({ p, r, h, c, rot }: { p: [number, number, number]; r: number; h: number; c: string; rot?: [number, number, number] }) {
  return (
    <mesh position={p} rotation={rot} castShadow>
      <coneGeometry args={[r, h, 16]} />
      <meshStandardMaterial color={c} roughness={0.4} />
    </mesh>
  );
}

const DARK = '#26262b';
const WHITE = '#f2f0e8';

// Каждая фигурка стоит на цоколе-подставке своего цвета
export function FigureMesh({ figure, color }: P) {
  const id = figure ?? 'pawn';
  const body = color;
  return (
    <group>
      {/* цоколь-подставка игрока */}
      <Cyl p={[0, 0.05, 0]} r={0.26} h={0.1} c={body} />
      {id === 'car' && (
        <group>
          <Box p={[0, 0.16, 0]} s={[0.52, 0.12, 0.28]} c={body} />
          <Box p={[-0.04, 0.27, 0]} s={[0.24, 0.12, 0.24]} c={WHITE} />
          <Cyl p={[0.17, 0.09, 0.15]} r={0.07} h={0.06} c={DARK} rot={[0, 0, Math.PI / 2]} />
          <Cyl p={[0.17, 0.09, -0.15]} r={0.07} h={0.06} c={DARK} rot={[0, 0, Math.PI / 2]} />
          <Cyl p={[-0.17, 0.09, 0.15]} r={0.07} h={0.06} c={DARK} rot={[0, 0, Math.PI / 2]} />
          <Cyl p={[-0.17, 0.09, -0.15]} r={0.07} h={0.06} c={DARK} rot={[0, 0, Math.PI / 2]} />
        </group>
      )}
      {id === 'dog' && (
        <group>
          <Ball p={[0, 0.22, 0]} r={0.13} c={body} sx={1.4} sy={1} sz={1} />
          <Ball p={[0.2, 0.36, 0]} r={0.1} c={body} />
          <Ball p={[0.24, 0.46, 0.06]} r={0.04} c={DARK} />
          <Ball p={[0.24, 0.46, -0.06]} r={0.04} c={DARK} />
          <Cyl p={[-0.2, 0.32, 0]} r={0.02} h={0.16} c={body} rot={[0, 0, 0.8]} />
          <Cyl p={[0.06, 0.08, 0.08]} r={0.03} h={0.16} c={body} />
          <Cyl p={[0.06, 0.08, -0.08]} r={0.03} h={0.16} c={body} />
        </group>
      )}
      {id === 'cat' && (
        <group>
          <Ball p={[0, 0.22, 0]} r={0.13} c={body} sx={1.2} sy={1} sz={1} />
          <Ball p={[0.18, 0.38, 0]} r={0.1} c={body} />
          <Cone p={[0.16, 0.52, 0.06]} r={0.04} h={0.1} c={body} />
          <Cone p={[0.16, 0.52, -0.06]} r={0.04} h={0.1} c={body} />
          <Cyl p={[-0.22, 0.3, 0]} r={0.02} h={0.2} c={body} rot={[0, 0, -0.9]} />
          <Cyl p={[0.06, 0.08, 0.08]} r={0.03} h={0.14} c={body} />
          <Cyl p={[0.06, 0.08, -0.08]} r={0.03} h={0.14} c={body} />
        </group>
      )}
      {id === 'hamster' && (
        <group>
          <Ball p={[0, 0.18, 0]} r={0.16} c={body} />
          <Ball p={[0.12, 0.34, 0]} r={0.09} c={body} />
          <Ball p={[0.1, 0.44, 0.05]} r={0.035} c={body} />
          <Ball p={[0.1, 0.44, -0.05]} r={0.035} c={body} />
        </group>
      )}
      {id === 'elephant' && (
        <group>
          <Ball p={[0, 0.26, 0]} r={0.17} c={body} sx={1.15} />
          <Ball p={[0.18, 0.4, 0]} r={0.12} c={body} />
          <Cyl p={[0.3, 0.26, 0]} r={0.035} h={0.2} c={body} rot={[0, 0, -0.5]} />
          <Ball p={[0.14, 0.42, 0.11]} r={0.07} c={body} sx={0.3} sy={1} />
          <Ball p={[0.14, 0.42, -0.11]} r={0.07} c={body} sx={0.3} sy={1} />
          <Cyl p={[0, 0.08, 0.1]} r={0.04} h={0.16} c={body} />
          <Cyl p={[0, 0.08, -0.1]} r={0.04} h={0.16} c={body} />
        </group>
      )}
      {id === 'cap' && (
        <group>
          <Cyl p={[0, 0.2, 0]} r={0.17} h={0.12} c={body} />
          <Cyl p={[0.16, 0.14, 0]} r={0.13} h={0.03} c={body} rot={[0, 0, 0.35]} />
          <Ball p={[0, 0.26, 0]} r={0.05} c={WHITE} />
        </group>
      )}
      {id === 'rocket' && (
        <group>
          <Cyl p={[0, 0.24, 0]} r={0.09} h={0.3} c={WHITE} />
          <Cone p={[0, 0.47, 0]} r={0.09} h={0.16} c={body} />
          <Cone p={[0.12, 0.12, 0]} r={0.05} h={0.12} c={body} rot={[0, 0, -1.2]} />
          <Cone p={[-0.12, 0.12, 0]} r={0.05} h={0.12} c={body} rot={[0, 0, 1.2]} />
        </group>
      )}
      {id === 'beer' && (
        <group>
          <Cyl p={[0, 0.18, 0]} r={0.13} h={0.28} c={body} />
          <Cyl p={[0, 0.34, 0]} r={0.13} h={0.06} c={WHITE} />
          <Cyl p={[0.18, 0.2, 0]} r={0.05} h={0.03} c={body} rot={[Math.PI / 2, 0, 0]} />
        </group>
      )}
      {id === 'spider' && (
        <group>
          <Ball p={[0, 0.24, 0]} r={0.15} c={body} sy={0.8} />
          {[0, 1, 2, 3].map((k) => (
            <group key={k}>
              <Cyl p={[0.18, 0.16, (k - 1.5) * 0.09]} r={0.015} h={0.3} c={body} rot={[0, 0, (k - 1.5) * 0.35 - 1.2]} />
              <Cyl p={[-0.18, 0.16, (k - 1.5) * 0.09]} r={0.015} h={0.3} c={body} rot={[0, 0, (k - 1.5) * 0.35 + 1.2]} />
            </group>
          ))}
          <Ball p={[0, 0.32, 0.06]} r={0.03} c={WHITE} />
          <Ball p={[0, 0.32, -0.06]} r={0.03} c={WHITE} />
        </group>
      )}
      {id === 'devil' && (
        <group>
          <Ball p={[0, 0.3, 0]} r={0.15} c={body} />
          <Cone p={[0.09, 0.48, 0.05]} r={0.035} h={0.12} c={DARK} />
          <Cone p={[0.09, 0.48, -0.05]} r={0.035} h={0.12} c={DARK} />
          <Ball p={[0.13, 0.34, 0.06]} r={0.03} c={WHITE} />
          <Ball p={[0.13, 0.34, -0.06]} r={0.03} c={WHITE} />
        </group>
      )}
      {id === 'pawn' && (
        <group>
          <Ball p={[0, 0.26, 0]} r={0.13} c={body} />
          <Cyl p={[0, 0.1, 0]} r={0.09} h={0.2} c={body} />
        </group>
      )}
    </group>
  );
}
