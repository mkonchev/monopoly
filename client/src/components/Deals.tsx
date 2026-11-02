import { useState } from 'react';
import type { GameAction, RoomSnapshot } from '../../../shared/src/types';
import { fmtMoney } from '../fmt';

interface Props {
  snap: RoomSnapshot;
  act: (a: GameAction) => void;
}

type ModalKind = null | 'bank-loan' | 'player-loan' | 'trade';

export function loanCfgOf(snap: RoomSnapshot) {
  return (
    snap.board.rules.loans ?? {
      bankRate: 0.1,
      playerRate: 0.05,
      termTurns: 10,
      extendRateFactor: 1.5,
      maxExtensions: 2,
      maxPrincipal: snap.board.rules.startMoney,
      rescueSharePercent: 50,
    }
  );
}

export default function Deals({ snap, act }: Props) {
  const [modal, setModal] = useState<ModalKind>(null);
  const me = snap.players.find((p) => p.id === snap.you);
  if (!me || me.bankrupt || snap.state.phase === 'over') return null;
  const cur = snap.board.meta.currency;
  const myTurn = snap.you === snap.state.turnPlayer;
  const turnHint = !myTurn && <div className="hint">⏳ Кредиты, обмены и спасение — только в свой ход</div>;

  const nameOf = (id: string) => snap.players.find((p) => p.id === id)?.name ?? '???';
  const incomingTrades = snap.state.offers.trades.filter((t) => t.to === me.id);
  const incomingLoans = snap.state.offers.loanRequests.filter((r) => r.to === me.id);
  const outgoingTrades = snap.state.offers.trades.filter((t) => t.from === me.id);
  const outgoingLoans = snap.state.offers.loanRequests.filter((r) => r.from === me.id);
  const rescueable = snap.players.filter((p) => p.loan?.due && !p.bankrupt && p.id !== me.id);

  return (
    <section className="panel deals-panel">
      <h3>Кредиты и обмен</h3>

      {me.loan ? (
        <LoanBlock snap={snap} act={act} myTurn={myTurn} />
      ) : (
        <div className="btn-row">
          <button className="btn secondary" disabled={!myTurn} onClick={() => setModal('bank-loan')}>
            🏦 Кредит в банке
          </button>
          <button className="btn secondary" disabled={!myTurn} onClick={() => setModal('player-loan')}>
            🤝 Занять у игрока
          </button>
        </div>
      )}

      {(incomingTrades.length > 0 || incomingLoans.length > 0) && (
        <div className="offer-block">
          <div className="offer-title">Входящие предложения</div>
          {turnHint}
          {incomingLoans.map((r) => (
            <div key={r.id} className="offer-row">
              <span>
                🤲 <b>{nameOf(r.from)}</b> просит в долг {fmtMoney(r.amount, cur)}
              </span>
              <span className="offer-actions">
                <button className="mini-btn" disabled={!myTurn} onClick={() => act({ type: 'acceptLoanRequest', id: r.id })}>
                  Дать
                </button>
                <button className="mini-btn" disabled={!myTurn} onClick={() => act({ type: 'declineLoanRequest', id: r.id })}>
                  Отказать
                </button>
              </span>
            </div>
          ))}
          {incomingTrades.map((t) => (
            <div key={t.id} className="offer-row">
              <span>
                🔄 <b>{nameOf(t.from)}</b> отдаёт: {describeTiles(snap, t.giveTiles)}
                {t.giveMoney > 0 && ` + ${fmtMoney(t.giveMoney, cur)}`} ↔ хочет: {describeTiles(snap, t.wantTiles)}
                {t.wantMoney > 0 && ` + ${fmtMoney(t.wantMoney, cur)}`}
              </span>
              <span className="offer-actions">
                <button className="mini-btn" disabled={!myTurn} onClick={() => act({ type: 'acceptTrade', id: t.id })}>
                  Принять
                </button>
                <button className="mini-btn" disabled={!myTurn} onClick={() => act({ type: 'declineTrade', id: t.id })}>
                  Отказать
                </button>
              </span>
            </div>
          ))}
        </div>
      )}

      {rescueable.length > 0 && (
        <div className="offer-block rescue">
          <div className="offer-title">Просроченные кредиты — можно спасти</div>
          {turnHint}
          {rescueable.map((p) => (
            <div key={p.id} className="offer-row">
              <span>
                🆘 <b>{p.name}</b> должен {fmtMoney(p.loan!.debt, cur)} ({nameOfLoanCreditor(snap, p.loan!.creditor)})
              </span>
              <button
                className="mini-btn"
                disabled={!myTurn || me.money < p.loan!.debt}
                title="Погасить его долг; он будет должен вам, а вы получаете половину ренты с его улиц до выплаты"
                onClick={() => act({ type: 'rescueLoan', target: p.id })}
              >
                Спасти
              </button>
            </div>
          ))}
        </div>
      )}

      {(outgoingTrades.length > 0 || outgoingLoans.length > 0) && (
        <div className="offer-block">
          <div className="offer-title">Ваши исходящие предложения</div>
          {outgoingLoans.map((r) => (
            <div key={r.id} className="offer-row">
              <span>
                🤲 К {nameOf(r.to)}: просите {fmtMoney(r.amount, cur)}
              </span>
              <button className="mini-btn" disabled={!myTurn} onClick={() => act({ type: 'cancelOffer', kind: 'loan', id: r.id })}>
                Отменить
              </button>
            </div>
          ))}
          {outgoingTrades.map((t) => (
            <div key={t.id} className="offer-row">
              <span>
                🔄 К {nameOf(t.to)}: {describeTiles(snap, t.giveTiles)}
                {t.giveMoney > 0 && ` + ${fmtMoney(t.giveMoney, cur)}`} ↔ {describeTiles(snap, t.wantTiles)}
                {t.wantMoney > 0 && ` + ${fmtMoney(t.wantMoney, cur)}`}
              </span>
              <button className="mini-btn" disabled={!myTurn} onClick={() => act({ type: 'cancelOffer', kind: 'trade', id: t.id })}>
                Отменить
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="btn-row">
        <button className="btn secondary" disabled={!myTurn} onClick={() => setModal('trade')}>
          🔄 Предложить обмен
        </button>
      </div>

      {modal === 'bank-loan' && <BankLoanModal snap={snap} act={act} onClose={() => setModal(null)} />}
      {modal === 'player-loan' && <PlayerLoanModal snap={snap} act={act} onClose={() => setModal(null)} />}
      {modal === 'trade' && <TradeModal snap={snap} act={act} onClose={() => setModal(null)} />}
    </section>
  );
}

function nameOfLoanCreditor(snap: RoomSnapshot, creditor: string | 'bank'): string {
  return creditor === 'bank' ? 'банку' : snap.players.find((p) => p.id === creditor)?.name ?? '???';
}

function describeTiles(snap: RoomSnapshot, tiles: number[]): string {
  if (tiles.length === 0) return '—';
  return tiles.map((i) => snap.board.tiles[i]?.name ?? '?').join(', ');
}

function LoanBlock({ snap, act, myTurn }: { snap: RoomSnapshot; act: (a: GameAction) => void; myTurn: boolean }) {
  const me = snap.players.find((p) => p.id === snap.you)!;
  const l = me.loan!;
  const cfg = loanCfgOf(snap);
  const cur = snap.board.meta.currency;
  const left = Math.max(0, l.termTurns - l.turnsServed);
  return (
    <div className={`loan-block${l.due ? ' due' : ''}`}>
      {l.due && (
        <div className="due-warning">
          ⚠ Просрочено! Погасите или продлите в свой ход — иначе в начале вашего следующего хода {nameOfLoanCreditor(snap, l.creditor)} заберёт всё имущество и деньги
        </div>
      )}
      <div>
        Долг: <b>{fmtMoney(l.debt, cur)}</b> · ставка {Math.round(l.rate * 100)}% за ход
        {l.creditor !== 'bank' && ` · кредитор: ${nameOfLoanCreditor(snap, l.creditor)}`}
        {l.rescued && ` · спасён: кредитору идёт ${cfg.rescueSharePercent}% ренты с ваших улиц`}
      </div>
      {!l.due && <div>Осталось ходов: {left}</div>}
      <div className="btn-row">
        <button className="btn primary" disabled={!myTurn || me.money < l.debt} onClick={() => act({ type: 'repayLoan' })}>
          💰 Погасить {fmtMoney(l.debt, cur)}
        </button>
        {l.due && (
          <button
            className="btn secondary"
            disabled={!myTurn || l.extensions >= cfg.maxExtensions}
            title={`Ставка станет ${Math.round(l.rate * cfg.extendRateFactor * 100)}%`}
            onClick={() => act({ type: 'extendLoan' })}
          >
            📈 Продлить ({l.extensions}/{cfg.maxExtensions})
          </button>
        )}
        <button
          className="btn danger"
          disabled={!myTurn}
          onClick={() => { if (window.confirm('Отдать всё имущество и деньги кредитору?')) act({ type: 'defaultLoan' }); }}
        >
          🏳 Сдаться
        </button>
      </div>
    </div>
  );
}

function BankLoanModal({ snap, act, onClose }: { snap: RoomSnapshot; act: (a: GameAction) => void; onClose: () => void }) {
  const cfg = loanCfgOf(snap);
  const cur = snap.board.meta.currency;
  const [amount, setAmount] = useState(Math.min(300000, cfg.maxPrincipal));
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="tile-info-modal" onClick={(e) => e.stopPropagation()}>
        <div className="tile-info-bar" style={{ background: '#5b6470' }} />
        <h2 className="tile-info-title">🏦 Кредит в банке</h2>
        <p className="tile-info-note">
          Ставка {Math.round(cfg.bankRate * 100)}% за ваш ход (долг растёт как снежный ком). Вернуть в течение {cfg.termTurns} своих ходов,
          иначе банк заберёт всё имущество и деньги. Продление: ставка ×{cfg.extendRateFactor}, максимум {cfg.maxExtensions} раз.
        </p>
        <label className="field">
          <span>Сумма (максимум {fmtMoney(cfg.maxPrincipal, cur)})</span>
          <input
            type="number"
            min={1000}
            max={cfg.maxPrincipal}
            step={10000}
            value={amount}
            onChange={(e) => setAmount(Math.min(cfg.maxPrincipal, Math.max(0, Number(e.target.value) || 0)))}
          />
        </label>
        <p className="tile-info-note">
          Долг к концу срока: ~{fmtMoney(Math.round(amount * Math.pow(1 + cfg.bankRate, cfg.termTurns)), cur)}
        </p>
        <div className="btn-row">
          <button className="btn primary" disabled={amount <= 0} onClick={() => { act({ type: 'takeLoan', amount }); onClose(); }}>
            Взять
          </button>
          <button className="btn secondary" onClick={onClose}>
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}

function PlayerLoanModal({ snap, act, onClose }: { snap: RoomSnapshot; act: (a: GameAction) => void; onClose: () => void }) {
  const me = snap.players.find((p) => p.id === snap.you)!;
  const cfg = loanCfgOf(snap);
  const cur = snap.board.meta.currency;
  const candidates = snap.players.filter((p) => p.id !== me.id && !p.bankrupt);
  const [to, setTo] = useState(candidates[0]?.id ?? '');
  const target = candidates.find((p) => p.id === to);
  const max = Math.min(cfg.maxPrincipal, target?.money ?? 0);
  const [amount, setAmount] = useState(Math.min(300000, max));
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="tile-info-modal" onClick={(e) => e.stopPropagation()}>
        <div className="tile-info-bar" style={{ background: '#2e7d32' }} />
        <h2 className="tile-info-title">🤝 Занять у игрока</h2>
        <p className="tile-info-note">
          Ставка {Math.round(cfg.playerRate * 100)}% за ход — ниже банковской. Кредитор должен одобрить займ.
        </p>
        <label className="field">
          <span>У кого занимать</span>
          <select value={to} onChange={(e) => setTo(e.target.value)}>
            {candidates.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — {fmtMoney(p.money, cur)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Сумма (максимум {fmtMoney(max, cur)})</span>
          <input
            type="number"
            min={1000}
            max={max}
            step={10000}
            value={amount}
            onChange={(e) => setAmount(Math.min(max, Math.max(0, Number(e.target.value) || 0)))}
          />
        </label>
        <div className="btn-row">
          <button
            className="btn primary"
            disabled={!to || amount <= 0 || amount > max}
            onClick={() => { act({ type: 'requestLoanFrom', to, amount }); onClose(); }}
          >
            Попросить
          </button>
          <button className="btn secondary" onClick={onClose}>
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}

function TradeModal({ snap, act, onClose }: { snap: RoomSnapshot; act: (a: GameAction) => void; onClose: () => void }) {
  const me = snap.players.find((p) => p.id === snap.you)!;
  const cur = snap.board.meta.currency;
  const candidates = snap.players.filter((p) => p.id !== me.id && !p.bankrupt);
  const [to, setTo] = useState(candidates[0]?.id ?? '');
  const [giveTiles, setGiveTiles] = useState<Set<number>>(new Set());
  const [wantTiles, setWantTiles] = useState<Set<number>>(new Set());
  const [giveMoney, setGiveMoney] = useState(0);
  const [wantMoney, setWantMoney] = useState(0);

  const tradeable = (ownerId: string) =>
    snap.board.tiles
      .map((t, i) => ({ t, i, ps: snap.state.properties[i] }))
      .filter(({ t, ps }) => ps.owner === ownerId && (t.type !== 'street' || ps.houses === 0));

  const mine = tradeable(me.id);
  const theirs = tradeable(to);

  const toggle = (set: Set<number>, idx: number, apply: (s: Set<number>) => void) => {
    const next = new Set(set);
    if (next.has(idx)) next.delete(idx);
    else next.add(idx);
    apply(next);
  };

  const target = candidates.find((p) => p.id === to);
  const canSend = !!target && (giveTiles.size > 0 || giveMoney > 0) && (wantTiles.size > 0 || wantMoney > 0) && me.money >= giveMoney;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="tile-info-modal trade-modal" onClick={(e) => e.stopPropagation()}>
        <div className="tile-info-bar" style={{ background: '#1e88e5' }} />
        <h2 className="tile-info-title">🔄 Обмен с {target?.name ?? '…'}</h2>
        <label className="field">
          <span>С кем меняемся</span>
          <select
            value={to}
            onChange={(e) => { setTo(e.target.value); setWantTiles(new Set()); }}
          >
            {candidates.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <div className="trade-cols">
          <div>
            <h3 className="tile-info-heading">Вы отдаёте</h3>
            <div className="checkbox-list">
              {mine.length === 0 && <div className="hint">Нечего отдавать</div>}
              {mine.map(({ t, i }) => (
                <label key={i} className="check-row">
                  <input type="checkbox" checked={giveTiles.has(i)} onChange={() => toggle(giveTiles, i, setGiveTiles)} />
                  {t.name}
                </label>
              ))}
            </div>
            <label className="field">
              <span>Деньги (у вас {fmtMoney(me.money, cur)})</span>
              <input type="number" min={0} step={10000} value={giveMoney} onChange={(e) => setGiveMoney(Math.max(0, Number(e.target.value) || 0))} />
            </label>
          </div>
          <div>
            <h3 className="tile-info-heading">Вы получаете</h3>
            <div className="checkbox-list">
              {theirs.length === 0 && <div className="hint">У игрока нечего взять</div>}
              {theirs.map(({ t, i }) => (
                <label key={i} className="check-row">
                  <input type="checkbox" checked={wantTiles.has(i)} onChange={() => toggle(wantTiles, i, setWantTiles)} />
                  {t.name}
                </label>
              ))}
            </div>
            <label className="field">
              <span>Деньги с него</span>
              <input type="number" min={0} step={10000} value={wantMoney} onChange={(e) => setWantMoney(Math.max(0, Number(e.target.value) || 0))} />
            </label>
          </div>
        </div>
        <p className="tile-info-note">Улицы с домами обмену не подлежат — сначала продайте постройки. Заложенные поля передаются с залогом.</p>
        <div className="btn-row">
          <button className="btn primary" disabled={!canSend} onClick={() => { act({ type: 'proposeTrade', to, giveTiles: [...giveTiles], giveMoney, wantTiles: [...wantTiles], wantMoney }); onClose(); }}>
            Предложить
          </button>
          <button className="btn secondary" onClick={onClose}>
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}
