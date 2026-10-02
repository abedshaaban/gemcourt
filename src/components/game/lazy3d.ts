import { lazy } from 'react'

// three.js (+ GLTFLoader) is by far the heaviest dependency. Loading it through dynamic imports keeps it
// out of the room route's chunk: the lobby renders without it, and the board's 2D fallbacks (CSS chips,
// felt background) show until the WebGL layers are ready.
const loadBank3D = () => import('./Bank3D')
const loadTableBoard3D = () => import('./TableBoard3D')

export const LazyBank3D = lazy(() => loadBank3D().then((m) => ({ default: m.Bank3D })))
export const LazyTableBoard3D = lazy(() => loadTableBoard3D().then((m) => ({ default: m.TableBoard3D })))

/** Warm the 3D chunk (and its models) when the browser is idle. Returns a cancel function. */
export function preload3D(): () => void {
  if (typeof window === 'undefined') return () => {}
  let cancelled = false
  const run = () => {
    if (cancelled) return
    void loadBank3D().catch(() => {})
    void loadTableBoard3D().catch(() => {})
  }
  if ('requestIdleCallback' in window) {
    const id = window.requestIdleCallback(run, { timeout: 3000 })
    return () => {
      cancelled = true
      window.cancelIdleCallback(id)
    }
  }
  const id = setTimeout(run, 500)
  return () => {
    cancelled = true
    clearTimeout(id)
  }
}
