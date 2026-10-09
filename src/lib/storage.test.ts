import { describe, expect, it } from 'vitest'
import { STORAGE_KEYS, legacyKey, readStored } from './storage'

/** Minimal in-memory Storage (vitest runs in node, without localStorage). */
function memoryStorage(initial: Record<string, string> = {}): Storage & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial))
  return {
    data,
    get length() { return data.size },
    key: (i: number) => [...data.keys()][i] ?? null,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, String(v)),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
  }
}

describe('readStored', () => {
  it('maps every key to its pre-rename name', () => {
    expect(legacyKey(STORAGE_KEYS.name)).toBe('splendor:name')
    expect(legacyKey(STORAGE_KEYS.tutorialDone)).toBe('splendor-tutorial-done')
    expect(legacyKey(STORAGE_KEYS.turnSound)).toBe('splendor:turn-sound')
    expect(legacyKey(STORAGE_KEYS.session('ABCD'))).toBe('splendor:session:ABCD')
  })

  it('reads the current key without touching a legacy one', () => {
    const store = memoryStorage({ 'gemcourt:name': 'Maya', 'splendor:name': 'Old' })
    expect(readStored(store, STORAGE_KEYS.name)).toBe('Maya')
    expect(store.data.get('splendor:name')).toBe('Old')
  })

  it('moves a legacy value to the new key once', () => {
    const store = memoryStorage({ 'splendor:session:ABCD': '{"token":"t","playerId":"p"}' })
    expect(readStored(store, STORAGE_KEYS.session('ABCD'))).toBe('{"token":"t","playerId":"p"}')
    expect([...store.data.entries()]).toEqual([['gemcourt:session:ABCD', '{"token":"t","playerId":"p"}']])
    expect(readStored(store, STORAGE_KEYS.session('ABCD'))).toBe('{"token":"t","playerId":"p"}')
  })

  it('returns null when neither key exists', () => {
    const store = memoryStorage()
    expect(readStored(store, STORAGE_KEYS.tutorialDone)).toBeNull()
    expect(store.data.size).toBe(0)
  })

  it('still returns the legacy value when writing fails, and never throws', () => {
    const store = memoryStorage({ 'splendor:turn-sound': 'off' })
    store.setItem = () => { throw new Error('QuotaExceededError') }
    expect(readStored(store, STORAGE_KEYS.turnSound)).toBe('off')
    const broken = memoryStorage()
    broken.getItem = () => { throw new Error('SecurityError') }
    expect(readStored(broken, STORAGE_KEYS.name)).toBeNull()
  })
})
