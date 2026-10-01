import { createFileRoute } from '@tanstack/react-router'
import { createRoom } from '~/server/rooms'

export const Route = createFileRoute('/api/rooms/')({
  server: {
    handlers: {
      POST: async () => {
        const code = createRoom()
        return code
          ? Response.json({ code })
          : Response.json({ error: 'Too many open games on this server' }, { status: 503 })
      },
    },
  },
})
