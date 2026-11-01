import type { GameAction, RoomSnapshot } from '../../../shared/src/types';
import Board from './Board';
import CenterPanel from './CenterPanel';
import Players from './Players';
import MyProperties from './MyProperties';
import LogPanel from './LogPanel';
import CardModal from './CardModal';

interface Props {
  snap: RoomSnapshot;
  act: (a: GameAction) => void;
  toast: (m: string) => void;
  leave: () => void;
}

export default function Game({ snap, act, leave }: Props) {
  return (
    <div className="game">
      <header className="game-header">
        <span className="game-title">🎩 {snap.board.meta.title}</span>
        <span className="room-badge">{snap.code}</span>
        <button className="link-btn" onClick={leave}>
          Выйти
        </button>
      </header>
      <div className="game-body">
        <Board snap={snap}>
          <CenterPanel snap={snap} act={act} />
        </Board>
        <aside className="side">
          <Players snap={snap} />
          <MyProperties snap={snap} act={act} />
          <LogPanel snap={snap} />
        </aside>
      </div>
      <CardModal snap={snap} />
    </div>
  );
}
