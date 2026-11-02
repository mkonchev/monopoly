// Интеграционный прогон: полная партия за 4 игроков через реальные сокеты.
// Упражняет все механики и проверяет инварианты. Запуск: node scripts/playtest.mjs [порт]
import { io } from 'socket.io-client';

const PORT = process.argv[2] || '3001';
const URL = `http://localhost:${PORT}`;
const MAX_ACTIONS = Number(process.argv[3] || 3000);

// ---------- утилиты ----------
const FIG = ['car', 'dog', 'cat', 'hamster'];
const NAMES = ['Анна', 'Максим', 'Борис', 'Вика'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randInt = (min, max) => min + Math.floor(Math.random() * (max - min + 1));

const stats = {
  actions: 0, errors: 0, rolls: 0, doubles: 0, triplets: 0, bus: 0, mrMonopoly: 0,
  buys: 0, declines: 0, builds: 0, mortgages: 0, unmortgages: 0, sells: 0,
  jailTrips: 0, jailFinesPaid: 0, copsTriggers: 0, copsFines: 0,
  casinoVisits: 0, casinoWins: 0, casinoMisses: 0,
  bankLoans: 0, playerLoans: 0, loanRepays: 0, loanExtends: 0, loanDefaults: 0,
  tradesProposed: 0, tradesAccepted: 0, tradesDeclined: 0,
  debts: 0, payDebts: 0, bankruptcies: 0, goSalaries: 0,
  violations: [], potMax: 0,
};

function check(cond, msg) {
  if (!cond) stats.violations.push(msg);
}

function countLog(prevSeq, snap, patterns) {
  // возвращает updated seq и инкрементирует счётчики по новым строкам лога
  let seq = prevSeq;
  for (const e of snap.state.log) {
    if (e.id <= seq) continue;
    seq = Math.max(seq, e.id);
    const t = e.text;
    if (t.includes('МЕНТЫ ПРИЕХАЛИ')) stats.copsTriggers++;
    if (t.includes('ментов — штраф')) stats.copsFines++;
    if (t.includes('Казино: выпало')) stats.casinoRollsLogged = (stats.casinoRollsLogged || 0) + 1;
    if (t.includes('забирает') && t.includes('Казино')) stats.casinoWins++;
    if (t.includes('мимо') && t.includes('Казино')) stats.casinoMisses++;
    if (t.includes('в казино!')) stats.casinoVisits++;
    if (t.includes('ТРИПЛЕТ')) stats.triplets++;
    if (t.includes('Автобус!')) stats.bus++;
    if (t.includes('Мистер Монополия ведёт') || t.includes('Мистеру Монополии некуда')) stats.mrMonopoly++;
    if (t.includes('берёт у банка')) stats.bankLoans++;
    if (t.includes('в долг') && t.includes('даёт')) stats.playerLoans++;
    if (t.includes('полностью гасит кредит')) stats.loanRepays++;
    if (t.includes('продлевает кредит')) stats.loanExtends++;
    if (t.includes('совершили обмен')) stats.tradesAccepted++;
    if (t.includes('ждём ответа')) { /* предложение создано */ }
    if (t.includes('проходит СТАРТ')) stats.goSalaries++;
    if (t.includes('обанкротился')) stats.bankruptcies++;
    if (t.includes('в тюрьму!') || t.includes('отправляется в тюрьму')) stats.jailTrips++;
    if (t.includes('платит залог') && t.includes('и выходит из тюрьмы')) stats.jailFinesPaid++;
    if (t.includes('Дубль!')) stats.doubles++;
    if (t.includes('должен') && t.includes('распродавайте')) stats.debts++;
  }
  return seq;
}

// ---------- подключение ----------
const sockets = [];
const snaps = new Array(4).fill(null);
await Promise.all(NAMES.map((name, i) => new Promise((resolve) => {
  const s = io(URL, { transports: ['websocket'] });
  s.on('room', (r) => { snaps[i] = r; });
  s.on('connect', resolve);
  sockets.push(s);
  sockets[i] = s;
})));
const emit = (i, ev, payload) => new Promise((res) => sockets[i].emit(ev, payload, res));

// лобби: комната, фигурки, быстрый режим, старт
const create = await emit(0, 'room:create', { name: NAMES[0] });
if (!create.ok) throw new Error('create: ' + create.error);
const code = create.code;
const tokens = [create.token];
for (let i = 1; i < 4; i++) {
  const j = await emit(i, 'room:join', { code, name: NAMES[i] });
  if (!j.ok) throw new Error('join: ' + j.error);
  tokens.push(j.token);
}
for (let i = 0; i < 4; i++) {
  await emit(i, 'action', { code, token: tokens[i], action: { type: 'setFigure', figure: FIG[i] } });
}
await emit(0, 'action', { code, token: tokens[0], action: { type: 'setSpeedDie', enabled: true } });
const started = await emit(0, 'action', { code, token: tokens[0], action: { type: 'startGame' } });
if (!started.ok) throw new Error('start: ' + started.error);
await sleep(300);

let logSeq = 0;
let snap = () => snaps.find(Boolean);
let lastPot = 0;
const loanTaken = new Set(); // кто уже брал банк-кредит (не чаще 1 раза за игру)
const loanRequested = new Set(); // кто уже просил у игроков

// ожидание изменения состояния (действие применилось)
async function waitChange(prev, timeoutMs = 4000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const s = snap();
    if (!s) { await sleep(15); continue; }
    if (s.state.logSeq !== prev.logSeq || s.state.phase !== prev.phase || s.state.turnNumber !== prev.turnNumber || s.state.rollId !== prev.rollId || s.state.casinoSeq !== prev.casinoSeq) return true;
    await sleep(12);
  }
  return false;
}

async function act(i, action) {
  stats.actions++;
  const before = JSON.parse(JSON.stringify(snap().state));
  const res = await emit(i, 'action', { code, token: tokens[i], action });
  if (!res.ok) {
    // отказ сервера: состояние не изменится — не ждём
    stats.errors++;
    logSeq = countLog(logSeq, snap(), stats);
    return res;
  }
  await waitChange(before);
  logSeq = countLog(logSeq, snap(), stats);
  stats.potMax = Math.max(stats.potMax, snap().state.casinoPot);
  return res;
}

function myTiles(s, id) {
  return s.board.tiles.map((t, i) => ({ t, i, ps: s.state.properties[i] })).filter((x) => x.ps.owner === id);
}

function buildableTile(s, id) {
  const mine = myTiles(s, id).filter((x) => x.t.type === 'street');
  for (const { i, ps } of mine) {
    const group = s.board.tiles[i].group;
    const idxs = s.board.tiles.map((t, k) => (t.type === 'street' && t.group === group ? k : -1)).filter((k) => k >= 0);
    if (!idxs.every((k) => s.state.properties[k].owner === id)) continue;
    if (idxs.some((k) => s.state.properties[k].mortgaged)) continue;
    const houses = idxs.map((k) => s.state.properties[k].houses);
    if (ps.houses >= 5 || ps.houses !== Math.min(...houses)) continue;
    if (s.state.bank.houses != null && ps.houses < 4 && s.state.bank.houses <= 0) continue;
    if (ps.houses === 4 && s.state.bank.hotels != null && s.state.bank.hotels <= 0) continue;
    if (s.players.find((p) => p.id === id).money < s.board.tiles[i].houseCost + 100000) continue;
    return i;
  }
  return null;
}

// ---------- игровой цикл ----------
let winner = null;
let guard = 0;
while (guard++ < MAX_ACTIONS) {
  const s = snap();
  if (!s) { await sleep(30); continue; }
  const st = s.state;
  stats.potMax = Math.max(stats.potMax, st.casinoPot);
  logSeq = countLog(logSeq, s, stats);

  // инварианты
  for (const p of s.players) check(p.money >= 0, `отрицательные деньги у ${p.name}`);
  for (const [i, ps] of Object.entries(st.properties)) {
    if (ps.owner) {
      const owner = s.players.find((p) => p.id === ps.owner);
      check(!!owner && !owner.bankrupt, `владелец клетки ${i} мёртв: ${ps.owner}`);
    }
  }
  for (const p of s.players) if (p.bankrupt) check(myTiles(s, p.id).length === 0, `банкрот ${p.name} владеет имуществом`);
  if (st.phase === 'debt') check(!!st.debt, 'фаза debt без долга');
  if (st.debt) check(st.phase === 'debt', 'долг вне фазы debt');

  if (st.phase === 'over') { winner = s.players.find((p) => p.id === st.winner)?.name ?? '—'; break; }

  // ответ на предложение — получателем, немедленно
  if (st.awaitingOffer) {
    const a = st.awaitingOffer;
    const toIdx = s.players.findIndex((p) => p.id === a.to);
    const fromIdx = s.players.findIndex((p) => p.id === a.from);
    if (a.to === s.state.turnPlayer || true) {
      // отвечать может только получатель; автор может отменить — случайно
      if (a.kind === 'trade') {
        const offer = st.offers.trades.find((t) => t.id === a.id);
        if (offer) {
          // оцениваем предложение: что получаем против что отдаём
          const valueIn = offer.giveMoney + offer.giveTiles.reduce((s2, ti) => s2 + (s.board.tiles[ti].price ?? 0), 0);
          const valueOut = offer.wantMoney + offer.wantTiles.reduce((s2, ti) => s2 + (s.board.tiles[ti].price ?? 0), 0);
          const accept = valueIn >= valueOut * 0.8 || Math.random() < 0.2;
          await act(toIdx, { type: accept ? 'acceptTrade' : 'declineTrade', id: a.id });
          if (accept) stats.tradesAccepted++; else stats.tradesDeclined++;
          continue;
        }
      } else {
        const req = st.offers.loanRequests.find((r) => r.id === a.id);
        if (req) {
          const accept = Math.random() < 0.7;
          await act(toIdx, { type: accept ? 'acceptLoanRequest' : 'declineLoanRequest', id: a.id });
          continue;
        }
      }
    }
  }

  const cur = s.players.find((p) => p.id === st.turnPlayer);
  if (!cur || cur.bankrupt) { await sleep(30); continue; }
  const idx = s.players.findIndex((p) => p.id === cur.id);
  const money = cur.money;

  const roll = async (a) => {
    const r = await act(idx, a);
    if (!r.ok) stats.errors++;
    return r;
  };

  switch (st.phase) {
    case 'roll': {
      if (cur.inJail) {
        if (cur.jailCards > 0) { await act(idx, { type: 'useJailCard' }); continue; }
        if (money >= s.board.rules.jailFine && Math.random() < 0.6) { await act(idx, { type: 'payJailFine' }); continue; }
        await roll({ type: 'roll' }); // пытаемся выйти по дублю (иногда до третьей попытки с залогом)
        continue;
      }
      await roll({ type: 'roll' });
      continue;
    }
    case 'buy': {
      const tile = s.board.tiles[cur.position];
      const price = tile.price ?? 0;
      if (money >= price + 100000) { await act(idx, { type: 'buy' }); stats.buys++; }
      else { await act(idx, { type: 'decline' }); stats.declines++; }
      continue;
    }
    case 'bus': {
      const [d1, d2] = st.dice;
      await act(idx, { type: 'busMove', choice: pick(['sum', 'd1', 'd2']) });
      continue;
    }
    case 'triplet': {
      await act(idx, { type: 'tripletMove', tile: randInt(0, 39) });
      continue;
    }
    case 'casino': {
      const nums = [];
      const k = randInt(1, 3);
      while (nums.length < k) { const n = randInt(1, 6); if (!nums.includes(n)) nums.push(n); }
      await act(idx, { type: 'casinoBet', numbers: nums });
      continue;
    }
    case 'debt': {
      const d = st.debt;
      stats.debts++;
      if (money >= d.amount) {
        const r = await act(idx, { type: 'payDebt' });
        stats.payDebts++;
        check(snap().state.phase !== 'debt', 'payDebt не вывел из фазы debt');
        continue;
      }
      const houseRow = Object.entries(st.properties).find(([i2, ps]) => {
        if (ps.owner !== cur.id || ps.houses === 0) return false;
        const group = s.board.tiles[Number(i2)].group;
        const groupHouses = s.board.tiles
          .map((t, k) => (t.type === 'street' && (t).group === group ? s.state.properties[k].houses : -1))
          .filter((h) => h >= 0);
        return ps.houses === Math.max(...groupHouses); // продаём с самой застроенной
      });
      if (houseRow) { await act(idx, { type: 'sellHouse', tile: Number(houseRow[0]) }); stats.sells++; continue; }
      const mortRow = Object.entries(st.properties).find(([i2, ps]) => ps.owner === cur.id && !ps.mortgaged && ps.houses === 0);
      if (mortRow) { await act(idx, { type: 'mortgage', tile: Number(mortRow[0]) }); stats.mortgages++; continue; }
      await act(idx, { type: 'declareBankrupt' });
      continue;
    }
    case 'manage': {
      // кредит: приоритетно уладить просрочку
      if (cur.loan?.due) {
        if (money >= cur.loan.debt) { await act(idx, { type: 'repayLoan' }); stats.loanRepays++; continue; }
        if (cur.loan.extensions < (s.board.rules.loans?.maxExtensions ?? 2)) { await act(idx, { type: 'extendLoan' }); stats.loanExtends++; continue; }
        await act(idx, { type: 'defaultLoan' }); stats.loanDefaults++; continue;
      }
      if (cur.loan && money >= cur.loan.debt) { await act(idx, { type: 'repayLoan' }); stats.loanRepays++; continue; }
      // банк-кредит при бедности (один раз за игру на игрока)
      if (!cur.loan && money < s.board.rules.startMoney * 0.5 && !loanTaken.has(cur.id)) {
        const max = s.board.rules.loans?.maxPrincipal ?? s.board.rules.startMoney;
        const r = await act(idx, { type: 'takeLoan', amount: Math.min(300000, max) });
        if (r.ok) { loanTaken.add(cur.id); continue; }
      }
      // займ у игрока при бедности (один раз)
      if (!cur.loan && money < s.board.rules.startMoney * 0.35 && !loanRequested.has(cur.id)) {
        const rich = s.players.filter((p) => !p.bankrupt && p.id !== cur.id && p.money > 300000);
        if (rich.length) {
          const r = await act(idx, { type: 'requestLoanFrom', to: pick(rich).id, amount: 200000 });
          if (r.ok) { loanRequested.add(cur.id); continue; }
        }
      }
      // целевой обмен: добираем группу своими деньгами (×2 цены) — responder согласится
      if (Math.random() < 0.5) {
        const partner = s.players.find((p) => !p.bankrupt && p.id !== cur.id);
        if (partner) {
          const theirs = myTiles(s, partner.id).filter((x) => x.t.type === 'street' && x.ps.houses === 0 && !x.ps.mortgaged);
          for (const th of theirs) {
            const group = th.t.group;
            const idxs = s.board.tiles.map((t, k) => (t.type === 'street' && t.group === group ? k : -1)).filter((k) => k >= 0);
            const mineInGroup = idxs.filter((k) => s.state.properties[k].owner === cur.id).length;
            if (mineInGroup === idxs.length - 1 && money >= th.t.price * 2) {
              const r = await act(idx, {
                type: 'proposeTrade', to: partner.id,
                giveTiles: [], giveMoney: th.t.price * 2, wantTiles: [th.i], wantMoney: 0,
              });
              if (r.ok) { stats.tradesProposed++; continue; }
            }
          }
        }
      }
      // случайный обмен-разведка
      if (Math.random() < 0.03) {
        const mine = myTiles(s, cur.id).filter((x) => x.t.type !== 'street' || x.ps.houses === 0);
        const others = s.players.filter((p) => !p.bankrupt && p.id !== cur.id);
        const partner = others.find((p) => myTiles(s, p.id).some((x) => x.t.type !== 'street' || x.ps.houses === 0));
        if (mine.length && partner) {
          const give = pick(mine);
          const theirs = myTiles(s, partner.id).filter((x) => x.t.type !== 'street' || x.ps.houses === 0);
          const want = pick(theirs);
          const r = await act(idx, {
            type: 'proposeTrade', to: partner.id,
            giveTiles: [give.i], giveMoney: 0, wantTiles: [want.i], wantMoney: 0,
          });
          if (r.ok) { stats.tradesProposed++; continue; }
        }
      }
      // стройка: до 3 построек за ход
      for (let b = 0; b < 3; b++) {
        const bt = buildableTile(s, cur.id);
        if (bt === null) break;
        await act(idx, { type: 'build', tile: bt });
        stats.builds++;
      }
      if (snap().state.phase === 'debt') continue; // стройка загнала в долг — разрулим там
      // выкуп из залога при богатстве
      const mort = myTiles(s, cur.id).find((x) => x.ps.mortgaged && money > (x.t.price ?? 0));
      if (mort && Math.random() < 0.4) { await act(idx, { type: 'unmortgage', tile: mort.i }); stats.unmortgages++; continue; }
      await act(idx, { type: 'endTurn' });
      continue;
    }
    default:
      // buy-фаза другого рода, bus/triplet/casino уже обработаны; на всякий — ждём
      await sleep(40);
  }
}

const s = snap();
const report = {
  code, winner, phase: s?.state?.phase, turns: s?.state?.turnNumber, actions: stats.actions,
  pot: s?.state?.casinoPot, potMax: stats.potMax,
  players: s?.players.map((p) => ({ name: p.name, figure: p.figure, money: p.money, bankrupt: p.bankrupt, pos: p.position, loan: p.loan?.debt ?? null })),
  stats,
  violations: stats.violations.slice(0, 20),
  logTail: s?.state.log.slice(-12).map((l) => l.text),
};
console.log('=== REPORT ===');
console.log(JSON.stringify(report, null, 1));
sockets.forEach((s2) => s2.close());
process.exit(0);
