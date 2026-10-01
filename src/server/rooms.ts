import { randomUUID } from 'node:crypto'
import { customAlphabet } from 'nanoid'
import { applyAction, createGame, skipTurn, toPublicState } from '~/game/engine'
import type { GameState } from '~/game/types'
import { MAX_PLAYERS, MIN_PLAYERS } from '~/game/types'
import type { LobbyPlayer, OpResult, RoomInfo, RoomOp, RoomStatus, RoomView } from '~/lib/protocol'
import { CODE_ALPHABET, CODE_LENGTH, NAME_MAX, normalizeCode } from '~/lib/protocol'
import { lanAddresses, serverInfo } from './runtime'

export { normalizeCode }

interface Member {
  id: string
  token: string
  name: string
  connections: number // open sockets; the socket layer closes dead ones, so > 0 means online
  everConnected: boolean // has opened a live socket at least once
  offlineSince: number // ms timestamp of the last disconnect (meaningful when connections === 0)
}

interface Listener {
  token: string | null
  send: (view: RoomView) => void
  gone: () => void // the room was deleted
  unsubscribe: () => void
}

interface Room {
  code: string
  members: Member[]
  hostId: string | null
  status: RoomStatus
  game: GameState | null
  listeners: Set<Listener>
  version: number
  lastActivity: number
}

const CODE_ATTEMPTS = 5 // 24^6 ≈ 190M codes: a collision is rare, five in a row means something is wrong
const ROOM_TTL_MS = 3 * 60 * 60 * 1000 // idle rooms with nobody connected are dropped after 3h
const EMPTY_ROOM_TTL_MS = 10 * 60 * 1000 // rooms with no seated player go after 10 min, even if watched
const MAX_ROOMS = 500
/** How long someone must be gone before others may take over for them (host rights, seat reclaim). */
export const AWAY_GRACE_MS = 5000
/** How long the current player must be gone before anyone may skip their turn (matches the client's button). */
export const SKIP_GRACE_MS = 8000

// Keep state on globalThis so Vite's dev-server module reloads don't wipe running games, and so the
// socket handler and the HTTP routes share one store whichever module instance they were loaded from.
const STORE_KEY = Symbol.for('splendor.rooms')
const SWEEPER_KEY = Symbol.for('splendor.roomSweeper')
const g = globalThis as { [STORE_KEY]?: Map<string, Room>; [SWEEPER_KEY]?: ReturnType<typeof setInterval> }
const store = (g[STORE_KEY] ??= new Map<string, Room>())

if (!g[SWEEPER_KEY]) {
  g[SWEEPER_KEY] = setInterval(() => {
    const now = Date.now()
    for (const room of store.values()) {
      if (room.members.length === 0) {
        if (now - room.lastActivity > EMPTY_ROOM_TTL_MS) deleteRoom(room)
      } else if (room.listeners.size === 0 && now - room.lastActivity > ROOM_TTL_MS) deleteRoom(room)
    }
  }, 60 * 1000)
  g[SWEEPER_KEY].unref?.()
}

const generateCode = customAlphabet(CODE_ALPHABET, CODE_LENGTH)

function newCode(): string | null {
  for (let i = 0; i < CODE_ATTEMPTS; i++) {
    const code = generateCode()
    if (!store.has(code)) return code
  }
  return null
}

function deleteRoom(room: Room) {
  store.delete(room.code)
  for (const l of [...room.listeners]) l.gone()
}

function cleanName(name: unknown): string | null {
  if (typeof name !== 'string') return null
  const cleaned = name
    .normalize('NFKC')
    .replace(/[\p{C}\u200B-\u200D\u2060\uFEFF]/gu, '') // control / zero-width characters
    .replace(/\s+/g, ' ')
  // Truncate by code point so emoji are never split, then trim.
  const n = Array.from(cleaned).slice(0, NAME_MAX).join('').trim()
  // Must contain something visible (letters, digits or symbols such as emoji).
  return /[\p{L}\p{N}\p{S}]/u.test(n) ? n : null
}

const sameName = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function createRoom(): { ok: true; code: string } | { ok: false; error: string } {
  if (store.size >= MAX_ROOMS) return { ok: false, error: 'Too many open games on this server' }
  const code = newCode()
  if (!code) return { ok: false, error: 'Server busy, try again' }
  store.set(code, {
    code,
    members: [],
    hostId: null,
    status: 'lobby',
    game: null,
    listeners: new Set(),
    version: 0,
    lastActivity: Date.now(),
  })
  return { ok: true, code }
}

export function roomExists(rawCode: string): boolean {
  return store.has(normalizeCode(rawCode))
}

/** `fallbackPort`: the request's port, used until the plugins have recorded the real one. */
export function roomInfo(rawCode: string, fallbackPort: string | number): RoomInfo {
  const info = serverInfo()
  const port = info.port ?? fallbackPort
  const code = normalizeCode(rawCode)
  const room = store.get(code)
  return {
    code,
    exists: !!room,
    status: room?.status ?? null,
    playerCount: room?.members.length ?? 0,
    joinable: !!room && room.status === 'lobby' && room.members.length < MAX_PLAYERS,
    lanUrls: lanAddresses().map((ip) => `http://${ip}:${port}`),
    publicUrl: info.publicUrl,
  }
}

function memberByToken(room: Room, token: string | null | undefined): Member | undefined {
  if (!token) return undefined
  return room.members.find((m) => m.token === token)
}

/** Counts as present: has an open socket (half-open ones are closed by the socket's ping check). */
const online = (m: Member) => m.connections > 0

function viewFor(room: Room, token: string | null): RoomView {
  const me = memberByToken(room, token)
  const players: LobbyPlayer[] = room.members.map((m) => ({
    id: m.id,
    name: m.name,
    connected: online(m),
    isHost: m.id === room.hostId,
  }))
  return {
    code: room.code,
    status: room.status,
    hostId: room.hostId,
    players,
    youId: me?.id ?? null,
    game: room.game ? toPublicState(room.game, me?.id ?? null) : null,
    version: room.version,
  }
}

function broadcast(room: Room) {
  room.version++
  room.lastActivity = Date.now()
  const failed: Listener[] = []
  for (const l of room.listeners) {
    try {
      l.send(viewFor(room, l.token))
    } catch {
      failed.push(l)
    }
  }
  // Same path as a normal disconnect, so the member's connection count (presence) stays right.
  for (const l of failed) l.unsubscribe()
}

function removeMember(room: Room, memberId: string) {
  room.members = room.members.filter((m) => m.id !== memberId)
  if (room.hostId === memberId) room.hostId = (room.members.find(online) ?? room.members[0])?.id ?? null
}

function awayLongEnough(m: Member | undefined, grace = AWAY_GRACE_MS, now = Date.now()): boolean {
  // `?? 0`: members created before a dev hot-reload may lack the field; treat them as long gone.
  return !m || (!online(m) && now - (m.offlineSince ?? 0) >= grace)
}

/**
 * Host rights check (no side effects): the host, or anyone once the host has been offline for a
 * few seconds. Callers validate the rest of the op first, then call takeHost() before applying it.
 */
function hostError(room: Room, me: Member, what: string): string | null {
  if (room.hostId === me.id) return null
  const host = room.members.find((m) => m.id === room.hostId)
  if (awayLongEnough(host)) return null
  return host && !online(host)
    ? `${host.name} (host) just disconnected — try again in a few seconds`
    : `Only the host can ${what}`
}

function takeHost(room: Room, me: Member) {
  room.hostId = me.id // always followed by broadcast() in the caller
}

function isValidOp(op: unknown): op is RoomOp {
  return !!op && typeof op === 'object' && !Array.isArray(op) && typeof (op as { op?: unknown }).op === 'string'
}

/**
 * Register a socket as a listener. `gone` is called if the room is deleted while subscribed.
 * Returns an unsubscribe function, or null if the room doesn't exist.
 */
export function subscribe(
  rawCode: string,
  token: string | null,
  send: (view: RoomView) => void,
  gone: () => void,
): (() => void) | null {
  const room = store.get(normalizeCode(rawCode))
  if (!room) return null
  let done = false
  const unsubscribe = () => {
    if (done) return
    done = true
    room.listeners.delete(listener)
    const m = memberByToken(room, token)
    if (m) {
      m.connections = Math.max(0, m.connections - 1)
      if (m.connections === 0) m.offlineSince = Date.now()
      broadcast(room)
    }
  }
  const listener: Listener = { token, send, gone, unsubscribe }
  room.listeners.add(listener)
  const member = memberByToken(room, token)
  if (member) {
    member.connections++
    member.everConnected = true
    broadcast(room) // presence changed; also delivers the initial view to this listener
  } else {
    send(viewFor(room, token))
  }
  return unsubscribe
}

export function performOp(rawCode: string, op: unknown): OpResult {
  const room = store.get(normalizeCode(rawCode))
  if (!room) return { ok: false, error: 'Room not found' }
  if (!isValidOp(op)) return { ok: false, error: 'Invalid request' }

  if (op.op === 'join') {
    const existing = memberByToken(room, op.token)
    if (existing) return { ok: true, playerId: existing.id, token: existing.token }
    const name = cleanName(op.name)
    if (!name) return { ok: false, error: 'Please enter a name' }
    // Reclaim a seat: same name as a member who was connected before and has been gone a few seconds
    // (closed tab, other device). The grace period stops two newcomers or a reconnecting player
    // from being merged into one seat.
    const offline = room.members.find((m) => sameName(m.name, name) && m.everConnected && awayLongEnough(m))
    if (offline) return { ok: true, playerId: offline.id, token: offline.token }
    if (room.status !== 'lobby') {
      const seat = room.members.find((m) => sameName(m.name, name))
      if (seat && !online(seat))
        return { ok: false, error: `${seat.name} only just disconnected — try again in a few seconds` }
      return { ok: false, error: seat ? `${seat.name} is still connected` : `No player named ${name} in this game` }
    }
    if (room.members.length >= MAX_PLAYERS) return { ok: false, error: `Room is full (max ${MAX_PLAYERS} players)` }
    if (room.members.some((m) => sameName(m.name, name)))
      return { ok: false, error: 'That name is already taken in this room' }
    const member: Member = {
      id: randomUUID().slice(0, 8),
      token: randomUUID(),
      name,
      connections: 0,
      everConnected: false,
      offlineSince: Date.now(),
    }
    room.members.push(member)
    room.hostId ??= member.id
    broadcast(room)
    return { ok: true, playerId: member.id, token: member.token }
  }

  const me = memberByToken(room, (op as { token?: string }).token)
  if (!me) return { ok: false, error: 'You are not in this room' }

  switch (op.op) {
    case 'rename': {
      if (room.status !== 'lobby') return { ok: false, error: 'Names are locked once the game starts' }
      const name = cleanName(op.name)
      if (!name) return { ok: false, error: 'Please enter a name' }
      if (room.members.some((m) => m.id !== me.id && sameName(m.name, name)))
        return { ok: false, error: 'That name is already taken in this room' }
      me.name = name
      broadcast(room)
      return { ok: true }
    }
    case 'leave': {
      if (room.status !== 'lobby') return { ok: false, error: 'You cannot leave a game in progress' }
      removeMember(room, me.id)
      broadcast(room)
      return { ok: true }
    }
    case 'kick': {
      const err = hostError(room, me, 'remove players')
      if (err) return { ok: false, error: err }
      if (room.status !== 'lobby') return { ok: false, error: 'Players cannot be removed mid-game' }
      if (op.playerId === me.id) return { ok: false, error: 'You cannot remove yourself' }
      if (!room.members.some((m) => m.id === op.playerId)) return { ok: false, error: 'That player already left' }
      takeHost(room, me)
      removeMember(room, op.playerId)
      broadcast(room)
      return { ok: true }
    }
    case 'start': {
      const err = hostError(room, me, 'start the game')
      if (err) return { ok: false, error: err }
      if (room.status !== 'lobby') return { ok: false, error: 'Game already started' }
      if (room.members.length < MIN_PLAYERS) return { ok: false, error: `Need at least ${MIN_PLAYERS} players` }
      const away = room.members.filter((m) => !online(m))
      if (away.length)
        return { ok: false, error: `${away.map((m) => m.name).join(', ')} ${away.length === 1 ? 'is' : 'are'} offline — remove or wait` }
      takeHost(room, me)
      const seating = shuffle(room.members).map((m) => ({ id: m.id, name: m.name }))
      room.game = createGame(seating)
      room.status = 'playing'
      broadcast(room)
      return { ok: true }
    }
    case 'action': {
      if (room.status !== 'playing' || !room.game) return { ok: false, error: 'No game in progress' }
      const result = applyAction(room.game, me.id, op.action)
      if (!result.ok) return { ok: false, error: result.error }
      room.game = result.state
      broadcast(room)
      return { ok: true }
    }
    case 'skipTurn': {
      if (room.status !== 'playing' || !room.game || room.game.status !== 'playing')
        return { ok: false, error: 'No game in progress' }
      // The client says which turn it means to skip, so double clicks can't skip two players.
      if (op.turn !== room.game.turn) return { ok: false, error: 'That turn is already over' }
      const current = room.game.players[room.game.currentPlayerIndex]
      const member = room.members.find((m) => m.id === current.id)
      if (member && online(member)) return { ok: false, error: `${current.name} is back online` }
      if (!awayLongEnough(member, SKIP_GRACE_MS)) return { ok: false, error: `Give ${current.name} a few seconds to reconnect` }
      room.game = skipTurn(room.game)
      broadcast(room)
      return { ok: true }
    }
    case 'playAgain': {
      if (room.status === 'lobby') return { ok: true } // someone already did
      const err = hostError(room, me, 'restart')
      if (err) return { ok: false, error: err }
      if (room.game && room.game.status !== 'finished') return { ok: false, error: 'The game is still in progress' }
      takeHost(room, me)
      room.status = 'lobby'
      room.game = null
      broadcast(room)
      return { ok: true }
    }
    default:
      return { ok: false, error: 'Unknown request' }
  }
}
