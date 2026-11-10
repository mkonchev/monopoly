import { useRef, useState } from 'react';
import type { RoomSnapshot } from '../../../shared/src/types';

export default function CardModal({ snap }: { snap: RoomSnapshot }) {
  const card = snap.state.lastCard;
  const [dismissed, setDismissed] = useState(0);

  // 3D-наклон карточки за курсором + блик источника света
  const tiltRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ rx: 0, ry: 0, gx: 50, gy: 25 });
  const onTiltMove = (e: React.MouseEvent) => {
    const el = tiltRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const py = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    setTilt({ rx: -(py - 0.5) * 10, ry: (px - 0.5) * 16, gx: px * 100, gy: py * 100 });
  };
  const onTiltLeave = () => setTilt({ rx: 0, ry: 0, gx: 50, gy: 25 });

  if (!card || card.seq <= dismissed) return null;

  const drawer = snap.players.find((p) => p.id === card.drawer)?.name ?? '???';

  return (
    <div className="modal-overlay" onClick={() => setDismissed(card.seq)}>
      <div
        className="card-modal card-tilt"
        ref={tiltRef}
        onMouseMove={onTiltMove}
        onMouseLeave={onTiltLeave}
        onClick={(e) => e.stopPropagation()}
        style={{ transform: `perspective(900px) rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg)` }}
      >
        <div className="card-glare" style={{ background: `radial-gradient(circle at ${tilt.gx}% ${tilt.gy}%, rgba(255,255,255,0.45), rgba(255,255,255,0) 55%)` }} />
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
