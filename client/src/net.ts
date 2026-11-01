import { io, type Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io({ path: '/socket.io', transports: ['websocket', 'polling'] });
  }
  return socket;
}

export interface Session {
  code: string;
  token: string;
  name: string;
}

const key = (code: string) => `monopoly:${code}`;

export function saveSession(s: Session): void {
  localStorage.setItem(key(s.code), JSON.stringify(s));
}

export function loadSession(code: string): Session | null {
  try {
    const raw = localStorage.getItem(key(code));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Session;
    return parsed.code === code && parsed.token ? parsed : null;
  } catch {
    return null;
  }
}

export function clearSession(code: string): void {
  localStorage.removeItem(key(code));
}
