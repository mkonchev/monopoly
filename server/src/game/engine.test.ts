import fs from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BoardConfig, GameAction } from '../../../shared/src/types';
import { GameError, type GameRoom, applyAction, createLobbyState, startGame } from './engine';

const board = JSON.parse(
  fs.readFileSync(new URL('../../../shared/board.json', import.meta.url), 'utf-8'),
) as BoardConfig;

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
    });
  }
  startGame(room);
  return room;
}

function act(room: GameRoom, i: number, action: GameAction): void {
  applyAction(room, room.players[i], action);
}

// Подменяем Math.random так, чтобы d6() выдал ровно d1 и d2.
function roll(room: GameRoom, i: number, d1: number, d2: number): void {
  const r = (v: number) => (v - 1) / 6 + 0.08;
  vi.spyOn(Math, 'random').mockReturnValueOnce(r(d1)).mockReturnValueOnce(r(d2));
  act(room, i, { type: 'roll' });
}

function tileIdx(room: GameRoom, name: string): number {
  const idx = room.board.tiles.findIndex((t) => t.name === name);
  if (idx < 0) throw new Error(`нет поля «${name}»`);
  return idx;
}

function give(room: GameRoom, ownerIdx: number, ...names: string[]): void {
  for (const n of names) room.state.properties[tileIdx(room, n)]!.owner = room.players[ownerIdx].id;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('покупка и рента', () => {
  it('свободное поле переводит в фазу покупки и покупается', () => {
    const room = makeRoom(2);
    const p = room.players[0];
    p.position = 0;
    roll(room, 0, 1, 2); // позиция 3 — Нагатинская улица (60000)
    expect(room.state.phase).toBe('buy');
    const before = p.money;
    act(room, 0, { type: 'buy' });
    expect(room.state.properties[tileIdx(room, 'Нагатинская улица')].owner).toBe(p.id);
    expect(p.money).toBe(before - 60000);
    expect(room.state.phase).toBe('manage');
  });

  it('отказ от покупки оставляет поле банку', () => {
    const room = makeRoom(2);
    room.players[0].position = 0;
    roll(room, 0, 1, 2);
    act(room, 0, { type: 'decline' });
    expect(room.state.properties[tileIdx(room, 'Нагатинская улица')].owner).toBeNull();
    expect(room.state.phase).toBe('manage');
  });

  it('рента за улицу без монополии — базовая', () => {
    const room = makeRoom(2);
    give(room, 1, 'Нагатинская улица');
    room.players[0].position = 0;
    const before = room.players[0].money;
    roll(room, 0, 1, 2);
    expect(room.players[0].money).toBe(before - 4000);
    expect(room.players[1].money).toBe(board.rules.startMoney + 4000);
    expect(room.state.phase).toBe('manage');
  });

  it('монополия удваивает базовую ренту', () => {
    const room = makeRoom(2);
    give(room, 1, 'Житная улица', 'Нагатинская улица');
    room.players[0].position = 0;
    roll(room, 0, 1, 2);
    expect(room.players[0].money).toBe(board.rules.startMoney - 8000);
  });

  it('рента растёт с домами по таблице', () => {
    const room = makeRoom(2);
    const idx = tileIdx(room, 'Нагатинская улица');
    give(room, 1, 'Житная улица', 'Нагатинская улица');
    room.state.properties[idx]!.houses = 3;
    room.players[0].position = 0;
    roll(room, 0, 1, 2);
    expect(room.players[0].money).toBe(board.rules.startMoney - 180000);
  });

  it('рента за вокзал зависит от числа вокзалов у владельца', () => {
    const room = makeRoom(2);
    give(room, 1, 'Рижский вокзал', 'Казанский вокзал');
    room.players[0].position = 0;
    roll(room, 0, 2, 3); // позиция 5 — Рижский вокзал
    expect(room.players[0].money).toBe(board.rules.startMoney - 50000);
  });

  it('предприятие: бросок × множитель', () => {
    const room = makeRoom(2);
    give(room, 1, 'Электростанция');
    room.players[0].position = 0;
    roll(room, 0, 6, 6); // позиция 12, дубль, сумма 12
    expect(room.players[0].money).toBe(board.rules.startMoney - 12 * 4);
  });

  it('заложенная собственность не приносит ренту', () => {
    const room = makeRoom(2);
    const idx = tileIdx(room, 'Нагатинская улица');
    give(room, 1, 'Нагатинская улица');
    room.state.properties[idx]!.mortgaged = true;
    room.players[0].position = 0;
    roll(room, 0, 1, 2);
    expect(room.players[0].money).toBe(board.rules.startMoney);
  });

  it('проход СТАРТА даёт зарплату', () => {
    const room = makeRoom(2);
    room.players[0].position = 37;
    roll(room, 0, 1, 2); // 37+3=40 → точно на СТАРТ, с зарплатой
    expect(room.players[0].money).toBe(board.rules.startMoney + board.rules.goSalary);
    expect(room.players[0].position).toBe(0);
  });

  it('налог платится в банк', () => {
    const room = makeRoom(2);
    room.players[0].position = 1;
    roll(room, 0, 1, 2); // 1+3=4 — Подоходный налог
    expect(room.players[0].money).toBe(board.rules.startMoney - 200000);
    expect(room.state.phase).toBe('manage');
  });
});

describe('дубли и тюрьма', () => {
  it('дубль даёт дополнительный бросок', () => {
    const room = makeRoom(2);
    room.players[0].position = 0;
    roll(room, 0, 3, 3); // позиция 6 — Варварка
    expect(room.state.pendingExtraRoll).toBe(true);
  });

  it('после отказа от покупки при дубле снова можно бросать', () => {
    const room = makeRoom(2);
    room.players[0].position = 0;
    roll(room, 0, 3, 3);
    act(room, 0, { type: 'buy' });
    expect(room.state.phase).toBe('roll');
    roll(room, 0, 1, 2); // 6+3=9 Рязанский проспект
    expect(room.state.phase).toBe('buy');
    act(room, 0, { type: 'decline' });
    expect(room.state.phase).toBe('manage');
  });

  it('три дубля подряд — тюрьма', () => {
    const room = makeRoom(2);
    room.players[0].position = 33;
    roll(room, 0, 1, 1); // → 35 Киевский вокзал
    act(room, 0, { type: 'buy' });
    roll(room, 0, 2, 2); // → 39 Арбатская площадь
    act(room, 0, { type: 'buy' });
    roll(room, 0, 3, 3); // третий дубль
    expect(room.players[0].inJail).toBe(true);
    expect(room.players[0].position).toBe(10);
    expect(room.state.phase).toBe('manage');
  });

  it('дубль в тюрьме выводит и двигает, без дополнительного броска', () => {
    const room = makeRoom(2);
    const p = room.players[0];
    p.position = 10;
    p.inJail = true;
    roll(room, 0, 4, 4); // выход, сумма 8 → позиция 18 Грузинский Вал
    expect(p.inJail).toBe(false);
    expect(p.position).toBe(18);
    expect(room.state.phase).toBe('buy'); // предложение купить: доп. броска нет
    act(room, 0, { type: 'decline' });
    expect(room.state.phase).toBe('manage');
  });

  it('после трёх неудачных попыток платится залог и происходит ход', () => {
    const room = makeRoom(2);
    const p = room.players[0];
    p.position = 10;
    p.inJail = true;
    p.jailTurns = 2;
    p.money = 100000;
    roll(room, 0, 1, 2); // не дубль, третья попытка
    expect(p.money).toBe(50000);
    expect(p.inJail).toBe(false);
    expect(p.position).toBe(13); // 10+3 → Улица Дружбы, денег на неё нет
    expect(room.state.phase).toBe('manage');
  });

  it('нехватка денег на залог после 3 попытки — долг', () => {
    const room = makeRoom(2);
    const p = room.players[0];
    p.position = 10;
    p.inJail = true;
    p.jailTurns = 2;
    p.money = 10000;
    roll(room, 0, 1, 2);
    expect(room.state.phase).toBe('debt');
    expect(room.state.debt?.reason).toBe('jail-fine');
  });

  it('оплата залога действием и карта освобождения работают', () => {
    const room = makeRoom(2);
    const p = room.players[0];
    p.position = 10;
    p.inJail = true;
    act(room, 0, { type: 'payJailFine' });
    expect(p.inJail).toBe(false);
    expect(p.money).toBe(board.rules.startMoney - board.rules.jailFine);

    const room2 = makeRoom(2);
    const q = room2.players[0];
    q.position = 10;
    q.inJail = true;
    q.jailCards = 1;
    act(room2, 0, { type: 'useJailCard' });
    expect(q.inJail).toBe(false);
    expect(q.jailCards).toBe(0);
  });
});

describe('карточки', () => {
  it('«переходите на СТАРТ» двигает и платит зарплату', () => {
    const room = makeRoom(2);
    room.decks!.chance = [{ text: 'СТАРТ', effect: { type: 'moveTo', tile: 'СТАРТ' } }];
    room.players[0].position = 0;
    roll(room, 0, 3, 4); // позиция 7 — Шанс
    expect(room.players[0].position).toBe(0);
    expect(room.players[0].money).toBe(board.rules.startMoney + board.rules.goSalary);
    expect(room.state.lastCard?.text).toBe('СТАРТ');
  });

  it('карта goToJail сажает в тюрьму', () => {
    const room = makeRoom(2);
    room.decks!.chance = [{ text: 'В тюрьму', effect: { type: 'goToJail' } }];
    room.players[0].position = 0;
    roll(room, 0, 3, 4);
    expect(room.players[0].inJail).toBe(true);
    expect(room.players[0].position).toBe(10);
    expect(room.state.phase).toBe('manage');
  });

  it('getOutOfJail остаётся у игрока', () => {
    const room = makeRoom(2);
    room.decks!.chance = [{ text: 'Освобождение', effect: { type: 'getOutOfJail' } }];
    room.players[0].position = 0;
    roll(room, 0, 3, 4);
    expect(room.players[0].jailCards).toBe(1);
    expect(room.state.phase).toBe('manage');
  });

  it('moneyFromEach собирает с игроков и банкротит неспособных заплатить', () => {
    const room = makeRoom(3);
    room.decks!.chest = [{ text: 'День рождения', effect: { type: 'moneyFromEach', amount: 100000 } }];
    room.players[2].money = 50000;
    room.players[0].position = 0;
    roll(room, 0, 1, 1); // дубль → позиция 2 Казна
    expect(room.state.phase).toBe('roll'); // дубль сохраняется
    expect(room.players[1].money).toBe(board.rules.startMoney - 100000);
    expect(room.players[2].bankrupt).toBe(true);
    expect(room.players[0].money).toBe(board.rules.startMoney + 150000);
  });

  it('repairs: платит за дома', () => {
    const room = makeRoom(2);
    const idx = tileIdx(room, 'Житная улица');
    give(room, 0, 'Житная улица', 'Нагатинская улица');
    room.state.properties[idx]!.houses = 2;
    room.decks!.chance = [{ text: 'Ремонт', effect: { type: 'repairs', perHouse: 50000, perHotel: 200000 } }];
    room.players[0].position = 0;
    roll(room, 0, 3, 4); // 7 — Шанс
    expect(room.players[0].money).toBe(board.rules.startMoney - 100000);
    expect(room.state.phase).toBe('manage');
  });

  it('nearestRailroad: с Шанса на ближайший вокзал, двойная рента', () => {
    const room = makeRoom(2);
    give(room, 1, 'Казанский вокзал'); // позиция 15 — ближайший вперёд от 7
    room.decks!.chance = [{ text: 'К вокзалу', effect: { type: 'nearestRailroad' } }];
    room.players[0].position = 0;
    roll(room, 0, 3, 4); // 7 — Шанс
    expect(room.players[0].position).toBe(15);
    expect(room.players[0].money).toBe(board.rules.startMoney - 50000); // 25000 × 2
    expect(room.state.phase).toBe('manage'); // вокзал принадлежит p1 — просто рента
  });

  it('moveBy назад не даёт зарплату и разрешает новую клетку', () => {
    const room = makeRoom(2);
    room.decks!.chance = [{ text: 'Назад', effect: { type: 'moveBy', steps: -3 } }];
    room.players[0].position = 36;
    roll(room, 0, 5, 6); // 36+11=47 → 7 Шанс (по пути пройден СТАРТ) → назад на 3 → позиция 4 (налог)
    expect(room.players[0].position).toBe(4);
    expect(room.players[0].money).toBe(board.rules.startMoney + board.rules.goSalary - 200000);
    expect(room.state.phase).toBe('manage');
  });
});

describe('дома и залоги', () => {
  it('равномерная застройка: нельзя опережать группу', () => {
    const room = makeRoom(2);
    give(room, 0, 'Житная улица', 'Нагатинская улица');
    const a = tileIdx(room, 'Житная улица');
    const b = tileIdx(room, 'Нагатинская улица');
    act(room, 0, { type: 'build', tile: a });
    expect(room.state.properties[a]!.houses).toBe(1);
    expect(() => act(room, 0, { type: 'build', tile: a })).toThrow(GameError);
    act(room, 0, { type: 'build', tile: b });
    act(room, 0, { type: 'build', tile: b });
    expect(room.state.properties[b]!.houses).toBe(2);
    expect(() => act(room, 0, { type: 'sellHouse', tile: a })).toThrow(GameError);
    act(room, 0, { type: 'sellHouse', tile: b });
    expect(room.state.properties[b]!.houses).toBe(1);
  });

  it('строить можно только при полной немортгазированной группе', () => {
    const room = makeRoom(2);
    const a = tileIdx(room, 'Житная улица');
    give(room, 0, 'Житная улица');
    expect(() => act(room, 0, { type: 'build', tile: a })).toThrow(GameError);
    give(room, 0, 'Нагатинская улица');
    room.state.properties[a]!.mortgaged = true;
    expect(() => act(room, 0, { type: 'build', tile: a })).toThrow(GameError);
  });

  it('залог даёт половину цены, выкуп — 55%', () => {
    const room = makeRoom(2);
    const a = tileIdx(room, 'Житная улица');
    give(room, 0, 'Житная улица', 'Нагатинская улица');
    const before = room.players[0].money;
    act(room, 0, { type: 'mortgage', tile: a });
    expect(room.players[0].money).toBe(before + 30000);
    act(room, 0, { type: 'unmortgage', tile: a });
    expect(room.players[0].money).toBe(before + 30000 - 33000);
  });
});

describe('банкротство и победа', () => {
  it('нехватка денег на ренту → банкротство в пользу кредитора → победа', () => {
    const room = makeRoom(2);
    const idx = tileIdx(room, 'Арбатская площадь');
    room.state.properties[idx]!.owner = room.players[1].id;
    room.state.properties[idx]!.houses = 5;
    const p = room.players[0];
    p.position = 37;
    p.money = 300000;
    roll(room, 0, 1, 1); // 37+2=39, отель, рента 2000000
    expect(room.state.phase).toBe('debt');
    expect(room.state.debt?.creditor).toBe('p1');
    act(room, 0, { type: 'declareBankrupt' });
    expect(p.bankrupt).toBe(true);
    expect(room.state.properties[idx]!.owner).toBe('p1');
    expect(room.state.phase).toBe('over');
    expect(room.state.winner).toBe('p1');
  });

  it('банкротство кредитору передаёт собственность, игра продолжается', () => {
    const room = makeRoom(3);
    const p = room.players[0];
    give(room, 0, 'Житная улица', 'Нагатинская улица');
    const idx = tileIdx(room, 'Арбатская площадь');
    room.state.properties[idx]!.owner = room.players[1].id;
    room.state.properties[idx]!.houses = 5;
    p.position = 37;
    p.money = 1000;
    roll(room, 0, 1, 1);
    act(room, 0, { type: 'declareBankrupt' });
    expect(p.bankrupt).toBe(true);
    expect(room.state.properties[tileIdx(room, 'Житная улица')]!.owner).toBe('p1');
    expect(room.state.properties[idx]!.owner).toBe('p1');
    expect(room.state.phase).toBe('roll');
    expect(room.state.turnPlayer).toBe('p1');
    expect(room.state.winner).toBeNull();
  });

  it('в долг можно закладывать собственность, но не хватает — банкротство', () => {
    const room = makeRoom(2);
    const idx = tileIdx(room, 'Арбатская площадь');
    room.state.properties[idx]!.owner = room.players[1].id;
    room.state.properties[idx]!.houses = 5;
    const p = room.players[0];
    give(room, 0, 'Житная улица');
    p.position = 37;
    p.money = 100000;
    roll(room, 0, 1, 1);
    expect(room.state.phase).toBe('debt');
    act(room, 0, { type: 'mortgage', tile: tileIdx(room, 'Житная улица') });
    expect(p.money).toBe(130000);
    expect(() => act(room, 0, { type: 'payDebt' })).toThrow(GameError);
    act(room, 0, { type: 'declareBankrupt' });
    expect(p.bankrupt).toBe(true);
  });
});

describe('ход игры', () => {
  it('после не-дубля ход переходит к следующему по кнопке', () => {
    const room = makeRoom(3);
    room.players[0].position = 33;
    roll(room, 0, 1, 2); // 33+3=36 Шанс (карты не трогаем — берутся из перемешанной колоды)
    // попадание на Шанс допустимо; закончим ход в любой фазе результата
    const phase = room.state.phase;
    expect(phase === 'manage' || phase === 'buy' || phase === 'roll').toBe(true);
    if (phase === 'buy') act(room, 0, { type: 'decline' });
    act(room, 0, { type: 'endTurn' });
    expect(room.state.turnPlayer).toBe('p1');
    expect(room.state.phase).toBe('roll');
  });

  it('действия не текущего игрока запрещены', () => {
    const room = makeRoom(2);
    expect(() => act(room, 1, { type: 'roll' })).toThrow(GameError);
  });

  it('нехватка денег исключает предложение покупки', () => {
    const room = makeRoom(2);
    room.players[0].money = 1000;
    room.players[0].position = 0;
    roll(room, 0, 1, 2); // Нагатинская за 60000 — не по карману
    expect(room.state.phase).toBe('manage');
  });

  it('карта moneyToEach при нехватке денег создаёт долг с получателями', () => {
    const room = makeRoom(3);
    room.decks!.chance = [{ text: 'Правление', effect: { type: 'moneyToEach', amount: 100000 } }];
    const p = room.players[0];
    p.money = 150000;
    p.position = 0;
    roll(room, 0, 3, 4); // 7 — Шанс
    expect(room.state.phase).toBe('debt');
    expect(room.state.debt?.recipients).toEqual(['p1', 'p2']);
    expect(() => act(room, 0, { type: 'payDebt' })).toThrow(GameError);
  });
});
