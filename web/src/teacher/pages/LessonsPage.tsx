import { useState } from 'react'
import { Field } from '../../components/FormDialog'
import { Loaded, Notice, PageHeader } from '../../components/Loaded'
import { PAST_PAGE_SIZE } from '../../student/studentApi'
import { sortPast, sortUpcoming } from '../../student/lessonList'
import { useNow } from '../clock'
import { formatDay, formatRange } from '../format'
import { LessonViewer } from '../lessons/LessonViewer'
import { matchesStudent, needsPayment, outcomeChip, paidChip } from '../lessonsList'
import { usePastLessons, useReference, useStudents, useUpcomingLessons } from '../queries'
import { roomName, studentNames } from '../scheduleItems'
import { ownLocations, type LessonRow, type Reference, type StudentRow } from '../teacherApi'

/** With a search or a filter the whole history is looked through, since what is wanted can be anywhere in it. */
const EVERYTHING = 1000

function Row({
  lesson,
  reference,
  students,
  now,
  onOpen,
}: {
  lesson: LessonRow
  reference: Reference
  students: StudentRow[]
  now: Date
  onOpen: () => void
}) {
  // what is the same for every lesson of a teacher (the one subject, the one location) is not repeated on each row
  const subject =
    reference.subjects.length === 1
      ? undefined
      : (reference.subjects.find((s) => s.id === lesson.subjectId)?.name ?? 'Čas')
  const location =
    ownLocations(reference).length === 1
      ? undefined
      : reference.locations.find((l) => l.id === lesson.locationId)?.name
  const room = roomName(reference, lesson.locationId, lesson.roomId)
  const what = [subject, [location, room].filter(Boolean).join(', ')].filter(Boolean).join(' · ')
  const chips = [outcomeChip(lesson, now), paidChip(lesson, now)].filter(
    (chip): chip is string => chip !== null,
  )

  return (
    <li className="lesson">
      <button type="button" className="lesson__head" onClick={onOpen}>
        <span className="lesson__when">
          <strong>{formatDay(lesson.start)}</strong>
          <span>{formatRange(lesson.start, lesson.end)}</span>
        </span>
        <span className="lesson__what">
          <strong>{studentNames(lesson, students)}</strong>
          {what && <span>{what}</span>}
        </span>
        <span className="lesson__marks">
          {chips.map((chip) => (
            <span key={chip} className="badge">
              {chip}
            </span>
          ))}
        </span>
      </button>
    </li>
  )
}

/** All the teacher's lessons and bookings: the ones still to come, then the ones behind, to work on one by one. */
export function LessonsPage() {
  const now = useNow()
  const [query, setQuery] = useState('')
  const [unpaidOnly, setUnpaidOnly] = useState(false)
  const [shown, setShown] = useState(PAST_PAGE_SIZE)
  const [openId, setOpenId] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const filtering = query.trim() !== '' || unpaidOnly
  const reference = useReference()
  const students = useStudents()
  const upcoming = useUpcomingLessons()
  const past = usePastLessons(filtering ? EVERYTHING : shown)

  return (
    <>
      <PageHeader title="Časovi" />
      <Notice message={notice} />

      <Loaded query={reference}>
        {(ref) => (
          <Loaded query={students}>
            {(people) => (
              <Loaded query={upcoming}>
                {(coming) => (
                  <Loaded query={past}>
                    {(behind) => {
                      const keep = (lesson: LessonRow) => matchesStudent(lesson, people, query)
                      const ahead = unpaidOnly ? [] : sortUpcoming(coming.filter(keep))
                      const before = sortPast(
                        behind.lessons.filter(
                          (lesson) => keep(lesson) && (!unpaidOnly || needsPayment(lesson, now)),
                        ),
                      )
                      const opened = [...coming, ...behind.lessons].find((l) => l.id === openId)
                      const row = (lesson: LessonRow) => (
                        <Row
                          key={lesson.id}
                          lesson={lesson}
                          reference={ref}
                          students={people}
                          now={now}
                          onOpen={() => setOpenId(lesson.id)}
                        />
                      )

                      return (
                        <>
                          <div className="list-filter">
                            <Field
                              label="Pretraga po učeniku"
                              type="search"
                              value={query}
                              onChange={setQuery}
                              maxLength={100}
                            />
                            <label className="check">
                              <input
                                type="checkbox"
                                checked={unpaidOnly}
                                onChange={(event) => setUnpaidOnly(event.target.checked)}
                              />
                              <span>Samo nenaplaćeni</span>
                            </label>
                          </div>

                          {ahead.length === 0 && before.length === 0 && (
                            <p className="muted">
                              {filtering ? 'Nema časova koji odgovaraju.' : 'Još nemate časova.'}
                            </p>
                          )}

                          {ahead.length > 0 && (
                            <section className="student__section">
                              <h2>Predstojeći</h2>
                              <ul className="lessons" aria-label="Predstojeći časovi">
                                {ahead.map(row)}
                              </ul>
                            </section>
                          )}

                          {before.length > 0 && (
                            <section className="student__section">
                              <h2>Prošli</h2>
                              <ul className="lessons" aria-label="Prošli časovi">
                                {before.map(row)}
                              </ul>
                              {!filtering && behind.hasMore && (
                                <button
                                  type="button"
                                  className="button button--secondary"
                                  onClick={() => setShown((count) => count + PAST_PAGE_SIZE)}
                                >
                                  Prikaži starije
                                </button>
                              )}
                            </section>
                          )}

                          {opened && (
                            <LessonViewer
                              lesson={opened}
                              reference={ref}
                              students={people}
                              onClose={() => setOpenId(null)}
                              onDone={(message) => {
                                setOpenId(null)
                                setNotice(message)
                              }}
                            />
                          )}
                        </>
                      )
                    }}
                  </Loaded>
                )}
              </Loaded>
            )}
          </Loaded>
        )}
      </Loaded>
    </>
  )
}
