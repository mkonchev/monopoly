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

// Бросок с полным контролем случайных чисел ПОСЛЕ кубиков:
// [0] — проверка шанса ментов, [1] — проверка шанса дрона, rest — тасовка/выбор клетки.
function rollDraws(room: GameRoom, i: number, d1: number, d2: number, draws: number[], rest = 0.5): void {
  const r = (v: number) => (v - 1) / 6 + 0.08;
  const spy = vi.spyOn(Math, 'random');
  spy.mockReturnValueOnce(r(d1)).mockReturnValueOnce(r(d2));
  for (const d of draws) spy.mockReturnValueOnce(d);
  spy.mockImplementation(() => rest);
  act(room, i, { type: 'roll' });
  vi.restoreAllMocks();
}

afterEach(() => vi.restoreAllMocks());

describe('дрон', () => {
  it('срабатывает по шансу и уничтожает не-угловое поле', () => {
    const room = makeRoom(2);
    rollDraws(room, 0, 2, 3, [0.9, 0.01]); // ментов нет, дрон летит
    expect(room.state.drone).not.toBeNull();
    const { tile, seq } = room.state.drone!;
    expect(seq).toBe(1);
    expect(tile).not.toBe(0);
    expect(tile).not.toBe(10);
    expect(tile).not.toBe(20);
    expect(tile).not.toBe(30);
    expect(room.state.properties[tile]!.owner).toBeNull();
  });

  it('не срабатывает, если шанс не выпал', () => {
    const room = makeRoom(2);
    rollDraws(room, 0, 2, 3, [0.9, 0.5]);
    expect(room.state.drone).toBeNull();
  });

  it('второй раз за игру не срабатывает', () => {
    const room = makeRoom(2);
    room.state.drone = { tile: 5, seq: 1 };
    rollDraws(room, 0, 2, 3, [0.9, 0.0001]); // шанс выпал, но дрон уже прилетал
    expect(room.state.drone).toEqual({ tile: 5, seq: 1 });
  });

  it('владелец теряет уничтоженную улицу вместе с домами', () => {
    const room = makeRoom(2);
    const idx = room.board.tiles.findIndex((t) => t.name === 'Тестовая улица');
    room.state.properties[idx]!.owner = 'p0';
    room.state.properties[idx]!.houses = 3;
    // candidates[2] — Тестовая улица; rest 0.07: floor(0.07 * 36) = 2
    rollDraws(room, 0, 2, 3, [0.9, 0.01], 0.07);
    expect(room.state.drone!.tile).toBe(idx);
    expect(room.state.properties[idx]!.owner).toBeNull();
    expect(room.state.properties[idx]!.houses).toBe(0);
  });

  it('приезд на разрушенное поле: нет эффектов и нет штрафа ментов', () => {
    const room = makeRoom(2);
    const idx = room.board.tiles.findIndex((t) => t.name === 'Тестовая улица');
    room.state.properties[idx]!.owner = 'p1';
    room.state.cops = { tiles: [idx], rollsLeft: 10 };
    room.state.drone = { tile: idx, seq: 1 };
    room.players[0].position = idx - 3;
    rollDraws(room, 0, 1, 2, [0.9]); // сумма 3 → разрушенное поле
    expect(room.players[0].position).toBe(idx);
    expect(room.players[0].money).toBe(board.rules.startMoney); // ни ренты (поле мертво), ни штрафа ментов
    expect(room.state.phase).toBe('manage');
  });

  it('мигалки не ставятся на разрушенное поле', () => {
    const room = makeRoom(2);
    room.state.drone = { tile: 7, seq: 1 };
    rollDraws(room, 0, 2, 3, [0.001]); // менты срабатывают
    expect(room.state.cops).not.toBeNull();
    expect(room.state.cops!.tiles).not.toContain(7);
  });

  it('казино на разрушенном поле не открывается', () => {
    const room = makeRoom(2);
    room.board.tiles[20] = { type: 'casino', name: 'Казино' };
    room.state.drone = { tile: 20, seq: 1 }; // форс: углы не выбираются, ставим вручную
    room.players[0].position = 17;
    rollDraws(room, 0, 1, 2, [0.9]); // сумма 3 → казино
    expect(room.players[0].position).toBe(20);
    expect(room.state.phase).toBe('manage'); // не 'casino'
  });
});
