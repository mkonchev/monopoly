import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameAction, RoomSnapshot } from '../../shared/src/types';
import { clearSession, getSocket, loadSession, saveSession, type Session } from './net';
import Home from './components/Home';
import Room from './components/Room';
import Game from './components/Game';

export interface Ctx {
  snap: RoomSnapshot;
  act: (a: GameAction) => void;
  toast: (m: string) => void;
  leave: () => void;
}

export default function App() {
  const [snap, setSnap] = useState<RoomSnapshot | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toast = useCallback((m: string) => {
    setToastMsg(m);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 4000);
  }, []);

  useEffect(() => {
    const s = getSocket();
    const onRoom = (r: RoomSnapshot) => setSnap(r);
    s.on('room', onRoom);

    const urlCode = new URLSearchParams(window.location.search).get('room')?.trim().toUpperCase();
    if (urlCode) {
      const saved = loadSession(urlCode);
      if (saved) {
        sessionRef.current = saved;
        s.emit('room:join', { code: urlCode, name: saved.name, token: saved.token }, (res: { ok: boolean; error?: string }) => {
          if (!res.ok) toast(res.error ?? 'Не удалось переподключиться');
        });
      }
    }
    return () => {
      s.off('room', onRoom);
    };
  }, [toast]);

  const leave = useCallback(() => {
    if (sessionRef.current) clearSession(sessionRef.current.code);
    sessionRef.current = null;
    window.history.replaceState(null, '', window.location.pathname);
    setSnap(null);
  }, []);

  const act = useCallback(
    (a: GameAction) => {
      const s = sessionRef.current;
      if (!s) return;
      getSocket().emit('action', { code: s.code, token: s.token, action: a }, (res: { ok: boolean; error?: string }) => {
        if (!res.ok) toast(res.error ?? 'Ошибка');
      });
    },
    [toast],
  );

  const createRoom = useCallback(
    (name: string) => {
      getSocket().emit('room:create', { name }, (res: { ok: boolean; code?: string; token?: string; error?: string }) => {
        if (res.ok && res.code && res.token) {
          const session = { code: res.code, token: res.token, name };
          sessionRef.current = session;
          saveSession(session);
        } else {
          toast(res.error ?? 'Не удалось создать комнату');
        }
      });
    },
    [toast],
  );

  const joinRoom = useCallback(
    (code: string, name: string) => {
      const c = code.trim().toUpperCase();
      getSocket().emit('room:join', { code: c, name }, (res: { ok: boolean; token?: string; error?: string }) => {
        if (res.ok && res.token) {
          const session = { code: c, token: res.token, name };
          sessionRef.current = session;
          saveSession(session);
        } else {
          toast(res.error ?? 'Не удалось войти');
        }
      });
    },
    [toast],
  );

  return (
    <>
      {!snap && <Home onCreate={createRoom} onJoin={joinRoom} />}
      {snap && !snap.started && (
        <Room
          snap={snap}
          isHost={!!snap.players.find((p) => p.id === snap.you)?.isHost}
          onStart={() => act({ type: 'startGame' })}
          onLeave={leave}
          toast={toast}
        />
      )}
      {snap && snap.started && <CtxProvider snap={snap} act={act} toast={toast} leave={leave} />}
      {toastMsg && <div className="toast">{toastMsg}</div>}
    </>
  );
}

function CtxProvider({ snap, act, toast, leave }: { snap: RoomSnapshot; act: (a: GameAction) => void; toast: (m: string) => void; leave: () => void }) {
  return <Game snap={snap} act={act} toast={toast} leave={leave} />;
}
