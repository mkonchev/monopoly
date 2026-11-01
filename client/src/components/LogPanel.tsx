import { useEffect, useRef } from 'react';
import type { RoomSnapshot } from '../../../shared/src/types';

export default function LogPanel({ snap }: { snap: RoomSnapshot }) {
  const ref = useRef<HTMLDivElement>(null);
  const entries = snap.state.log.slice(-80);

  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [snap.state.logSeq]);

  return (
    <section className="panel log-panel">
      <h3>Ход игры</h3>
      <div className="log" ref={ref}>
        {entries.map((e) => (
          <div key={e.id} className="log-line">
            {e.text}
          </div>
        ))}
      </div>
    </section>
  );
}
