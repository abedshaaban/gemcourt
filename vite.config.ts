import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { lanQr } from './plugins/lan-qr.ts'
import { tunnel } from './plugins/tunnel.ts'
import { websocket } from './plugins/websocket.ts'

// LAN addresses and localhost are always allowed; the tunnel (`pnpm play:online`) adds this one.
const allowedHosts = ['.trycloudflare.com']

export default defineConfig({
  resolve: { tsconfigPaths: true },
  server: { host: '0.0.0.0', port: 3000, allowedHosts },
  preview: { host: '0.0.0.0', port: 3000, allowedHosts },
  plugins: [tanstackStart(), viteReact(), websocket(), lanQr(), tunnel()],
})
