import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { constants } from 'node:os'
import type { Logger, Plugin, PreviewServer, ViteDevServer } from 'vite'
import { serverInfo } from '../src/server/runtime.ts'
import { bold, onListening, printQrBanner } from './terminal.ts'

// `pnpm play:online`: a Cloudflare Quick Tunnel (no account) gives the server a public
// https://*.trycloudflare.com address, new on every start. Opt-in: `--mode online` or SPLENDOR_TUNNEL=1.

const URL_RE = /https:\/\/(?!api\.)[a-z0-9-]+\.trycloudflare\.com/i
const SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP'] as const

async function cloudflaredBin(logger: Logger): Promise<string | null> {
  try {
    const { bin, install } = await import('cloudflared')
    if (existsSync(bin)) return bin
    // The package downloads the binary in its postinstall; pnpm skips that unless allowed
    // (package.json → pnpm.onlyBuiltDependencies), so fetch it now if it's missing.
    logger.info('  Downloading cloudflared…')
    return await install(bin)
  } catch (e) {
    logger.warn(`\n  Could not get cloudflared (${e instanceof Error ? e.message : e}).`)
    logger.warn('  Try `pnpm rebuild cloudflared`, or install it from https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/')
    return null
  }
}

function startTunnel(server: ViteDevServer | PreviewServer, port: number) {
  const logger = server.config.logger
  const lanOnly = () => logger.warn('  Continuing LAN-only: players on your Wi-Fi can still join.\n')
  let child: ChildProcess | null = null
  let stopped = false

  const stop = () => {
    stopped = true
    serverInfo().publicUrl = null
    if (child && child.exitCode === null && child.signalCode === null) child.kill()
  }
  process.once('exit', stop)
  for (const sig of SIGNALS) {
    process.once(sig, () => {
      stop()
      // Exit like the default handler would. Don't defer to "other listeners": signal-exit (pulled in by
      // a dependency) defers to us in turn, and the server would keep running after Ctrl+C.
      process.exit(128 + (constants.signals[sig] ?? 0))
    })
  }
  server.httpServer?.once('close', stop)

  void cloudflaredBin(logger).then((bin) => {
    if (!bin) return lanOnly()
    if (stopped) return
    logger.info('  Opening a public tunnel (Cloudflare Quick Tunnel)…')
    // 127.0.0.1 rather than localhost: the server listens on IPv4 and this avoids a ::1 attempt.
    // A short grace period so cloudflared doesn't linger ~30s draining connections after we exit.
    const args = ['tunnel', '--no-autoupdate', '--grace-period', '1s', '--url', `http://127.0.0.1:${port}`]
    child = spawn(bin, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let found = false
    let tail = ''
    const scan = (chunk: Buffer) => {
      const text = chunk.toString()
      tail = (tail + text).slice(-2000) // for the error message if it fails
      const url = !found && text.match(URL_RE)?.[0]
      if (!url) return
      found = true
      serverInfo().publicUrl = url
      try {
        printQrBanner((msg = '') => logger.info(msg), `${bold('Play from anywhere')}  (share this link or QR)`, url, [
          'New address on every start · may take a few seconds to come up',
          'Anyone with this link and a game code can join.',
        ])
      } catch {
        logger.info(`\n  Public URL: ${url}\n`)
      }
    }
    child.stdout?.on('data', scan)
    child.stderr?.on('data', scan)
    child.on('error', (e) => {
      logger.warn(`\n  cloudflared failed to start: ${e.message}`)
      lanOnly()
    })
    child.on('exit', (code) => {
      serverInfo().publicUrl = null
      if (stopped) return
      logger.warn(`\n  The tunnel closed (cloudflared exited with ${code}).`)
      if (!found) logger.warn(tail.trim().split('\n').slice(-5).map((l) => `    ${l}`).join('\n'))
      lanOnly()
    })
  })
}

export function tunnel(): Plugin {
  let enabled = false
  const hook = (server: ViteDevServer | PreviewServer) => {
    if (enabled) onListening(server, (port) => startTunnel(server, port))
  }
  return {
    name: 'splendor-tunnel',
    configResolved(config) {
      enabled = config.mode === 'online' || process.env.SPLENDOR_TUNNEL === '1'
    },
    configureServer: hook,
    configurePreviewServer: hook,
  }
}
