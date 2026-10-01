import { networkInterfaces } from 'node:os'
import QRCode from 'qrcode'
import type { Plugin, PreviewServer, ViteDevServer } from 'vite'

// Virtual adapters (Docker, VPNs, VMs) come after real Wi-Fi / Ethernet.
const VIRTUAL = /^(docker|br-|veth|vbox|vmnet|utun|tun|tap|awdl|llw|bridge|zt|tailscale)/i

// Fixed 256-colour palette entries (16 = pure black, 231 = pure white). Unlike the basic ANSI
// colours, themes don't remap these, so "white" never turns into a low-contrast grey.
const DARK = '\x1b[48;5;16m'
const LIGHT = '\x1b[48;5;231m'
const RESET = '\x1b[0m'
const QUIET_ZONE = 2 // light modules around the code; scanners need a clear border

/**
 * Render a QR code with background colours: each module is two spaces (≈ square in a terminal
 * cell). Background fills the whole cell including line spacing, so unlike half-block glyphs
 * there are no gaps between rows, whatever the terminal's line height.
 */
function renderQr(text: string): string[] {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: 'M' })
  const size = modules.size
  const isDark = (r: number, c: number) => r >= 0 && c >= 0 && r < size && c < size && !!modules.get(r, c)
  const rows: string[] = []
  for (let r = -QUIET_ZONE; r < size + QUIET_ZONE; r++) {
    let line = ''
    let current = ''
    for (let c = -QUIET_ZONE; c < size + QUIET_ZONE; c++) {
      const color = isDark(r, c) ? DARK : LIGHT
      if (color !== current) line += color
      current = color
      line += '  '
    }
    rows.push(line + RESET)
  }
  return rows
}

/** LAN IPv4 addresses, most likely "the Wi-Fi one" first. */
function lanAddresses(): string[] {
  const found: { name: string; address: string }[] = []
  for (const [name, list] of Object.entries(networkInterfaces())) {
    for (const addr of list ?? []) {
      if (addr.family === 'IPv4' && !addr.internal) found.push({ name, address: addr.address })
    }
  }
  const rank = (n: string) => (VIRTUAL.test(n) ? 2 : /^(en|eth|wlan|wl|Wi-Fi|Ethernet)/i.test(n) ? 0 : 1)
  return found.sort((a, b) => rank(a.name) - rank(b.name)).map((f) => f.address)
}

function printQr(server: ViteDevServer | PreviewServer) {
  const address = server.httpServer?.address()
  const port = address && typeof address === 'object' ? address.port : null
  if (!port) return
  const [primary, ...others] = lanAddresses().map((ip) => `http://${ip}:${port}`)
  const log = (msg = '') => server.config.logger.info(msg)

  if (!primary) {
    log('\n  No network connection found — players on other devices cannot join.')
    log(`  Local only: http://localhost:${port}\n`)
    return
  }
  const bold = (t: string) => `\x1b[1m${t}\x1b[22m`
  const gold = (t: string) => `\x1b[38;5;178m${t}\x1b[39m`
  log('')
  log(`  ${gold(bold('◆ SPLENDOR'))}  ${bold('Scan with your phone camera to join')}  (same Wi-Fi)`)
  log('')
  for (const row of renderQr(primary)) log(`  ${row}`)
  log('')
  log(`  ${bold(primary)}`)
  for (const url of others) log(`  also: ${url}`)
  log('')
}

/** Prints a QR code of the LAN address after Vite prints its own URLs (dev and preview). */
export function lanQr(): Plugin {
  const hook = (server: ViteDevServer | PreviewServer) => {
    const original = server.printUrls.bind(server)
    server.printUrls = () => {
      original()
      try {
        printQr(server)
      } catch {
        // a QR code is a convenience; never break server start-up over it
      }
    }
  }
  return {
    name: 'splendor-lan-qr',
    configureServer: hook,
    configurePreviewServer: hook,
  }
}
