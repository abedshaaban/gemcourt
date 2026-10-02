import type { GameAction, PublicGameState } from '~/game/types'

export type RoomStatus = 'lobby' | 'playing'

export interface LobbyPlayer {
  id: string
  name: string
  connected: boolean
  isHost: boolean
}

/** What each subscribed socket receives whenever the room changes (tailored per viewer). */
export interface RoomView {
  code: string
  status: RoomStatus
  hostId: string | null
  winningPoints: number
  players: LobbyPlayer[]
  youId: string | null // null = not a member (spectator / needs to join)
  game: PublicGameState | null
  chat: ChatMessage[] // recent table talk, oldest first (empty for non-members)
  version: number
}

/** One public chat line. Plain text only: always rendered as text, never as HTML. */
export interface ChatMessage {
  id: number // increases within a room
  playerId: string
  name: string // sender's name when sent (they may rename in the lobby)
  text: string
  ts: number // server time, epoch ms
}

export interface RoomInfo {
  code: string
  exists: boolean
  status: RoomStatus | null
  playerCount: number
  joinable: boolean
  lanUrls: string[]
  publicUrl: string | null // https tunnel address when the server runs with `pnpm play:online`
}

export type RoomOp =
  | { op: 'join'; name: string; token?: string }
  | { op: 'rename'; token: string; name: string }
  | { op: 'leave'; token: string }
  | { op: 'kick'; token: string; playerId: string }
  | { op: 'start'; token: string }
  | { op: 'setWinningPoints'; token: string; points: number }
  | { op: 'action'; token: string; action: GameAction }
  | { op: 'playAgain'; token: string }
  | { op: 'skipTurn'; token: string; turn: number } // turn guards against double skips
  | { op: 'chat'; token: string; text: string }

export type OpResult = { ok: true; playerId?: string; token?: string } | { ok: false; error: string }

export const NAME_MAX = 20
/** Longest chat message, in characters (code points). */
export const CHAT_MAX = 280

// ---------- Room codes ----------

/** Room codes: 6 letters, no I / O and no digits, so they read aloud and type easily. */
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
export const CODE_LENGTH = 6

export function normalizeCode(code: string): string {
  return code.trim().toUpperCase().replace(/[^A-Z]/g, '')
}

// ---------- WebSocket ----------

/** Same origin as the page; one socket per tab carries the room view and every op. */
export const WS_PATH = '/ws'
/** Largest message the server accepts; anything bigger closes the socket. */
export const WS_MAX_PAYLOAD = 16 * 1024
/** How often the server pings; the client reconnects after ~3 missed pings (half-open sockets). */
export const PING_MS = 15_000
/** Close code for a socket that kept flooding the server (RFC 6455 "policy violation"). */
export const WS_POLICY_VIOLATION = 1008

/** Client → server. `id` correlates the reply; the socket is bound to `?code=` from its URL. */
export type ClientMessage = { type: 'op'; id: number; op: RoomOp } | { type: 'pong' }

/** Server → client. */
export type ServerMessage =
  | { type: 'view'; view: RoomView }
  | { type: 'result'; id: number; result: OpResult }
  | { type: 'missing' } // no such room (or it was cleaned up); the socket closes right after
  | { type: 'error'; error: string } // refused before subscribing (e.g. rate limited); the socket closes right after
  | { type: 'ping' }
