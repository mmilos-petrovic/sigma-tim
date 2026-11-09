import { useState } from 'react'
import { explainError } from '../../admin/errors'
import { formatDay, formatRange } from '../format'
import { studentNames } from '../scheduleItems'
import { useRefresh } from '../queries'
import { useTeacherApi } from '../TeacherApiProvider'
import { DeclineDialog } from './DeclineDialog'
import type { LessonRow, Reference, StudentRow } from '../teacherApi'

/** Late bookings (made less than 12 hours ahead): the teacher confirms them, or declines and frees the slot. */
export function PendingBookings({
  bookings,
  reference,
  students,
  onNotice,
  onError,
}: {
  bookings: LessonRow[]
  reference: Reference
  students: StudentRow[]
  onNotice: (message: string) => void
  onError: (message: string) => void
}) {
  const api = useTeacherApi()
  const refresh = useRefresh()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [declining, setDeclining] = useState<LessonRow | null>(null)

  if (bookings.length === 0) return null

  const confirm = async (booking: LessonRow) => {
    if (busyId) return
    setBusyId(booking.id)
    try {
      await api.confirmBooking(booking.id)
      onNotice('Zahtev je potvrđen.')
      await refresh()
    } catch (failure) {
      onError(explainError(failure, 'confirmBooking'))
      await refresh()
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="pending">
      <h2>Zahtevi na čekanju</h2>
      <p className="muted">Zauzeto je manje od 12 sati pre početka. Potvrdite ili odbijte.</p>
      <ul className="plain-list">
        {bookings.map((booking) => {
          const who = studentNames(booking, students)
          const subject = reference.subjects.find((s) => s.id === booking.subjectId)?.name ?? 'Čas'
          return (
            <li
              key={booking.id}
              aria-label={`${who}, ${subject}, ${formatDay(booking.start)}, ${formatRange(booking.start, booking.end)}`}
            >
              <strong>{who}</strong>
              <span>{subject}</span>
              <span>
                {formatDay(booking.start)}, {formatRange(booking.start, booking.end)}
              </span>
              <button
                type="button"
                className="button button--small"
                disabled={busyId !== null}
                onClick={() => void confirm(booking)}
              >
                Potvrdi
              </button>
              <button
                type="button"
                className="button button--small button--secondary"
                disabled={busyId !== null}
                onClick={() => setDeclining(booking)}
              >
                Odbij
              </button>
            </li>
          )
        })}
      </ul>
      {declining && (
        <DeclineDialog
          booking={declining}
          reference={reference}
          students={students}
          onClose={() => setDeclining(null)}
          onDone={(message) => {
            setDeclining(null)
            onNotice(message)
          }}
        />
      )}
    </section>
  )
}
