import { SCHOOL_TIME_ZONE } from '../schoolDay'

const weekdayFormat = new Intl.DateTimeFormat('sr-Latn', {
  timeZone: SCHOOL_TIME_ZONE,
  weekday: 'narrow',
})
const dayFormat = new Intl.DateTimeFormat('sr-Latn', {
  timeZone: SCHOOL_TIME_ZONE,
  day: 'numeric',
  month: 'numeric',
})

/** What the head of a day column says on a phone: the letter of the weekday ("P", "Č") and the date ("5.11."). */
export function dayHeaderParts(date: Date): { weekday: string; date: string } {
  const part = (type: 'day' | 'month') =>
    dayFormat.formatToParts(date).find((p) => p.type === type)?.value ?? ''
  return {
    weekday: weekdayFormat.format(date).toLocaleUpperCase('sr-Latn'),
    date: `${part('day')}.${part('month')}.`,
  }
}
