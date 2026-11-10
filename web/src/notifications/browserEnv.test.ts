import { describe, expect, it } from 'vitest'
import { createLocalPushPrefs, isIos } from './browserEnv'
import { readPromptState, writePromptState } from './promptState'

describe('isIos', () => {
  it('recognises an iPhone and an iPod', () => {
    expect(isIos('Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) Safari/605.1', 5)).toBe(
      true,
    )
    expect(isIos('Mozilla/5.0 (iPod touch; CPU iPhone OS 15_0 like Mac OS X)', 5)).toBe(true)
  })

  it('recognises an iPad, also when it asks for the desktop site', () => {
    expect(isIos('Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) Safari/605.1', 5)).toBe(true)
    expect(isIos('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15', 5)).toBe(true)
  })

  it('does not take a Mac for an iPad', () => {
    expect(isIos('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15', 0)).toBe(false)
  })

  it('leaves Android and Windows alone', () => {
    expect(
      isIos('Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/124.0 Mobile Safari/537.36', 5),
    ).toBe(false)
    expect(isIos('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0 Safari/537.36', 0)).toBe(
      false,
    )
  })
})

/** A storage that holds nothing, or fails like a blocked one. */
function storage(kind: 'works' | 'throws'): () => Storage {
  const data = new Map<string, string>()
  const fail = () => {
    throw new Error('blocked')
  }
  return () =>
    ({
      getItem: kind === 'throws' ? fail : (key: string) => data.get(key) ?? null,
      setItem: kind === 'throws' ? fail : (key: string, value: string) => void data.set(key, value),
      removeItem: kind === 'throws' ? fail : (key: string) => void data.delete(key),
    }) as unknown as Storage
}

describe('the choice to switch push off on this device', () => {
  it('is remembered per person', () => {
    const prefs = createLocalPushPrefs(storage('works'))
    expect(prefs.isOff('a')).toBe(false)
    prefs.setOff('a', true)
    expect(prefs.isOff('a')).toBe(true)
    expect(prefs.isOff('b')).toBe(false)
    prefs.setOff('a', false)
    expect(prefs.isOff('a')).toBe(false)
  })

  it('is simply not remembered when storage fails', () => {
    const prefs = createLocalPushPrefs(storage('throws'))
    expect(() => prefs.setOff('a', true)).not.toThrow()
    expect(prefs.isOff('a')).toBe(false)
  })
})

describe('how far the invitation has got', () => {
  it('starts at nothing and moves on per person', () => {
    const store = storage('works')
    expect(readPromptState('a', store)).toBeNull()
    writePromptState('a', 'asked', store)
    expect(readPromptState('a', store)).toBe('asked')
    expect(readPromptState('b', store)).toBeNull()
    writePromptState('a', 'dismissed', store)
    expect(readPromptState('a', store)).toBe('dismissed')
  })

  it('ignores a value it does not know and survives failing storage', () => {
    const store = storage('works')
    store().setItem('push-prompt:a', 'nonsense')
    expect(readPromptState('a', store)).toBeNull()
    const broken = storage('throws')
    expect(() => writePromptState('a', 'asked', broken)).not.toThrow()
    expect(readPromptState('a', broken)).toBeNull()
  })
})
