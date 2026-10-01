import { createFileRoute } from '@tanstack/react-router'
import { subscribe } from '~/server/rooms'
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
            const unsubscribe = subscribe(params.code, token, (view: RoomView) => {
              write(`data: ${JSON.stringify(view)}\n\n`)
            })
            if (!unsubscribe) {
              write(`event: missing\ndata: {}\n\n`)
              closed = true
              controller.close()
              return
            }
            const ping = setInterval(() => write(`: ping\n\n`), 15000)
            cleanup = () => {
              if (closed) return
              closed = true
              clearInterval(ping)
              unsubscribe()
              try {
                controller.close()
              } catch {}
            }
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
