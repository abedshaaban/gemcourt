import { memo } from 'react'
import type { ReactNode } from 'react'
import type { TokenColor } from '../../game/types'
import { GemIcon } from './Gem'
import { cx } from './ui'

// The engine writes color words in lowercase ("took 1 diamond, 2 ruby"); map them back to colors.
const WORD_COLOR: Record<string, TokenColor> = {
  diamond: 'white',
  sapphire: 'blue',
  emerald: 'green',
  ruby: 'red',
  onyx: 'black',
  gold: 'gold',
}
// A leading count is part of the chip, except card tiers ("a tier 1 ruby card").
const GEM_RE = /(?:(?<!tier )(\d+) )?\b(diamond|sapphire|emerald|ruby|onyx|gold)\b(, (?=\d+ (?:diamond|sapphire|emerald|ruby|onyx|gold)\b))?/g

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function gemChips(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  for (const m of text.matchAll(GEM_RE)) {
    const [whole, count, word] = m
    const at = m.index ?? 0
    if (at > last) out.push(text.slice(last, at))
    const color = WORD_COLOR[word]
    const label = count ? `${count} ${word}` : word
    out.push(
      <span key={`${keyBase}-${at}`} className={cx('sp-logchip', `sp-c-${color}`)} role="img" aria-label={label} title={label}>
        {count ? <span className="sp-logchip__n">{count}</span> : <GemIcon color={color} className="sp-logchip__gem" />}
      </span>,
    )
    last = at + whole.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

// The name-splitting regex depends only on the player names, which rarely change: build it once per
// name list instead of once per log line per render (the full-game history can be hundreds of lines).
let cachedKey: string | null = null
let cachedRe: RegExp | null = null
function namesRegex(names: string[]): RegExp | null {
  const key = names.join('\u0000')
  if (key !== cachedKey) {
    const sorted = names.filter(Boolean).sort((a, b) => b.length - a.length)
    cachedKey = key
    cachedRe = sorted.length ? new RegExp(`(${sorted.map(escapeRe).join('|')})`) : null
  }
  return cachedRe
}

/** A log message with gem color words drawn as small chips. Player names are left untouched. */
export const LogText = memo(function LogText({ message, names }: { message: string; names: string[] }) {
  const re = namesRegex(names)
  if (!re) return <>{gemChips(message, 'm')}</>
  const parts = message.split(re)
  return (
    <>
      {parts.map((part, i) => (i % 2 === 1 ? part : gemChips(part, `p${i}`)))}
    </>
  )
})
