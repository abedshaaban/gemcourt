import { createFileRoute } from '@tanstack/react-router'
import { TOO_MANY, limits, requestAddress } from '~/server/limits'
import { createRoom } from '~/server/rooms'

export const Route = createFileRoute('/api/rooms/')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const addr = requestAddress(request)
        if (!addr.local && !limits.create.take(addr.ip)) return Response.json({ error: TOO_MANY }, { status: 429 })
        const r = createRoom()
        return r.ok ? Response.json({ code: r.code }) : Response.json({ error: r.error }, { status: 503 })
      },
    },
  },
})
