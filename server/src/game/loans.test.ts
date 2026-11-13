import fs from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BoardConfig, GameAction, Tile } from '../../../shared/src/types';
import { GameError, type GameRoom, applyAction, createLobbyState, startGame } from './engine';

const realBoard = JSON.parse(
  fs.readFileSync(new URL('../../../shared/board.json', import.meta.url), 'utf-8'),
) as BoardConfig;

// Нейтральная доска: путь свободен (без эффектов), две тестовые улицы для ренты и изъятия.
function neutralBoard(): BoardConfig {
  const tiles: Tile[] = [];
  for (let i = 0; i < 40; i++) {
    if (i === 0) tiles.push({ type: 'go', name: 'СТАРТ' });
    else if (i === 3)
      tiles.push({ type: 'street', name: 'Тестовая улица', group: 'brown', price: 60000, houseCost: 50000, rent: [4000, 20000, 60000, 180000, 320000, 450000] });
    else if (i === 39)
      tiles.push({ type: 'street', name: 'Тестовая площадь', group: 'blue', price: 400000, houseCost: 200000, rent: [50000, 200000, 600000, 1400000, 1700000, 2000000] });
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
      position: 19,
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

// Один полный ход: с позиции 19 два броска (дубль, затем не-дубль), mid — перед концом хода.
function turn(room: GameRoom, i: number, mid?: (room: GameRoom) => void): void {
  const p = room.players[i];
  if (p.bankrupt) return;
  p.position = 19;
  const r = (v: number) => (v - 1) / 6 + 0.08;
  const spy = vi.spyOn(Math, 'random');
  spy.mockReturnValueOnce(r(1)).mockReturnValueOnce(r(1)); // дубль
  act(room, i, { type: 'roll' });
  if (room.state.phase !== 'roll') {
    mid?.(room);
    act(room, i, { type: 'endTurn' });
    vi.restoreAllMocks();
    return;
  }
  spy.mockReturnValueOnce(r(1)).mockReturnValueOnce(r(2)); // 1+2, не дубль
  act(room, i, { type: 'roll' });
  mid?.(room);
  act(room, i, { type: 'endTurn' });
  vi.restoreAllMocks();
}

// Крутим ходы по кругу; когда у заёмщика наступает просрочка (ставится в начале
// его хода), onDue вызывается перед endTurn — иначе изъятие в начале его следующего хода.
function dueCycle(room: GameRoom, borrowerIdx: number, onDue: (room: GameRoom) => void): void {
  let guard = 0;
  while (guard++ < 300) {
    const currentIdx = room.players.findIndex((p) => p.id === room.state.turnPlayer);
    if (currentIdx < 0) return;
    let fired = false;
    turn(room, currentIdx, (r) => {
      if (currentIdx === borrowerIdx && r.players[borrowerIdx].loan?.due) {
        fired = true;
        onDue(r);
      }
    });
    const b = room.players[borrowerIdx];
    if (b.bankrupt || !b.loan) return; // изъятие
    if (fired && !b.loan.due) return; // урегулировано в mid
  }
}

// Спасение в ход спасателя: окно — чужие ходы между просрочкой должника и началом его следующего хода.
function rescueOnTurn(room: GameRoom, borrowerIdx: number, rescuerIdx: number): void {
  let guard = 0;
  while (guard++ < 300) {
    const currentIdx = room.players.findIndex((p) => p.id === room.state.turnPlayer);
    if (currentIdx < 0) return;
    const b = room.players[borrowerIdx];
    if (b.bankrupt || !b.loan) throw new Error('должника изъяли до спасения');
    if (currentIdx === rescuerIdx && b.loan.due) {
      act(room, rescuerIdx, { type: 'rescueLoan', target: `p${borrowerIdx}` });
      turn(room, rescuerIdx); // завершить ход спасателя
      return;
    }
    turn(room, currentIdx);
  }
}

afterEach(() => vi.restoreAllMocks());

describe('кредит в банке', () => {
  it('выдаётся, деньги приходят, второй кредит нельзя', () => {
    const room = makeRoom(2);
    act(room, 0, { type: 'takeLoan', amount: 500000 });
    expect(room.players[0].loan?.creditor).toBe('bank');
    expect(room.players[0].money).toBe(board.rules.startMoney + 500000);
    expect(() => act(room, 0, { type: 'takeLoan', amount: 1000 })).toThrow(GameError);
  });

  it('сумма ограничена конфигом', () => {
    const room = makeRoom(2);
    expect(() => act(room, 0, { type: 'takeLoan', amount: 99999999 })).toThrow(GameError);
  });

  it('проценты начисляются в начале каждого хода должника, к сроку — просрочка', () => {
    const room = makeRoom(2);
    const p = room.players[0];
    act(room, 0, { type: 'takeLoan', amount: 1000000 });
    turn(room, 0); // завершает 1-й ход
    turn(room, 1);
    expect(p.loan!.debt).toBe(1100000); // начисление в начале 2-го хода (ставка банка 10%)
    expect(p.loan!.turnsServed).toBe(1);
    turn(room, 0);
    turn(room, 1);
    expect(p.loan!.debt).toBe(Math.round(1000000 * 1.1 * 1.1));
    expect(p.loan!.turnsServed).toBe(2);
    let guard = 0;
    while (!p.loan!.due && guard++ < 60) {
      turn(room, 0);
      turn(room, 1);
    }
    expect(p.loan!.turnsServed).toBe(10); // termTurns из конфига
    expect(p.loan!.due).toBe(true);
  });

  it('досрочное погашение списывает долг и закрывает кредит', () => {
    const room = makeRoom(2);
    const p = room.players[0];
    act(room, 0, { type: 'takeLoan', amount: 500000 });
    p.money = 600000;
    act(room, 0, { type: 'repayLoan' });
    expect(p.loan).toBeNull();
    expect(p.money).toBe(100000);
  });

  it('погасить без денег нельзя', () => {
    const room = makeRoom(2);
    act(room, 0, { type: 'takeLoan', amount: 1000000 });
    room.players[0].money = 10;
    expect(() => act(room, 0, { type: 'repayLoan' })).toThrow(GameError);
  });
});

describe('продление и изъятие', () => {
  it('продление повышает ставку и обнуляет срок', () => {
    const room = makeRoom(2);
    const p = room.players[0];
    act(room, 0, { type: 'takeLoan', amount: 1000000 });
    dueCycle(room, 0, () => act(room, 0, { type: 'extendLoan' }));
    expect(p.loan!.due).toBe(false);
    expect(p.loan!.turnsServed).toBe(0);
    expect(p.loan!.rate).toBeCloseTo(0.15, 5); // 0.10 × 1.5
    expect(p.loan!.extensions).toBe(1);
  });

  it('после исчерпания продлений конец хода с просрочкой = всё банку', () => {
    const room = makeRoom(3);
    const p = room.players[0];
    const idx = tileIdx(room, 'Тестовая улица');
    room.state.properties[idx]!.owner = 'p0';
    act(room, 0, { type: 'takeLoan', amount: 1000000 });
    const extend = (r: GameRoom) => {
      if (r.players[0].loan!.extensions < 2) act(r, 0, { type: 'extendLoan' });
    };
    dueCycle(room, 0, extend);
    dueCycle(room, 0, extend);
    dueCycle(room, 0, () => {}); // продлений нет → изъятие в начале следующего хода должника
    expect(p.bankrupt).toBe(true);
    expect(p.loan).toBeNull();
    expect(room.state.properties[idx]!.owner).toBeNull();
    expect(p.money).toBe(0);
    expect(room.state.phase).not.toBe('over');
  });

  it('изъятие в пользу игрока-кредитора передаёт собственность и все деньги', () => {
    const room = makeRoom(3);
    const p = room.players[0];
    const creditor = room.players[1];
    const idx = tileIdx(room, 'Тестовая улица');
    room.state.properties[idx]!.owner = 'p0';
    act(room, 0, { type: 'requestLoanFrom', to: 'p1', amount: 300000 });
    act(room, 1, { type: 'acceptLoanRequest', id: room.state.offers.loanRequests[0]!.id });
    expect(p.loan!.creditor).toBe('p1');
    const creditorBefore = creditor.money;
    dueCycle(room, 0, () => {});
    expect(p.bankrupt).toBe(true);
    expect(room.state.properties[idx]!.owner).toBe('p1');
    expect(p.money).toBe(0);
    expect(creditor.money).toBeGreaterThan(creditorBefore);
    expect(room.state.phase).not.toBe('over');
  });
});

describe('займ между игроками', () => {
  it('просьба → согласие: ответ приходит сразу, деньги переводятся', () => {
    const room = makeRoom(3);
    act(room, 0, { type: 'requestLoanFrom', to: 'p2', amount: 250000 });
    expect(room.state.offers.loanRequests).toHaveLength(1);
    expect(room.state.awaitingOffer?.kind).toBe('loan');
    act(room, 2, { type: 'acceptLoanRequest', id: room.state.offers.loanRequests[0]!.id });
    expect(room.players[2].money).toBe(board.rules.startMoney - 250000);
    expect(room.players[0].money).toBe(board.rules.startMoney + 250000);
    expect(room.players[0].loan!.creditor).toBe('p2');
    expect(room.players[0].loan!.rate).toBeCloseTo(0.05, 5);
    expect(room.state.offers.loanRequests).toHaveLength(0);
    expect(room.state.awaitingOffer).toBeNull();
  });

  it('отказ убирает заявку', () => {
    const room = makeRoom(2);
    act(room, 0, { type: 'requestLoanFrom', to: 'p1', amount: 100000 });
    act(room, 1, { type: 'declineLoanRequest', id: room.state.offers.loanRequests[0]!.id });
    expect(room.state.offers.loanRequests).toHaveLength(0);
    expect(room.players[0].loan).toBeNull();
    expect(room.state.awaitingOffer).toBeNull();
  });

  it('пока займ ждёт ответа — ход предложившего заморожен', () => {
    const room = makeRoom(2);
    act(room, 0, { type: 'requestLoanFrom', to: 'p1', amount: 100000 });
    expect(() => act(room, 0, { type: 'roll' })).toThrow(GameError);
    expect(() => act(room, 0, { type: 'endTurn' })).toThrow(GameError);
    // не-получатель ответить не может
    expect(() => act(room, 0, { type: 'acceptLoanRequest', id: room.state.offers.loanRequests[0]!.id })).toThrow(GameError);
    act(room, 1, { type: 'declineLoanRequest', id: room.state.offers.loanRequests[0]!.id });
    act(room, 0, { type: 'roll' }); // после отказа ход разморожен
  });

  it('вне своего хода кредиты и обмены запрещены', () => {
    const room = makeRoom(2);
    expect(() => act(room, 1, { type: 'takeLoan', amount: 100000 })).toThrow(GameError);
    expect(() => act(room, 1, { type: 'proposeTrade', to: 'p0', giveTiles: [], giveMoney: 1000, wantTiles: [], wantMoney: 0 })).toThrow(GameError);
    act(room, 0, { type: 'takeLoan', amount: 100000 });
    turn(room, 0); // ход p1
    expect(() => act(room, 0, { type: 'repayLoan' })).toThrow(GameError);
    act(room, 1, { type: 'takeLoan', amount: 100000 }); // в свой ход можно
    expect(room.players[1].loan?.creditor).toBe('bank');
  });

  it('новый займ недоступен, пока есть кредит', () => {
    const room = makeRoom(2);
    act(room, 0, { type: 'takeLoan', amount: 100000 });
    expect(() => act(room, 0, { type: 'requestLoanFrom', to: 'p1', amount: 100000 })).toThrow(GameError);
    act(room, 0, { type: 'repayLoan' });
    act(room, 0, { type: 'requestLoanFrom', to: 'p1', amount: 100000 });
  });
});

describe('спасение долга', () => {
  it('спасатель платит банку, долг переходит к нему', () => {
    const room = makeRoom(3);
    const debtor = room.players[0];
    const rescuer = room.players[2];
    act(room, 0, { type: 'takeLoan', amount: 500000 });
    rescuer.money = 10000000; // за 10 ходов под 10% долг заметно растёт
    rescueOnTurn(room, 0, 2); // спасение в ход p2, пока окно не закрылось
    const debt = debtor.loan!.debt;
    expect(debt).toBeGreaterThan(500000);
    expect(debtor.loan!.creditor).toBe('p2');
    expect(debtor.loan!.rescued).toBe(true);
    expect(debtor.loan!.due).toBe(false);
    expect(debtor.loan!.debt).toBe(debt);
  });

  it('половина уличной ренты уходит спасателю', () => {
    const room = makeRoom(3);
    const debtor = room.players[0];
    const rescuer = room.players[2];
    room.state.properties[tileIdx(room, 'Тестовая улица')]!.owner = 'p0';
    act(room, 0, { type: 'takeLoan', amount: 100000 });
    rescueOnTurn(room, 0, 2);
    turn(room, 0); // после спасателя ход у p0 — прокручиваем до p1
    const rescuerBefore = rescuer.money;
    const debtorBefore = debtor.money;
    // игрок 1 попадает на Тестовую улицу. База 4000, но улица одна в своей группе —
    // монополия удваивает ренту до 8000; спасателю половина.
    room.players[1].position = 0;
    const r = (v: number) => (v - 1) / 6 + 0.08;
    vi.spyOn(Math, 'random').mockReturnValueOnce(r(1)).mockReturnValueOnce(r(2)); // сумма 3
    act(room, 1, { type: 'roll' });
    vi.restoreAllMocks();
    expect(rescuer.money).toBe(rescuerBefore + 4000);
    expect(debtor.money).toBe(debtorBefore + 4000);
  });

  it('просроченный долг нельзя спасти без денег', () => {
    const room = makeRoom(3);
    act(room, 0, { type: 'takeLoan', amount: 1000000 });
    let rescuedAttempted = false;
    let guard = 0;
    while (!rescuedAttempted && guard++ < 300) {
      const currentIdx = room.players.findIndex((p) => p.id === room.state.turnPlayer);
      if (currentIdx < 0) break;
      const b = room.players[0];
      if (b.bankrupt) break;
      if (currentIdx === 2 && b.loan?.due) {
        room.players[2].money = 0;
        expect(() => act(room, 2, { type: 'rescueLoan', target: 'p0' })).toThrow(GameError);
        rescuedAttempted = true;
        break;
      }
      turn(room, currentIdx);
    }
    expect(rescuedAttempted).toBe(true);
  });
});

describe('банкротство с активным кредитом — залог', () => {
  it('при банкротстве от ренты всё уходит кредитору по кредиту, а не обидчику', () => {
    const room = makeRoom(3);
    const p = room.players[0];
    const rentOwner = room.players[1];
    const idx = tileIdx(room, 'Тестовая площадь');
    const ownIdx = tileIdx(room, 'Тестовая улица');
    room.state.properties[idx]!.owner = 'p1';
    room.state.properties[idx]!.houses = 5; // рента 4 000 000 (монополия ×2)
    room.state.properties[ownIdx]!.owner = 'p0';
    act(room, 0, { type: 'takeLoan', amount: 1000000 });
    p.money = 1000;
    p.position = tileIdx(room, 'Тестовая площадь') - 2;
    const r = (v: number) => (v - 1) / 6 + 0.08;
    vi.spyOn(Math, 'random').mockReturnValueOnce(r(1)).mockReturnValueOnce(r(1)); // дубль, сумма 2
    act(room, 0, { type: 'roll' });
    vi.restoreAllMocks();
    expect(room.state.phase).toBe('debt');
    act(room, 0, { type: 'declareBankrupt' });
    expect(p.bankrupt).toBe(true);
    expect(room.state.properties[ownIdx]!.owner).toBeNull(); // банку, а не p1
    expect(room.state.properties[idx]!.owner).toBe('p1'); // имущество p1 не тронуто
    expect(p.money).toBe(0);
    expect(rentOwner.money).toBe(board.rules.startMoney); // рента не дошла
  });
});

describe('обмен собственностью', () => {
  it('предложение → принятие: поля и деньги меняются местами', () => {
    const room = makeRoom(2);
    const a = tileIdx(room, 'Тестовая улица');
    const b = tileIdx(room, 'Тестовая площадь');
    room.state.properties[a]!.owner = 'p0';
    room.state.properties[b]!.owner = 'p1';
    act(room, 0, { type: 'proposeTrade', to: 'p1', giveTiles: [a], giveMoney: 50000, wantTiles: [b], wantMoney: 0 });
    const money0 = room.players[0].money;
    const money1 = room.players[1].money;
    act(room, 1, { type: 'acceptTrade', id: room.state.offers.trades[0]!.id });
    expect(room.state.properties[a]!.owner).toBe('p1');
    expect(room.state.properties[b]!.owner).toBe('p0');
    expect(room.players[0].money).toBe(money0 - 50000);
    expect(room.players[1].money).toBe(money1 + 50000);
    expect(room.state.offers.trades).toHaveLength(0);
  });

  it('улица с домами предлагается: дома переезжают вместе с полем', () => {
    const room = makeRoom(2);
    const a = tileIdx(room, 'Тестовая улица');
    const b = tileIdx(room, 'Тестовая площадь');
    room.state.properties[a]!.owner = 'p0';
    room.state.properties[a]!.houses = 2;
    room.state.properties[b]!.owner = 'p1';
    room.state.turnPlayer = 'p0';
    room.state.phase = 'manage';
    act(room, 0, { type: 'proposeTrade', to: 'p1', giveTiles: [a], giveMoney: 0, wantTiles: [b], wantMoney: 0 });
    act(room, 1, { type: 'acceptTrade', id: room.state.offers.trades[0].id });
    expect(room.state.properties[a]!.owner).toBe('p1');
    expect(room.state.properties[a]!.houses).toBe(2);
    expect(room.state.properties[b]!.owner).toBe('p0');
  });

  it('принятие отклоняется, если обстоятельства изменились', () => {
    const room = makeRoom(2);
    const a = tileIdx(room, 'Тестовая улица');
    room.state.properties[a]!.owner = 'p0';
    act(room, 0, { type: 'proposeTrade', to: 'p1', giveTiles: [a], giveMoney: 100000, wantTiles: [], wantMoney: 4000 });
    room.players[0].money = 0;
    expect(() => act(room, 1, { type: 'acceptTrade', id: room.state.offers.trades[0]!.id })).toThrow(GameError);
  });

  it('отказ и отмена работают', () => {
    const room = makeRoom(2);
    const a = tileIdx(room, 'Тестовая улица');
    const b = tileIdx(room, 'Тестовая площадь');
    room.state.properties[a]!.owner = 'p0';
    room.state.properties[b]!.owner = 'p1';
    act(room, 0, { type: 'proposeTrade', to: 'p1', giveTiles: [a], giveMoney: 0, wantTiles: [b], wantMoney: 0 });
    act(room, 0, { type: 'cancelOffer', kind: 'trade', id: room.state.offers.trades[0]!.id });
    expect(room.state.offers.trades).toHaveLength(0);
    act(room, 0, { type: 'proposeTrade', to: 'p1', giveTiles: [a], giveMoney: 0, wantTiles: [b], wantMoney: 0 });
    act(room, 1, { type: 'declineTrade', id: room.state.offers.trades[0]!.id });
    expect(room.state.offers.trades).toHaveLength(0);
  });
});
