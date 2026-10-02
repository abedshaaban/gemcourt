import type { GameAction, PublicGameState } from '~/game/types'

export type RoomStatus = 'lobby' | 'playing'

export interface LobbyPlayer {
  id: string
  name: string
  connected: boolean
  isHost: boolean
}

/** What each SSE subscriber receives whenever the room changes (tailored per viewer). */
export interface RoomView {
  code: string
  status: RoomStatus
  hostId: string | null
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
}

export type RoomOp =
  | { op: 'join'; name: string; token?: string }
  | { op: 'rename'; token: string; name: string }
  | { op: 'leave'; token: string }
  | { op: 'kick'; token: string; playerId: string }
  | { op: 'start'; token: string }
  | { op: 'action'; token: string; action: GameAction }
  | { op: 'playAgain'; token: string }
  | { op: 'skipTurn'; token: string; turn: number } // turn guards against double skips
  | { op: 'chat'; token: string; text: string }
  | { op: 'heartbeat'; token: string } // liveness: lets the server spot devices that vanished without closing

export type OpResult = { ok: true; playerId?: string; token?: string } | { ok: false; error: string }

export const NAME_MAX = 20
/** Longest chat message, in characters (code points). */
export const CHAT_MAX = 280
/** How often a joined client sends a heartbeat (the server marks it offline after ~90s of silence, which tolerates background-tab timer throttling). */
export const HEARTBEAT_MS = 10_000
/** How often the server sends an SSE `ping` event; the client reconnects after ~3 missed pings (half-open streams). */
export const SSE_PING_MS = 15_000
