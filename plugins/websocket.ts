import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { isRunnableDevEnvironment } from 'vite'
import type { Logger, Plugin, PreviewServer, ViteDevServer } from 'vite'
import { WebSocketServer } from 'ws'
import { WS_MAX_PAYLOAD, WS_PATH } from '../src/lib/protocol.ts'
import { serverInfo, wsHandler } from '../src/server/runtime.ts'
import { onListening } from './terminal.ts'

// TanStack Start (this version) has no WebSocket support, so this plugin owns the upgrade and hands
// the socket to the handler the app registers on globalThis (src/server/socket.ts). Loading the
// app's server entry first makes sure that handler, the room store and the HTTP routes are one
// module instance: Vite's SSR runner in dev, the built bundle in preview.

const SERVER_ENTRY = 'virtual:tanstack-start-server-entry' // TanStack Start's id for src/server.ts

type HttpServer = NonNullable<ViteDevServer['httpServer']>

function attach(httpServer: HttpServer | null, load: () => Promise<unknown>, logger: Logger) {
  if (!httpServer) return // middleware mode: no server of our own to listen on
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: WS_MAX_PAYLOAD,
    perMessageDeflate: { threshold: 256 }, // room views are repetitive JSON: compresses ~5-10x
  })

  httpServer.on('upgrade', async (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    if (new URL(req.url ?? '/', 'http://localhost').pathname !== WS_PATH) return // e.g. Vite's HMR socket
    socket.on('error', () => {})
    const handler = await load().then(wsHandler, (e: unknown) => {
      logger.error(`[gemcourt] could not load the server entry for a WebSocket: ${e instanceof Error ? e.message : e}`)
      return undefined
    })
    if (!handler) return socket.destroy()
    const refusal = handler.refuse(req)
    if (refusal) {
      socket.end(`HTTP/1.1 429 Too Many Requests\r\nConnection: close\r\nContent-Type: text/plain\r\n\r\n${refusal}`)
      return
    }
    wss.handleUpgrade(req, socket, head, (ws) => handler.connect(ws, req))
  })
  httpServer.on('close', () => {
    for (const ws of wss.clients) ws.terminate()
    wss.close()
  })
}

/** Serves the game's WebSocket on WS_PATH, in `vite dev` and `vite preview`. */
export function websocket(): Plugin {
  const recordPort = (server: ViteDevServer | PreviewServer) =>
    onListening(server, (port) => (serverInfo().port = port)) // the API builds LAN invite links from it
  return {
    name: 'gemcourt-websocket',
    configureServer(server) {
      recordPort(server)
      // The runner caches modules, so this is cheap; after a hot update it re-runs the changed code.
      const load = async () => {
        const env = server.environments.ssr
        if (!isRunnableDevEnvironment(env)) throw new Error('the SSR environment is not runnable')
        return env.runner.import(SERVER_ENTRY)
      }
      attach(server.httpServer, load, server.config.logger)
    },
    configurePreviewServer(server) {
      recordPort(server)
      // Same file (and so the same module instance) TanStack Start's preview middleware imports.
      const outDir = server.config.environments.ssr?.build?.outDir ?? join(server.config.build.outDir, 'server')
      const entry = pathToFileURL(resolve(server.config.root, outDir, 'server.js')).toString()
      let loading: Promise<unknown> | null = null
      const load = () => (loading ??= import(entry).catch((e) => ((loading = null), Promise.reject(e))))
      attach(server.httpServer, load, server.config.logger)
      void load().catch(() => {}) // start the room sweeper right away; errors resurface on first use
    },
  }
}
