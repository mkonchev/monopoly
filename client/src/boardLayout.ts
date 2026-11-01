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

export const CORNER_EMOJI: Record<number, string> = { 0: '🏁', 10: '🚔', 20: '🅿️', 30: '👮' };
