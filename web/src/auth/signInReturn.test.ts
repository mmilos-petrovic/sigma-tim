import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearSignInStarted, markSignInStarted, peekSignInStarted } from './signInReturn'

afterEach(() => {
  vi.useRealTimers()
  clearSignInStarted()
})

describe('the note about a sign-in that has started', () => {
  it('is there after the sign-in started and gone once it is cleared', () => {
    expect(peekSignInStarted()).toBe(false)
    markSignInStarted()
    expect(peekSignInStarted()).toBe(true)
    // reading does not use it up
    expect(peekSignInStarted()).toBe(true)
    clearSignInStarted()
    expect(peekSignInStarted()).toBe(false)
  })

  it('is forgotten after ten minutes: a sign-in that never came back does not count', () => {
    vi.useFakeTimers()
    markSignInStarted()
    vi.advanceTimersByTime(9 * 60 * 1000)
    expect(peekSignInStarted()).toBe(true)
    vi.advanceTimersByTime(2 * 60 * 1000)
    expect(peekSignInStarted()).toBe(false)
  })

  it('is not there when the browser keeps nothing, or something that is not a time', () => {
    window.sessionStorage.setItem('sigma.signingIn', 'yes')
    expect(peekSignInStarted()).toBe(false)
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(peekSignInStarted()).toBe(false)
    vi.restoreAllMocks()
  })
})
