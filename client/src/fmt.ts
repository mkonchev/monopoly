const compact = new Intl.NumberFormat('ru-RU', { notation: 'compact', maximumFractionDigits: 1 });
const full = new Intl.NumberFormat('ru-RU');

export function fmtMoney(v: number, currency: string): string {
  return `${full.format(v)} ${currency}`;
}

// Короткий формат для клеток доски: 60000 -> "60 тыс."
export function fmtCompact(v: number): string {
  return compact.format(v);
}
