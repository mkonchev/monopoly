import fs from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BoardConfig, GameAction, Tile } from '../../../shared/src/types';
import { GameError, type GameRoom, applyAction, createLobbyState, startGame } from './engine';

const realBoard = JSON.parse(
  fs.readFileSync(new URL('../../../shared/board.json', import.meta.url), 'utf-8'),
) as BoardConfig;

// Грани скоростного кубика: ['1','2','3','bus','m1','bus'] — индексы 0..4.
function neutralBoard(withUtility = false): BoardConfig {
  const tiles: Tile[] = [];
  for (let i = 0; i < 40; i++) {
    if (i === 0) tiles.push({ type: 'go', name: 'СТАРТ' });
    else if (i === 3)
      tiles.push({ type: 'street', name: 'Тестовая улица', group: 'brown', price: 60000, houseCost: 50000, rent: [4000, 20000, 60000, 180000, 320000, 450000] });
    else if (i === 39)
      tiles.push({ type: 'street', name: 'Тестовая площадь', group: 'blue', price: 400000, houseCost: 200000, rent: [50000, 200000, 600000, 1400000, 1700000, 2000000] });
    else if (i === 9 && withUtility)
      tiles.push({ type: 'utility', name: 'Тестовое предприятие', price: 150000, rentMultiplier: [4, 10] });
    else tiles.push({ type: 'free-parking', name: `Пусто ${i}` });
  }
  return { ...realBoard, tiles, chance: [], chest: [] };
}

const board = neutralBoard();

function makeRoom(n: number, b: BoardConfig = board): GameRoom {
  const room: GameRoom = {
    code: 'TEST',
    board: b,
    state: createLobbyState(),
    players: [],
    decks: null,
    discards: null,
    rentOverride: null,
    createdAt: 0,
    lastActivity: 0,
  };
  for (let i = 0; i < n; i++) {
    room.players.push({
      id: `p${i}`,
      name: `Игрок${i + 1}`,
      color: '#000',
      token: `tok${i}`,
      money: b.rules.startMoney,
      position: 0,
      inJail: false,
      jailTurns: 0,
      jailCards: 0,
      bankrupt: false,
      isHost: i === 0,
      socketIds: new Set(['s']),
      figure: null,
      loan: null,
    });
  }
  startGame(room);
  room.state.speedDie = true;
  return room;
}

function act(room: GameRoom, i: number, action: GameAction): void {
  applyAction(room, room.players[i], action);
}

function tileIdx(room: GameRoom, name: string): number {
  const idx = room.board.tiles.findIndex((t) => t.name === name);
  if (idx < 0) throw new Error(`нет поля «${name}»`);
  return idx;
}

// Бросок с зафиксированными кубиками и гранью скоростного кубика.
function rollSpeed(room: GameRoom, i: number, d1: number, d2: number, faceIdx: number | null): void {
  const r = (v: number) => (v - 1) / 6 + 0.08;
  const rf = (idx: number) => (idx + 0.5) / 6;
  const spy = vi.spyOn(Math, 'random');
  spy.mockReturnValueOnce(r(d1)).mockReturnValueOnce(r(d2));
  if (faceIdx !== null) spy.mockReturnValueOnce(rf(faceIdx));
  act(room, i, { type: 'roll' });
  vi.restoreAllMocks();
}

afterEach(() => vi.restoreAllMocks());

describe('числовые грани скоростного кубика', () => {
  it('очки прибавляются к сумме обычных кубиков', () => {
    const room = makeRoom(2);
    rollSpeed(room, 0, 1, 2, 0); // 1 + 2 + «1» = 4
    expect(room.players[0].position).toBe(4);
    expect(room.state.phase).toBe('manage');
  });

  it('дубль на обычных кубиках с числовой гранью даёт доп. бросок', () => {
    const room = makeRoom(2);
    rollSpeed(room, 0, 3, 3, 1); // 3 + 3 + «2» = 8, дубль
    expect(room.players[0].position).toBe(8);
    expect(room.state.pendingExtraRoll).toBe(true);
    expect(room.state.phase).toBe('roll');
  });

  it('рента предприятия считается по всем трём кубикам', () => {
    const room = makeRoom(2, neutralBoard(true));
    const utilIdx = tileIdx(room, 'Тестовое предприятие');
    room.state.properties[utilIdx]!.owner = 'p1';
    room.players[0].position = 0;
    rollSpeed(room, 0, 3, 5, 0); // 3 + 5 + «1» = 9 → предприятие; (3+5+1) × 4 = 36
    expect(room.players[0].position).toBe(utilIdx);
    expect(room.players[0].money).toBe(board.rules.startMoney - 36);
  });
});

describe('автобус', () => {
  it('фаза выбора: сумма даёт дубль и доп. бросок', () => {
    const room = makeRoom(2);
    rollSpeed(room, 0, 2, 2, 3); // автобус при дубле на обычных
    expect(room.state.phase).toBe('bus');
    act(room, 0, { type: 'busMove', choice: 'sum' });
    expect(room.players[0].position).toBe(4);
    expect(room.state.pendingExtraRoll).toBe(true);
    expect(room.state.phase).toBe('roll');
  });

  it('один кубик — без доп. броска', () => {
    const room = makeRoom(2);
    rollSpeed(room, 0, 2, 2, 3);
    act(room, 0, { type: 'busMove', choice: 'd1' });
    expect(room.players[0].position).toBe(2);
    expect(room.state.phase).toBe('manage');
  });

  it('можно выбрать и второй кубик', () => {
    const room = makeRoom(2);
    rollSpeed(room, 0, 5, 1, 3);
    act(room, 0, { type: 'busMove', choice: 'd2' });
    expect(room.players[0].position).toBe(1);
  });
});

describe('триплет', () => {
  it('все три кубика равны — выбор любой клетки и новый бросок', () => {
    const room = makeRoom(2);
    rollSpeed(room, 0, 2, 2, 1); // 2 + 2 + «2»
    expect(room.state.phase).toBe('triplet');
    expect(room.players[0].position).toBe(0); // ещё не двигался
    act(room, 0, { type: 'tripletMove', tile: 30 });
    expect(room.players[0].position).toBe(30);
    expect(room.state.phase).toBe('roll'); // бросает заново
    expect(room.state.doublesCount).toBe(0); // триплет — не дубль
  });

  it('телепорт в тюрьму завершает ход без нового броска', () => {
    const room = makeRoom(2);
    // заменим клетку 30 на go-to-jail
    room.board.tiles[30] = { type: 'go-to-jail', name: 'Иди в тюрьму' };
    rollSpeed(room, 0, 2, 2, 1);
    act(room, 0, { type: 'tripletMove', tile: 30 });
    expect(room.players[0].inJail).toBe(true);
    expect(room.players[0].position).toBe(10);
    expect(room.state.phase).toBe('manage');
  });

  it('триплет не двигал фишку — неверный выбор клетки отклоняется', () => {
    const room = makeRoom(2);
    rollSpeed(room, 0, 2, 2, 1);
    expect(() => act(room, 0, { type: 'tripletMove', tile: 40 })).toThrow(GameError);
    expect(() => act(room, 1, { type: 'tripletMove', tile: 5 })).toThrow(GameError); // не его ход
  });
});

describe('Мистер Монополия', () => {
  it('после обычного хода ведёт к ближайшей свободной собственности', () => {
    const room = makeRoom(2);
    room.state.properties[tileIdx(room, 'Тестовая улица')]!.owner = 'p1';
    room.players[0].position = 0;
    rollSpeed(room, 0, 1, 2, 4); // обычный ход 3 → чужая улица (рента 8000), затем M1 → площадь 39 (вперёд, без круга)
    const p = room.players[0];
    expect(p.position).toBe(39);
    expect(p.money).toBe(board.rules.startMoney - 8000);
    expect(room.state.phase).toBe('buy'); // предложение купить площадь
    act(room, 0, { type: 'decline' });
    expect(room.state.phase).toBe('manage'); // дублей не было
  });

  it('если свободных нет — платит ренту ближайшему чужому полю', () => {
    const room = makeRoom(2);
    room.state.properties[tileIdx(room, 'Тестовая улица')]!.owner = 'p1';
    room.state.properties[tileIdx(room, 'Тестовая площадь')]!.owner = 'p1';
    room.players[0].position = 0;
    rollSpeed(room, 0, 1, 1, 4); // обычный ход 2 (дубль) → пусто, затем M1 → улица 3 (рента 8000)
    const p = room.players[0];
    expect(p.position).toBe(3);
    expect(p.money).toBe(board.rules.startMoney - 8000);
    expect(room.state.phase).toBe('roll'); // дубль на обычных кубиках — доп. бросок
  });

  it('если обычный бросок даёт покупку — M1 откладывается до решения', () => {
    const room = makeRoom(2);
    room.players[0].position = 0;
    rollSpeed(room, 0, 1, 2, 4); // ход 3 → свободная Тестовая улица → buy; M1 ждёт
    expect(room.state.phase).toBe('buy');
    expect(room.players[0].position).toBe(3);
    act(room, 0, { type: 'buy' });
    // купил улицу, теперь M1 ведёт к ближайшей свободной — площадь 39
    expect(room.players[0].position).toBe(39);
    expect(room.state.phase).toBe('buy');
  });
});

describe('нюансы режима', () => {
  it('в тюрьме скоростной кубик не бросается, неудача оставляет в тюрьме', () => {
    const room = makeRoom(2);
    const p = room.players[0];
    p.position = 10;
    p.inJail = true;
    rollSpeed(room, 0, 1, 2, 0); // третий random не должен использоваться
    expect(p.position).toBe(10); // не двигается
    expect(p.inJail).toBe(true);
    expect(p.jailTurns).toBe(1);
    expect(room.state.speedFace).toBeNull();
    expect(room.state.phase).toBe('manage');
  });

  it('хост переключает режим до начала игры', () => {
    const room = makeRoom(2);
    room.state.phase = 'lobby';
    expect(() => act(room, 1, { type: 'setSpeedDie', enabled: true })).toThrow(GameError); // не хост
    act(room, 0, { type: 'setSpeedDie', enabled: true });
    expect(room.state.speedDie).toBe(true);
    startGame(room);
    expect(room.state.speedDie).toBe(true); // режим сохраняется на новую игру
  });

  it('без режима скорость не бросается', () => {
    const room = makeRoom(2);
    room.state.speedDie = false;
    rollSpeed(room, 0, 1, 2, 0);
    expect(room.players[0].position).toBe(3); // без «+1»
    expect(room.state.speedFace).toBeNull();
  });
});
