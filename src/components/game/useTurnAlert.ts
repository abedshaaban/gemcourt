import { useCallback, useEffect, useRef, useState } from 'react'

const BASE_TITLE = 'Splendor'
const TURN_TITLE = '● Your turn — Splendor'
const FLASH_TITLE = '○ YOUR TURN — Splendor'
const SOUND_KEY = 'splendor:turn-sound'

/** Browsers block sound and vibration until the page has had a tap or click; skip quietly until then. */
function hasUserGesture(): boolean {
  const ua = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation
  return ua ? ua.hasBeenActive : true
}

/** Two soft rising notes. Silently does nothing where WebAudio is unavailable or still locked. */
function playChime(ctxRef: { current: AudioContext | null }) {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    const ctx = (ctxRef.current ??= new Ctx())
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {})
    const now = ctx.currentTime
    for (const [i, freq] of [659.25, 987.77].entries()) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      const t = now + i * 0.14
      gain.gain.setValueAtTime(0.0001, t)
      gain.gain.exponentialRampToValueAtTime(0.12, t + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.45)
      osc.connect(gain).connect(ctx.destination)
      osc.start(t)
      osc.stop(t + 0.5)
    }
  } catch {
    // audio is a nicety; never let it break the board
  }
}

/**
 * Lets a player notice their turn from another tab or with the phone in hand:
 * tab title, a flashing title while the tab is hidden, a short vibration and an optional chime.
 * Everything touching the browser runs in effects, so server and first client render match.
 */
export function useTurnAlert(isMyTurn: boolean): { soundOn: boolean; toggleSound: () => void } {
  const [soundOn, setSoundOn] = useState(true)
  const soundRef = useRef(true)
  const audioRef = useRef<AudioContext | null>(null)
  const wasMyTurn = useRef<boolean | null>(null)

  // Saved preference (read after mount to avoid a hydration mismatch).
  useEffect(() => {
    try {
      const on = localStorage.getItem(SOUND_KEY) !== 'off'
      soundRef.current = on
      setSoundOn(on)
    } catch {
      // storage blocked: keep the default
    }
  }, [])

  const toggleSound = useCallback(() => {
    const on = !soundRef.current
    soundRef.current = on
    setSoundOn(on)
    try {
      localStorage.setItem(SOUND_KEY, on ? 'on' : 'off')
    } catch {
      // ignore
    }
  }, [])

  // Title, plus a flashing title while the tab is in the background.
  useEffect(() => {
    if (!isMyTurn) {
      document.title = BASE_TITLE
      return
    }
    document.title = TURN_TITLE
    let timer: number | undefined
    const stop = () => {
      if (timer !== undefined) window.clearInterval(timer)
      timer = undefined
      document.title = TURN_TITLE
    }
    const sync = () => {
      if (!document.hidden) return stop()
      if (timer !== undefined) return
      let on = false
      timer = window.setInterval(() => {
        on = !on
        document.title = on ? FLASH_TITLE : TURN_TITLE
      }, 1000)
    }
    sync()
    document.addEventListener('visibilitychange', sync)
    return () => {
      document.removeEventListener('visibilitychange', sync)
      if (timer !== undefined) window.clearInterval(timer)
    }
  }, [isMyTurn])

  // Restore the plain title when the board goes away.
  useEffect(
    () => () => {
      document.title = BASE_TITLE
    },
    [],
  )

  // Buzz and chime when the turn passes to me (not on first load).
  useEffect(() => {
    const prev = wasMyTurn.current
    wasMyTurn.current = isMyTurn
    if (prev === null || prev || !isMyTurn || !hasUserGesture()) return
    try {
      if (typeof navigator.vibrate === 'function' && window.matchMedia('(pointer: coarse)').matches) navigator.vibrate([90, 60, 90])
    } catch {
      // vibration may be blocked without a user gesture
    }
    if (soundRef.current) playChime(audioRef)
  }, [isMyTurn])

  useEffect(
    () => () => {
      void audioRef.current?.close().catch(() => {})
    },
    [],
  )

  return { soundOn, toggleSound }
}
