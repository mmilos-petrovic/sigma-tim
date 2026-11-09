/** A date as the calendar says it (`2026-11-09`) and as it is written at home (`09.11.2026`). */

/** `09.11.2026` for `2026-11-09`; anything that is not a date comes back as it is. */
export function formatDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  return match ? `${match[3]}.${match[2]}.${match[1]}` : iso
}

/**
 * The date (`2026-11-09`) of what a person typed: day, month and a year of four digits, separated by dots, slashes,
 * dashes or spaces, with or without leading zeros and a dot at the end. Null when it is not a date that exists.
 */
export function parseDate(text: string): string | null {
  const match = /^(\d{1,2})[./\s-]+(\d{1,2})[./\s-]+(\d{4})\.?$/.exec(text.trim())
  if (!match) return null
  const [day, month, year] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const iso = `${match[3]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  // a day that does not exist (31 February) rolls over into the next month, which gives a different date
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10) === iso ? iso : null
}
