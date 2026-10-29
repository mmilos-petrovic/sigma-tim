import { SCHOOL_TIME_ZONE } from './schoolDay'

const day = new Intl.DateTimeFormat('sr-Latn', {
  timeZone: SCHOOL_TIME_ZONE,
  weekday: 'short',
  day: 'numeric',
  month: 'long',
})
const time = new Intl.DateTimeFormat('sr-Latn', {
  timeZone: SCHOOL_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

/** "sre, 4. novembar", on the Belgrade calendar. */
export const formatDay = (iso: string) => day.format(new Date(iso))

/** "08:00", on the Belgrade clock. */
export const formatTime = (iso: string) => time.format(new Date(iso))

/** "08:00–09:30". */
export const formatRange = (start: string, end: string) => `${formatTime(start)}–${formatTime(end)}`
