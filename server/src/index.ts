import fs from 'node:fs';
import path from 'node:path';
import { createServer } from 'node:http';
import express from 'express';
import { Server, type Socket } from 'socket.io';
import type { GameAction, RoomSnapshot } from '../../shared/src/types';
import { loadBoard } from './board';
import type { GameRoom, Player } from './game/engine';
import { RoomManager } from './rooms';

const PORT = Number(process.env.PORT || 3001);

const board = loadBoard();
const mgr = new RoomManager(board);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: true, credentials: false } });

app.get('/healthz', (_req, res) => {
  res.json({ ok: true, rooms: mgr.rooms.size });
});

const clientDist = path.resolve(process.cwd(), 'client/dist');
if (fs.existsSync(path.join(clientDist, 'index.html'))) {
  app.use(express.static(clientDist));
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/socket.io')) {
      res.sendFile(path.join(clientDist, 'index.html'));
    } else {
      next();
    }
  });
}

function snapshot(room: GameRoom, you: string | null): RoomSnapshot {
  const s = room.state;
  return {
    code: room.code,
    board: room.board,
    state: s,
    started: s.phase !== 'lobby',
    you,
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      money: p.money,
      position: p.position,
      inJail: p.inJail,
      jailTurns: p.jailTurns,
      jailCards: p.jailCards,
      bankrupt: p.bankrupt,
      connected: p.socketIds.size > 0,
      isHost: p.isHost,
      netWorth: p.bankrupt ? 0 : netWorth(room, p),
      loan: p.loan,
    })),
  };
}

function netWorth(room: GameRoom, p: Player): number {
  let total = p.money;
  for (let i = 0; i < room.board.tiles.length; i++) {
    const tile = room.board.tiles[i];
    const ps = room.state.properties[i];
    if (!ps || ps.owner !== p.id) continue;
    if (tile.type === 'street' || tile.type === 'railroad' || tile.type === 'utility') {
      total += ps.mortgaged ? Math.round(tile.price * 0.5) : tile.price;
      if (tile.type === 'street' && ps.houses > 0) total += Math.round((ps.houses >= 5 ? 5 : ps.houses) * tile.houseCost * 0.5);
    }
  }
  return total;
}

function broadcast(room: GameRoom): void {
  for (const p of room.players) {
    const snap = snapshot(room, p.id);
    for (const sid of p.socketIds) io.to(sid).emit('room', snap);
  }
}

function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : 'Неизвестная ошибка';
}

io.on('connection', (socket: Socket) => {
  socket.on('room:create', (payload: { name?: string }, ack?: (r: unknown) => void) => {
    try {
      const { room, player, token } = mgr.createRoom(String(payload?.name ?? ''));
      player.socketIds.add(socket.id);
      socket.data.code = room.code;
      socket.data.playerId = player.id;
      socket.join(room.code);
      ack?.({ ok: true, code: room.code, token });
      broadcast(room);
    } catch (e) {
      ack?.({ ok: false, error: errMessage(e) });
    }
  });

  socket.on('room:join', (payload: { code?: string; name?: string; token?: string }, ack?: (r: unknown) => void) => {
    try {
      const code = String(payload?.code ?? '').trim().toUpperCase();
      const { room, player, token } = mgr.joinRoom(code, String(payload?.name ?? ''), payload?.token);
      player.socketIds.add(socket.id);
      socket.data.code = room.code;
      socket.data.playerId = player.id;
      socket.join(room.code);
      ack?.({ ok: true, code: room.code, token });
      broadcast(room);
    } catch (e) {
      ack?.({ ok: false, error: errMessage(e) });
    }
  });

  socket.on('action', (payload: { code?: string; token?: string; action?: GameAction }, ack?: (r: unknown) => void) => {
    try {
      const code = String(payload?.code ?? '').trim().toUpperCase();
      const room = mgr.rooms.get(code);
      if (!room) throw new Error('Комната не найдена (возможно, сервер перезапустился)');
      const player = room.players.find((p) => p.token === payload?.token);
      if (!player) throw new Error('Вы не участник этой комнаты');
      player.socketIds.add(socket.id);
      socket.data.code = room.code;
      socket.data.playerId = player.id;
      if (!payload?.action || typeof payload.action !== 'object') throw new Error('Пустое действие');
      mgr.act(room, player, payload.action);
      ack?.({ ok: true });
      broadcast(room);
    } catch (e) {
      ack?.({ ok: false, error: errMessage(e) });
    }
  });

  socket.on('disconnect', () => {
    const code = socket.data?.code as string | undefined;
    const playerId = socket.data?.playerId as string | undefined;
    if (!code || !playerId) return;
    const room = mgr.rooms.get(code);
    if (!room) return;
    const player = room.players.find((p) => p.id === playerId);
    if (!player) return;
    player.socketIds.delete(socket.id);
    if (player.socketIds.size === 0 && player.isHost) {
      const candidate = room.players.find((p) => p.socketIds.size > 0);
      if (candidate) {
        player.isHost = false;
        candidate.isHost = true;
      }
    }
    broadcast(room);
  });
});

setInterval(() => {
  if (mgr.cleanup()) console.log('[monopoly] неактивная комната удалена');
}, 5 * 60 * 1000).unref();

httpServer.listen(PORT, () => {
  console.log(`[monopoly] «${board.meta.title}»: сервер запущен на порту ${PORT}`);
});
