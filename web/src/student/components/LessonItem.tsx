import { useId } from 'react'
import { formatDay, formatRange } from '../../teacher/format'
import { canCancel, mapsUrl, showsPaid, statusChip } from '../lessonList'
import { useTeacherPhone } from '../queries'
import type { MyLesson } from '../studentApi'
import { PhoneLink } from './PhoneLink'
import { cancelLabel } from './labels'

const where = (lesson: MyLesson) =>
  [lesson.location, lesson.room].filter((part): part is string => Boolean(part)).join(', ')

/**
 * One lesson as an accordion row. Closed: date, time, subject and place. Open: teacher with a number to call, the
 * address on a map, and the teacher's note.
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
  const phone = useTeacherPhone(open ? lesson.teacherId : null)

  return (
    <li className="lesson">
      <button
        type="button"
        className="lesson__head"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={onToggle}
      >
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
      </button>

      {open && (
        <div className="lesson__body" id={bodyId} role="region" aria-label="Podaci o času">
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
