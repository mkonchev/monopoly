import { randomUUID } from 'node:crypto';
import type { BoardConfig, GameAction } from '../../shared/src/types';
import { MAX_PLAYERS, PLAYER_COLORS, type GameRoom, type Player, applyAction, createLobbyState } from './game/engine';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export type JoinResult = { room: GameRoom; player: Player; token: string };

function sanitizeName(raw: unknown): string {
  const s = typeof raw === 'string' ? raw.trim().slice(0, 20) : '';
  return s || 'Игрок';
}

export class RoomManager {
  readonly rooms = new Map<string, GameRoom>();

  constructor(private readonly board: BoardConfig) {}

  createRoom(name: string): JoinResult {
    const code = this.genCode();
    const room: GameRoom = {
      code,
      board: this.board,
      state: createLobbyState(),
      players: [],
      decks: null,
      discards: null,
      rentOverride: null,
      createdAt: Date.now(),
      lastActivity: Date.now(),
    };
    this.rooms.set(code, room);
    const player = this.addPlayer(room, name, true);
    return { room, player, token: player.token };
  }

  joinRoom(code: string, name: string, token?: string): JoinResult {
    const room = this.rooms.get(code.toUpperCase());
    if (!room) throw new Error('Комната не найдена');
    room.lastActivity = Date.now();

    if (token) {
      const existing = room.players.find((p) => p.token === token);
      if (existing) return { room, player: existing, token };
    }
    if (room.state.phase !== 'lobby') throw new Error('Игра уже началась — присоединиться нельзя');
    if (room.players.length >= MAX_PLAYERS) throw new Error('Комната заполнена');
    const player = this.addPlayer(room, sanitizeName(name), false);
    return { room, player, token: player.token };
  }

  act(room: GameRoom, player: Player, action: GameAction): void {
    applyAction(room, player, action);
  }

  // Возвращает true, если комната удалена.
  cleanup(now = Date.now()): boolean {
    for (const [code, room] of this.rooms) {
      const idle = now - room.lastActivity;
      const nobodyConnected = room.players.every((p) => p.socketIds.size === 0);
      if (idle > 12 * 60 * 60 * 1000 || (nobodyConnected && idle > 30 * 60 * 1000)) {
        this.rooms.delete(code);
        return true;
      }
    }
    return false;
  }

  private genCode(): string {
    for (let attempt = 0; attempt < 100; attempt++) {
      let code = '';
      for (let i = 0; i < 4; i++) code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
      if (!this.rooms.has(code)) return code;
    }
    throw new Error('Не удалось сгенерировать код комнаты');
  }

  private addPlayer(room: GameRoom, rawName: string, isHost: boolean): Player {
    let name = sanitizeName(rawName);
    let n = 2;
    while (room.players.some((p) => p.name === name)) name = `${sanitizeName(rawName)} (${n++})`;
    if (room.players.length >= MAX_PLAYERS) throw new Error('Комната заполнена (максимум 8)');
    const player: Player = {
      id: randomUUID(),
      name,
      color: PLAYER_COLORS[room.players.length % PLAYER_COLORS.length],
      token: randomUUID(),
      money: 0,
      position: 0,
      inJail: false,
      jailTurns: 0,
      jailCards: 0,
      bankrupt: false,
      isHost,
      socketIds: new Set(),
      loan: null,
      figure: null,
    };
    room.players.push(player);
    return player;
  }
}
