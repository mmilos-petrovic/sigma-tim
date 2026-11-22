import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthProvider'
import type { ApplicantRole, EnrolmentFormInfo } from './enrolmentApi'
import { savePendingEnrolment } from './pending'

/** The subject that is chosen when the form opens (most people ask for it); who the person is is never chosen for them. */
const PRESELECTED_SUBJECT = 'Matematika'

const ROLES: { value: ApplicantRole; label: string }[] = [
  { value: 'student', label: 'Učenik' },
  { value: 'parent', label: 'Roditelj' },
]

/**
 * The form on the front page: one subject (Matematika is chosen already), who the person is, then Google. What was chosen waits in the browser while
 * Google has the person, and the front page picks it up when they are back (see `StartEnrolment`). Somebody who is already
 * signed in with Google does not go there again: `onChosen` tells the front page to carry on with what was chosen.
 */
export function EnrolmentForm({
  info,
  onChosen,
}: {
  info: EnrolmentFormInfo
  onChosen: () => void
}) {
  const { state, signInWithGoogle } = useAuth()
  const [subjectId, setSubjectId] = useState(
    () => info.subjects.find((subject) => subject.name === PRESELECTED_SUBJECT)?.id ?? '',
  )
  const [role, setRole] = useState<ApplicantRole | ''>('')
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    if (!subjectId) return setProblem('Izaberi predmet.')
    if (!role) return setProblem('Izaberi da li si učenik ili roditelj.')
    setProblem(null)
    savePendingEnrolment({ subjectId, role })
    if (state.status === 'ready') {
      onChosen()
      return
    }
    setBusy(true)
    try {
      await signInWithGoogle(null)
    } catch {
      setProblem('Prijava nije uspela. Pokušaj ponovo.')
      setBusy(false)
    }
  }

  return (
    <form
      className="pub-card pub-form"
      id="prijava"
      onSubmit={(event) => void submit(event)}
      noValidate
    >
      <h2 className="pub-form__title">
        <label htmlFor="predmet">Izaberi predmet iz kog želiš časove</label>
      </h2>

      <div className="pub-field">
        <select
          id="predmet"
          className="pub-select"
          value={subjectId}
          onChange={(event) => setSubjectId(event.target.value)}
          aria-invalid={problem === 'Izaberi predmet.' || undefined}
        >
          <option value="">Izaberi predmet</option>
          {info.subjects.map((subject) => (
            <option key={subject.id} value={subject.id}>
              {subject.name}
            </option>
          ))}
        </select>
      </div>

      <fieldset className="pub-field pub-role">
        <legend>Ja sam:</legend>
        <div className="pub-role__options">
          {ROLES.map((option) => (
            <label key={option.value} className="pub-role__option">
              <input
                type="radio"
                name="role"
                value={option.value}
                checked={role === option.value}
                onChange={() => setRole(option.value)}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {problem && (
        <p role="alert" className="pub-error">
          {problem}
        </p>
      )}
      <button type="submit" className="pub-btn pub-btn--primary pub-btn--block" disabled={busy}>
        <span>Nastavite sa Google-om</span>
        <svg className="pub-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </button>
      <p className="pub-form__note">
        Besplatno je. Posle prijave odmah dobijaš svoj nalog i čekaš ponude nastavnika.
      </p>
    </form>
  )
}
