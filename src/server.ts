import handler, { createServerEntry } from '@tanstack/react-start/server-entry'
// Registers the WebSocket handler on globalThis. Loading it from the server entry means it runs in
// the same module instance as the HTTP routes: through Vite's SSR runner in dev, and inside the
// built server bundle in preview (plugins/websocket.ts imports the entry for the first socket).
import './server/socket'

export default createServerEntry({
  fetch(request) {
    return handler.fetch(request)
  },
})
