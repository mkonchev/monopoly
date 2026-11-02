import { useState } from 'react';
import type { GameAction, RoomSnapshot } from '../../../shared/src/types';
import { fmtMoney } from '../fmt';

// Казино: ставка на числа (фаза casino) и показ результата прокрутки.
export default function CasinoModal({ snap, act }: { snap: RoomSnapshot; act: (a: GameAction) => void }) {
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [dismissed, setDismissed] = useState(0);
  const { state } = snap;
  const cur = snap.board.meta.currency;
  const betting = state.phase === 'casino' && snap.you === state.turnPlayer;
  const result = state.lastCasinoRoll && state.lastCasinoRoll.seq > dismissed ? state.lastCasinoRoll : null;

  if (!betting && !result) return null;
  const roller = snap.players.find((p) => p.id === (result?.player ?? state.turnPlayer))?.name ?? '???';

  const toggle = (n: number) => {
    const next = new Set(picked);
    if (next.has(n)) next.delete(n);
    else next.add(n);
    setPicked(next);
  };

  return (
    <div className="modal-overlay">
      <div className="tile-info-modal casino-modal" onClick={(e) => e.stopPropagation()}>
        <div className="tile-info-bar" style={{ background: '#7b1fa2' }} />
        {betting ? (
          <>
            <h2 className="tile-info-title">🎰 Казино</h2>
            <p className="tile-info-note">
              Банк: <b>{fmtMoney(state.casinoPot, cur)}</b>. Выбери числа и крути кубик: угадал с одной ставки — забираешь весь банк,
              с двух — половину, с трёх — треть… с шести — гарантированную шестую часть.
            </p>
            <div className="casino-numbers">
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <button key={n} className={'casino-num' + (picked.has(n) ? ' on' : '')} onClick={() => toggle(n)}>
                  {n}
                </button>
              ))}
            </div>
            <div className="btn-row">
              <button
                className="btn primary big"
                disabled={picked.size === 0}
                onClick={() => {
                  act({ type: 'casinoBet', numbers: [...picked] });
                  setPicked(new Set());
                }}
              >
                🎲 Крутить ({picked.size} {picked.size === 1 ? 'число' : 'чисел'})
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 className="tile-info-title">🎰 Казино: выпало {result!.roll}</h2>
            <p className="card-text">
              {result!.payout > 0 ? (
                <>
                  <b>{roller}</b> забирает <b>{fmtMoney(result!.payout, cur)}</b>!
                </>
              ) : (
                <>
                  <b>{roller}</b> мимо — банк остаётся в казино.
                </>
              )}
            </p>
            <div className="btn-row">
              <button className="btn primary" onClick={() => setDismissed(result!.seq)}>
                OK
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
