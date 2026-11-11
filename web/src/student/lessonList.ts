/** The rules of the student's and parent's lists, kept apart from the screens so they can be tested alone. */
import { formatDay } from '../teacher/format'
import { toWallClock } from '../teacher/schoolDay'
import {
  LATE_BOOKING_HOURS,
  type MyLesson,
  type OpenSlot,
  type StudentContext,
  type StudentRecord,
} from './studentApi'

const HOUR = 3_600_000
const time = (iso: string) => new Date(iso).getTime()

/** A booking made now for this start waits for the teacher (the database decides; this only tells the person beforehand). */
export function isLateBooking(start: string, now: Date): boolean {
  return time(start) - now.getTime() < LATE_BOOKING_HOURS * HOUR
}

/** A lesson can be cancelled until it starts. */
export function canCancel(lesson: Pick<MyLesson, 'start'>, now: Date): boolean {
  return time(lesson.start) > now.getTime()
}

/** Past means over: a lesson that is going on still belongs with the upcoming ones. */
export function isPast(lesson: Pick<MyLesson, 'end'>, now: Date): boolean {
  return time(lesson.end) <= now.getTime()
}

/**
 * The small label on a lesson. A past lesson the teacher has not recorded gets none on purpose: students and
 * parents are not told that the teacher has anything left to enter.
 */
export function statusChip(lesson: MyLesson, now: Date): string | null {
  if (isPast(lesson, now)) {
    if (lesson.status === 'pending') return 'Nije potvrđen'
    if (lesson.outcome === 'held') return 'Održan'
    if (lesson.outcome === 'not_held') return 'Nije održan'
    return null
  }
  if (time(lesson.start) <= now.getTime()) return 'U toku'
  return lesson.status === 'pending' ? 'Čeka potvrdu' : 'Potvrđen'
}

/**
 * Whether the row says that the lesson was paid for, also in advance (the teacher can mark a lesson that has not taken
 * place yet). A lesson that was not paid says nothing at all.
 */
export const showsPaid = (lesson: Pick<MyLesson, 'paid'>): boolean => lesson.paid

/** Soonest first. */
export const sortUpcoming = <T extends Pick<MyLesson, 'start'>>(lessons: readonly T[]): T[] =>
  [...lessons].sort((a, b) => time(a.start) - time(b.start))

/** Newest first. */
export const sortPast = <T extends Pick<MyLesson, 'start'>>(lessons: readonly T[]): T[] =>
  [...lessons].sort((a, b) => time(b.start) - time(a.start))

export interface SlotDay {
  /** `2026-11-05`, on the Belgrade calendar. */
  key: string
  /** "čet, 5. novembar". */
  title: string
  slots: OpenSlot[]
}

/** Free slots grouped by Belgrade day, in time order. */
export function groupSlotsByDay(slots: readonly OpenSlot[]): SlotDay[] {
  const days: SlotDay[] = []
  for (const slot of [...slots].sort((a, b) => time(a.start) - time(b.start))) {
    const key = toWallClock(new Date(slot.start)).date
    const last = days[days.length - 1]
    if (last && last.key === key) last.slots.push(slot)
    else days.push({ key, title: formatDay(slot.start), slots: [slot] })
  }
  return days
}

/** A map search for an address, for a phone to open in its map app. */
export const mapsUrl = (address: string): string =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`

/** How a record is named in the choice: a parent chooses a child, a student with two teachers chooses a teacher. */
export function recordLabel(context: StudentContext, record: StudentRecord): string {
  if (context === 'parent') return record.name
  if (!record.teacherId) return 'Bez nastavnika'
  return `Kod nastavnika: ${record.teacherName ?? 'nepoznat'}`
}

/** The remembered record if it is still one of theirs, else the first. */
export function pickRecord(
  records: readonly StudentRecord[],
  remembered: string | null,
): StudentRecord | null {
  return records.find((record) => record.id === remembered) ?? records[0] ?? null
}

/** Tells an edited note from the one the person already read (not a security hash, only a change marker). */
export function noteDigest(note: string): string {
  let hash = 5381
  for (let i = 0; i < note.length; i++) hash = ((hash * 33) ^ note.charCodeAt(i)) >>> 0
  return `${note.length}:${hash.toString(36)}`
}

export interface WatchedBooking {
  start: string
  subject: string
  /** The booking is no longer a lesson of the person and the person has not dismissed the notice yet. */
  gone?: boolean
}

/**
 * Keeps track of bookings that wait for the teacher, to tell the person when one disappears (the teacher declined it
 * or removed the slot). Until notifications exist this is the only way to know. Returns what to store next.
 *   still waiting -> watched; confirmed or over -> forgotten; gone before it started -> marked `gone` until dismissed.
 */
export function reconcileWatched(
  stored: Readonly<Record<string, WatchedBooking>>,
  current: readonly MyLesson[],
  now: Date,
): Record<string, WatchedBooking> {
  const byId = new Map(current.map((lesson) => [lesson.id, lesson]))
  const next: Record<string, WatchedBooking> = {}

  for (const [id, booking] of Object.entries(stored)) {
    const lesson = byId.get(id)
    if (lesson) {
      if (lesson.status === 'pending' && time(lesson.end) > now.getTime()) {
        next[id] = { start: lesson.start, subject: lesson.subject }
      }
    } else if (booking.gone) {
      next[id] = booking
    } else if (time(booking.start) > now.getTime()) {
      next[id] = { ...booking, gone: true }
    }
  }
  for (const lesson of current) {
    if (lesson.status === 'pending' && time(lesson.end) > now.getTime() && !(lesson.id in next)) {
      next[lesson.id] = { start: lesson.start, subject: lesson.subject }
    }
  }
  return next
}

export const goneBookings = (
  watched: Readonly<Record<string, WatchedBooking>>,
): ({ id: string } & WatchedBooking)[] =>
  Object.entries(watched)
    .filter(([, booking]) => booking.gone)
    .map(([id, booking]) => ({ id, start: booking.start, subject: booking.subject }))
