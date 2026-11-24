import { useState, type FormEvent } from 'react'
import { explainError } from '../admin/errors'
import { Field } from '../components/FormDialog'
import { formatPhone, normalizePhone } from '../lib/phone'
import { useEnrolmentApi } from './EnrolmentApiProvider'
import { PROFILE_LIMITS, type MyEnrolmentRequest } from './enrolmentApi'
import { profileProblem } from './profileProblem'

/**
 * The profile of a sign-up: who the student is and how to reach them. It can be changed until a teacher is chosen. The
 * consent is asked once, with the first save. `defaults` are the name from the Google account, for a student who signs up.
 */
export function ProfileForm({
  request,
  defaults,
  onSaved,
}: {
  request: MyEnrolmentRequest
  defaults: { firstName: string; lastName: string }
  onSaved: () => void
}) {
  const api = useEnrolmentApi()
  // the privacy policy is accepted once, by somebody who signs up; a student a teacher added did not sign up
  const needsConsent = request.source === 'signup' && !request.profileCompleted
  const [firstName, setFirstName] = useState(request.studentFirstName ?? defaults.firstName)
  const [lastName, setLastName] = useState(request.studentLastName ?? defaults.lastName)
  const [phone, setPhone] = useState(request.contactPhone ? formatPhone(request.contactPhone) : '')
  const [school, setSchool] = useState(request.school ?? '')
  const [grade, setGrade] = useState(request.grade ?? '')
  const [schoolTeacher, setSchoolTeacher] = useState(request.schoolTeacher ?? '')
  const [cityPart, setCityPart] = useState(request.cityPart ?? '')
  const [situation, setSituation] = useState(request.situation ?? '')
  const [consent, setConsent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    const problem = profileProblem({
      firstName,
      lastName,
      phone,
      school,
      grade,
      consent,
      needsConsent,
    })
    if (problem) return setError(problem)
    setBusy(true)
    setError(null)
    try {
      await api.completeProfile(request.id, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: normalizePhone(phone)!,
        school: school.trim(),
        grade: grade.trim(),
        cityPart: cityPart.trim(),
        schoolTeacher: schoolTeacher.trim(),
        situation: situation.trim(),
        // somebody who accepted the policy once is not asked again
        consent: needsConsent ? consent : true,
      })
      onSaved()
    } catch (failure) {
      setError(explainError(failure, 'completeEnrolmentProfile'))
      setBusy(false)
    }
  }

  return (
    <form className="enrolment-profile" onSubmit={(event) => void submit(event)} noValidate>
      <Field
        label="Ime učenika"
        value={firstName}
        maxLength={PROFILE_LIMITS.name}
        onChange={setFirstName}
      />
      <Field
        label="Prezime učenika"
        value={lastName}
        maxLength={PROFILE_LIMITS.name}
        onChange={setLastName}
      />
      <Field
        label="Telefon za kontakt"
        value={phone}
        type="tel"
        autoComplete="tel"
        onChange={setPhone}
      />
      <Field label="Škola" value={school} maxLength={PROFILE_LIMITS.school} onChange={setSchool} />
      <Field label="Razred" value={grade} maxLength={PROFILE_LIMITS.grade} onChange={setGrade} />
      <Field
        label="Nastavnik koji ti predaje u školi (nije obavezno)"
        value={schoolTeacher}
        maxLength={PROFILE_LIMITS.schoolTeacher}
        onChange={setSchoolTeacher}
      />
      <Field
        label="Deo grada (nije obavezno)"
        value={cityPart}
        maxLength={PROFILE_LIMITS.cityPart}
        onChange={setCityPart}
      />
      <label className="field">
        <span>Kako ide u školi i šta želiš da savladaš (nije obavezno)</span>
        <textarea
          value={situation}
          maxLength={PROFILE_LIMITS.situation}
          rows={4}
          onChange={(event) => setSituation(event.target.value)}
        />
      </label>

      {needsConsent && (
        <label className="check">
          <input
            type="checkbox"
            checked={consent}
            onChange={(event) => setConsent(event.target.checked)}
          />
          <span>
            Prihvatam <a href="/politika-privatnosti">politiku privatnosti</a>. Ako se prijavljuje
            roditelj, saglasnost daje za dete.
          </span>
        </label>
      )}

      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <div className="actions">
        <button type="submit" className="button" disabled={busy}>
          Sačuvaj
        </button>
      </div>
    </form>
  )
}
