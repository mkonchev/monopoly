export function gridPos(i: number): { row: number; col: number } {
  if (i <= 10) return { row: 11, col: 11 - i };
  if (i <= 20) return { row: 11 - (i - 10), col: 1 };
  if (i <= 30) return { row: 1, col: 1 + (i - 20) };
  return { row: 1 + (i - 30), col: 11 };
}

export type Side = 'corner' | 'bottom' | 'left' | 'top' | 'right';

export function sideOf(i: number): Side {
  if (i === 0 || i === 10 || i === 20 || i === 30) return 'corner';
  if (i < 10) return 'bottom';
  if (i < 20) return 'left';
  if (i < 30) return 'top';
  return 'right';
}

export const CORNER_EMOJI: Record<number, string> = { 0: '🏁', 10: '🚔', 20: '🎰', 30: '👮' };

// Центр клетки в процентах доски (сетка: углы 1.5fr, улицы 1fr; всего 12 единиц).
export function tileCenter(idx: number): { x: number; y: number } {
  const g = gridPos(idx);
  const unit = 100 / 12;
  const cx = g.col === 1 ? unit * 0.75 : g.col === 11 ? 100 - unit * 0.75 : unit * 1.5 + (g.col - 2 + 0.5) * unit;
  const cy = g.row === 1 ? unit * 0.75 : g.row === 11 ? 100 - unit * 0.75 : unit * 1.5 + (g.row - 2 + 0.5) * unit;
  return { x: cx, y: cy };
}
