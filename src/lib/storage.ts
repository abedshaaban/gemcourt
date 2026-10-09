// Browser storage keys, and a one-time migration from the names used before the game was renamed from
// "Splendor" to "Gemcourt", so existing players keep their name, their tab's seat and their tutorial/sound choices.

export const STORAGE_KEYS = {
  name: 'gemcourt:name',
  tutorialDone: 'gemcourt-tutorial-done',
  turnSound: 'gemcourt:turn-sound',
  session: (code: string) => `gemcourt:session:${code}`,
}

const PREFIX = 'gemcourt'
const LEGACY_PREFIX = 'splendor'

/** The pre-rename key for a `gemcourt…` key, e.g. `gemcourt:name` → `splendor:name`. */
export const legacyKey = (key: string) => LEGACY_PREFIX + key.slice(PREFIX.length)

/**
 * `store.getItem(key)`, except that if `key` is missing but its pre-rename key exists, the value is moved over
 * (copied to `key`, old key removed) and returned. Never throws: unavailable storage reads as `null`.
 */
export function readStored(store: Storage, key: string): string | null {
  try {
    const value = store.getItem(key)
    if (value !== null || !key.startsWith(PREFIX)) return value
    const old = store.getItem(legacyKey(key))
    if (old === null) return null
    try {
      store.setItem(key, old)
      store.removeItem(legacyKey(key))
    } catch {
      /* quota or disabled storage: the old value is still returned */
    }
    return old
  } catch {
    return null
  }
}
