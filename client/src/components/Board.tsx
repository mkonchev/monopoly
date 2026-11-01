import type { ReactNode } from 'react';
import type { RoomSnapshot } from '../../../shared/src/types';
import { CORNER_EMOJI, gridPos, sideOf } from '../boardLayout';
import { fmtCompact, fmtMoney } from '../fmt';

export default function Board({ snap, children, onSelectTile }: { snap: RoomSnapshot; children?: ReactNode; onSelectTile?: (idx: number) => void }) {
  return (
    <div className="board">
      {snap.board.tiles.map((tile, i) => (
        <Tile key={i} idx={i} snap={snap} onSelectTile={onSelectTile} />
      ))}
      <div className="board-center">{children}</div>
    </div>
  );
}

function Tile({ idx, snap, onSelectTile }: { idx: number; snap: RoomSnapshot; onSelectTile?: (idx: number) => void }) {
  const tile = snap.board.tiles[idx];
  const ps = snap.state.properties[idx];
  const side = sideOf(idx);
  const owner = ps?.owner ? snap.players.find((p) => p.id === ps.owner) : null;
  const group = tile.type === 'street' ? snap.board.groups[tile.group] : null;
  const pos = gridPos(idx);
  const tokens = snap.players.filter((p) => p.position === idx && !p.bankrupt);

  const price = 'price' in tile ? tile.price : 0;
  const houses = ps?.houses ?? 0;

  return (
    <div
      className={[
        'tile',
        `side-${side}`,
        price > 0 ? 'clickable' : '',
        owner ? 'owned' : '',
        ps?.mortgaged ? 'mortgaged' : '',
        owner?.id === snap.you ? 'mine' : '',
      ].join(' ')}
      onClick={price > 0 && onSelectTile ? () => onSelectTile(idx) : undefined}
      style={{
        gridRow: pos.row,
        gridColumn: pos.col,
        ...(owner ? { boxShadow: `inset 0 0 0 3px ${owner.color}` } : {}),
      }}
      title={
        price > 0
          ? `${tile.name}${owner ? ` — ${owner.name}` : ''}${price ? `, ${fmtMoney(price, snap.board.meta.currency)}` : ''}`
          : tile.name
      }
    >
      {group && (
        <div className="bar" style={{ background: group.color }}>
          {houses === 5 ? (
            <span className="hotel" />
          ) : (
            Array.from({ length: houses }).map((_, k) => <span key={k} className="house" />)
          )}
        </div>
      )}
      {side === 'corner' ? (
        <div className="corner-face">
          <span className="corner-emoji">{CORNER_EMOJI[idx]}</span>
          <span className="tname">{tile.name}</span>
        </div>
      ) : (
        <>
          <div className="tname">{tile.name}</div>
          {price > 0 && <div className="tprice">{fmtCompact(price)}</div>}
        </>
      )}
      {ps?.mortgaged && <span className="mort-badge">🏦</span>}
      {tile.type === 'chance' && <span className="tile-emoji">❓</span>}
      {tile.type === 'chest' && <span className="tile-emoji">🎁</span>}
      {tokens.length > 0 && (
        <div className="tokens">
          {tokens.map((t) => (
            <span key={t.id} className="token" style={{ background: t.color }} title={t.name}>
              {t.name.slice(0, 1)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
