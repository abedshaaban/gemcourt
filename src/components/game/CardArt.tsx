import type { GemColor, Tier } from '../../game/types'

const palettes: Record<GemColor, { sky: string; light: string; dark: string; accent: string }> = {
  white: { sky: '#c9e9ed', light: '#eff2d7', dark: '#617c86', accent: '#b5c3cb' },
  blue: { sky: '#77b8d5', light: '#e2d29c', dark: '#244c72', accent: '#edf0dc' },
  green: { sky: '#94c17d', light: '#e8d78f', dark: '#285841', accent: '#c2df9e' },
  red: { sky: '#dd9066', light: '#f3cf86', dark: '#783b3b', accent: '#f4ba65' },
  black: { sky: '#837f9f', light: '#d9c38e', dark: '#303143', accent: '#c5a967' },
}

/** A small original vector vignette: rendered as art on the card itself, never as UI text. */
export function CardArt({ color, tier, cardId }: { color: GemColor; tier: Tier; cardId: string }) {
  const p = palettes[color]
  const id = `art-${cardId}`
  const variation = Number(cardId.match(/(\d+)$/)?.[1] ?? tier)
  const sunX = 105 + (variation * 11) % 32
  const sunY = 34 + (variation * 7) % 24
  return (
    <svg className="sp-card__art" viewBox="0 0 160 190" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-sky`} x2="0" y2="1">
          <stop stopColor={p.sky} />
          <stop offset="1" stopColor={p.light} />
        </linearGradient>
        <linearGradient id={`${id}-stone`} x2="0.8" y2="1">
          <stop stopColor={p.accent} />
          <stop offset="1" stopColor={p.dark} />
        </linearGradient>
        <linearGradient id={`${id}-glow`} x2="0" y2="1">
          <stop stopColor="#fff7cf" stopOpacity=".9" />
          <stop offset="1" stopColor={p.accent} stopOpacity=".15" />
        </linearGradient>
      </defs>
      <rect width="160" height="190" fill={`url(#${id}-sky)`} />
      <circle cx={sunX} cy={sunY} r={17 + (variation % 6)} fill="#fff1c3" opacity=".7" />
      <circle cx={19 + (variation * 17) % 118} cy={28 + (variation * 13) % 48} r="1.7" fill="#fff7d8" opacity=".72" />
      <path d="M0 104 31 67l22 28 27-42 31 43 20-28 29 39v83H0Z" fill={p.dark} opacity=".32" />
      {color === 'white' && <>
        <path d="m9 124 42-68 28 36 26-49 47 75v72H9Z" fill={`url(#${id}-stone)`} />
        <path d="m51 56 12 39-12 7-13-6Zm54-13 12 42-13 7-12-8Z" fill="#f3fbf5" opacity=".8" />
        <path d="m58 103 21-32 19 31-19 42Z" fill="#dffaff" opacity=".82" />
        <path d="m79 71 19 31-19 42Z" fill="#74a6b4" opacity=".76" />
      </>}
      {color === 'blue' && <>
        <path d="M0 111q26-16 52 0t54 0 54 0v79H0Z" fill="#347e9c" />
        <path d="M0 130q26-16 52 0t54 0 54 0" fill="none" stroke="#c1e3d8" strokeWidth="4" opacity=".8" />
        <path d="M55 124h67l-11 15H66Z" fill={p.dark} />
        <path d="M84 62v61H56q18-34 28-61Z" fill={`url(#${id}-glow)`} />
        <path d="M88 78v45h31Z" fill="#fff1c3" opacity=".84" />
        <path d="M83 57v67" stroke={p.dark} strokeWidth="4" />
        <path d="M78 147q19-9 38 0t38 0" fill="none" stroke="#e6d69b" strokeWidth="2" />
      </>}
      {color === 'green' && <>
        <path d="M0 140q40-24 80 0t80 0v50H0Z" fill="#47734b" />
        <path d="M42 148V78a38 38 0 0 1 76 0v70" fill="none" stroke={p.dark} strokeWidth="10" />
        <path d="M51 145V80a29 29 0 0 1 58 0v65Z" fill="#d9edb3" opacity=".72" />
        <path d="M80 148V54m-1 47q-33-2-36-30 29 2 36 30Zm2-17q29-5 34-29-27 5-34 29Z" fill="#3d7650" />
        <path d="M29 166h102M37 174h86" stroke="#decf9a" strokeWidth="3" opacity=".8" />
      </>}
      {color === 'red' && <>
        <path d="M0 125h160v65H0Z" fill={p.dark} />
        <path d="M34 145V87h92v58" fill={`url(#${id}-stone)`} stroke={p.dark} strokeWidth="7" />
        <path d="M49 142v-29a31 31 0 0 1 62 0v29Z" fill="#f0a35b" />
        <path d="M60 142v-23a20 20 0 0 1 40 0v23Z" fill="#f8d481" />
        <path d="M23 84h114M42 74l12-22h52l12 22" fill="none" stroke="#f1d29b" strokeWidth="5" />
        <path d="M65 104q16-24 31 0-15 5-14 28-11-13-17-28Z" fill="#fff1b0" opacity=".9" />
      </>}
      {color === 'black' && <>
        <path d="M0 132h160v58H0Z" fill="#443d42" />
        <path d="M22 132V86l22-23 22 23v46Zm48 0V54l26-28 26 28v78Zm56 0V79l19-19 19 19v53Z" fill={`url(#${id}-stone)`} />
        <path d="M79 132V77a17 17 0 0 1 34 0v55Z" fill="#e4a75d" opacity=".92" />
        <path d="M0 147h160M16 158h128M30 169h100" stroke="#cba96b" strokeWidth="3" opacity=".65" />
        <circle cx="96" cy="82" r="8" fill="#ffe3a2" />
      </>}
      <rect x="7" y="7" width="146" height="176" rx="5" fill="none" stroke="#fff4d6" strokeOpacity=".52" strokeWidth="2" />
    </svg>
  )
}
