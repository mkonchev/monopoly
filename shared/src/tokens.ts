// Фигурки игроков (как фишки в настольной монополии).
export interface FigureDef {
  id: string;
  name: string;
  emoji: string;
}

export const FIGURES: FigureDef[] = [
  { id: 'car', name: 'Машинка', emoji: '🚗' },
  { id: 'dog', name: 'Собака', emoji: '🐕' },
  { id: 'cat', name: 'Кот', emoji: '🐈' },
  { id: 'hamster', name: 'Джунгарик', emoji: '🐹' },
  { id: 'elephant', name: 'Слон', emoji: '🐘' },
  { id: 'cap', name: 'Кепка', emoji: '🧢' },
];

export function figureById(id: string | null | undefined): FigureDef | null {
  return FIGURES.find((f) => f.id === id) ?? null;
}

export function figureEmoji(id: string | null | undefined): string {
  return figureById(id)?.emoji ?? '🎲';
}
