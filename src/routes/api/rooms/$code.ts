import { createFileRoute } from '@tanstack/react-router'
import { performOp, roomInfo } from '~/server/rooms'

const MAX_BODY_BYTES = 16 * 1024

/** Read a JSON body without ever buffering more than MAX_BODY_BYTES. */
async function readJson(request: Request): Promise<{ ok: true; value: unknown } | { ok: false; status: number }> {
  const declared = Number(request.headers.get('content-length') ?? 0)
  if (declared > MAX_BODY_BYTES) return { ok: false, status: 413 }
  const reader = request.body?.getReader()
  if (!reader) return { ok: false, status: 400 }
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > MAX_BODY_BYTES) {
      await reader.cancel()
      return { ok: false, status: 413 }
    }
    chunks.push(value)
  }
  try {
    return { ok: true, value: JSON.parse(Buffer.concat(chunks).toString('utf8')) }
  } catch {
    return { ok: false, status: 400 }
  }
}

export const Route = createFileRoute('/api/rooms/$code')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const port = new URL(request.url).port || '3000'
        return Response.json(roomInfo(params.code, port))
      },
      POST: async ({ request, params }) => {
        const body = await readJson(request)
        if (!body.ok) {
          const error = body.status === 413 ? 'Request too large' : 'Invalid request'
          return Response.json({ ok: false, error }, { status: body.status })
        }
        // Rule rejections ("not your turn", "name taken"…) are normal answers, not HTTP errors.
        return Response.json(performOp(params.code, body.value))
      },
    },
  },
})
