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

/** A log message with gem color words drawn as small chips. Player names are left untouched. */
export function LogText({ message, names }: { message: string; names: string[] }) {
  const sorted = names.filter(Boolean).sort((a, b) => b.length - a.length)
  if (sorted.length === 0) return <>{gemChips(message, 'm')}</>
  const parts = message.split(new RegExp(`(${sorted.map(escapeRe).join('|')})`))
  return (
    <>
      {parts.map((part, i) => (i % 2 === 1 ? part : gemChips(part, `p${i}`)))}
    </>
  )
}
