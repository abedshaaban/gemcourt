import type { TokenColor } from '../../game/types'

// The same matte color covers the top, bottom and edge of every coin.
export const TOKEN_COLOR: Record<TokenColor, string> = {
  white: '#eeeade', blue: '#3876ac', green: '#287b59',
  red: '#b54a57', black: '#353943', gold: '#cda34d',
}
export const TOKEN_SYMBOL_COLOR = (color: TokenColor) =>
  color === 'white' || color === 'gold' ? '#174a35' : '#faf7ed'
