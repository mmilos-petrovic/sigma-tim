/** The rules of the teacher's list of lessons, kept apart from the screen so they can be tested alone. */
import { containsWords } from '../lib/text'
import { isPast } from '../student/lessonList'
import { studentNames } from './scheduleItems'
import type { LessonRow, StudentRow } from './teacherApi'

const time = (iso: string) => new Date(iso).getTime()

/**
 * The small label on a lesson. A past lesson without an outcome gets one, unlike what students see: the teacher is the
 * one who has to enter it.
 */
export function outcomeChip(lesson: LessonRow, now: Date): string | null {
  if (lesson.status === 'pending') return 'Čeka vaš odgovor'
  if (isPast(lesson, now)) {
    if (lesson.outcome === 'held') return 'Održan'
    if (lesson.outcome === 'not_held') return 'Nije održan'
    return 'Ishod nije upisan'
  }
  return time(lesson.start) <= now.getTime() ? 'U toku' : null
}

/** A lesson that took place, or may have, and somebody on it has not paid. */
export function needsPayment(lesson: LessonRow, now: Date): boolean {
  return (
    lesson.status === 'confirmed' &&
    isPast(lesson, now) &&
    lesson.outcome !== 'not_held' &&
    lesson.participants.some((p) => !p.paid)
  )
}

/**
 * What the row says about payment: all paid, or how many of the group, also in advance. "Nije plaćeno" only where
 * money is due. Nothing at all for a lesson that did not take place or has nobody on it.
 */
export function paidChip(lesson: LessonRow, now: Date): string | null {
  const total = lesson.participants.length
  if (total === 0) return null
  const paid = lesson.participants.filter((p) => p.paid).length
  if (paid === total) return 'Plaćeno'
  if (paid > 0) return `Plaćeno ${paid} od ${total}`
  return needsPayment(lesson, now) ? 'Nije plaćeno' : null
}

/** Every word typed is somewhere in the names of the students on the lesson. Nothing typed matches everything. */
export function matchesStudent(lesson: LessonRow, students: StudentRow[], query: string): boolean {
  return containsWords(studentNames(lesson, students), query)
}
