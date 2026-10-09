import type { Plugin, PreviewServer, ViteDevServer } from 'vite'
import { lanAddresses } from '../src/server/runtime.ts'
import { bold, listeningPort, printQrBanner } from './terminal.ts'

function printQr(server: ViteDevServer | PreviewServer) {
  const port = listeningPort(server)
  if (!port) return
  const [primary, ...others] = lanAddresses().map((ip) => `http://${ip}:${port}`)
  const log = (msg = '') => server.config.logger.info(msg)

  if (!primary) {
    log('\n  No network connection found — players on other devices cannot join.')
    log(`  Local only: http://localhost:${port}\n`)
    return
  }
  printQrBanner(log, `${bold('Scan with your phone camera to join')}  (same Wi-Fi)`, primary, others.map((url) => `also: ${url}`))
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
    name: 'gemcourt-lan-qr',
    configureServer: hook,
    configurePreviewServer: hook,
  }
}
