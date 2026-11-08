/**
 * What the browser remembers for a student or parent: the record last looked at, the notes already read, and the
 * bookings that were waiting for the teacher. Per person and per device only, nothing here is important: storage can be
 * blocked (a private window), then everything simply reads as empty.
 */
import type { StudentContext } from './studentApi'
import type { WatchedBooking } from './lessonList'

const lastKey = (profileId: string, context: StudentContext) =>
  `sigma.lastRecord.${context}.${profileId}`
const seenKey = (profileId: string) => `sigma.seenNotes.${profileId}`
const watchedKey = (profileId: string, studentId: string) =>
  `sigma.watched.${profileId}.${studentId}`

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // blocked: the person is simply not remembered
  }
}

/** A stored object, or an empty one when there is none or it is not an object. */
function readObject<T>(key: string): Record<string, T> {
  const text = read(key)
  if (!text) return {}
  try {
    const value: unknown = JSON.parse(text)
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, T>)
      : {}
  } catch {
    return {}
  }
}

export const readLastRecord = (profileId: string, context: StudentContext): string | null =>
  read(lastKey(profileId, context))

export const writeLastRecord = (profileId: string, context: StudentContext, studentId: string) =>
  write(lastKey(profileId, context), studentId)

/** Lesson id to the digest of the note as it was when the person opened it. */
export const readSeenNotes = (profileId: string): Record<string, string> =>
  readObject<string>(seenKey(profileId))

export function writeSeenNote(profileId: string, lessonId: string, digest: string): void {
  write(seenKey(profileId), JSON.stringify({ ...readSeenNotes(profileId), [lessonId]: digest }))
}

/** Lesson id to what the booking was, for the bookings waiting for the teacher when last seen. */
export const readWatched = (profileId: string, studentId: string): Record<string, WatchedBooking> =>
  readObject<WatchedBooking>(watchedKey(profileId, studentId))

export const writeWatched = (
  profileId: string,
  studentId: string,
  watched: Record<string, WatchedBooking>,
) => write(watchedKey(profileId, studentId), JSON.stringify(watched))
