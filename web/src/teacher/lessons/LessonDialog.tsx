import { useState } from 'react'
import { explainError } from '../../admin/errors'
import { Dialog } from '../../components/Dialog'
import { FormDialog } from '../../components/FormDialog'
import { useNow } from '../clock'
import { formatDay, formatRange } from '../format'
import { useRefresh } from '../queries'
import { lessonState, roomName } from '../scheduleItems'
import { useTeacherApi } from '../TeacherApiProvider'
import type { LessonRow, Outcome, Participant, Reference, StudentRow } from '../teacherApi'

const fullName = (student: StudentRow) => `${student.firstName} ${student.lastName}`
const OUTCOME_TEXT: Record<Outcome, string> = { held: 'održan', not_held: 'nije održan' }

function NoteEditor({
  lesson,
  participant,
  student,
}: {
  lesson: LessonRow
  participant: Participant
  student: StudentRow | undefined
}) {
  const api = useTeacherApi()
  const refresh = useRefresh()
  const name = student ? fullName(student) : 'Nepoznat učenik'
  const [text, setText] = useState(participant.note ?? '')
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)
  const [busy, setBusy] = useState(false)

  const save = async () => {
    if (busy) return
    setBusy(true)
    setMessage(null)
    try {
      await api.setNote(lesson.id, participant.studentId, text.trim() || null)
      await refresh()
      setMessage({ text: 'Napomena je sačuvana.', error: false })
    } catch (failure) {
      setMessage({ text: explainError(failure, 'setNote'), error: true })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="note">
      <label className="field">
        <span>Napomena za {name}</span>
        <textarea
          value={text}
          maxLength={2000}
          rows={2}
          onChange={(event) => {
            setText(event.target.value)
            setMessage(null)
          }}
        />
      </label>
      <button
        type="button"
        className="button button--small button--secondary"
        aria-label={`Sačuvaj napomenu za ${name}`}
        disabled={busy || text.trim() === (participant.note ?? '')}
        onClick={() => void save()}
      >
        Sačuvaj napomenu
      </button>
      {message && (
        <p
          role={message.error ? 'alert' : 'status'}
          className={message.error ? 'form-error' : 'muted'}
        >
          {message.text}
        </p>
      )}
    </div>
  )
}

/** One lesson, slot or booking: what it is, notes per student, the outcome, and what can still be done with it. */
export function LessonDialog({
  lesson,
  reference,
  students,
  onClose,
  onEdit,
  onDone,
}: {
  lesson: LessonRow
  reference: Reference
  students: StudentRow[]
  onClose: () => void
  onEdit: () => void
  /** The lesson is gone or the teacher is done; the message is shown on the page. */
  onDone: (message: string) => void
}) {
  const api = useTeacherApi()
  const refresh = useRefresh()
  const now = useNow()
  const state = lessonState(lesson, now)
  const [confirming, setConfirming] = useState(false)
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)
  const [busy, setBusy] = useState(false)

  const subject = reference.subjects.find((s) => s.id === lesson.subjectId)?.name ?? 'Čas'
  const location = reference.locations.find((l) => l.id === lesson.locationId)?.name ?? ''
  const room = roomName(reference, lesson.locationId, lesson.roomId)
  const isSlot = lesson.status === 'open'
  const bookedSlot = lesson.origin === 'slot' && !isSlot
  const title = isSlot ? 'Slobodan termin' : lesson.status === 'pending' ? 'Na čekanju' : subject

  const cancelKind = isSlot ? 'remove' : bookedSlot ? 'cancel' : 'delete'
  const CANCEL = {
    remove: {
      open: 'Ukloni termin',
      title: 'Uklanjanje termina',
      submit: 'Ukloni',
      text: 'Slobodan termin nestaje i učenici ga više ne vide.',
      done: 'Termin je uklonjen.',
    },
    cancel: {
      open: 'Otkaži čas',
      title: 'Otkazivanje časa',
      submit: 'Otkaži čas',
      text: 'Učenik i roditelji dobijaju obaveštenje, a termin ponovo postaje slobodan.',
      done: 'Čas je otkazan, termin je ponovo slobodan.',
    },
    delete: {
      open: 'Obriši čas',
      title: 'Brisanje časa',
      submit: 'Obriši',
      text: 'Čas se briše, a učenici i roditelji dobijaju obaveštenje.',
      done: 'Čas je obrisan.',
    },
  }[cancelKind]

  if (confirming) {
    return (
      <FormDialog
        title={CANCEL.title}
        action="cancelLesson"
        submitLabel={CANCEL.submit}
        danger
        onClose={() => setConfirming(false)}
        onSubmit={async () => {
          await api.cancelLesson(lesson.id)
          await refresh()
          onDone(CANCEL.done)
        }}
      >
        <p>
          <strong>{title}</strong>, {formatDay(lesson.start)},{' '}
          {formatRange(lesson.start, lesson.end)}.
        </p>
        <p>{CANCEL.text}</p>
      </FormDialog>
    )
  }

  const run = async (
    action: () => Promise<void>,
    key: Parameters<typeof explainError>[1],
    text: string,
  ) => {
    if (busy) return
    setBusy(true)
    setMessage(null)
    try {
      await action()
      await refresh()
      setMessage({ text, error: false })
    } catch (failure) {
      setMessage({ text: explainError(failure, key), error: true })
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog title={title} onClose={onClose}>
      <dl className="facts">
        <dt>Termin</dt>
        <dd>
          {formatDay(lesson.start)}, {formatRange(lesson.start, lesson.end)}
        </dd>
        <dt>Mesto</dt>
        <dd>{[location, room].filter(Boolean).join(', ')}</dd>
        {isSlot && (
          <>
            <dt>Predmet</dt>
            <dd>{subject}</dd>
          </>
        )}
        {lesson.status === 'pending' && (
          <>
            <dt>Predmet</dt>
            <dd>{subject}</dd>
            <dt>Status</dt>
            <dd>Čeka vaš odgovor</dd>
          </>
        )}
        {lesson.outcome && (
          <>
            <dt>Ishod</dt>
            <dd>{OUTCOME_TEXT[lesson.outcome]}</dd>
          </>
        )}
      </dl>

      {state.locked && !isSlot && (
        <p className="notice notice--locked">
          Dan ovog časa je prošao ili je upisan ishod: predmet, mesto i vreme se više ne menjaju.
        </p>
      )}

      {!isSlot && (
        <section>
          <h3>Učenici</h3>
          {lesson.participants.map((participant) => {
            const student = students.find((s) => s.id === participant.studentId)
            return (
              <div key={participant.studentId}>
                <p>
                  <strong>{student ? fullName(student) : 'Nepoznat učenik'}</strong>
                </p>
                <NoteEditor lesson={lesson} participant={participant} student={student} />
              </div>
            )
          })}
        </section>
      )}

      {lesson.status === 'confirmed' && (
        <section>
          <h3>Ishod</h3>
          {state.canRecordOutcome ? (
            <div className="actions">
              <button
                type="button"
                className="button button--small button--secondary"
                disabled={busy || lesson.outcome === 'held'}
                onClick={() =>
                  void run(
                    () => api.setOutcome(lesson.id, 'held'),
                    'setOutcome',
                    'Ishod je upisan.',
                  )
                }
              >
                Održan
              </button>
              <button
                type="button"
                className="button button--small button--secondary"
                disabled={busy || lesson.outcome === 'not_held'}
                onClick={() =>
                  void run(
                    () => api.setOutcome(lesson.id, 'not_held'),
                    'setOutcome',
                    'Ishod je upisan.',
                  )
                }
              >
                Nije održan
              </button>
              {lesson.outcome && (
                <button
                  type="button"
                  className="button button--small button--secondary"
                  disabled={busy}
                  onClick={() =>
                    void run(
                      () => api.setOutcome(lesson.id, null),
                      'setOutcome',
                      'Ishod je obrisan.',
                    )
                  }
                >
                  Obriši ishod
                </button>
              )}
            </div>
          ) : (
            <p className="muted">Ishod se upisuje posle završetka časa.</p>
          )}
        </section>
      )}

      {message && (
        <p
          role={message.error ? 'alert' : 'status'}
          className={message.error ? 'form-error' : 'notice'}
        >
          {message.text}
        </p>
      )}

      <div className="actions actions--end">
        {lesson.status === 'pending' && (
          <>
            <button
              type="button"
              className="button"
              disabled={busy}
              onClick={() =>
                void run(
                  () => api.confirmBooking(lesson.id),
                  'confirmBooking',
                  'Zahtev je potvrđen.',
                )
              }
            >
              Potvrdi
            </button>
            <button
              type="button"
              className="button button--secondary"
              disabled={busy}
              onClick={() =>
                void run(
                  () => api.declineBooking(lesson.id),
                  'declineBooking',
                  'Zahtev je odbijen, termin je ponovo slobodan.',
                )
              }
            >
              Odbij
            </button>
          </>
        )}
        {lesson.status === 'confirmed' && (
          <button type="button" className="button button--secondary" onClick={onEdit}>
            Izmeni čas
          </button>
        )}
        {state.canCancel && lesson.status !== 'pending' && (
          <button
            type="button"
            className="button button--secondary"
            onClick={() => setConfirming(true)}
          >
            {CANCEL.open}
          </button>
        )}
        <button type="button" className="button button--secondary" onClick={onClose}>
          Zatvori
        </button>
      </div>
    </Dialog>
  )
}
