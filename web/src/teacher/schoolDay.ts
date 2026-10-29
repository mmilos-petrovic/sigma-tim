/**
 * The school day. Lessons are locked by calendar day in one fixed time zone (the database does the same), so the
 * client must not use the browser's zone: a teacher travelling abroad still works on Belgrade days.
 */
export const SCHOOL_TIME_ZONE = 'Europe/Belgrade'

const wallClock = new Intl.DateTimeFormat('en-GB', {
  timeZone: SCHOOL_TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

interface Wall {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

function wallOf(at: Date): Wall {
  const parts: Record<string, number> = {}
  for (const part of wallClock.formatToParts(at)) {
    if (part.type !== 'literal') parts[part.type] = Number(part.value)
  }
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
  }
}

/** Belgrade's offset from UTC at an instant, in milliseconds. */
function offsetAt(at: Date): number {
  const wall = wallOf(at)
  const asUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second)
  return asUtc - Math.floor(at.getTime() / 1000) * 1000
}

/** The instant at which the wall clock in Belgrade shows the given date at 00:00 (day may overflow into the next month). */
function midnightOf(year: number, month: number, day: number): Date {
  const wall = Date.UTC(year, month - 1, day)
  // Two passes settle the offset even when it differs between the guess and the answer (never at midnight, but cheap).
  let guess = wall - offsetAt(new Date(wall))
  guess = wall - offsetAt(new Date(guess))
  return new Date(guess)
}

/** 00:00 of the Belgrade day that contains the instant. */
export function schoolDayStart(at: Date): Date {
  const wall = wallOf(at)
  return midnightOf(wall.year, wall.month, wall.day)
}

/** 00:00 of the following day: the moment a lesson of this day gets locked. */
export function schoolDayEnd(at: Date): Date {
  const wall = wallOf(at)
  return midnightOf(wall.year, wall.month, wall.day + 1)
}

/** True when the day of the lesson is over, so its subject, place and time can no longer change. */
export function isDayLocked(lessonStart: Date, now: Date): boolean {
  return now.getTime() >= schoolDayEnd(lessonStart).getTime()
}

/** True once the lesson has begun (it can then be neither cancelled nor deleted). */
export function hasStarted(lessonStart: Date, now: Date): boolean {
  return lessonStart.getTime() <= now.getTime()
}
