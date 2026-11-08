import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  readLastRecord,
  readSeenNotes,
  readWatched,
  writeLastRecord,
  writeSeenNote,
  writeWatched,
} from './memory'

afterEach(() => {
  window.localStorage.clear()
  vi.restoreAllMocks()
})

describe('the last record looked at', () => {
  it('is remembered per person and per context', () => {
    writeLastRecord('p1', 'parent', 's-a')
    writeLastRecord('p1', 'student', 's-b')
    writeLastRecord('p2', 'parent', 's-c')
    expect(readLastRecord('p1', 'parent')).toBe('s-a')
    expect(readLastRecord('p1', 'student')).toBe('s-b')
    expect(readLastRecord('p2', 'parent')).toBe('s-c')
    expect(readLastRecord('p3', 'parent')).toBeNull()
  })
})

describe('notes already read', () => {
  it('keeps what was read per lesson, per person', () => {
    writeSeenNote('p1', 'l1', '5:abc')
    writeSeenNote('p1', 'l2', '7:def')
    expect(readSeenNotes('p1')).toEqual({ l1: '5:abc', l2: '7:def' })
    expect(readSeenNotes('p2')).toEqual({})
  })

  it('replaces the mark of a lesson when it is read again', () => {
    writeSeenNote('p1', 'l1', 'old')
    writeSeenNote('p1', 'l1', 'new')
    expect(readSeenNotes('p1')).toEqual({ l1: 'new' })
  })
})

describe('bookings being watched', () => {
  it('stores and returns them, and an empty set clears them', () => {
    writeWatched('p1', 's-a', { l1: { start: '2026-11-05T10:00:00Z', subject: 'Matematika' } })
    expect(readWatched('p1', 's-a')).toEqual({
      l1: { start: '2026-11-05T10:00:00Z', subject: 'Matematika' },
    })
    expect(readWatched('p1', 's-b')).toEqual({})
    writeWatched('p1', 's-a', {})
    expect(readWatched('p1', 's-a')).toEqual({})
  })
})

describe('when the browser cannot store anything', () => {
  it('reads as empty and never throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(readLastRecord('p1', 'parent')).toBeNull()
    expect(readSeenNotes('p1')).toEqual({})
    expect(readWatched('p1', 's')).toEqual({})
    expect(() => writeLastRecord('p1', 'parent', 's')).not.toThrow()
    expect(() => writeSeenNote('p1', 'l', 'd')).not.toThrow()
    expect(() => writeWatched('p1', 's', {})).not.toThrow()
  })

  it('ignores stored text that is not what was written', () => {
    window.localStorage.setItem('sigma.seenNotes.p1', '{not json')
    window.localStorage.setItem('sigma.watched.p1.s', '[1,2]')
    expect(readSeenNotes('p1')).toEqual({})
    expect(readWatched('p1', 's')).toEqual({})
  })
})
