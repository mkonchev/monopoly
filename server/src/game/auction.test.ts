import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
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

// Игрок i стоит на клетке 3 (Тестовая улица, 60000) в фазе покупки
function onBuyPhase(room: GameRoom, i: number): void {
  room.players[i].position = 3;
  room.state.turnPlayer = room.players[i].id;
  room.state.phase = 'buy';
}

const expectErr = (fn: () => void, part: string) => {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(GameError);
    expect((e as GameError).message).toContain(part);
    return;
  }
  throw new Error('ожидали GameError');
};

describe('аукцион', () => {
  it('отказ запускает аукцион: старт с половины цены, первым торгует следующий по кругу', () => {
    const room = makeRoom(3);
    onBuyPhase(room, 0);
    act(room, 0, { type: 'decline' });
    expect(room.state.phase).toBe('auction');
    const a = room.state.auction!;
    expect(a.tile).toBe(3);
    expect(a.bid).toBe(0);
    expect(a.leader).toBeNull();
    expect(a.order).toEqual(['p1', 'p2', 'p0']); // после отказника, отказник последним
    expect(a.turn).toBe(0);
  });

  it('ставка ниже стартовой отклоняется; выше суммы — тоже', () => {
    const room = makeRoom(2);
    onBuyPhase(room, 0);
    act(room, 0, { type: 'decline' });
    expectErr(() => act(room, 1, { type: 'auctionBid', amount: 29999 }), 'Минимальная ставка');
    expectErr(() => act(room, 1, { type: 'auctionBid', amount: 5000000 }), 'Не хватает денег');
    expect(room.state.auction!.leader).toBeNull();
  });

  it('не ваша очередь торговаться', () => {
    const room = makeRoom(2);
    onBuyPhase(room, 0);
    act(room, 0, { type: 'decline' });
    expectErr(() => act(room, 0, { type: 'auctionBid', amount: 30000 }), 'не ваша ставка');
    expectErr(() => act(room, 0, { type: 'auctionPass' }), 'не ваш торг');
  });

  it('все пасанули — поле остаётся у банка, ход продолжается', () => {
    const room = makeRoom(2);
    onBuyPhase(room, 0);
    act(room, 0, { type: 'decline' });
    act(room, 1, { type: 'auctionPass' }); // p1
    act(room, 0, { type: 'auctionPass' }); // p0 — последний
    expect(room.state.auction).toBeNull();
    expect(room.state.phase).toBe('manage');
    expect(room.state.properties[3]!.owner).toBeNull();
    expect(room.players[0].money).toBe(board.rules.startMoney);
  });

  it('одна ставка + пас остальных: победитель получает поле и платит', () => {
    const room = makeRoom(2);
    onBuyPhase(room, 0);
    act(room, 0, { type: 'decline' });
    act(room, 1, { type: 'auctionBid', amount: 30000 });
    act(room, 0, { type: 'auctionPass' });
    expect(room.state.auction).toBeNull();
    expect(room.state.phase).toBe('manage');
    expect(room.state.properties[3]!.owner).toBe('p1');
    expect(room.players[1].money).toBe(board.rules.startMoney - 30000);
    expect(room.players[0].money).toBe(board.rules.startMoney);
  });

  it('перебивки повышением: минимум bid+шаг, отказник может выкупить сам', () => {
    const room = makeRoom(2);
    onBuyPhase(room, 0);
    act(room, 0, { type: 'decline' });
    act(room, 1, { type: 'auctionBid', amount: 30000 });
    expectErr(() => act(room, 0, { type: 'auctionBid', amount: 39000 }), 'Минимальная ставка');
    act(room, 0, { type: 'auctionBid', amount: 40000 });
    act(room, 1, { type: 'auctionPass' });
    expect(room.state.properties[3]!.owner).toBe('p0');
    expect(room.players[0].money).toBe(board.rules.startMoney - 40000);
  });

  it('аукцион с 3 игроками: круг продолжается, пока не останется один с лидерской ставкой', () => {
    const room = makeRoom(3);
    onBuyPhase(room, 0);
    act(room, 0, { type: 'decline' });
    act(room, 1, { type: 'auctionBid', amount: 30000 }); // p1
    act(room, 2, { type: 'auctionPass' }); // p2
    act(room, 0, { type: 'auctionPass' }); // p0
    // остались p1 (лидер) — аукцион завершён сразу
    expect(room.state.auction).toBeNull();
    expect(room.state.properties[3]!.owner).toBe('p1');
  });

  it('одинокий живой игрок: аукциона нет, поле у банка', () => {
    const room = makeRoom(2);
    room.players[1].bankrupt = true;
    onBuyPhase(room, 0);
    act(room, 0, { type: 'decline' });
    expect(room.state.auction).toBeNull();
    expect(room.state.phase).toBe('manage');
    expect(room.state.properties[3]!.owner).toBeNull();
  });
});

describe('обмен с домами', () => {
  it('улицу с домами можно обменять на улицу — дома переезжают вместе с полем', () => {
    const room = makeRoom(2);
    room.state.properties[3]!.owner = 'p0';
    room.state.properties[3]!.houses = 2;
    // второе поле: заменим пустышку на улицу, отдадим p1
    (room.board.tiles as unknown as Record<number, unknown>)[5] = {
      type: 'street', name: 'Вторая улица', group: 'brown', price: 50000, houseCost: 50000, rent: [4000, 20000, 60000, 180000, 320000, 450000],
    };
    room.state.properties[5]!.owner = 'p1';
    room.state.turnPlayer = 'p0';
    room.state.phase = 'manage';
    act(room, 0, { type: 'proposeTrade', to: 'p1', giveTiles: [3], giveMoney: 0, wantTiles: [5], wantMoney: 0 });
    act(room, 1, { type: 'acceptTrade', id: room.state.offers.trades[0].id });
    expect(room.state.properties[3]!.owner).toBe('p1');
    expect(room.state.properties[3]!.houses).toBe(2);
    expect(room.state.properties[5]!.owner).toBe('p0');
  });
});
