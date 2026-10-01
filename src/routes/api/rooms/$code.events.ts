import { createFileRoute } from '@tanstack/react-router'
import { subscribe } from '~/server/rooms'
import { SSE_PING_MS } from '~/lib/protocol'
import type { RoomView } from '~/lib/protocol'

const MAX_QUEUED = 50

// Server-Sent Events stream: pushes a fresh RoomView to this client on every room change.
export const Route = createFileRoute('/api/rooms/$code/events')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const token = new URL(request.url).searchParams.get('token')
        const encoder = new TextEncoder()
        let cleanup = () => {}

        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            let closed = false
            const write = (chunk: string) => {
              if (closed) return
              // Client stopped reading (e.g. sleeping laptop): drop it so presence reflects reality.
              if ((controller.desiredSize ?? 0) < -MAX_QUEUED) return cleanup()
              try {
                controller.enqueue(encoder.encode(chunk))
              } catch {
                cleanup()
              }
            }
            let unsubscribe: (() => void) | null = null
            let ping: ReturnType<typeof setInterval> | undefined
            // Set up before subscribing: the initial view is sent synchronously and may already fail.
            cleanup = () => {
              if (closed) return
              closed = true
              clearInterval(ping)
              unsubscribe?.()
              try {
                controller.close()
              } catch {}
            }
            unsubscribe = subscribe(params.code, token, (view: RoomView) => {
              write(`data: ${JSON.stringify(view)}\n\n`)
            })
            if (!unsubscribe) {
              write(`event: missing\ndata: {}\n\n`)
              closed = true
              try {
                controller.close()
              } catch {}
              return
            }
            if (closed) return unsubscribe() // first send failed while subscribing
            // A named event (not a comment) so the client can see it and detect a silently dead stream.
            ping = setInterval(() => write(`event: ping\ndata: {}\n\n`), SSE_PING_MS)
            request.signal.addEventListener('abort', () => cleanup())
          },
          cancel() {
            cleanup()
          },
        })

        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream; charset=utf-8',
            // `vite preview` gzips text responses and buffers them, which stalls the stream and hides
            // disconnects. An explicit identity encoding makes the compression middleware skip it.
            'Content-Encoding': 'identity',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
            'X-Accel-Buffering': 'no',
          },
        })
      },
    },
  },
})
