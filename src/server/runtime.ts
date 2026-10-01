import type { IncomingMessage } from 'node:http'
import { networkInterfaces } from 'node:os'
import type { WebSocket } from 'ws'

// Process-wide hooks shared by the Vite plugins (plugins/*.ts) and the app's server code. They are
// loaded as separate module instances (the plugins by Vite's config loader, the app through Vite's
// SSR module graph in dev or the built bundle in preview), so everything lives on globalThis under
// Symbol.for keys, which resolve to the same symbol from any instance in the process.

/** Where players can reach this server. Filled in by the plugins once the server listens. */
export interface ServerInfo {
  port: number | null
  publicUrl: string | null // https://*.trycloudflare.com while `pnpm play:online` has a tunnel up
}

/** The app's WebSocket endpoint; the plugin upgrades the HTTP request and hands the socket over. */
export interface WsHandler {
  /** Checked before upgrading: a message refuses the connection (HTTP 429). */
  refuse(req: IncomingMessage): string | null
  connect(ws: WebSocket, req: IncomingMessage): void
}

const INFO_KEY = Symbol.for('splendor.serverInfo')
const WS_KEY = Symbol.for('splendor.wsHandler')
const g = globalThis as { [INFO_KEY]?: ServerInfo; [WS_KEY]?: WsHandler }

export function serverInfo(): ServerInfo {
  return (g[INFO_KEY] ??= { port: null, publicUrl: null })
}

export function wsHandler(): WsHandler | undefined {
  return g[WS_KEY]
}

export function registerWsHandler(handler: WsHandler) {
  g[WS_KEY] = handler // re-registered on every dev hot reload, so new sockets get the latest code
}

// Virtual adapters (Docker, VPNs, VMs) come after real Wi-Fi / Ethernet.
const VIRTUAL = /^(docker|br-|veth|vbox|vmnet|utun|tun|tap|awdl|llw|bridge|zt|tailscale)/i

/** LAN IPv4 addresses, most likely "the Wi-Fi one" first. */
export function lanAddresses(): string[] {
  const found: { name: string; address: string }[] = []
  for (const [name, list] of Object.entries(networkInterfaces())) {
    for (const addr of list ?? []) {
      if (addr.family === 'IPv4' && !addr.internal) found.push({ name, address: addr.address })
    }
  }
  const rank = (n: string) => (VIRTUAL.test(n) ? 2 : /^(en|eth|wlan|wl|Wi-Fi|Ethernet)/i.test(n) ? 0 : 1)
  return found.sort((a, b) => rank(a.name) - rank(b.name)).map((f) => f.address)
}
