// Refuses to run `vite build` while a preview server is serving dist/ on this machine.
// `vite preview` serves dist/ straight from disk and keeps the old SSR bundle in memory, so a rebuild
// underneath it breaks every page load (hashed asset names change) and can corrupt a live game.
// Set SPLENDOR_FORCE_BUILD=1 to build anyway.
import { connect } from 'node:net'

const PORT = Number(process.env.SPLENDOR_PREVIEW_PORT ?? 3000) // keep in sync with vite.config.ts

if (process.env.SPLENDOR_FORCE_BUILD) process.exit(0)

const busy = await new Promise((resolve) => {
  const socket = connect({ host: '127.0.0.1', port: PORT })
  const done = (value) => { socket.destroy(); resolve(value) }
  socket.once('connect', () => done(true))
  socket.once('error', () => done(false))
  socket.setTimeout(500, () => done(false))
})

if (busy) {
  console.error(
    `\n[splendor] Something is already listening on port ${PORT} (probably \`pnpm play\` / \`vite preview\`).\n` +
      `Building now would replace dist/ under that server and break the game it is serving.\n` +
      `Stop the server first, or run with SPLENDOR_FORCE_BUILD=1 if you are sure.\n`,
  )
  process.exit(1)
}
