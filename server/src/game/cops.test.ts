import fs from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BoardConfig, GameAction } from '../../../shared/src/types';
import { GameError, type GameRoom, applyAction, createLobbyState, startGame } from './engine';

const realBoard = JSON.parse(
  fs.readFileSync(new URL('../../../shared/board.json', import.meta.url), 'utf-8'),
) as BoardConfig;

function neutralBoard(): BoardConfig {
  const tiles = [];
  for (let i = 0; i < 40; i++) {
    if (i === 0) tiles.push({ type: 'go', name: 'СТАРТ' });
    else if (i === 3)
      tiles.push({ type: 'street', name: 'Тестовая улица', group: 'brown', price: 60000, houseCost: 50000, rent: [4000, 20000, 60000, 180000, 320000, 450000] });
    else tiles.push({ type: 'free-parking', name: `Пусто ${i}` });
  }
  return { ...realBoard, tiles, chance: [], chest: [] };
}

const board = neutralBoard();

function makeRoom(n: number): GameRoom {
  const room: GameRoom = {
    code: 'TEST',
    board,
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
      money: board.rules.startMoney,
      position: 0,
      inJail: false,
      jailTurns: 0,
      jailCards: 0,
      bankrupt: false,
      isHost: i === 0,
      socketIds: new Set(['s']),
      loan: null,
      figure: null,
    });
  }
  startGame(room);
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

// Бросок: d1,d2; chanceDraw — результат Math.random для проверки шанса события
// (null = не рисуем); rest — значение для тасовки клеток при срабатывании.
function rollCops(room: GameRoom, i: number, d1: number, d2: number, chanceDraw: number | null, rest = 0.5): void {
  const r = (v: number) => (v - 1) / 6 + 0.08;
  const spy = vi.spyOn(Math, 'random');
  spy.mockReturnValueOnce(r(d1)).mockReturnValueOnce(r(d2));
  if (chanceDraw !== null) {
    spy.mockReturnValueOnce(chanceDraw);
    spy.mockImplementation(() => rest);
  }
  act(room, i, { type: 'roll' });
  vi.restoreAllMocks();
}

afterEach(() => vi.restoreAllMocks());

describe('событие «Сыковские менты»', () => {
  it('появляется с шансом: 6 разных клеток и 10 бросков', () => {
    const room = makeRoom(2);
    room.players[0].position = 0;
    rollCops(room, 0, 2, 3, 0.01); // 0.01 < 0.025 → событие
    expect(room.state.cops).not.toBeNull();
    expect(room.state.cops!.tiles).toHaveLength(6);
    expect(new Set(room.state.cops!.tiles).size).toBe(6);
    expect(room.state.cops!.rollsLeft).toBe(10);
    expect(room.players[0].position).toBe(5); // движение при этом произошло
  });

  it('не появляется, если шанс не выпал', () => {
    const room = makeRoom(2);
    rollCops(room, 0, 2, 3, 0.5);
    expect(room.state.cops).toBeNull();
  });

  it('попадание на мигалку — штраф 50 000', () => {
    const room = makeRoom(2);
    room.state.cops = { tiles: [24], rollsLeft: 10 };
    room.players[0].position = 19;
    rollCops(room, 0, 2, 3, 0.9); // 19 + 5 = 24 — мигалка; chanceDraw не используется (событие активно)
    expect(room.players[0].money).toBe(board.rules.startMoney - 50000);
    expect(room.state.phase).toBe('manage');
  });

  it('на соседней клетке без мигалки штрафа нет', () => {
    const room = makeRoom(2);
    room.state.cops = { tiles: [24], rollsLeft: 10 };
    room.players[0].position = 19;
    rollCops(room, 0, 1, 1, 0.9); // 19 + 2 = 21 — мимо
    expect(room.players[0].money).toBe(board.rules.startMoney);
  });

  it('штраф списывается после разрешения клетки (покупка)', () => {
    const room = makeRoom(2);
    room.state.cops = { tiles: [3], rollsLeft: 10 };
    room.players[0].position = 0;
    rollCops(room, 0, 1, 2, 0.9); // позиция 3 — Тестовая улица свободна
    expect(room.state.phase).toBe('buy');
    expect(room.players[0].money).toBe(board.rules.startMoney); // штраф ещё не списан
    act(room, 0, { type: 'decline' });
    expect(room.players[0].money).toBe(board.rules.startMoney - 50000);
    expect(room.state.phase).toBe('manage');
  });

  it('нехватка денег на штраф — долг с причиной cops, затем банкротство', () => {
    const room = makeRoom(3);
    room.state.cops = { tiles: [24], rollsLeft: 10 };
    const p = room.players[0];
    p.money = 10000;
    p.position = 19;
    rollCops(room, 0, 2, 3, 0.9);
    expect(room.state.phase).toBe('debt');
    expect(room.state.debt?.reason).toBe('cops');
    act(room, 0, { type: 'declareBankrupt' });
    expect(p.bankrupt).toBe(true);
  });

  it('событие живёт ровно 10 бросков всех игроков', () => {
    const room = makeRoom(2);
    room.state.cops = { tiles: [99], rollsLeft: 10 }; // клетка вне доски — без штрафов
    for (let k = 0; k < 10; k++) {
      const i = k % 2;
      room.players[i].position = 19;
      const r = (v: number) => (v - 1) / 6 + 0.08;
      vi.spyOn(Math, 'random').mockReturnValueOnce(r(1)).mockReturnValueOnce(r(2));
      act(room, i, { type: 'roll' });
      vi.restoreAllMocks();
      if (k < 9) expect(room.state.cops).not.toBeNull(); // после 9-го броска ещё живо
      act(room, i, { type: 'endTurn' });
    }
    expect(room.state.cops).toBeNull(); // после 10-го броска уехали
  });

  it('штраф за мигалку не платится дважды за одно посещение', () => {
    const room = makeRoom(2);
    room.state.cops = { tiles: [21], rollsLeft: 10 };
    room.players[0].position = 19;
    const r = (v: number) => (v - 1) / 6 + 0.08;
    vi.spyOn(Math, 'random').mockReturnValueOnce(r(1)).mockReturnValueOnce(r(1)); // дубль, сумма 2 → 21
    act(room, 0, { type: 'roll' });
    vi.restoreAllMocks();
    expect(room.players[0].money).toBe(board.rules.startMoney - 50000); // один штраф, а не два
    expect(room.state.phase).toBe('roll'); // дубль сохраняется
    // второй бросок на ту же клетку? нет — фишка ушла с 21... дубль даёт доп. бросок с позиции 21
    room.players[0].position = 19;
    rollCops(room, 0, 1, 1, 0.9); // снова 21 — новое посещение, новый штраф
    expect(room.players[0].money).toBe(board.rules.startMoney - 100000);
  });
});

describe('регрессия: ход после выплаты долга', () => {
  it('штраф ментов: залог + payDebt возобновляют ход (не зависает в debt)', () => {
    const room = makeRoom(2);
    room.state.cops = { tiles: [24], rollsLeft: 10 };
    const p = room.players[0];
    p.money = 10000;
    p.position = 19;
    const idx = tileIdx(room, 'Тестовая улица');
    room.state.properties[idx]!.owner = 'p0';
    rollCops(room, 0, 2, 3, 0.9); // 24 мигалка → долг 50000
    expect(room.state.phase).toBe('debt');
    act(room, 0, { type: 'mortgage', tile: idx }); // +30000
    p.money = 100000; // донесли до суммы штрафа
    act(room, 0, { type: 'payDebt' });
    expect(room.state.phase).toBe('manage');
    expect(room.state.debt).toBeNull();
    act(room, 0, { type: 'endTurn' }); // ход завершился — игра жива
    expect(room.state.turnPlayer).toBe('p1');
  });

  it('долг рентой: выплата возобновляет ход (дубль сохраняется)', () => {
    const room = makeRoom(2);
    const idx = tileIdx(room, 'Тестовая улица');
    room.state.properties[idx]!.owner = 'p1';
    room.state.properties[idx]!.houses = 5;
    const p = room.players[0];
    p.money = 100000;
    p.position = idx - 2;
    const r = (v: number) => (v - 1) / 6 + 0.08;
    vi.spyOn(Math, 'random').mockReturnValueOnce(r(1)).mockReturnValueOnce(r(1)); // дубль, сумма 2
    act(room, 0, { type: 'roll' });
    vi.restoreAllMocks();
    expect(room.state.phase).toBe('debt');
    expect(room.state.debt?.creditor).toBe('p1');
    p.money = 5000000;
    act(room, 0, { type: 'payDebt' });
    expect(room.state.phase).toBe('roll'); // дубль — доп. бросок
    expect(room.state.debt).toBeNull();
    rollCops(room, 0, 1, 2, 0.9);
    expect(room.state.phase).toBe('manage');
  });

  it('залог тюрьмы из долга: после выплаты происходит ход по броску', () => {
    const room = makeRoom(2);
    const p = room.players[0];
    p.position = 10;
    p.inJail = true;
    p.jailTurns = 2;
    p.money = 10000;
    rollCops(room, 0, 1, 2, 0.9); // третья неудача → залог → долг
    expect(room.state.phase).toBe('debt');
    expect(room.state.debt?.reason).toBe('jail-fine');
    p.money = 100000;
    act(room, 0, { type: 'payDebt' });
    expect(p.position).toBe(13); // ход по сумме броска произошёл
    expect(room.state.phase).toBe('manage');
  });
});
