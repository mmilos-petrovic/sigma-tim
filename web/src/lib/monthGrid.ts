/** The days of a month laid out in weeks for a date picker. The week starts on Monday and ends on Sunday. */

export const MONTH_NAMES = [
  'januar',
  'februar',
  'mart',
  'april',
  'maj',
  'jun',
  'jul',
  'avgust',
  'septembar',
  'oktobar',
  'novembar',
  'decembar',
]

/** Monday to Sunday. */
export const WEEKDAY_LETTERS = ['P', 'U', 'S', 'Č', 'P', 'S', 'N']

export interface DayCell {
  /** `2026-11-09`. */
  iso: string
  day: number
  /** Belongs to the month shown, not to the one before or after it. */
  inMonth: boolean
}

const DAY_MS = 86_400_000
const iso = (utc: number) => new Date(utc).toISOString().slice(0, 10)

/** Six weeks that cover the month (`month` is 0 to 11), so the picker does not change its height from month to month. */
export function monthGrid(year: number, month: number): DayCell[][] {
  const first = Date.UTC(year, month, 1)
  const mondayBased = (new Date(first).getUTCDay() + 6) % 7
  const start = first - mondayBased * DAY_MS
  return Array.from({ length: 6 }, (_, week) =>
    Array.from({ length: 7 }, (_, day) => {
      const utc = start + (week * 7 + day) * DAY_MS
      const date = new Date(utc)
      return { iso: iso(utc), day: date.getUTCDate(), inMonth: date.getUTCMonth() === month }
    }),
  )
}

/** The year and month (0 to 11) of `2026-11-09`; null for anything else. */
export function yearAndMonth(value: string): { year: number; month: number } | null {
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(value)
  return match ? { year: Number(match[1]), month: Number(match[2]) - 1 } : null
}

/** The month before (-1) or after (+1), across the turn of the year. */
export function shiftMonth(
  at: { year: number; month: number },
  by: number,
): { year: number; month: number } {
  const index = at.year * 12 + at.month + by
  return { year: Math.floor(index / 12), month: ((index % 12) + 12) % 12 }
}
