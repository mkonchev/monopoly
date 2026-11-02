import type { GameAction, RoomSnapshot } from '../../../shared/src/types';
import { FIGURES, figureEmoji } from '../../../shared/src/tokens';

interface Props {
  snap: RoomSnapshot;
  isHost: boolean;
  onStart: () => void;
  onLeave: () => void;
  toast: (m: string) => void;
  act: (a: GameAction) => void;
}

export default function Room({ snap, isHost, onStart, onLeave, toast, act }: Props) {
  const link = `${window.location.origin}/?room=${snap.code}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast('Ссылка скопирована — отправьте её друзьям');
    } catch {
      toast(link);
    }
  };

  return (
    <div className="home">
      <div className="home-card">
        <h1>🎩 {snap.board.meta.title}</h1>
        <p className="subtitle">Комната создана. Пригласите друзей!</p>
        <div className="room-code">{snap.code}</div>
        <button className="btn secondary big" onClick={copy}>
          📋 Скопировать ссылку
        </button>
        <h3>Игроки ({snap.players.length}/8)</h3>
        <ul className="lobby-players">
          {snap.players.map((p) => (
            <li key={p.id}>
              <span className="dot" style={{ background: p.color }} />
              <span className="fig">{figureEmoji(p.figure)}</span>
              <span className="lobby-name">
                {p.name}
                {p.isHost && ' 👑'}
                {!p.connected && ' 💤'}
              </span>
              {p.id === snap.you && (
                <span className="figure-picker">
                  {FIGURES.map((f) => {
                    const taken = snap.players.some((q) => q.id !== p.id && q.figure === f.id);
                    return (
                      <button
                        key={f.id}
                        className={'fig-btn' + (p.figure === f.id ? ' on' : '')}
                        disabled={taken && p.figure !== f.id}
                        title={f.name}
                        onClick={() => act({ type: 'setFigure', figure: f.id })}
                      >
                        {f.emoji}
                      </button>
                    );
                  })}
                </span>
              )}
            </li>
          ))}
        </ul>
        <label className={`check-row setting${isHost ? '' : ' disabled'}`}>
          <input
            type="checkbox"
            checked={snap.state.speedDie}
            disabled={!isHost}
            onChange={(e) => act({ type: 'setSpeedDie', enabled: e.target.checked })}
          />
          <span>
            ⚡ <b>Быстрый режим</b> — скоростной кубик: 1–3 к ходу, 🚌 Автобус, 🎩 Мистер Монополия, триплет
          </span>
        </label>
        {isHost ? (
          <button className="btn primary big" disabled={snap.players.length < 2} onClick={onStart}>
            {snap.players.length < 2 ? 'Нужно минимум 2 игрока' : 'Начать игру'}
          </button>
        ) : (
          <p className="hint">Ждём, пока хост начнёт игру…</p>
        )}
        <button className="link-btn" onClick={onLeave}>
          Выйти
        </button>
      </div>
    </div>
  );
}
