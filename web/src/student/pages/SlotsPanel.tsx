import { useMemo, useState } from 'react'
import { Navigate } from 'react-router'
import { Loaded } from '../../components/Loaded'
import { formatDay, formatRange } from '../../teacher/format'
import { BookDialog } from '../components/BookDialog'
import { PhoneLink } from '../components/PhoneLink'
import { groupSlotsByDay } from '../lessonList'
import { useSlots, useTeacherPhone } from '../queries'
import type { LessonStatus, OpenSlot } from '../studentApi'
import { useStudentView } from '../view'

const minutes = (slot: OpenSlot) =>
  Math.round((new Date(slot.end).getTime() - new Date(slot.start).getTime()) / 60_000)

/** The teacher's free slots, the first one on top, each with a button to take it. */
export function SlotsPanel() {
  const { context, record, home } = useStudentView()
  const slots = useSlots(record.teacherId)
  const phone = useTeacherPhone(record.teacherId)
  const [booking, setBooking] = useState<OpenSlot | null>(null)
  const [booked, setBooked] = useState<LessonStatus | null>(null)

  const days = useMemo(() => groupSlotsByDay(slots.data ?? []), [slots.data])

  // Nobody teaches this student, so there is nothing to take.
  if (!record.teacherId) return <Navigate to={home} replace />

  return (
    <>
      {booked === 'confirmed' && (
        <p role="status" className="notice">
          Termin je zauzet. Vidite ga u spisku časova.
        </p>
      )}
      {booked === 'pending' && (
        <p role="status" className="notice">
          Zahtev je poslat. Nastavnik mora da potvrdi termin.
          {phone.data && (
            <>
              {' '}
              Pozovite nastavnika: <PhoneLink phone={phone.data} />
            </>
          )}
        </p>
      )}

      <Loaded query={slots}>
        {() =>
          days.length === 0 ? (
            <p className="muted">Nastavnik trenutno nema slobodnih termina.</p>
          ) : (
            days.map((day) => (
              <section key={day.key} className="student__section">
                <h2>{day.title}</h2>
                <ul className="slots">
                  {day.slots.map((slot) => (
                    <li key={slot.id} className="slot">
                      <div className="slot__info">
                        <strong>{formatRange(slot.start, slot.end)}</strong>
                        <span>
                          {slot.subject} · {slot.location}
                          {slot.room ? `, ${slot.room}` : ''}
                        </span>
                        <span className="muted">{minutes(slot)} min</span>
                      </div>
                      <button
                        type="button"
                        className="button"
                        aria-label={`Zauzmi termin ${formatDay(slot.start)} ${formatRange(slot.start, slot.end)}`}
                        onClick={() => {
                          setBooked(null)
                          setBooking(slot)
                        }}
                      >
                        Zauzmi
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )
        }
      </Loaded>

      {booking && (
        <BookDialog
          slot={booking}
          context={context}
          record={record}
          onClose={() => setBooking(null)}
          onBooked={setBooked}
        />
      )}
    </>
  )
}
