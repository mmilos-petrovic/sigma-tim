import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Loaded, Notice } from '../../components/Loaded'
import { useNow } from '../../teacher/clock'
import { formatDay, formatTime } from '../../teacher/format'
import { CancelDialog } from '../components/CancelDialog'
import { LessonItem } from '../components/LessonItem'
import { goneBookings, noteDigest, reconcileWatched } from '../lessonList'
import { readSeenNotes, readWatched, writeSeenNote, writeWatched } from '../memory'
import { usePast, useUpcoming } from '../queries'
import { PAST_PAGE_SIZE, type MyLesson } from '../studentApi'
import { useStudentView } from '../view'

/** The lessons that are coming up, then the ones that are behind, as two accordion lists. */
export function LessonsPanel() {
  const { record, home, profileId } = useStudentView()
  const now = useNow()
  const [pastLimit, setPastLimit] = useState(PAST_PAGE_SIZE)
  const upcoming = useUpcoming(record.id)
  const past = usePast(record.id, pastLimit)

  const [openIds, setOpenIds] = useState<ReadonlySet<string>>(new Set())
  const [seen, setSeen] = useState(() => readSeenNotes(profileId))
  const [cancelling, setCancelling] = useState<MyLesson | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  // Bookings that waited for the teacher and have disappeared: told until dismissed. What the browser remembers is
  // read once per load of the lists; the effect only writes it back.
  const [dismissals, setDismissals] = useState(0)
  const upcomingData = upcoming.data
  const pastData = past.data
  const watched = useMemo(
    () =>
      upcomingData && pastData
        ? reconcileWatched(
            readWatched(profileId, record.id),
            [...upcomingData, ...pastData.lessons],
            now,
          )
        : null,
    // `dismissals` makes it read what the browser kept after a dismissal
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [upcomingData, pastData, profileId, record.id, now, dismissals],
  )
  useEffect(() => {
    if (watched) writeWatched(profileId, record.id, watched)
  }, [watched, profileId, record.id])
  const gone = watched ? goneBookings(watched) : []

  const dismissGone = () => {
    if (!watched) return
    const kept = Object.fromEntries(Object.entries(watched).filter(([, booking]) => !booking.gone))
    writeWatched(profileId, record.id, kept)
    setDismissals((count) => count + 1)
  }

  const toggle = (lesson: MyLesson) => {
    const opening = !openIds.has(lesson.id)
    setOpenIds((current) => {
      const next = new Set(current)
      if (opening) next.add(lesson.id)
      else next.delete(lesson.id)
      return next
    })
    if (opening && lesson.note) {
      const digest = noteDigest(lesson.note)
      writeSeenNote(profileId, lesson.id, digest)
      setSeen((current) => ({ ...current, [lesson.id]: digest }))
    }
  }

  const row = (lesson: MyLesson) => (
    <LessonItem
      key={lesson.id}
      lesson={lesson}
      now={now}
      open={openIds.has(lesson.id)}
      unread={lesson.note !== null && seen[lesson.id] !== noteDigest(lesson.note)}
      onToggle={() => toggle(lesson)}
      onCancel={() => setCancelling(lesson)}
    />
  )

  return (
    <>
      <Notice message={message} />
      {gone.map((booking) => (
        <p key={booking.id} role="status" className="notice">
          Nastavnik je odbio ili je uklonio termin: {booking.subject}, {formatDay(booking.start)}{' '}
          {formatTime(booking.start)}.{' '}
          <button
            type="button"
            className="button button--small button--secondary"
            onClick={dismissGone}
          >
            U redu
          </button>
        </p>
      ))}

      <section className="student__section">
        <h2>Predstojeći časovi</h2>
        <Loaded query={upcoming}>
          {(lessons) =>
            lessons.length === 0 ? (
              <p className="muted">
                Nema zakazanih časova.
                {record.teacherId && (
                  <>
                    {' '}
                    <Link to={`${home}/termini`}>Pogledajte slobodne termine.</Link>
                  </>
                )}
              </p>
            ) : (
              <ul className="lessons" aria-label="Predstojeći časovi">
                {lessons.map(row)}
              </ul>
            )
          }
        </Loaded>
      </section>

      <section className="student__section">
        <h2>Prošli časovi</h2>
        <Loaded query={past}>
          {({ lessons, hasMore }) => (
            <>
              {lessons.length === 0 ? (
                <p className="muted">Još nema prošlih časova.</p>
              ) : (
                <ul className="lessons" aria-label="Prošli časovi">
                  {lessons.map(row)}
                </ul>
              )}
              {hasMore && (
                <button
                  type="button"
                  className="button button--secondary"
                  disabled={past.isPlaceholderData}
                  onClick={() => setPastLimit((limit) => limit + PAST_PAGE_SIZE)}
                >
                  Prikaži starije
                </button>
              )}
            </>
          )}
        </Loaded>
      </section>

      {cancelling && (
        <CancelDialog
          lesson={cancelling}
          now={now}
          onClose={() => setCancelling(null)}
          onCancelled={(lesson) => {
            // a booking the person cancelled is not one that "disappeared"
            const watched = readWatched(profileId, record.id)
            delete watched[lesson.id]
            writeWatched(profileId, record.id, watched)
            setMessage(lesson.origin === 'slot' ? 'Rezervacija je otkazana.' : 'Čas je otkazan.')
          }}
        />
      )}
    </>
  )
}
