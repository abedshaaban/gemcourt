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
  version: number
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

export type OpResult = { ok: true; playerId?: string; token?: string } | { ok: false; error: string }

export const NAME_MAX = 20
