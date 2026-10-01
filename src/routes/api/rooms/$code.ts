import { createFileRoute } from '@tanstack/react-router'
import { TOO_MANY, limits, requestAddress } from '~/server/limits'
import { roomExists, roomInfo } from '~/server/rooms'

// Room lookup for the home page and the waiting room's invite links. Everything live (joining,
// moves, room updates) goes over the WebSocket (src/server/socket.ts).
export const Route = createFileRoute('/api/rooms/$code')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        // Guessing codes: unknown codes use up the join budget; once it's gone every lookup is refused.
        const addr = requestAddress(request)
        if (!addr.local) {
          if (!limits.join.allowed(addr.ip)) return Response.json({ error: TOO_MANY }, { status: 429 })
          if (!roomExists(params.code)) limits.join.take(addr.ip)
        }
        const port = new URL(request.url).port || '3000'
        return Response.json(roomInfo(params.code, port))
      },
    },
  },
})
