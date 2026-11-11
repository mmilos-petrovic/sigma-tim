import { describe, expect, it } from 'vitest'
import { dayHeaderParts } from './dayHeader'

describe('dayHeaderParts', () => {
  // a day starts at midnight on the Belgrade clock, which is 23:00 (winter) or 22:00 (summer) UTC the day before
  it.each([
    ['2026-11-01T23:00:00Z', 'P', '2.11.'],
    ['2026-11-02T23:00:00Z', 'U', '3.11.'],
    ['2026-11-03T23:00:00Z', 'S', '4.11.'],
    ['2026-11-04T23:00:00Z', 'Č', '5.11.'],
    ['2026-11-05T23:00:00Z', 'P', '6.11.'],
    ['2026-11-06T23:00:00Z', 'S', '7.11.'],
    ['2026-11-07T23:00:00Z', 'N', '8.11.'],
    ['2026-07-14T22:00:00Z', 'S', '15.7.'],
  ])('names the day that starts at %s', (start, weekday, date) => {
    expect(dayHeaderParts(new Date(start))).toEqual({ weekday, date })
  })

  it('is Latin script, as the rest of the app', () => {
    for (let day = 0; day < 7; day++) {
      const { weekday } = dayHeaderParts(new Date(Date.UTC(2026, 10, 1 + day, 23)))
      expect(weekday).toMatch(/^[A-ZČĆŠŽĐ]$/)
    }
  })
})
