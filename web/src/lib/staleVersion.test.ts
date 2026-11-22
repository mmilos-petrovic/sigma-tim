import { describe, expect, it, vi } from 'vitest'
import { isChunkLoadError, reloadForNewVersion } from './staleVersion'

describe('isChunkLoadError', () => {
  it('knows what the browsers say when a screen loaded on demand is gone', () => {
    for (const message of [
      'Failed to fetch dynamically imported module: https://sigmatim.com/assets/ContextPage-abc.js',
      'error loading dynamically imported module: https://sigmatim.com/assets/ContextPage-abc.js',
      'Importing a module script failed.',
      'Unable to preload CSS for /assets/WeekCalendar-abc.css',
    ]) {
      expect(isChunkLoadError(new Error(message))).toBe(true)
    }
  })

  it('does not mind how the browser writes it', () => {
    expect(isChunkLoadError(new Error('FAILED TO FETCH DYNAMICALLY IMPORTED MODULE: x'))).toBe(true)
    expect(isChunkLoadError(new Error('importing a module script failed.'))).toBe(true)
    expect(isChunkLoadError(new Error('UNABLE TO PRELOAD CSS FOR /a.css'))).toBe(true)
  })

  it('is not any other error, and not something that is not an error', () => {
    // something thrown that only looks like one
    expect(isChunkLoadError({ message: 'Failed to fetch dynamically imported module: x' })).toBe(
      false,
    )
    expect(isChunkLoadError(new Error('x is undefined'))).toBe(false)
    expect(isChunkLoadError(new TypeError('Failed to fetch'))).toBe(false)
    expect(isChunkLoadError('Failed to fetch dynamically imported module')).toBe(false)
    expect(isChunkLoadError(null)).toBe(false)
  })
})

describe('reloadForNewVersion', () => {
  const storage = (value: string | null = null) => {
    const kept = { value }
    return {
      kept,
      getItem: vi.fn(() => kept.value),
      setItem: vi.fn((_key: string, next: string) => {
        kept.value = next
      }),
    }
  }

  it('loads the page again, and remembers when', () => {
    const reload = vi.fn()
    const store = storage()
    expect(reloadForNewVersion({ now: 1_000_000, storage: store, reload })).toBe(true)
    expect(reload).toHaveBeenCalledTimes(1)
    expect(store.setItem).toHaveBeenCalledWith('sigma.reloadedAt', '1000000')
  })

  it('does not do it again within a minute', () => {
    const reload = vi.fn()
    const store = storage('1000000')
    expect(reloadForNewVersion({ now: 1_000_000 + 59_999, storage: store, reload })).toBe(false)
    expect(reload).not.toHaveBeenCalled()
    expect(store.setItem).not.toHaveBeenCalled()
  })

  it('does it again after a minute', () => {
    const reload = vi.fn()
    const store = storage('1000000')
    expect(reloadForNewVersion({ now: 1_000_000 + 60_000, storage: store, reload })).toBe(true)
    expect(reload).toHaveBeenCalledTimes(1)
    expect(store.kept.value).toBe(String(1_060_000))
  })

  it('goes by the first reload in a row: two in a minute are never allowed', () => {
    const reload = vi.fn()
    const store = storage()
    expect(reloadForNewVersion({ now: 5_000_000, storage: store, reload })).toBe(true)
    expect(reloadForNewVersion({ now: 5_000_500, storage: store, reload })).toBe(false)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('ignores a note that is not a time', () => {
    const reload = vi.fn()
    expect(reloadForNewVersion({ now: 1, storage: storage('garbage'), reload })).toBe(true)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('does not reload when the browser keeps nothing: it could not tell a second reload from the first', () => {
    const reload = vi.fn()
    const broken = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    }
    expect(reloadForNewVersion({ now: 1, storage: broken, reload })).toBe(false)
    expect(reload).not.toHaveBeenCalled()

    const readOnly = {
      getItem: () => null,
      setItem: vi.fn(() => {
        throw new Error('full')
      }),
    }
    expect(reloadForNewVersion({ now: 1, storage: readOnly, reload })).toBe(false)
    expect(reload).not.toHaveBeenCalled()
  })

  it('uses the session storage and the page of the browser when it is given nothing', () => {
    window.sessionStorage.clear()
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload })
    try {
      expect(reloadForNewVersion({ now: 42 })).toBe(true)
      expect(window.sessionStorage.getItem('sigma.reloadedAt')).toBe('42')
      expect(reload).toHaveBeenCalledTimes(1)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
