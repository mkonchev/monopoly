import type { BoardConfig, CardDef, CardEffect, GameState, PropertyState, Tile } from '../../../shared/src/types';

export class GameError extends Error {}

export interface Player {
  id: string;
  name: string;
  color: string;
  token: string;
  money: number;
  position: number;
  inJail: boolean;
  jailTurns: number;
  jailCards: number;
  bankrupt: boolean;
  isHost: boolean;
  socketIds: Set<string>;
}

export interface GameRoom {
  code: string;
  board: BoardConfig;
  state: GameState;
  players: Player[];
  decks: { chance: CardDef[]; chest: CardDef[] } | null;
  discards: { chance: CardDef[]; chest: CardDef[] } | null;
  rentOverride: { kind: 'railroad' | 'utility' } | null;
  createdAt: number;
  lastActivity: number;
}

export const PLAYER_COLORS = ['#e53935', '#1e88e5', '#43a047', '#fdd835', '#8e24aa', '#fb8c00', '#00acc1', '#d81b60'];
export const MAX_PLAYERS = 8;

export function fmtNum(n: number): string {
  return new Intl.NumberFormat('ru-RU').format(n);
}

export function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const d6 = () => 1 + Math.floor(Math.random() * 6);

function log(st: GameState, text: string): void {
  st.log.push({ id: ++st.logSeq, text });
  if (st.log.length > 200) st.log.splice(0, st.log.length - 200);
}

function fmtMoney(room: GameRoom, n: number): string {
  return `${fmtNum(n)} ${room.board.meta.currency}`;
}

// ---------- Создание и сброс игры ----------

export function createLobbyState(): GameState {
  return {
    phase: 'lobby',
    turnPlayer: null,
    turnNumber: 0,
    dice: null,
    rollId: 0,
    doublesCount: 0,
    pendingExtraRoll: false,
    properties: {},
    debt: null,
    lastCard: null,
    cardSeq: 0,
    winner: null,
    log: [],
    logSeq: 0,
    bank: { houses: null, hotels: null },
  };
}

export function startGame(room: GameRoom): void {
  const b = room.board;
  room.state = {
    phase: 'roll',
    turnPlayer: room.players[0].id,
    turnNumber: 1,
    dice: null,
    rollId: 0,
    doublesCount: 0,
    pendingExtraRoll: false,
    properties: Object.fromEntries(b.tiles.map((_, i) => [i, { owner: null, mortgaged: false, houses: 0 }])),
    debt: null,
    lastCard: null,
    cardSeq: 0,
    winner: null,
    log: [],
    logSeq: 0,
    bank: { houses: b.rules.housesLimit, hotels: b.rules.hotelsLimit },
  };
  for (const p of room.players) {
    p.money = b.rules.startMoney;
    p.position = 0;
    p.inJail = false;
    p.jailTurns = 0;
    p.jailCards = 0;
    p.bankrupt = false;
  }
  room.decks = { chance: shuffle([...b.chance]), chest: shuffle([...b.chest]) };
  room.discards = { chance: [], chest: [] };
  room.rentOverride = null;
  log(room.state, `Игра началась! Первым ходит ${room.players[0].name}.`);
}

// ---------- Доступ из движка ----------

function st(room: GameRoom): GameState {
  if (room.state.phase === 'lobby') throw new GameError('Игра ещё не началась');
  return room.state;
}

function tileOf(room: GameRoom, idx: number): Tile {
  return room.board.tiles[idx];
}

function propsOf(room: GameRoom, idx: number): PropertyState {
  return room.state.properties[idx];
}

const PURCHASABLE = new Set(['street', 'railroad', 'utility']);
const isPurchasable = (t: Tile) => PURCHASABLE.has(t.type);

function nameOf(room: GameRoom, id: string): string {
  return room.players.find((p) => p.id === id)?.name ?? '???';
}

function priceOf(tile: Tile): number {
  return tile.type === 'street' || tile.type === 'railroad' || tile.type === 'utility' ? tile.price : 0;
}

function groupIndices(room: GameRoom, group: string): number[] {
  return room.board.tiles.map((t, i) => (t.type === 'street' && t.group === group ? i : -1)).filter((i) => i >= 0);
}

function groupHouses(room: GameRoom, group: string): number[] {
  return groupIndices(room, group).map((i) => propsOf(room, i).houses);
}

function ownsGroup(room: GameRoom, ownerId: string, group: string): boolean {
  return groupIndices(room, group).every((i) => propsOf(room, i).owner === ownerId);
}

function isCurrent(room: GameRoom, p: Player): boolean {
  return room.state.turnPlayer === p.id;
}

function cur(room: GameRoom): Player {
  const s = st(room);
  const p = room.players.find((x) => x.id === s.turnPlayer);
  if (!p) throw new GameError('Нет текущего игрока');
  return p;
}

// ---------- Ходы и разрешение последствий ----------

function finishResolution(room: GameRoom): void {
  const s = room.state;
  if (s.phase === 'debt' || s.phase === 'over' || s.phase === 'lobby') return;
  const p = cur(room);
  if (p.inJail) {
    s.phase = 'manage';
    return;
  }
  s.phase = s.pendingExtraRoll ? 'roll' : 'manage';
}

function sendToJail(room: GameRoom, p: Player): void {
  p.position = 10;
  p.inJail = true;
  p.jailTurns = 0;
  const s = room.state;
  s.pendingExtraRoll = false;
  s.doublesCount = 0;
  log(s, `🚔 ${p.name} отправляется в тюрьму!`);
}

function giveGoSalary(room: GameRoom, p: Player): void {
  p.money += room.board.rules.goSalary;
  log(room.state, `${p.name} проходит СТАРТ и получает ${fmtMoney(room, room.board.rules.goSalary)}`);
}

// Бросок кубиками: пройти N шагов вперёд и разрешить клетку.
function moveAndResolve(room: GameRoom, p: Player, steps: number): void {
  const old = p.position;
  p.position = (((old + steps) % 40) + 40) % 40;
  if (steps > 0 && p.position < old) giveGoSalary(room, p);
  resolveTile(room, p, 0);
}

// Переход на конкретное поле (карточки «переходите на ...»): всегда вперёд.
function advanceTo(room: GameRoom, p: Player, idx: number): void {
  const old = p.position;
  p.position = idx;
  if (idx < old) giveGoSalary(room, p);
  resolveTile(room, p, 0);
}

function nextOfType(room: GameRoom, from: number, type: 'railroad' | 'utility'): number | null {
  for (let k = 1; k <= 40; k++) {
    const idx = (from + k) % 40;
    if (room.board.tiles[idx].type === type) return idx;
  }
  return null;
}

function resolveTile(room: GameRoom, p: Player, depth: number): void {
  const s = room.state;
  const tile = tileOf(room, p.position);
  switch (tile.type) {
    case 'street':
    case 'railroad':
    case 'utility': {
      const ps = propsOf(room, p.position);
      if (!ps.owner) {
        if (p.money < priceOf(tile)) {
          log(s, `${p.name} попал(а) на «${tile.name}», но не может позволить себе покупку за ${fmtMoney(room, priceOf(tile))}`);
          finishResolution(room);
          return;
        }
        s.phase = 'buy';
        log(s, `${p.name} попал(а) на «${tile.name}» — можно купить за ${fmtMoney(room, priceOf(tile))}`);
        return;
      }
      if (ps.owner === p.id) {
        log(s, `${p.name} на своей собственности «${tile.name}»`);
        finishResolution(room);
        return;
      }
      if (ps.mortgaged) {
        log(s, `«${tile.name}» заложена — рента не платится`);
        finishResolution(room);
        return;
      }
      const rent = calcRent(room, p.position);
      log(s, `${p.name} платит ренту ${fmtMoney(room, rent)} игроку ${nameOf(room, ps.owner)}`);
      const r = payTo(room, p, ps.owner, rent, 'rent');
      if (r === 'paid') finishResolution(room);
      return;
    }
    case 'chance':
      drawCard(room, p, 'chance', depth);
      return;
    case 'chest':
      drawCard(room, p, 'chest', depth);
      return;
    case 'tax': {
      log(s, `${p.name} платит налог «${tile.name}»: ${fmtMoney(room, tile.amount)}`);
      const r = payBank(room, p, tile.amount, 'tax');
      if (r === 'paid') finishResolution(room);
      return;
    }
    case 'go-to-jail':
      sendToJail(room, p);
      s.phase = 'manage';
      return;
    default:
      if (tile.type === 'go' && p.position === 0) log(s, `${p.name} точно на СТАРТЕ`);
      finishResolution(room);
  }
}

function calcRent(room: GameRoom, idx: number): number {
  const tile = tileOf(room, idx);
  const ps = propsOf(room, idx);
  const owner = room.players.find((x) => x.id === ps.owner);
  const override = room.rentOverride;
  room.rentOverride = null;
  if (!owner) return 0;

  if (tile.type === 'street') {
    if (ps.houses > 0) return tile.rent[Math.min(ps.houses, 5)];
    const monopoly = ownsGroup(room, owner.id, tile.group);
    return tile.rent[0] * (monopoly ? 2 : 1);
  }
  if (tile.type === 'railroad') {
    const owned = room.board.tiles
      .map((t, i) => (t.type === 'railroad' ? i : -1))
      .filter((i) => i >= 0 && propsOf(room, i).owner === owner.id && !propsOf(room, i).mortgaged);
    const base = tile.rent[Math.max(0, Math.min(owned.length, 4) - 1)];
    return override?.kind === 'railroad' ? base * 2 : base;
  }
  if (tile.type === 'utility') {
    const owned = room.board.tiles
      .map((t, i) => (t.type === 'utility' ? i : -1))
      .filter((i) => i >= 0 && propsOf(room, i).owner === owner.id && !propsOf(room, i).mortgaged);
    const mult = override?.kind === 'utility' ? 10 : tile.rentMultiplier[Math.max(0, Math.min(owned.length, 2) - 1)];
    const diceSum = (room.state.dice?.[0] ?? 3) + (room.state.dice?.[1] ?? 4);
    return diceSum * mult;
  }
  return 0;
}

// ---------- Платежи и долги ----------

function enterDebt(room: GameRoom, p: Player, amount: number, creditor: string | 'bank', reason: string, recipients?: string[]): void {
  const s = room.state;
  s.debt = { player: p.id, amount, creditor, reason, recipients };
  s.phase = 'debt';
  log(s, `⚠ ${p.name} должен ${fmtMoney(room, amount)} — распродавайте имущество или объявляйте банкротство`);
}

function payBank(room: GameRoom, p: Player, amount: number, reason: string): 'paid' | 'debt' {
  if (p.money >= amount) {
    p.money -= amount;
    return 'paid';
  }
  enterDebt(room, p, amount, 'bank', reason);
  return 'debt';
}

function payTo(room: GameRoom, p: Player, creditorId: string, amount: number, reason: string): 'paid' | 'debt' {
  if (p.money >= amount) {
    p.money -= amount;
    const c = room.players.find((x) => x.id === creditorId);
    if (c) c.money += amount;
    return 'paid';
  }
  enterDebt(room, p, amount, creditorId, reason);
  return 'debt';
}

// Погашение долга другого игрока перед игроком p (карточка «получите с каждого»):
// при нехватке денег — авто-распродажа, иначе банкротство в пользу p.
function settleFromOther(room: GameRoom, q: Player, beneficiary: Player, amount: number): void {
  if (q.bankrupt || q.id === beneficiary.id) return;
  if (q.money < amount) liquidate(room, q);
  const paid = Math.min(q.money, amount);
  q.money -= paid;
  beneficiary.money += paid;
  if (paid < amount) {
    log(room.state, `${q.name} не смог выплатить полностью`);
    doBankrupt(room, q, beneficiary.id);
  }
}

// Принудительная распродажа: все дома по полцены, затем залог всей собственности.
export function liquidate(room: GameRoom, p: Player): void {
  let raised = 0;
  for (let i = 0; i < room.board.tiles.length; i++) {
    const tile = tileOf(room, i);
    const ps = propsOf(room, i);
    if (ps.owner !== p.id || ps.houses === 0) continue;
    if (tile.type === 'street') {
      raised += ps.houses * tile.houseCost * 0.5;
      ps.houses = 0;
    }
  }
  for (let i = 0; i < room.board.tiles.length; i++) {
    const tile = tileOf(room, i);
    const ps = propsOf(room, i);
    if (ps.owner !== p.id || ps.mortgaged || !isPurchasable(tile)) continue;
    ps.mortgaged = true;
    raised += priceOf(tile) * 0.5;
  }
  p.money += Math.round(raised);
  log(room.state, `${p.name} распродаёт имущество (получено ${fmtMoney(room, Math.round(raised))})`);
}

export function doBankrupt(room: GameRoom, p: Player, creditor: string | 'bank'): void {
  const s = room.state;
  p.bankrupt = true;
  // Дома продаются банку по полцены — выручка идёт в общую массу.
  let houseMoney = 0;
  for (let i = 0; i < room.board.tiles.length; i++) {
    const tile = tileOf(room, i);
    const ps = propsOf(room, i);
    if (ps.owner !== p.id || ps.houses === 0) continue;
    if (tile.type === 'street') houseMoney += ps.houses * tile.houseCost * 0.5;
    ps.houses = 0;
  }
  p.money += Math.round(houseMoney);

  if (creditor === 'bank') {
    for (let i = 0; i < room.board.tiles.length; i++) {
      const ps = propsOf(room, i);
      if (ps.owner === p.id) Object.assign(ps, { owner: null, mortgaged: false, houses: 0 });
    }
    log(s, `💥 ${p.name} обанкротился! Собственность возвращается банку`);
  } else {
    const c = room.players.find((x) => x.id === creditor);
    if (c) {
      c.money += p.money;
      c.jailCards += p.jailCards;
    }
    p.money = 0;
    p.jailCards = 0;
    for (let i = 0; i < room.board.tiles.length; i++) {
      const ps = propsOf(room, i);
      if (ps.owner === p.id) ps.owner = creditor;
    }
    log(s, `💥 ${p.name} обанкротился! Всё имущество переходит к ${nameOf(room, creditor)}`);
  }
  checkWin(room);
}

function checkWin(room: GameRoom): void {
  const actives = room.players.filter((p) => !p.bankrupt);
  if (actives.length <= 1) {
    room.state.phase = 'over';
    room.state.winner = actives[0]?.id ?? null;
    room.state.debt = null;
    log(room.state, actives[0] ? `🏆 ${actives[0].name} победил(а)!` : 'Игра окончена');
  }
}

function advanceTurn(room: GameRoom): void {
  const s = room.state;
  s.doublesCount = 0;
  s.pendingExtraRoll = false;
  const order = room.players;
  const curIdx = order.findIndex((p) => p.id === s.turnPlayer);
  for (let k = 1; k <= order.length; k++) {
    const next = order[(curIdx + k) % order.length];
    if (!next.bankrupt) {
      s.turnPlayer = next.id;
      break;
    }
  }
  s.turnNumber++;
  s.phase = 'roll';
}

// ---------- Карточки ----------

function drawCard(room: GameRoom, p: Player, deckName: 'chance' | 'chest', depth: number): void {
  const s = room.state;
  if (!room.decks) return;
  if (room.decks[deckName].length === 0) {
    room.decks[deckName] = shuffle(room.discards[deckName]);
    room.discards[deckName] = [];
  }
  const card = room.decks[deckName].shift()!;
  s.lastCard = { seq: ++s.cardSeq, deck: deckName, text: card.text, drawer: p.id };
  log(s, `🎴 ${p.name} тянет карту «${deckName === 'chance' ? 'Шанс' : 'Казна'}»: ${card.text}`);
  applyCardEffect(room, p, card.effect, depth);
  if (card.effect.type !== 'getOutOfJail') room.discards[deckName].push(card);
}

function applyCardEffect(room: GameRoom, p: Player, effect: CardEffect, depth: number): void {
  const s = room.state;
  switch (effect.type) {
    case 'money': {
      if (effect.amount >= 0) {
        p.money += effect.amount;
        log(s, `${p.name} получает ${fmtMoney(room, effect.amount)}`);
        finishResolution(room);
      } else {
        const r = payBank(room, p, -effect.amount, 'card');
        if (r === 'paid') finishResolution(room);
      }
      return;
    }
    case 'moneyFromEach': {
      const me = p;
      for (const q of room.players) settleFromOther(room, q, me, effect.amount);
      log(s, `${p.name} собирает по ${fmtMoney(room, effect.amount)} с каждого игрока`);
      finishResolution(room);
      return;
    }
    case 'moneyToEach': {
      const recipients = room.players.filter((q) => q.id !== p.id && !q.bankrupt);
      const total = effect.amount * recipients.length;
      if (p.money < total) liquidate(room, p);
      if (p.money >= total) {
        for (const q of recipients) {
          p.money -= effect.amount;
          q.money += effect.amount;
        }
        log(s, `${p.name} платит по ${fmtMoney(room, effect.amount)} каждому игроку`);
        finishResolution(room);
      } else {
        enterDebt(room, p, effect.amount, 'bank', 'card-toEach', recipients.map((q) => q.id));
      }
      return;
    }
    case 'moveTo': {
      if (depth >= 2) {
        finishResolution(room);
        return;
      }
      const idx = typeof effect.tile === 'number' ? effect.tile : findTileByName(room, effect.tile);
      if (idx == null) {
        log(s, `Карта ссылается на неизвестное поле «${String(effect.tile)}» — эффект пропущен`);
        finishResolution(room);
        return;
      }
      advanceTo(room, p, idx);
      return;
    }
    case 'moveBy': {
      if (depth >= 2) {
        finishResolution(room);
        return;
      }
      moveAndResolve(room, p, effect.steps);
      return;
    }
    case 'goToJail':
      sendToJail(room, p);
      s.phase = 'manage';
      return;
    case 'getOutOfJail':
      p.jailCards++;
      log(s, `${p.name} получает карту «Освобождение из тюрьмы»`);
      finishResolution(room);
      return;
    case 'nearestRailroad': {
      if (depth >= 2) {
        finishResolution(room);
        return;
      }
      const idx = nextOfType(room, p.position, 'railroad');
      if (idx == null) {
        finishResolution(room);
        return;
      }
      room.rentOverride = { kind: 'railroad' };
      advanceTo(room, p, idx);
      return;
    }
    case 'nearestUtility': {
      if (depth >= 2) {
        finishResolution(room);
        return;
      }
      const idx = nextOfType(room, p.position, 'utility');
      if (idx == null) {
        finishResolution(room);
        return;
      }
      room.rentOverride = { kind: 'utility' };
      advanceTo(room, p, idx);
      return;
    }
    case 'repairs': {
      let total = 0;
      for (let i = 0; i < room.board.tiles.length; i++) {
        const tile = tileOf(room, i);
        const ps = propsOf(room, i);
        if (ps.owner !== p.id || tile.type !== 'street') continue;
        total += ps.houses >= 5 ? effect.perHotel : ps.houses * effect.perHouse;
      }
      if (total > 0) {
        log(s, `${p.name} платит за ремонт: ${fmtMoney(room, total)}`);
        const r = payBank(room, p, total, 'card');
        if (r === 'paid') finishResolution(room);
      } else {
        log(s, `У ${p.name} нет строений — ремонт не требуется`);
        finishResolution(room);
      }
      return;
    }
  }
}

function findTileByName(room: GameRoom, name: string): number | null {
  const target = name.trim().toLowerCase();
  const idx = room.board.tiles.findIndex((t) => t.name.trim().toLowerCase() === target);
  return idx >= 0 ? idx : null;
}

// ---------- Действия игроков ----------

export function applyAction(room: GameRoom, p: Player, action: GameAction): void {
  room.lastActivity = Date.now();
  const s = room.state;

  switch (action.type) {
    case 'startGame': {
      if (!p.isHost) throw new GameError('Только хост может начать игру');
      if (room.players.length < 2) throw new GameError('Нужно минимум 2 игрока');
      if (s.phase !== 'lobby' && s.phase !== 'over') throw new GameError('Игра уже идёт');
      startGame(room);
      return;
    }
    case 'roll': {
      if (!isCurrent(room, p)) throw new GameError('Сейчас не ваш ход');
      if (s.phase !== 'roll') throw new GameError('Сейчас нельзя бросать кубики');
      const d1 = d6();
      const d2 = d6();
      s.dice = [d1, d2];
      s.rollId++;
      const sum = d1 + d2;
      log(s, `🎲 ${p.name} бросает: ${d1} + ${d2} = ${sum}`);

      if (p.inJail) {
        if (d1 === d2) {
          log(s, `${p.name} выбрасывает дубль и выходит из тюрьмы!`);
          p.inJail = false;
          p.jailTurns = 0;
          moveAndResolve(room, p, sum);
        } else {
          p.jailTurns++;
          if (p.jailTurns >= 3) {
            log(s, `${p.name} третья неудача — платит залог ${fmtMoney(room, room.board.rules.jailFine)} и идёт по сумме броска`);
            p.inJail = false;
            const r = payBank(room, p, room.board.rules.jailFine, 'jail-fine');
            if (r === 'paid') moveAndResolve(room, p, sum);
          } else {
            log(s, `${p.name} не выбрасывает дубль — остаётся в тюрьме (${p.jailTurns}/3)`);
            s.phase = 'manage';
          }
        }
        return;
      }

      if (d1 === d2) {
        s.doublesCount++;
        if (s.doublesCount >= 3) {
          log(s, `Третий дубль подряд — за мошенничество ${p.name} идёт в тюрьму!`);
          sendToJail(room, p);
          s.phase = 'manage';
        } else {
          s.pendingExtraRoll = true;
          log(s, `Дубль! ${p.name} ходит ещё раз`);
          moveAndResolve(room, p, sum);
        }
      } else {
        s.doublesCount = 0;
        s.pendingExtraRoll = false;
        moveAndResolve(room, p, sum);
      }
      return;
    }
    case 'buy': {
      if (!isCurrent(room, p)) throw new GameError('Сейчас не ваш ход');
      if (s.phase !== 'buy') throw new GameError('Сейчас нельзя покупать');
      const tile = tileOf(room, p.position);
      const ps = propsOf(room, p.position);
      const price = priceOf(tile);
      if (ps.owner || !isPurchasable(tile)) throw new GameError('Это поле нельзя купить');
      if (p.money < price) throw new GameError('Не хватает денег');
      p.money -= price;
      ps.owner = p.id;
      log(s, `🏷 ${p.name} покупает «${tile.name}» за ${fmtMoney(room, price)}`);
      s.phase = 'manage';
      finishResolution(room);
      return;
    }
    case 'decline': {
      if (!isCurrent(room, p)) throw new GameError('Сейчас не ваш ход');
      if (s.phase !== 'buy') throw new GameError('Нет предложения о покупке');
      log(s, `${p.name} отказывается от покупки «${tileOf(room, p.position).name}»`);
      s.phase = 'manage';
      finishResolution(room);
      return;
    }
    case 'endTurn': {
      if (!isCurrent(room, p)) throw new GameError('Сейчас не ваш ход');
      if (s.phase !== 'manage') throw new GameError('Сейчас нельзя закончить ход');
      advanceTurn(room);
      return;
    }
    case 'payJailFine': {
      if (!isCurrent(room, p)) throw new GameError('Сейчас не ваш ход');
      if (s.phase !== 'roll') throw new GameError('Сейчас нельзя платить залог');
      if (!p.inJail) throw new GameError('Вы не в тюрьме');
      if (p.money < room.board.rules.jailFine) throw new GameError('Не хватает денег на залог');
      p.money -= room.board.rules.jailFine;
      p.inJail = false;
      p.jailTurns = 0;
      log(s, `${p.name} платит залог ${fmtMoney(room, room.board.rules.jailFine)} и выходит из тюрьмы`);
      return;
    }
    case 'useJailCard': {
      if (!isCurrent(room, p)) throw new GameError('Сейчас не ваш ход');
      if (s.phase !== 'roll') throw new GameError('Сейчас нельзя использовать карту');
      if (!p.inJail) throw new GameError('Вы не в тюрьме');
      if (p.jailCards <= 0) throw new GameError('У вас нет карты «Освобождение из тюрьмы»');
      p.jailCards--;
      p.inJail = false;
      p.jailTurns = 0;
      log(s, `${p.name} использует карту «Освобождение из тюрьмы»`);
      return;
    }
    case 'build':
      doBuild(room, p, action.tile);
      return;
    case 'sellHouse':
      doSellHouse(room, p, action.tile);
      return;
    case 'mortgage':
      doMortgage(room, p, action.tile);
      return;
    case 'unmortgage':
      doUnmortgage(room, p, action.tile);
      return;
    case 'payDebt': {
      if (!isCurrent(room, p)) throw new GameError('Сейчас не ваш ход');
      if (s.phase !== 'debt' || !s.debt || s.debt.player !== p.id) throw new GameError('Нет активного долга');
      const debt = s.debt;
      const total = debt.recipients ? debt.amount * debt.recipients.length : debt.amount;
      if (p.money < total) throw new GameError(`Нужно ещё ${fmtMoney(room, total - p.money)} — продайте дома или заложите собственность`);
      p.money -= total;
      if (debt.recipients) {
        for (const rid of debt.recipients) {
          const q = room.players.find((x) => x.id === rid);
          if (q && !q.bankrupt) q.money += debt.amount;
        }
      } else if (debt.creditor !== 'bank') {
        const c = room.players.find((x) => x.id === debt.creditor);
        if (c) c.money += debt.amount;
      }
      log(s, `${p.name} выплачивает долг ${fmtMoney(room, total)}`);
      s.debt = null;
      if (debt.reason === 'jail-fine') moveAndResolve(room, p, (s.dice?.[0] ?? 1) + (s.dice?.[1] ?? 1));
      else finishResolution(room);
      return;
    }
    case 'declareBankrupt': {
      if (!isCurrent(room, p)) throw new GameError('Сейчас не ваш ход');
      if (s.phase !== 'debt' || !s.debt || s.debt.player !== p.id) throw new GameError('Нет активного долга');
      const creditor = s.debt.creditor;
      s.debt = null;
      doBankrupt(room, p, creditor);
      if (s.phase !== 'over') advanceTurn(room);
      return;
    }
  }
}

function requireOwnership(room: GameRoom, p: Player, idx: number): { tile: Tile; ps: PropertyState } {
  const tile = tileOf(room, idx);
  const ps = propsOf(room, idx);
  if (!ps || ps.owner !== p.id) throw new GameError('Это не ваша собственность');
  return { tile, ps };
}

function requireActivePhase(room: GameRoom, ...phases: string[]): void {
  if (!phases.includes(room.state.phase)) throw new GameError('Сейчас это недоступно');
}

function doBuild(room: GameRoom, p: Player, idx: number): void {
  requireActivePhase(room, 'roll', 'manage');
  if (!isCurrent(room, p)) throw new GameError('Строить можно только в свой ход');
  const { tile, ps } = requireOwnership(room, p, idx);
  if (tile.type !== 'street') throw new GameError('Строить можно только на улицах');
  if (!ownsGroup(room, p.id, tile.group)) throw new GameError('Сначала соберите всю цветовую группу');
  if (groupIndices(room, tile.group).some((i) => propsOf(room, i).mortgaged)) {
    throw new GameError('В группе есть заложенная собственность');
  }
  const houses = groupHouses(room, tile.group);
  const min = Math.min(...houses);
  if (ps.houses >= 5) throw new GameError('Здесь уже отель');
  if (ps.houses !== min) throw new GameError('Равномерная застройка: сначала достройте другие улицы группы');
  if (p.money < tile.houseCost) throw new GameError('Не хватает денег');
  const bank = room.state.bank;
  if (ps.houses === 4) {
    if (bank.hotels != null && bank.hotels <= 0) throw new GameError('В банке закончились отели');
  } else if (bank.houses != null && bank.houses <= 0) {
    throw new GameError('В банке закончились дома');
  }
  p.money -= tile.houseCost;
  if (ps.houses === 4) {
    ps.houses = 5;
    if (bank.hotels != null) bank.hotels--;
    if (bank.houses != null) bank.houses += 4;
    log(room.state, `🏨 ${p.name} строит отель на «${tile.name}» за ${fmtMoney(room, tile.houseCost)}`);
  } else {
    ps.houses++;
    if (bank.houses != null) bank.houses--;
    log(room.state, `🏠 ${p.name} строит дом на «${tile.name}» за ${fmtMoney(room, tile.houseCost)}`);
  }
}

function doSellHouse(room: GameRoom, p: Player, idx: number): void {
  requireActivePhase(room, 'roll', 'manage', 'debt');
  if (!isCurrent(room, p)) throw new GameError('Продавать можно только в свой ход');
  const { tile, ps } = requireOwnership(room, p, idx);
  if (tile.type !== 'street' || ps.houses <= 0) throw new GameError('Здесь нет домов');
  const houses = groupHouses(room, tile.group);
  if (ps.houses !== Math.max(...houses)) throw new GameError('Равномерная застройка: сначала продавайте дома с самых застроенных улиц');
  const bank = room.state.bank;
  const refund = Math.round(tile.houseCost * 0.5);
  if (ps.houses === 5) {
    ps.houses = 4;
    if (bank.hotels != null) bank.hotels++;
    if (bank.houses != null) bank.houses -= 4;
    log(room.state, `${p.name} продаёт отель на «${tile.name}» за ${fmtMoney(room, refund)}`);
  } else {
    ps.houses--;
    if (bank.houses != null) bank.houses++;
    log(room.state, `${p.name} продаёт дом на «${tile.name}» за ${fmtMoney(room, refund)}`);
  }
  p.money += refund;
}

function doMortgage(room: GameRoom, p: Player, idx: number): void {
  requireActivePhase(room, 'roll', 'manage', 'debt');
  if (!isCurrent(room, p)) throw new GameError('Закладывать можно только в свой ход');
  const { tile, ps } = requireOwnership(room, p, idx);
  if (!isPurchasable(tile)) throw new GameError('Это поле нельзя заложить');
  if (ps.mortgaged) throw new GameError('Уже в залоге');
  if (tile.type === 'street' && groupIndices(room, tile.group).some((i) => propsOf(room, i).houses > 0)) {
    throw new GameError('Сначала продайте все дома в этой группе');
  }
  ps.mortgaged = true;
  const value = Math.round(priceOf(tile) * 0.5);
  p.money += value;
  log(room.state, `🏦 ${p.name} закладывает «${tile.name}» и получает ${fmtMoney(room, value)}`);
}

function doUnmortgage(room: GameRoom, p: Player, idx: number): void {
  requireActivePhase(room, 'roll', 'manage');
  if (!isCurrent(room, p)) throw new GameError('Выкупать можно только в свой ход');
  const { tile, ps } = requireOwnership(room, p, idx);
  if (!ps.mortgaged) throw new GameError('Не в залоге');
  const cost = Math.round(priceOf(tile) * 0.55);
  if (p.money < cost) throw new GameError(`Не хватает денег (нужно ${fmtMoney(room, cost)})`);
  p.money -= cost;
  ps.mortgaged = false;
  log(room.state, `${p.name} выкупает «${tile.name}» из залога за ${fmtMoney(room, cost)}`);
}
