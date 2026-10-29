import { useState } from 'react'
import { Field, FormDialog } from '../../components/FormDialog'
import { useNow } from '../clock'
import { useRefresh, useTeacherId } from '../queries'
import { toInstant, toWallClock } from '../schoolDay'
import { useTeacherApi } from '../TeacherApiProvider'
import { SLOT_MINUTES, type Reference, type SlotMinutes, type TimeRange } from '../teacherApi'
import { PlaceFields } from './PlaceFields'
import { usePlace } from './usePlace'

const QUARTER_MS = 15 * 60_000
const HOUR_MS = 60 * 60_000

/** Publishes a free slot (45 or 60 minutes) that the teacher's own students and their parents can book. */
export function SlotDialog({
  reference,
  initial,
  onClose,
  onDone,
}: {
  reference: Reference
  /** A stretch of time selected on the calendar: only its start is used, the length is chosen here. */
  initial?: TimeRange
  onClose: () => void
  onDone: (message: string | null) => void
}) {
  const api = useTeacherApi()
  const refresh = useRefresh()
  const teacherId = useTeacherId()
  const now = useNow()
  const place = usePlace(reference)

  const first = toWallClock(
    initial
      ? new Date(initial.start)
      : new Date(Math.floor(now.getTime() / HOUR_MS) * HOUR_MS + HOUR_MS),
  )
  const [date, setDate] = useState(first.date)
  const [time, setTime] = useState(first.time)
  const [minutes, setMinutes] = useState<SlotMinutes>(60)

  const start = toInstant(date, time)

  return (
    <FormDialog
      title="Novi slobodan termin"
      action="publishSlot"
      submitLabel="Objavi"
      onClose={onClose}
      validate={() => {
        if (Number.isNaN(start.getTime())) return 'Unesite datum i vreme termina.'
        if (start.getTime() % QUARTER_MS !== 0) return 'Vreme mora biti na svakih 15 minuta.'
        if (start.getTime() <= now.getTime()) return 'Slobodan termin mora biti u budućnosti.'
        return null
      }}
      onSubmit={async () => {
        await api.publishSlot({
          teacherId,
          subjectId: place.subjectId,
          locationId: place.locationId,
          roomId: place.roomId || null,
          start: start.toISOString(),
          minutes,
        })
        await refresh()
        onDone('Slobodan termin je objavljen.')
      }}
    >
      <p>Vide ga i mogu da ga zauzmu samo vaši učenici i njihovi roditelji.</p>
      <PlaceFields reference={reference} place={place} />
      <Field label="Datum" type="date" value={date} onChange={setDate} />
      <Field label="Početak" type="time" step={900} value={time} onChange={setTime} />
      <fieldset className="choice">
        <legend>Trajanje</legend>
        {SLOT_MINUTES.map((option) => (
          <label key={option} className="check">
            <input
              type="radio"
              name="slot-minutes"
              checked={minutes === option}
              onChange={() => setMinutes(option)}
            />
            <span>{option} minuta</span>
          </label>
        ))}
      </fieldset>
    </FormDialog>
  )
}
