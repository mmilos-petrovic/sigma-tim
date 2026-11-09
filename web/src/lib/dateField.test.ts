import { describe, expect, it } from 'vitest'
import { formatDate, parseDate } from './dateField'

describe('writing a date the way it is written at home', () => {
  it('turns the date of the calendar into day.month.year', () => {
    expect(formatDate('2026-11-09')).toBe('09.11.2026')
    expect(formatDate('2027-01-05')).toBe('05.01.2027')
  })

  it('shows nothing for no date, and leaves what is not a date alone', () => {
    expect(formatDate('')).toBe('')
    expect(formatDate('soon')).toBe('soon')
  })
})

describe('reading a date a person typed', () => {
  it('takes day.month.year, with or without leading zeros', () => {
    expect(parseDate('09.11.2026')).toBe('2026-11-09')
    expect(parseDate('9.11.2026')).toBe('2026-11-09')
    expect(parseDate('9.1.2026')).toBe('2026-01-09')
  })

  it('takes a dot at the end, which is how the date is often written', () => {
    expect(parseDate('09.11.2026.')).toBe('2026-11-09')
  })

  it('takes a slash, a dash or a space between the parts too', () => {
    expect(parseDate('09/11/2026')).toBe('2026-11-09')
    expect(parseDate('09-11-2026')).toBe('2026-11-09')
    expect(parseDate('09 11 2026')).toBe('2026-11-09')
    expect(parseDate('  09.11.2026  ')).toBe('2026-11-09')
  })

  it('wants a year of four digits', () => {
    expect(parseDate('09.11.26')).toBeNull()
    expect(parseDate('09.11.20266')).toBeNull()
  })

  it('refuses a date that does not exist', () => {
    expect(parseDate('31.02.2026')).toBeNull()
    expect(parseDate('29.02.2026')).toBeNull()
    expect(parseDate('29.02.2028')).toBe('2028-02-29') // a leap year
    expect(parseDate('00.11.2026')).toBeNull()
    expect(parseDate('09.13.2026')).toBeNull()
    expect(parseDate('32.01.2026')).toBeNull()
  })

  it('refuses what is not finished or not a date', () => {
    expect(parseDate('')).toBeNull()
    expect(parseDate('09.11.')).toBeNull()
    expect(parseDate('09')).toBeNull()
    expect(parseDate('abc')).toBeNull()
    expect(parseDate('2026-11-09')).toBeNull() // the other way round is not what is typed here
  })

  it('gives back the same date it formatted', () => {
    for (const iso of ['2026-11-09', '2028-02-29', '2027-12-31']) {
      expect(parseDate(formatDate(iso))).toBe(iso)
    }
  })
})
