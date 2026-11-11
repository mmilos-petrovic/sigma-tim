import { describe, expect, it } from 'vitest'
import { monthGrid, shiftMonth, WEEKDAY_LETTERS, yearAndMonth } from './monthGrid'

describe('monthGrid', () => {
  it('starts every week on Monday, so Sunday is the last column', () => {
    // 1 November 2026 is a Sunday: the first row is Monday 26 October to Sunday 1 November
    const grid = monthGrid(2026, 10)
    expect(grid[0].map((cell) => cell.iso)).toEqual([
      '2026-10-26',
      '2026-10-27',
      '2026-10-28',
      '2026-10-29',
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
    ])
    expect(WEEKDAY_LETTERS).toHaveLength(7)
    expect(WEEKDAY_LETTERS[6]).toBe('N')
  })

  it('has six whole weeks, with the days of the month marked', () => {
    const grid = monthGrid(2026, 10)
    expect(grid).toHaveLength(6)
    for (const week of grid) expect(week).toHaveLength(7)
    const inMonth = grid.flat().filter((cell) => cell.inMonth)
    expect(inMonth).toHaveLength(30)
    expect(inMonth[0].iso).toBe('2026-11-01')
    expect(inMonth[29].iso).toBe('2026-11-30')
  })

  it('knows a month that starts on a Monday and a leap year', () => {
    expect(monthGrid(2026, 5)[0][0]).toEqual({ iso: '2026-06-01', day: 1, inMonth: true })
    expect(
      monthGrid(2028, 1)
        .flat()
        .filter((cell) => cell.inMonth),
    ).toHaveLength(29)
  })
})

describe('yearAndMonth and shiftMonth', () => {
  it('reads the month of a date and nothing else', () => {
    expect(yearAndMonth('2026-11-09')).toEqual({ year: 2026, month: 10 })
    expect(yearAndMonth('')).toBeNull()
    expect(yearAndMonth('09.11.2026')).toBeNull()
  })

  it('moves across the turn of the year', () => {
    expect(shiftMonth({ year: 2026, month: 11 }, 1)).toEqual({ year: 2027, month: 0 })
    expect(shiftMonth({ year: 2026, month: 0 }, -1)).toEqual({ year: 2025, month: 11 })
    expect(shiftMonth({ year: 2026, month: 5 }, 1)).toEqual({ year: 2026, month: 6 })
  })
})
