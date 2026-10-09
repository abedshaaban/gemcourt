import type { GemCounts, Noble } from './types'

// The 10 standard base-game nobles (3 prestige points each).
function n(id: string, req: Partial<GemCounts>): Noble {
  return {
    id,
    points: 3,
    requirement: {
      white: req.white ?? 0,
      blue: req.blue ?? 0,
      green: req.green ?? 0,
      red: req.red ?? 0,
      black: req.black ?? 0,
    },
  }
}

export const ALL_NOBLES: Noble[] = [
  n('n-01', { white: 4, blue: 4 }),
  n('n-02', { blue: 4, green: 4 }),
  n('n-03', { green: 4, red: 4 }),
  n('n-04', { red: 4, black: 4 }),
  n('n-05', { black: 4, white: 4 }),
  n('n-06', { white: 3, blue: 3, green: 3 }),
  n('n-07', { blue: 3, green: 3, red: 3 }),
  n('n-08', { green: 3, red: 3, black: 3 }),
  n('n-09', { red: 3, black: 3, white: 3 }),
  n('n-10', { black: 3, white: 3, blue: 3 }),
]
