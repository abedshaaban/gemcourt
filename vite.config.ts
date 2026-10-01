import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { lanQr } from './plugins/lan-qr.ts'

export default defineConfig({
  resolve: { tsconfigPaths: true },
  server: { host: '0.0.0.0', port: 3000 },
  preview: { host: '0.0.0.0', port: 3000 },
  plugins: [tanstackStart(), viteReact(), lanQr()],
})
