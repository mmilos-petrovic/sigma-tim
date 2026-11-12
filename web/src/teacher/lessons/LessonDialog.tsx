import { useState } from 'react'
import { explainError } from '../../admin/errors'
import { Dialog } from '../../components/Dialog'
import { FormDialog } from '../../components/FormDialog'
import { ReasonField } from '../../components/ReasonField'
import { cleanReason } from '../../lib/reason'
import { DeclineDialog } from './DeclineDialog'
import { useNow } from '../clock'
import { formatDay, formatRange } from '../format'
import { useRefresh } from '../queries'
import { lessonState, roomName } from '../scheduleItems'
import { useTeacherApi } from '../TeacherApiProvider'
import type { LessonRow, Outcome, Participant, Reference, StudentRow } from '../teacherApi'

const fullName = (student: StudentRow) => `${student.firstName} ${student.lastName}`
const OUTCOME_TEXT: Record<Outcome, string> = { held: 'održan', not_held: 'nije održan' }

/** The note of one student. The text is kept by the dialog, so that OK can save what was typed and not yet saved. */
function NoteEditor({
  lesson,
  participant,
  student,
  text,
  onText,
}: {
  lesson: LessonRow
  participant: Participant
  student: StudentRow | undefined
  text: string
  onText: (text: string) => void
}) {
  const api = useTeacherApi()
  const refresh = useRefresh()
  const name = student ? fullName(student) : 'Nepoznat učenik'
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // a change is not announced: the button just has nothing left to save; a failure is said
  const save = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await api.setNote(lesson.id, participant.studentId, text.trim() || null)
      await refresh()
    } catch (failure) {
      setError(explainError(failure, 'setNote'))
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
            onText(event.target.value)
            setError(null)
          }}
        />
      </label>
      <p className="muted">Napomenu vide učenik i njegovi roditelji.</p>
      <button
        type="button"
        className="button button--small button--secondary"
        aria-label={`Sačuvaj napomenu za ${name}`}
        disabled={busy || text.trim() === (participant.note ?? '')}
        onClick={() => void save()}
      >
        Sačuvaj napomenu
      </button>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </div>
  )
}

/**
 * One lesson, slot or booking: what it is, notes per student, the outcome, and what can still be done with it.
 * With `onEdit` (the calendar) a lesson can be taken to the form that changes it; without it (the list of lessons, which
 * has a button for that on each card) OK saves what was typed and closes.
 */
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
  onEdit?: () => void
  /** The lesson is gone or the teacher is done. */
  onDone: () => void
}) {
  const api = useTeacherApi()
  const refresh = useRefresh()
  const now = useNow()
  const state = lessonState(lesson, now)
  const [confirming, setConfirming] = useState(false)
  const [declining, setDeclining] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [notes, setNotes] = useState<Record<string, string>>(() =>
    Object.fromEntries(lesson.participants.map((p) => [p.studentId, p.note ?? ''])),
  )

  const subject = reference.subjects.find((s) => s.id === lesson.subjectId)?.name ?? 'Čas'
  const location = reference.locations.find((l) => l.id === lesson.locationId)?.name ?? ''
  const room = roomName(reference, lesson.locationId, lesson.roomId)
  const isSlot = lesson.status === 'open'
  const bookedSlot = lesson.origin === 'slot' && !isSlot
  const title = isSlot ? 'Slobodan termin' : lesson.status === 'pending' ? 'Na čekanju' : subject
  const canEdit = onEdit !== undefined && lesson.status === 'confirmed'
  const hasOk = lesson.status === 'confirmed' && !canEdit

  const cancelKind = isSlot ? 'remove' : bookedSlot ? 'cancel' : 'delete'
  const CANCEL = {
    remove: {
      open: 'Ukloni termin',
      title: 'Uklanjanje termina',
      submit: 'Ukloni',
      text: 'Slobodan termin nestaje i učenici ga više ne vide.',
    },
    cancel: {
      open: 'Otkaži čas',
      title: 'Otkazivanje časa',
      submit: 'Otkaži čas',
      text: 'Učenik i roditelji dobijaju obaveštenje, a termin ponovo postaje slobodan.',
    },
    delete: {
      open: 'Obriši čas',
      title: 'Brisanje časa',
      submit: 'Obriši',
      text: 'Čas se briše, a učenici i roditelji dobijaju obaveštenje.',
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
          await api.cancelLesson(lesson.id, cleanReason(reason))
          await refresh()
          onDone()
        }}
      >
        <p>
          <strong>{title}</strong>, {formatDay(lesson.start)},{' '}
          {formatRange(lesson.start, lesson.end)}.
        </p>
        <p>{CANCEL.text}</p>
        {cancelKind !== 'remove' && (
          <ReasonField
            value={reason}
            onChange={setReason}
            hint="Razlog dobijaju učenici i roditelji u obaveštenju."
          />
        )}
      </FormDialog>
    )
  }

  if (declining) {
    return (
      <DeclineDialog
        booking={lesson}
        reference={reference}
        students={students}
        onClose={() => setDeclining(false)}
        onDone={onDone}
      />
    )
  }

  // A change is not announced (the screen shows it); a failure is.
  const run = async (action: () => Promise<void>, key: Parameters<typeof explainError>[1]) => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await action()
      await refresh()
    } catch (failure) {
      setError(explainError(failure, key))
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  // OK: what was typed in a note and not saved yet is saved, then the dialog closes
  const finish = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      for (const participant of lesson.participants) {
        const text = (notes[participant.studentId] ?? '').trim()
        if (text !== (participant.note ?? '')) {
          await api.setNote(lesson.id, participant.studentId, text || null)
        }
      }
      await refresh()
      onClose()
    } catch (failure) {
      setError(explainError(failure, 'setNote'))
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
                <label className="check">
                  <input
                    type="checkbox"
                    checked={participant.paid}
                    disabled={busy}
                    aria-label={`Plaćeno za ${student ? fullName(student) : 'Nepoznat učenik'}`}
                    onChange={(event) =>
                      void run(
                        () => api.setPaid(lesson.id, participant.studentId, event.target.checked),
                        'setPaid',
                      )
                    }
                  />
                  <span>Plaćeno</span>
                </label>
                <NoteEditor
                  lesson={lesson}
                  participant={participant}
                  student={student}
                  text={notes[participant.studentId] ?? ''}
                  onText={(text) => setNotes((all) => ({ ...all, [participant.studentId]: text }))}
                />
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
                onClick={() => void run(() => api.setOutcome(lesson.id, 'held'), 'setOutcome')}
              >
                Održan
              </button>
              <button
                type="button"
                className="button button--small button--secondary"
                disabled={busy || lesson.outcome === 'not_held'}
                onClick={() => void run(() => api.setOutcome(lesson.id, 'not_held'), 'setOutcome')}
              >
                Nije održan
              </button>
              {lesson.outcome && (
                <button
                  type="button"
                  className="button button--small button--secondary"
                  disabled={busy}
                  onClick={() => void run(() => api.setOutcome(lesson.id, null), 'setOutcome')}
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

      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}

      <div className="actions actions--end">
        {lesson.status === 'pending' && (
          <>
            <button
              type="button"
              className="button"
              disabled={busy}
              onClick={() => void run(() => api.confirmBooking(lesson.id), 'confirmBooking')}
            >
              Potvrdi
            </button>
            <button
              type="button"
              className="button button--secondary"
              disabled={busy}
              onClick={() => setDeclining(true)}
            >
              Odbij
            </button>
          </>
        )}
        {/* cancelling, removing or deleting is red and stays apart on the left of the two usual buttons */}
        {state.canCancel && lesson.status !== 'pending' && (
          <button
            type="button"
            className="button button--danger actions__apart"
            onClick={() => setConfirming(true)}
          >
            {CANCEL.open}
          </button>
        )}
        <button type="button" className="button button--secondary" onClick={onClose}>
          Odustani
        </button>
        {canEdit && (
          <button type="button" className="button" onClick={onEdit}>
            Izmeni
          </button>
        )}
        {hasOk && (
          <button type="button" className="button" disabled={busy} onClick={() => void finish()}>
            OK
          </button>
        )}
      </div>
    </Dialog>
  )
}
