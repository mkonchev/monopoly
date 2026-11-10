// Раскладка 3D-доски: индекс клетки → координаты и размеры (единицы, 12×12).
// Строится программно из индекса по классической раскладке — ничего не хардкодится по клеткам.
import { gridPos } from '../boardLayout';

export const BOARD_SIZE = 12;
const CORNER = 1.5;

export interface TilePlacement {
  x: number; // центр по X
  z: number; // центр по Z
  w: number; // размер вдоль края
  d: number; // глубина к центру
  side: 'bottom' | 'left' | 'top' | 'right' | 'corner';
}

function axisCenter(track: number): number {
  // track 1..11 (как в gridPos); координатный центр трека
  if (track === 1) return -BOARD_SIZE / 2 + CORNER / 2;
  if (track === 11) return BOARD_SIZE / 2 - CORNER / 2;
  return -BOARD_SIZE / 2 + CORNER + (track - 2) + 0.5;
}

export function tilePlacement(idx: number): TilePlacement {
  const edge = 1;
  const g = gridPos(idx);
  const side: TilePlacement['side'] =
    g.row === 11 ? 'bottom' : g.col === 1 ? 'left' : g.row === 1 ? 'top' : g.col === 11 ? 'right' : 'corner';
  const x = axisCenter(g.col);
  const z = axisCenter(g.row);
  const cornerTile = side === 'corner';
  // низ/верх: ширина 1 вдоль края, глубина 1.5; лево/право: наоборот
  const w = cornerTile ? CORNER : side === 'left' || side === 'right' ? CORNER : edge;
  const d = cornerTile ? CORNER : side === 'left' || side === 'right' ? edge : CORNER;
  return { x, z, w, d, side };
}

// Смещения нескольких фигурок на одной клетке (мини-сетка)
export function figureOffset(index: number, count: number): { dx: number; dz: number } {
  if (count <= 1) return { dx: 0, dz: 0 };
  if (count === 2) return { dx: index === 0 ? -0.22 : 0.22, dz: 0 };
  if (count === 3) {
    const t = [[0, -0.22], [-0.24, 0.18], [0.24, 0.18]][index];
    return { dx: t[0], dz: t[1] };
  }
  const t = [[-0.22, -0.22], [0.22, -0.22], [-0.22, 0.22], [0.22, 0.22]][index % 4];
  return { dx: t[0], dz: t[1] };
}
