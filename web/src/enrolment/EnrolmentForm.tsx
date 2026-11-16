import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import { LOGIN_PATH } from '../auth/roles'
import type { ApplicantRole, EnrolmentFormInfo } from './enrolmentApi'
import { savePendingEnrolment } from './pending'

const ROLES: { value: ApplicantRole; label: string }[] = [
  { value: 'student', label: 'Učenik' },
  { value: 'parent', label: 'Roditelj' },
]

/**
 * The form on the front page: one subject, who the person is, then Google. What was chosen waits in the browser while
 * Google has the person, and the sign-in page picks it up (see `StartEnrolment`).
 */
export function EnrolmentForm({ info }: { info: EnrolmentFormInfo }) {
  const { state, signInWithGoogle } = useAuth()
  const navigate = useNavigate()
  const [subjectId, setSubjectId] = useState('')
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
    // Somebody who is already signed in with Google does not need to go there again: the sign-in page takes it from here.
    if (state.status === 'ready') {
      navigate(LOGIN_PATH)
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
    <form className="enrolment-form" onSubmit={(event) => void submit(event)} noValidate>
      <label className="field">
        <span>Izaberi predmet iz kog želiš časove</span>
        <select value={subjectId} onChange={(event) => setSubjectId(event.target.value)}>
          <option value="">Izaberi predmet</option>
          {info.subjects.map((subject) => (
            <option key={subject.id} value={subject.id}>
              {subject.name}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="choice enrolment-form__role">
        <legend>Ja sam:</legend>
        {ROLES.map((option) => (
          <label key={option.value} className="check">
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
      </fieldset>

      {problem && (
        <p role="alert" className="form-error">
          {problem}
        </p>
      )}
      <button type="submit" className="button" disabled={busy}>
        Nastavite sa Google-om
      </button>
    </form>
  )
}
