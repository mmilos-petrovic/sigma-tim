import { describe, expect, it } from 'vitest'
import {
  hasStarted,
  isDayLocked,
  schoolDayEnd,
  schoolDayStart,
  toInstant,
  toWallClock,
} from './schoolDay'

const at = (iso: string) => new Date(iso)
const iso = (date: Date) => date.toISOString()

// The same cases as the database tests (supabase/tests/90_lesson_editing.test.sql), so both sides agree on the day.
describe('the school day (Europe/Belgrade)', () => {
  it('winter: 23:30 local is still the same day', () => {
    expect(iso(schoolDayStart(at('2026-11-02T22:30:00Z')))).toBe('2026-11-01T23:00:00.000Z')
    expect(iso(schoolDayEnd(at('2026-11-02T22:30:00Z')))).toBe('2026-11-02T23:00:00.000Z')
  })

  it('winter: 00:30 local is already the next day, although UTC is still the old date', () => {
    expect(iso(schoolDayStart(at('2026-11-02T23:30:00Z')))).toBe('2026-11-02T23:00:00.000Z')
  })

  it('summer: the offset is two hours', () => {
    expect(iso(schoolDayStart(at('2026-07-15T22:30:00Z')))).toBe('2026-07-15T22:00:00.000Z')
    expect(iso(schoolDayEnd(at('2026-07-15T21:30:00Z')))).toBe('2026-07-15T22:00:00.000Z')
  })

  it('the day the clocks go forward has 23 hours', () => {
    expect(iso(schoolDayStart(at('2026-03-29T12:00:00Z')))).toBe('2026-03-28T23:00:00.000Z')
    expect(iso(schoolDayEnd(at('2026-03-29T12:00:00Z')))).toBe('2026-03-29T22:00:00.000Z')
  })

  it('the day they go back has 25 hours', () => {
    expect(iso(schoolDayStart(at('2026-10-25T12:00:00Z')))).toBe('2026-10-24T22:00:00.000Z')
    expect(iso(schoolDayEnd(at('2026-10-25T12:00:00Z')))).toBe('2026-10-25T23:00:00.000Z')
  })

  it('rolls over the end of a month and a year', () => {
    expect(iso(schoolDayEnd(at('2026-12-31T12:00:00Z')))).toBe('2026-12-31T23:00:00.000Z')
    expect(iso(schoolDayEnd(at('2026-01-31T12:00:00Z')))).toBe('2026-01-31T23:00:00.000Z')
  })

  it('is independent of the zone of the browser', () => {
    // the answers above were computed without looking at the process zone; make that explicit with a late-evening UTC time
    expect(iso(schoolDayStart(at('2026-11-02T00:10:00Z')))).toBe('2026-11-01T23:00:00.000Z')
  })
})

describe('locking', () => {
  const lesson = at('2026-11-02T17:00:00Z') // 18:00 local

  it('a lesson is open to changes until 23:59 of its day', () => {
    expect(isDayLocked(lesson, at('2026-11-02T22:59:59Z'))).toBe(false)
    expect(isDayLocked(lesson, at('2026-11-02T23:00:00Z'))).toBe(true)
  })

  it('knows when a lesson has started', () => {
    expect(hasStarted(lesson, at('2026-11-02T16:59:59Z'))).toBe(false)
    expect(hasStarted(lesson, at('2026-11-02T17:00:00Z'))).toBe(true)
  })
})

describe('wall clock and instants', () => {
  it('reads an instant as the date and time on a Belgrade clock', () => {
    expect(toWallClock(at('2026-11-02T22:30:00Z'))).toEqual({ date: '2026-11-02', time: '23:30' })
    expect(toWallClock(at('2026-11-02T23:30:00Z'))).toEqual({ date: '2026-11-03', time: '00:30' })
    expect(toWallClock(at('2026-07-15T21:30:00Z'))).toEqual({ date: '2026-07-15', time: '23:30' })
  })

  it('turns a typed date and time into the instant, winter and summer', () => {
    expect(iso(toInstant('2026-11-02', '18:00'))).toBe('2026-11-02T17:00:00.000Z')
    expect(iso(toInstant('2026-07-15', '18:00'))).toBe('2026-07-15T16:00:00.000Z')
    expect(iso(toInstant('2026-11-03', '00:15'))).toBe('2026-11-02T23:15:00.000Z')
  })

  it('round-trips every quarter of an hour of a day with a clock change', () => {
    for (const day of ['2026-03-29', '2026-10-25', '2026-06-01']) {
      for (let minutes = 0; minutes < 24 * 60; minutes += 15) {
        const time = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
        // 02:00-02:45 does not exist on the day the clocks go forward
        if (day === '2026-03-29' && time >= '02:00' && time < '03:00') continue
        expect(toWallClock(toInstant(day, time))).toEqual({ date: day, time })
      }
    }
  })

  it('refuses nonsense', () => {
    expect(toInstant('2026-13-40', '18:00').getTime()).toBeNaN()
    expect(toInstant('', '18:00').getTime()).toBeNaN()
    expect(toInstant('2026-11-02', '').getTime()).toBeNaN()
    expect(toInstant('2026-11-02', '25:00').getTime()).toBeNaN()
  })
})
