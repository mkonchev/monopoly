import type { RoomSnapshot } from '../../../shared/src/types';
import { figureEmoji } from '../../../shared/src/tokens';

// Левая колонка: имущество всех игроков. Полная цветовая группа — жирным,
// дома — зелёными домиками, отель — большим жёлтым домом.
export default function AllProperties({ snap, onSelectTile }: { snap: RoomSnapshot; onSelectTile?: (idx: number) => void }) {
  const active = snap.players.filter((p) => !p.bankrupt);
  return (
    <div className="left-col">
      {active.map((p) => (
        <PlayerProps key={p.id} snap={snap} playerId={p.id} onSelectTile={onSelectTile} />
      ))}
    </div>
  );
}

function PlayerProps({
  snap,
  playerId,
  onSelectTile,
}: {
  snap: RoomSnapshot;
  playerId: string;
  onSelectTile?: (idx: number) => void;
}) {
  const p = snap.players.find((x) => x.id === playerId)!;
  const owned = snap.board.tiles
    .map((t, i) => ({ t, i, ps: snap.state.properties[i] }))
    .filter(({ ps }) => ps.owner === playerId);

  const streets = owned.filter(({ t }) => t.type === 'street');
  const groups = new Map<string, typeof streets>();
  for (const s of streets) {
    const list = groups.get((s.t as { group: string }).group) ?? [];
    list.push(s);
    groups.set((s.t as { group: string }).group, list);
  }
  const others = owned.filter(({ t }) => t.type === 'railroad' || t.type === 'utility');

  return (
    <section className="panel own-panel">
      <div className="own-head">
        <span className="dot" style={{ background: p.color }} />
        <span className="fig">{figureEmoji(p.figure)}</span>
        <b className="own-player">{p.name}</b>
      </div>
      {[...groups.entries()].map(([groupId, list]) => (
        <div key={groupId} className="own-group">
          <div className="prop-group-title">
            <span className="dot" style={{ background: snap.board.groups[groupId]?.color }} />
            {snap.board.groups[groupId]?.name ?? groupId}
          </div>
          {list.map(({ t, i, ps }) => {
            const full = ownsFullGroup(snap, playerId, groupId);
            return (
              <div key={i} className="own-row" onClick={() => onSelectTile?.(i)}>
                <span className={'own-name' + (full ? ' full' : '')}>{t.name}</span>
                <Houses n={ps!.houses} />
                {ps!.mortgaged && <span className="mort" title="в залоге">🏦</span>}
              </div>
            );
          })}
        </div>
      ))}
      {others.length > 0 && (
        <div className="own-group">
          <div className="prop-group-title">🚂🚰 Вокзалы и предприятия</div>
          {others.map(({ t, i, ps }) => (
            <div key={i} className="own-row" onClick={() => onSelectTile?.(i)}>
              <span className="own-name">{t.name}</span>
              {ps!.mortgaged && <span className="mort" title="в залоге">🏦</span>}
            </div>
          ))}
        </div>
      )}
      {owned.length === 0 && <div className="hint">пока ничего не куплено</div>}
    </section>
  );
}

function ownsFullGroup(snap: RoomSnapshot, playerId: string, group: string): boolean {
  return snap.board.tiles.every(
    (t, i) => t.type !== 'street' || (t as { group?: string }).group !== group || snap.state.properties[i]!.owner === playerId,
  );
}

function Houses({ n }: { n: number }) {
  if (!n) return null;
  if (n >= 5) return <span className="hotel-icon" title="Отель" />;
  return (
    <span className="houses-icon" title={`${n} дом(а)`}>
      {Array.from({ length: n }).map((_, k) => (
        <span key={k} className="mini-house" />
      ))}
    </span>
  );
}
