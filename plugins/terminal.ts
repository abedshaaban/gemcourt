import QRCode from 'qrcode'
import type { PreviewServer, ViteDevServer } from 'vite'

// Shared bits of the terminal banners (LAN QR in lan-qr.ts, public QR in tunnel.ts).

// Fixed 256-colour palette entries (16 = pure black, 231 = pure white). Unlike the basic ANSI
// colours, themes don't remap these, so "white" never turns into a low-contrast grey.
const DARK = '\x1b[48;5;16m'
const LIGHT = '\x1b[48;5;231m'
const RESET = '\x1b[0m'
const QUIET_ZONE = 2 // light modules around the code; scanners need a clear border

export const bold = (t: string) => `\x1b[1m${t}\x1b[22m`
export const gold = (t: string) => `\x1b[38;5;178m${t}\x1b[39m`

/**
 * Render a QR code with background colours: each module is two spaces (≈ square in a terminal
 * cell). Background fills the whole cell including line spacing, so unlike half-block glyphs
 * there are no gaps between rows, whatever the terminal's line height.
 */
export function renderQr(text: string): string[] {
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

/** Heading, QR code and URL, framed by blank lines. */
export function printQrBanner(log: (msg?: string) => void, heading: string, url: string, extra: string[] = []) {
  log('')
  log(`  ${gold(bold('◆ GEMCOURT'))}  ${heading}`)
  log('')
  for (const row of renderQr(url)) log(`  ${row}`)
  log('')
  log(`  ${bold(url)}`)
  for (const line of extra) log(`  ${line}`)
  log('')
}

export function listeningPort(server: ViteDevServer | PreviewServer): number | null {
  const address = server.httpServer?.address()
  return address && typeof address === 'object' ? address.port : null
}

/** Runs `fn` with the port once the HTTP server listens (right away if it already does). */
export function onListening(server: ViteDevServer | PreviewServer, fn: (port: number) => void) {
  const http = server.httpServer
  if (!http) return
  const run = () => {
    const port = listeningPort(server)
    if (port) fn(port)
  }
  if (http.listening) run()
  else http.once('listening', run)
}
