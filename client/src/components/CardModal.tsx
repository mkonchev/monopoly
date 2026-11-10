import { useState } from 'react';
import type { RoomSnapshot } from '../../../shared/src/types';

export default function CardModal({ snap }: { snap: RoomSnapshot }) {
  const card = snap.state.lastCard;
  const [dismissed, setDismissed] = useState(0);

  if (!card || card.seq <= dismissed) return null;

  const drawer = snap.players.find((p) => p.id === card.drawer)?.name ?? '???';

  return (
    <div className="modal-overlay" onClick={() => setDismissed(card.seq)}>
      <div className={`card-modal ${card.deck}`} onClick={(e) => e.stopPropagation()}>
        <div className="card-deck-label">{card.deck === 'chance' ? '❓ ШАНС' : '🎁 КАЗНА'}</div>
        {card.image && (
          <img
            className="card-image"
            src={card.image.startsWith('http') ? card.image : '/' + card.image.replace(/^\/+/, '')}
            alt=""
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        )}
        <p className="card-text">{card.text}</p>
        <div className="card-drawer">— {drawer}</div>
        <button className="btn primary" onClick={() => setDismissed(card.seq)}>
          OK
        </button>
      </div>
    </div>
  );
}
