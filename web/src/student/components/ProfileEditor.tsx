import { useState, type FormEvent } from 'react'
import { explainError } from '../../admin/errors'
import { Field } from '../../components/FormDialog'
import { PROFILE_LIMITS } from '../../enrolment/enrolmentApi'
import { formatPhone, normalizePhone } from '../../lib/phone'
import { profileProblem, type PersonDraft } from '../profileProblem'
import { useStudentApi } from '../StudentApiProvider'
import type { MyProfile } from '../studentApi'

const show = (phone: string | null) => (phone ? formatPhone(phone) : '')

/**
 * The profile of a student or a parent: the own phone (a parent needs one), and for each student the name, school, grade,
 * the part of the town and a note. The first save also takes the privacy policy; it is how a person confirms what the
 * teacher entered. `onSaved` says whether it was that first save.
 */
export function ProfileEditor({
  profile,
  onSaved,
}: {
  profile: MyProfile
  onSaved: (first: boolean) => void
}) {
  const api = useStudentApi()
  const first = !profile.confirmed
  const prefilled = profile.phone !== null || profile.people.some((p) => p.school || p.grade)
  const [ownPhone, setOwnPhone] = useState(show(profile.phone))
  const [people, setPeople] = useState<PersonDraft[]>(() =>
    profile.people.map((person) => ({
      profileId: person.profileId,
      self: person.self,
      firstName: person.firstName,
      lastName: person.lastName,
      phone: show(person.phone),
      school: person.school ?? '',
      grade: person.grade ?? '',
      cityPart: person.cityPart ?? '',
      situation: person.situation ?? '',
    })),
  )
  const [consent, setConsent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)

  const change = (profileId: string, patch: Partial<PersonDraft>) => {
    setSaved(false)
    setPeople((all) => all.map((p) => (p.profileId === profileId ? { ...p, ...patch } : p)))
  }
  const changeOwnPhone = (value: string) => {
    setSaved(false)
    setOwnPhone(value)
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    const problem = profileProblem(ownPhone, profile.isParent, people, first, consent)
    if (problem) return setError(problem)
    setBusy(true)
    setError(null)
    try {
      await api.saveMyProfile({
        phone: normalizePhone(ownPhone) ?? '',
        people: people.map((person) => ({
          profileId: person.profileId,
          firstName: person.firstName.trim(),
          lastName: person.lastName.trim(),
          // the number of a student who signs in is the own number above
          phone: person.self ? '' : (normalizePhone(person.phone) ?? ''),
          school: person.school.trim(),
          grade: person.grade.trim(),
          cityPart: person.cityPart.trim(),
          situation: person.situation.trim(),
        })),
        consent: first ? consent : true,
      })
      setSaved(true)
      onSaved(first)
    } catch (failure) {
      setError(explainError(failure, 'saveMyProfile'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className="enrolment-profile profile"
      aria-label="Profil"
      onSubmit={(event) => void submit(event)}
      noValidate
    >
      {profile.isParent && (
        <Field
          label="Vaš telefon za kontakt"
          value={ownPhone}
          type="tel"
          autoComplete="tel"
          onChange={changeOwnPhone}
        />
      )}

      {people.map((person) => (
        <fieldset key={person.profileId} className="profile__person">
          <legend>
            {person.self
              ? 'Podaci učenika'
              : `Dete: ${person.firstName} ${person.lastName}`.trimEnd()}
          </legend>
          <Field
            label="Ime"
            value={person.firstName}
            maxLength={PROFILE_LIMITS.name}
            onChange={(firstName) => change(person.profileId, { firstName })}
          />
          <Field
            label="Prezime"
            value={person.lastName}
            maxLength={PROFILE_LIMITS.name}
            onChange={(lastName) => change(person.profileId, { lastName })}
          />
          {person.self && !profile.isParent && (
            <Field
              label="Telefon (nije obavezno)"
              value={ownPhone}
              type="tel"
              autoComplete="tel"
              onChange={changeOwnPhone}
            />
          )}
          {!person.self && (
            <Field
              label="Telefon deteta (nije obavezno)"
              value={person.phone}
              type="tel"
              onChange={(phone) => change(person.profileId, { phone })}
            />
          )}
          <Field
            label="Škola"
            value={person.school}
            maxLength={PROFILE_LIMITS.school}
            onChange={(school) => change(person.profileId, { school })}
          />
          <Field
            label="Razred"
            value={person.grade}
            maxLength={PROFILE_LIMITS.grade}
            onChange={(grade) => change(person.profileId, { grade })}
          />
          <Field
            label="Deo grada (nije obavezno)"
            value={person.cityPart}
            maxLength={PROFILE_LIMITS.cityPart}
            onChange={(cityPart) => change(person.profileId, { cityPart })}
          />
          <label className="field">
            <span>Kako ide u školi i šta treba da se savlada (nije obavezno)</span>
            <textarea
              value={person.situation}
              maxLength={PROFILE_LIMITS.situation}
              rows={4}
              onChange={(event) => change(person.profileId, { situation: event.target.value })}
            />
          </label>
        </fieldset>
      ))}

      {first && (
        <label className="check">
          <input
            type="checkbox"
            checked={consent}
            onChange={(event) => setConsent(event.target.checked)}
          />
          <span>
            Prihvatam <a href="/politika-privatnosti">politiku privatnosti</a>.
            {profile.isParent && ' Saglasnost roditelj daje i za decu.'}
          </span>
        </label>
      )}

      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {saved && !first && (
        <p role="status" className="notice">
          Podaci su sačuvani.
        </p>
      )}
      <div className="actions">
        <button type="submit" className="button" disabled={busy}>
          {first ? (prefilled ? 'Potvrdi podatke' : 'Sačuvaj') : 'Sačuvaj izmene'}
        </button>
      </div>
    </form>
  )
}
