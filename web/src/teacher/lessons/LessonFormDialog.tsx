import { useRef, useState } from 'react'
import { Field, FormDialog } from '../../components/FormDialog'
import { explainError } from '../../admin/errors'
import { useNow } from '../clock'
import { useRefresh, useTeacherId } from '../queries'
import { describeConflict, lessonState } from '../scheduleItems'
import { toInstant, toWallClock } from '../schoolDay'
import { useTeacherApi } from '../TeacherApiProvider'
import {
  MAX_LESSON_STUDENTS,
  type Conflict,
  type LessonRow,
  type Reference,
  type StudentRow,
  type TimeRange,
} from '../teacherApi'
import { PlaceFields } from './PlaceFields'
import { usePlace } from './usePlace'

const QUARTER_MS = 15 * 60_000
const HOUR_MS = 60 * 60_000
const fullName = (student: StudentRow) => `${student.firstName} ${student.lastName}`

/** The first full hour after now, for one hour: where a new lesson starts unless a stretch of time was selected. */
function defaultRange(now: Date): TimeRange {
  const start = Math.floor(now.getTime() / HOUR_MS) * HOUR_MS + HOUR_MS
  return { start: new Date(start).toISOString(), end: new Date(start + HOUR_MS).toISOString() }
}

interface Props {
  /** The lesson to edit; without it the form schedules a new one. */
  lesson?: LessonRow
  /** For a new lesson: the stretch of time that was selected on the calendar. */
  initial?: TimeRange
  reference: Reference
  students: StudentRow[]
  onClose: () => void
  onDone: (message: string | null) => void
}

/** Schedules a lesson or edits one. An overlap is shown as a warning and sent only on the second click. */
export function LessonFormDialog({ lesson, initial, reference, students, onClose, onDone }: Props) {
  const api = useTeacherApi()
  const refresh = useRefresh()
  const teacherId = useTeacherId()
  const now = useNow()
  const editing = lesson !== undefined
  const state = lesson ? lessonState(lesson, now) : null
  // after the day of the lesson, or with an outcome, only the participants can change
  const placeLocked = state ? !state.canEditPlaceAndTime : false
  // a booked free slot keeps its length: moving it moves the end with it
  const fixedLength = lesson?.origin === 'slot'

  const range = lesson ?? initial ?? defaultRange(now)
  const first = toWallClock(new Date(range.start))
  const last = toWallClock(new Date(range.end))

  const place = usePlace(reference, lesson)
  const [date, setDate] = useState(first.date)
  const [startTime, setStartTime] = useState(first.time)
  const [endTime, setEndTime] = useState(last.time)
  const [studentIds, setStudentIds] = useState<string[]>(
    lesson?.participants.map((p) => p.studentId) ?? [],
  )
  const [acknowledged, setAcknowledged] = useState<{ key: string; conflicts: Conflict[] } | null>(
    null,
  )
  const step = useRef<'place' | 'students'>('place')

  const start = toInstant(date, startTime)
  const end =
    fixedLength && lesson
      ? new Date(
          start.getTime() + (new Date(lesson.end).getTime() - new Date(lesson.start).getTime()),
        )
      : toInstant(date, endTime)
  const key = [place.roomId, date, startTime, endTime].join('|')
  const warning = acknowledged && acknowledged.key === key ? acknowledged.conflicts : null

  const problem = (): string | null => {
    if (!placeLocked) {
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        return 'Unesite datum i vreme časa.'
      }
      if (start.getTime() % QUARTER_MS !== 0 || end.getTime() % QUARTER_MS !== 0) {
        return 'Vreme mora biti na svakih 15 minuta.'
      }
      if (end.getTime() <= start.getTime()) return 'Kraj časa mora biti posle početka.'
      const movedToThePast =
        start.getTime() < toInstant(toWallClock(now).date, '00:00').getTime() &&
        (!lesson || start.getTime() !== new Date(lesson.start).getTime())
      if (movedToThePast) {
        return lesson
          ? 'Čas ne može da se pomeri na dan koji je prošao.'
          : 'Čas ne može da počne na dan koji je prošao.'
      }
    }
    if (studentIds.length === 0) return 'Izaberite bar jednog učenika.'
    return null
  }

  const submit = async () => {
    const startIso = start.toISOString()
    const endIso = end.toISOString()
    const roomId = place.roomId || null

    if (!editing) {
      if (!warning) {
        const conflicts = await api.findConflicts({
          teacherId,
          roomId,
          start: startIso,
          end: endIso,
        })
        if (conflicts.length > 0) {
          setAcknowledged({ key, conflicts })
          return
        }
      }
      step.current = 'place'
      await api.scheduleLesson({
        subjectId: place.subjectId,
        locationId: place.locationId,
        roomId,
        start: startIso,
        end: endIso,
        studentIds,
      })
      await refresh()
      onDone('Čas je zakazan.')
      return
    }

    const patch: Parameters<typeof api.updateLesson>[1] = {}
    if (!placeLocked) {
      if (place.subjectId !== lesson.subjectId) patch.subjectId = place.subjectId
      if (place.locationId !== lesson.locationId) patch.locationId = place.locationId
      if (roomId !== lesson.roomId) patch.roomId = roomId
      // compared as instants: the same moment can be written in different ways
      if (start.getTime() !== new Date(lesson.start).getTime()) patch.start = startIso
      if (end.getTime() !== new Date(lesson.end).getTime()) patch.end = endIso
    }
    const timeOrPlaceChanged = Object.keys(patch).length > 0
    const before = lesson.participants.map((p) => p.studentId)
    const studentsChanged =
      before.length !== studentIds.length || before.some((id) => !studentIds.includes(id))
    if (!timeOrPlaceChanged && !studentsChanged) {
      onDone(null)
      return
    }

    if (timeOrPlaceChanged && !warning) {
      const conflicts = await api.findConflicts({
        teacherId,
        roomId,
        start: startIso,
        end: endIso,
        excludeLessonId: lesson.id,
      })
      if (conflicts.length > 0) {
        setAcknowledged({ key, conflicts })
        return
      }
    }
    try {
      if (timeOrPlaceChanged) {
        step.current = 'place'
        await api.updateLesson(lesson.id, patch)
      }
      if (studentsChanged) {
        step.current = 'students'
        await api.setLessonStudents(lesson.id, studentIds)
      }
    } finally {
      // whatever was saved before a failure is shown as it is
      await refresh()
    }
    onDone('Čas je izmenjen.')
  }

  const toggle = (id: string, checked: boolean) =>
    setStudentIds((ids) => (checked ? [...ids, id] : ids.filter((other) => other !== id)))

  return (
    <FormDialog
      title={editing ? 'Izmena časa' : 'Novi čas'}
      action={editing ? 'updateLesson' : 'scheduleLesson'}
      submitLabel={warning ? 'Sačuvaj i pored upozorenja' : editing ? 'Sačuvaj' : 'Zakaži'}
      onClose={onClose}
      validate={problem}
      explain={(failure) =>
        editing && step.current === 'students' ? explainError(failure, 'setLessonStudents') : null
      }
      onSubmit={submit}
    >
      {placeLocked && (
        <p className="notice notice--locked">
          Dan ovog časa je prošao ili je upisan ishod: predmet, mesto i vreme se više ne menjaju.
          Učenike i napomene i dalje možete da menjate.
        </p>
      )}
      <PlaceFields reference={reference} place={place} disabled={placeLocked} />
      <Field label="Datum" type="date" value={date} onChange={setDate} disabled={placeLocked} />
      <Field
        label="Početak"
        type="time"
        step={900}
        value={startTime}
        onChange={setStartTime}
        disabled={placeLocked}
      />
      <Field
        label="Kraj"
        type="time"
        step={900}
        value={fixedLength ? toWallClock(end).time : endTime}
        onChange={setEndTime}
        disabled={placeLocked || fixedLength}
      />
      {fixedLength && (
        <p className="muted">Slobodan termin zadržava trajanje; pomera se samo početak.</p>
      )}

      <fieldset className="choice">
        <legend>Učenici</legend>
        <p className="muted">Najviše {MAX_LESSON_STUDENTS} učenika.</p>
        {students.length === 0 && <p className="muted">Još nemate učenika.</p>}
        {students.map((student) => {
          const checked = studentIds.includes(student.id)
          return (
            <label key={student.id} className="check">
              <input
                type="checkbox"
                checked={checked}
                disabled={!checked && studentIds.length >= MAX_LESSON_STUDENTS}
                onChange={(event) => toggle(student.id, event.target.checked)}
              />
              <span>{fullName(student)}</span>
            </label>
          )
        })}
      </fieldset>

      {warning && (
        <div role="group" aria-label="Upozorenje o preklapanju" className="warning">
          <strong>Preklapanje</strong>
          <ul>
            {warning.map((conflict) => (
              <li key={`${conflict.teacherId}${conflict.start}`}>
                {describeConflict(conflict, teacherId, reference)}
              </li>
            ))}
          </ul>
          <p>Možete da sačuvate čas i pored upozorenja.</p>
        </div>
      )}
    </FormDialog>
  )
}
