import { useId } from 'react'
import { formatDay, formatRange } from '../../teacher/format'
import { canCancel, isPast, mapsUrl, showsPaid, statusChip } from '../lessonList'
import { useTeacherPhone } from '../queries'
import type { MyLesson } from '../studentApi'
import { PhoneLink } from '../../components/PhoneLink'
import { cancelLabel } from './labels'

const where = (lesson: MyLesson) =>
  [lesson.location, lesson.room].filter((part): part is string => Boolean(part)).join(', ')

/**
 * One lesson as an accordion row. Closed: date, time, subject and place. Open: for a lesson to come, the teacher with
 * a number to call, the address on a map, and the teacher's note; for a lesson that is over, only the note (and a
 * lesson without one does not open).
 */
export function LessonItem({
  lesson,
  now,
  open,
  unread,
  onToggle,
  onCancel,
}: {
  lesson: MyLesson
  now: Date
  open: boolean
  /** The note has not been opened since it was written or changed. */
  unread: boolean
  onToggle: () => void
  onCancel: () => void
}) {
  const bodyId = useId()
  const chip = statusChip(lesson, now)
  // A lesson that is over has only the teacher's note left to tell; without one there is nothing to open.
  const over = isPast(lesson, now)
  const expandable = !over || lesson.note !== null
  const phone = useTeacherPhone(open && !over ? lesson.teacherId : null)

  const head = (
    <>
      <span className="lesson__when">
        <strong>{formatDay(lesson.start)}</strong>
        <span>{formatRange(lesson.start, lesson.end)}</span>
      </span>
      <span className="lesson__what">
        {lesson.subject} · {where(lesson)}
      </span>
      <span className="lesson__marks">
        {chip && <span className="badge">{chip}</span>}
        {showsPaid(lesson) && <span className="badge badge--paid">Plaćen</span>}
        {unread && <span className="badge badge--new">Nova napomena</span>}
      </span>
    </>
  )

  return (
    <li className="lesson">
      {expandable ? (
        <button
          type="button"
          className="lesson__head"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={onToggle}
        >
          {head}
        </button>
      ) : (
        <div className="lesson__head lesson__head--static">{head}</div>
      )}

      {expandable && open && (
        <div className="lesson__body" id={bodyId} role="region" aria-label="Podaci o času">
          {!over && (
            <dl>
              <div>
                <dt>Nastavnik</dt>
                <dd>{lesson.teacherName ?? 'Nastavnik nije poznat'}</dd>
              </div>
              {phone.data && (
                <div>
                  <dt>Telefon</dt>
                  <dd>
                    <PhoneLink phone={phone.data} />
                  </dd>
                </div>
              )}
              <div>
                <dt>Mesto</dt>
                <dd>
                  <a href={mapsUrl(lesson.address)} target="_blank" rel="noopener noreferrer">
                    {lesson.address}
                  </a>
                  {lesson.room && <div className="muted">{lesson.room}</div>}
                </dd>
              </div>
            </dl>
          )}

          {lesson.note && (
            <section className="lesson__note">
              <h3>Napomena nastavnika</h3>
              <p>{lesson.note}</p>
            </section>
          )}

          {canCancel(lesson, now) && (
            <div className="actions">
              <button type="button" className="button button--secondary" onClick={onCancel}>
                {cancelLabel(lesson)}
              </button>
            </div>
          )}
        </div>
      )}
    </li>
  )
}
