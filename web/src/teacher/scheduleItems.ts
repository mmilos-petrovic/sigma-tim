import type { CalendarItem } from './calendar/WeekCalendar'
import { OWN_COLOR, teacherColor } from './colors'
import { formatRange } from './format'
import { hasStarted, isDayLocked } from './schoolDay'
import type { BusyRow, Conflict, LessonRow, Reference, StudentRow } from './teacherApi'

const fullName = (person: { firstName: string; lastName: string }) =>
  `${person.firstName} ${person.lastName}`

/** What can still be done with a lesson at a given moment. These mirror the database's rules; the database decides. */
export function lessonState(lesson: LessonRow, now: Date) {
  const start = new Date(lesson.start)
  const started = hasStarted(start, now)
  const ended = new Date(lesson.end).getTime() <= now.getTime()
  // frozen after 23:59 of its day, and as soon as an outcome is recorded
  const locked = isDayLocked(start, now) || lesson.outcome !== null
  return {
    started,
    ended,
    locked,
    /** Subject, place and time: a booking that waits for an answer is answered first, not edited. */
    canEditPlaceAndTime: !locked && lesson.status !== 'pending',
    /** Deleting, cancelling and removing a slot only work before the start. */
    canCancel: !started,
    canRecordOutcome: lesson.status === 'confirmed' && ended,
  }
}

export function roomName(reference: Reference, locationId: string, roomId: string | null) {
  if (!roomId) return null
  return (
    reference.locations.find((l) => l.id === locationId)?.rooms.find((r) => r.id === roomId)
      ?.name ?? null
  )
}

export function studentNames(lesson: LessonRow, students: StudentRow[]) {
  return lesson.participants
    .map((p) => {
      const student = students.find((s) => s.id === p.studentId)
      return student ? fullName(student) : 'Nepoznat učenik'
    })
    .join(', ')
}

interface Inputs {
  lessons: LessonRow[]
  busy: BusyRow[]
  students: StudentRow[]
  reference: Reference
  teacherId: string
  now: Date
}

/** The blocks of the weekly calendar: the teacher's own lessons and slots, and the time colleagues are busy. */
export function buildItems({ lessons, busy, students, reference, teacherId, now }: Inputs) {
  const items: CalendarItem[] = []

  for (const lesson of lessons) {
    // a free slot that has begun is of no use to anyone
    if (lesson.status === 'open' && new Date(lesson.start) <= now) continue
    const state = lessonState(lesson, now)
    const room = roomName(reference, lesson.locationId, lesson.roomId)
    const subject = reference.subjects.find((s) => s.id === lesson.subjectId)?.name ?? 'Čas'
    const names = studentNames(lesson, students)
    const movable = state.canEditPlaceAndTime
    // a slot is 45 or 60 minutes, whether or not somebody booked it
    const resizable = movable && lesson.origin !== 'slot'

    const base = { id: lesson.id, start: lesson.start, end: lesson.end, movable, resizable }
    if (lesson.status === 'open') {
      items.push({
        ...base,
        title: 'Slobodan termin',
        detail: [subject, room].filter(Boolean).join(' · '),
        color: OWN_COLOR,
        variant: 'slot',
      })
    } else if (lesson.status === 'pending') {
      items.push({
        ...base,
        title: 'Na čekanju',
        detail: [names, subject].filter(Boolean).join(' · '),
        color: OWN_COLOR,
        variant: 'pending',
      })
    } else {
      items.push({
        ...base,
        title: subject,
        detail: [names, room].filter(Boolean).join(' · '),
        color: OWN_COLOR,
        variant: state.locked ? 'own locked' : 'own',
      })
    }
  }

  for (const block of busy) {
    if (block.teacherId === teacherId) continue
    const colleague = reference.colleagues.find((c) => c.id === block.teacherId)
    const room = roomName(reference, block.locationId, block.roomId)
    items.push({
      id: `busy:${block.teacherId}:${block.start}`,
      start: block.start,
      end: block.end,
      title: 'Zauzeto',
      detail: [colleague ? fullName(colleague) : 'Drugi nastavnik', room]
        .filter(Boolean)
        .join(' · '),
      color: teacherColor(block.teacherId),
      variant: 'busy',
      movable: false,
      resizable: false,
    })
  }

  return items
}

/** A warning about an overlap, in words. Never a reason to refuse. */
export function describeConflict(conflict: Conflict, teacherId: string, reference: Reference) {
  const when = formatRange(conflict.start, conflict.end)
  const room = conflict.roomId
    ? reference.locations.flatMap((l) => l.rooms).find((r) => r.id === conflict.roomId)?.name
    : null
  if (conflict.sameTeacher) {
    return `Već imate čas u to vreme (${when})${conflict.sameRoom && room ? ` u istoj učionici (${room}).` : '.'}`
  }
  const colleague = reference.colleagues.find((c) => c.id === conflict.teacherId)
  const who =
    colleague && conflict.teacherId !== teacherId ? fullName(colleague) : 'drugi nastavnik'
  return `Učionica${room ? ` (${room})` : ''} je u to vreme (${when}) zauzeta: nastavnik ${who}.`
}
