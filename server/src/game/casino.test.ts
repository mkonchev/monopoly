import fs from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BoardConfig, GameAction } from '../../../shared/src/types';
import { GameError, type GameRoom, applyAction, createLobbyState, startGame } from './engine';

const realBoard = JSON.parse(
  fs.readFileSync(new URL('../../../shared/board.json', import.meta.url), 'utf-8'),
) as BoardConfig;

function casinoBoard(): BoardConfig {
  const tiles = [];
  for (let i = 0; i < 40; i++) {
    if (i === 0) tiles.push({ type: 'go', name: 'СТАРТ' });
    else if (i === 20) tiles.push({ type: 'casino', name: 'Казино' });
    else tiles.push({ type: 'free-parking', name: `Пусто ${i}` });
  }
  return { ...realBoard, tiles, chance: [], chest: [] };
}

const board = casinoBoard();

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

function rollTo(room: GameRoom, i: number, d1: number, d2: number): void {
  const r = (v: number) => (v - 1) / 6 + 0.08;
  const spy = vi.spyOn(Math, 'random');
  spy.mockReturnValueOnce(r(d1)).mockReturnValueOnce(r(d2));
  spy.mockImplementation(() => 0.9); // тик ментов: без события
  act(room, i, { type: 'roll' });
  vi.restoreAllMocks();
}

// полный ход без последствий (позиция сбрасывается вызывающим)
function turnOf(room: GameRoom, i: number): void {
  const p = room.players[i];
  if (p.bankrupt) return;
  p.position = 30;
  const r = (v: number) => (v - 1) / 6 + 0.08;
  const spy = vi.spyOn(Math, 'random');
  spy.mockReturnValueOnce(r(1)).mockReturnValueOnce(r(1));
  act(room, i, { type: 'roll' });
  if (room.state.phase !== 'roll') {
    act(room, i, { type: 'endTurn' });
    vi.restoreAllMocks();
    return;
  }
  spy.mockReturnValueOnce(r(1)).mockReturnValueOnce(r(2));
  act(room, i, { type: 'roll' });
  act(room, i, { type: 'endTurn' });
  vi.restoreAllMocks();
}

afterEach(() => vi.restoreAllMocks());

describe('казино', () => {
  it('посадка на казино открывает фазу ставки', () => {
    const room = makeRoom(2);
    room.players[0].position = 17;
    rollTo(room, 0, 1, 2); // 17 + 3 = 20 Казино
    expect(room.players[0].position).toBe(20);
    expect(room.state.phase).toBe('casino');
  });

  it('ставка на одно число: угадал — забирает весь банк', () => {
    const room = makeRoom(2);
    room.state.casinoPot = 150000;
    room.players[0].position = 17;
    rollTo(room, 0, 1, 2);
    const r = (v: number) => (v - 1) / 6 + 0.08;
    vi.spyOn(Math, 'random').mockReturnValueOnce(r(6)); // выпадет 6
    act(room, 0, { type: 'casinoBet', numbers: [6] });
    expect(room.players[0].money).toBe(board.rules.startMoney + 150000);
    expect(room.state.casinoPot).toBe(0);
    expect(room.state.phase).toBe('manage');
    expect(room.state.lastCasinoRoll?.roll).toBe(6);
    expect(room.state.lastCasinoRoll?.payout).toBe(150000);
  });

  it('два числа: угадал одно из них — половина банка', () => {
    const room = makeRoom(2);
    room.state.casinoPot = 150000;
    room.players[0].position = 17;
    rollTo(room, 0, 1, 2);
    const r = (v: number) => (v - 1) / 6 + 0.08;
    vi.spyOn(Math, 'random').mockReturnValueOnce(r(3));
    act(room, 0, { type: 'casinoBet', numbers: [3, 5] });
    expect(room.players[0].money).toBe(board.rules.startMoney + 75000);
    expect(room.state.casinoPot).toBe(75000);
  });

  it('шесть чисел: гарантированная шестая часть банка', () => {
    const room = makeRoom(2);
    room.state.casinoPot = 150000;
    room.players[0].position = 17;
    rollTo(room, 0, 1, 2);
    const r = (v: number) => (v - 1) / 6 + 0.08;
    vi.spyOn(Math, 'random').mockReturnValueOnce(r(2));
    act(room, 0, { type: 'casinoBet', numbers: [1, 2, 3, 4, 5, 6] });
    expect(room.players[0].money).toBe(board.rules.startMoney + 25000);
    expect(room.state.casinoPot).toBe(125000);
  });

  it('мимо — банк и деньги не меняются', () => {
    const room = makeRoom(2);
    room.state.casinoPot = 150000;
    room.players[0].position = 17;
    rollTo(room, 0, 1, 2);
    const r = (v: number) => (v - 1) / 6 + 0.08;
    vi.spyOn(Math, 'random').mockReturnValueOnce(r(1));
    act(room, 0, { type: 'casinoBet', numbers: [6] });
    expect(room.players[0].money).toBe(board.rules.startMoney);
    expect(room.state.casinoPot).toBe(150000);
    expect(room.state.phase).toBe('manage');
  });

  it('неверная ставка отклоняется', () => {
    const room = makeRoom(2);
    room.players[0].position = 17;
    rollTo(room, 0, 1, 2);
    expect(() => act(room, 0, { type: 'casinoBet', numbers: [] })).toThrow(GameError);
    expect(() => act(room, 0, { type: 'casinoBet', numbers: [0, 7] })).toThrow(GameError);
    expect(() => act(room, 1, { type: 'casinoBet', numbers: [3] })).toThrow(GameError); // не его ход
  });

  it('банк копится со всех выплат в банк: залог тюрьмы', () => {
    const room = makeRoom(2);
    const p = room.players[0];
    p.position = 10;
    p.inJail = true;
    act(room, 0, { type: 'payJailFine' });
    expect(room.state.casinoPot).toBe(board.rules.jailFine);
    expect(p.money).toBe(board.rules.startMoney - board.rules.jailFine);
  });

  it('банк копится с каждого штрафа ментов', () => {
    const room = makeRoom(2);
    room.state.cops = { tiles: [24], rollsLeft: 10 };
    room.players[0].position = 19;
    rollTo(room, 0, 2, 3); // 19 + 5 = 24 мигалка → штраф 50000 в банк
    expect(room.state.casinoPot).toBe(50000);
    act(room, 0, { type: 'endTurn' });
    room.players[1].position = 30;
    turnOf(room, 1);
    room.players[0].position = 19;
    room.state.cops.rollsLeft = 10;
    rollTo(room, 0, 2, 3); // снова мигалка → ещё 50000
    expect(room.state.casinoPot).toBe(100000);
  });
});
