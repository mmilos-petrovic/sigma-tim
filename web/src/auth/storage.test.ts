import { afterEach, describe, expect, it, vi } from 'vitest'
import { readLastContext, writeLastContext } from './lastContext'
import { sanitizeReturnTo, saveReturnTo, takeReturnTo } from './returnTo'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('last context', () => {
  it('is remembered per person', () => {
    writeLastContext('profile-a', 'teacher')
    writeLastContext('profile-b', 'admin')
    expect(readLastContext('profile-a')).toBe('teacher')
    expect(readLastContext('profile-b')).toBe('admin')
    expect(readLastContext('profile-c')).toBeNull()
  })

  it('is overwritten by the latest choice', () => {
    writeLastContext('profile-a', 'teacher')
    writeLastContext('profile-a', 'admin')
    expect(readLastContext('profile-a')).toBe('admin')
  })

  it('ignores a stored value that is not a context', () => {
    window.localStorage.setItem('sigma.lastContext.profile-a', 'superuser')
    expect(readLastContext('profile-a')).toBeNull()
  })

  it('survives storage that throws (private window, blocked site data)', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(() => writeLastContext('profile-a', 'teacher')).not.toThrow()
    expect(readLastContext('profile-a')).toBeNull()
  })
})

describe('return page', () => {
  it('keeps an in-app path, with query and hash', () => {
    expect(sanitizeReturnTo('/moj-raspored')).toBe('/moj-raspored')
    expect(sanitizeReturnTo('/moj-raspored/nedelja?dan=2#top')).toBe(
      '/moj-raspored/nedelja?dan=2#top',
    )
  })

  it('refuses anything that could leave the app or loop through the sign-in pages', () => {
    for (const bad of [
      'https://evil.example',
      '//evil.example',
      '/\\evil.example',
      'javascript:alert(1)',
      'moj-raspored',
      '',
      null,
      undefined,
      '/prijava',
      '/prijava?error=x',
      '/nije-clan',
    ]) {
      expect(sanitizeReturnTo(bad)).toBeNull()
    }
  })

  it('is stored for the trip to Google and taken back exactly once', () => {
    saveReturnTo('/moj-raspored')
    expect(takeReturnTo()).toBe('/moj-raspored')
    expect(takeReturnTo()).toBeNull()
  })

  it('does not store a path it refuses', () => {
    saveReturnTo('//evil.example')
    expect(takeReturnTo()).toBeNull()
  })

  it('survives storage that throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(() => saveReturnTo('/moj-raspored')).not.toThrow()
    expect(takeReturnTo()).toBeNull()
  })
})
