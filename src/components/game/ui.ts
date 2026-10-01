import type { GemColor, Tier, TokenColor, TurnPhase } from '../../game/types'

export const GEM_NAME: Record<TokenColor, string> = {
  white: 'Diamond',
  blue: 'Sapphire',
  green: 'Emerald',
  red: 'Ruby',
  black: 'Onyx',
  gold: 'Gold',
}

export const ROMAN: Record<Tier, string> = { 1: 'I', 2: 'II', 3: 'III' }

export const AVATAR_COLORS = ['#a8457f', '#2d8a95', '#c0712a', '#6656c4', '#4f8a3c', '#b8455a']

export function avatarColor(index: number): string {
  return AVATAR_COLORS[((index % AVATAR_COLORS.length) + AVATAR_COLORS.length) % AVATAR_COLORS.length]
}

export function initial(name: string): string {
  // Array.from splits by code point, so emoji stay whole.
  return (Array.from(name.trim())[0] ?? '?').toUpperCase()
}

export function phaseVerb(phase: TurnPhase): string {
  switch (phase) {
    case 'discard':
      return 'is returning tokens…'
    case 'chooseNoble':
      return 'is choosing a noble…'
    default:
      return 'is deciding…'
  }
}

export function describeCost(cost: Record<GemColor, number>): string {
  const parts = (Object.keys(cost) as GemColor[])
    .filter((c) => cost[c] > 0)
    .map((c) => `${cost[c]} ${GEM_NAME[c]}`)
  return parts.length ? parts.join(', ') : 'free'
}

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}
