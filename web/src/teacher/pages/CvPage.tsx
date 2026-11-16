import { useMemo, useRef, useState, type ChangeEvent } from 'react'
import { Link } from 'react-router'
import { explainError } from '../../admin/errors'
import { PHOTO_ACCEPT, shrinkImage } from '../../admin/image'
import { homePath } from '../../auth/roles'
import { Field } from '../../components/FormDialog'
import { useMember } from '../../components/guards'
import { Loaded, Notice, PageHeader } from '../../components/Loaded'
import { CV_LIMITS, type CvData } from '../../cv/cvApi'
import { useCvApi } from '../../cv/CvApiProvider'
import { CvPhoto } from '../../cv/CvPhoto'
import { CvView } from '../../cv/CvView'
import { useMyCv, useRefresh, useReference, useTeacherId } from '../queries'
import { useTeacherApi } from '../TeacherApiProvider'
import {
  asInput,
  BLANK_EDUCATION,
  BLANK_EXPERIENCE,
  cvProblem,
  keyed,
  moved,
  toInput,
  type Draft,
} from '../cvDraft'
import type { MyCv } from '../teacherApi'

function CvForm({ saved }: { saved: MyCv | null }) {
  const api = useTeacherApi()
  const cvApi = useCvApi()
  const refresh = useRefresh()
  const teacherId = useTeacherId()
  const { roles } = useMember()
  const reference = useReference()

  const [draft, setDraft] = useState<Draft>(() => {
    const start = asInput(saved)
    return {
      about: start.about,
      showPublic: start.showPublic,
      showMembers: start.showMembers,
      experience: start.experience.map(keyed),
      education: start.education.map(keyed),
      skills: start.skills.map(keyed),
    }
  })
  const [busy, setBusy] = useState(false)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inFlight = useRef(false)

  const input = toInput(draft)
  const dirty = JSON.stringify(input) !== JSON.stringify(asInput(saved))
  const hasText = draft.about.trim() !== ''

  const patch = (change: Partial<Draft>) => setDraft((current) => ({ ...current, ...change }))

  const save = async () => {
    if (inFlight.current) return
    const problem = cvProblem(input)
    if (problem) {
      setNotice(null)
      setError(problem)
      return
    }
    inFlight.current = true
    setBusy(true)
    setNotice(null)
    setError(null)
    try {
      await api.saveMyCv(input)
      await refresh()
      setNotice('CV je sačuvan.')
    } catch (failure) {
      setError(explainError(failure, 'saveCv'))
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  const changePhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const target = event.target
    const file = target.files?.[0]
    if (!file || inFlight.current) return
    inFlight.current = true
    setPhotoBusy(true)
    setNotice(null)
    setError(null)
    try {
      await api.setCvPhoto(teacherId, await shrinkImage(file))
      await refresh()
      setNotice('Fotografija je sačuvana.')
    } catch (failure) {
      setError(explainError(failure, 'setCvPhoto'))
    } finally {
      inFlight.current = false
      setPhotoBusy(false)
      // so that choosing the same file again works
      target.value = ''
    }
  }

  const removePhoto = async () => {
    if (inFlight.current) return
    inFlight.current = true
    setPhotoBusy(true)
    setNotice(null)
    setError(null)
    try {
      await api.setCvPhoto(teacherId, null)
      await refresh()
      setNotice('Fotografija je uklonjena.')
    } catch (failure) {
      setError(explainError(failure, 'setCvPhoto'))
    } finally {
      inFlight.current = false
      setPhotoBusy(false)
    }
  }

  const preview: CvData = useMemo(
    () => ({
      slug: saved?.slug ?? '',
      firstName: roles.firstName,
      lastName: roles.lastName,
      about: draft.about.trim() || null,
      photoPath: saved?.photoPath ?? null,
      subjects: (reference.data?.subjects ?? []).map((subject) => subject.name),
      experience: draft.experience.map(({ value }) => ({
        employer: value.employer,
        position: value.position,
        period: value.period.trim() || null,
        description: value.description.trim() || null,
      })),
      education: draft.education.map(({ value }) => ({
        institution: value.institution,
        degree: value.degree.trim() || null,
        period: value.period.trim() || null,
      })),
      skills: input.skills,
    }),
    // `input` is made from `draft`
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draft, saved, roles, reference.data],
  )

  const photoSrc = saved?.photoPath ? cvApi.photoUrl(saved.photoPath) : null

  return (
    <form
      className="cv-editor"
      onSubmit={(event) => {
        event.preventDefault()
        void save()
      }}
      noValidate
    >
      <Notice message={notice} />
      <p>
        CV nije obavezan. Vidljiv je samo onima kojima ga dozvolite u odeljku „Ko može da vidi moj
        CV“. Učenici i roditelji koji vas izaberu uvek mogu da vide vaš CV.
      </p>

      <fieldset className="choice">
        <legend>Fotografija</legend>
        <div className="cv-editor__photo">
          <CvPhoto
            src={photoSrc}
            firstName={roles.firstName}
            lastName={roles.lastName}
            size="large"
          />
          <div className="actions">
            <label className={`button button--secondary${photoBusy ? ' is-disabled' : ''}`}>
              {saved?.photoPath ? 'Zameni fotografiju' : 'Izaberi fotografiju'}
              <input
                type="file"
                accept={PHOTO_ACCEPT}
                className="visually-hidden"
                disabled={photoBusy}
                onChange={(event) => void changePhoto(event)}
              />
            </label>
            {saved?.photoPath && (
              <button
                type="button"
                className="button button--secondary"
                disabled={photoBusy}
                onClick={() => void removePhoto()}
              >
                Ukloni fotografiju
              </button>
            )}
            {photoBusy && (
              <span role="status" className="muted">
                Fotografija se otprema…
              </span>
            )}
          </div>
        </div>
      </fieldset>

      <fieldset className="choice">
        <legend>O meni</legend>
        <label className="field">
          <span>Kratak opis</span>
          <textarea
            value={draft.about}
            maxLength={CV_LIMITS.about}
            rows={6}
            onChange={(event) => patch({ about: event.target.value })}
          />
        </label>
        <p className="muted">
          Telefon, email i adresa se ne prikazuju, osim ako ih sami upišete ovde. Najviše{' '}
          {CV_LIMITS.about} znakova.
        </p>
      </fieldset>

      <fieldset className="choice">
        <legend>Radno iskustvo</legend>
        {draft.experience.map((row, index) => (
          <div
            className="cv-editor__entry"
            key={row.key}
            role="group"
            aria-label={`Radno iskustvo ${index + 1}`}
          >
            <Field
              label="Poslodavac"
              value={row.value.employer}
              maxLength={CV_LIMITS.employer}
              onChange={(employer) =>
                patch({
                  experience: draft.experience.map((r) =>
                    r.key === row.key ? { ...r, value: { ...r.value, employer } } : r,
                  ),
                })
              }
            />
            <Field
              label="Pozicija"
              value={row.value.position}
              maxLength={CV_LIMITS.position}
              onChange={(position) =>
                patch({
                  experience: draft.experience.map((r) =>
                    r.key === row.key ? { ...r, value: { ...r.value, position } } : r,
                  ),
                })
              }
            />
            <Field
              label="Period (na primer 2019 – 2022)"
              value={row.value.period}
              maxLength={CV_LIMITS.period}
              onChange={(period) =>
                patch({
                  experience: draft.experience.map((r) =>
                    r.key === row.key ? { ...r, value: { ...r.value, period } } : r,
                  ),
                })
              }
            />
            <label className="field">
              <span>Opis</span>
              <textarea
                value={row.value.description}
                maxLength={CV_LIMITS.description}
                rows={3}
                onChange={(event) =>
                  patch({
                    experience: draft.experience.map((r) =>
                      r.key === row.key
                        ? { ...r, value: { ...r.value, description: event.target.value } }
                        : r,
                    ),
                  })
                }
              />
            </label>
            <div className="actions">
              <button
                type="button"
                className="button button--secondary"
                disabled={index === 0}
                onClick={() => patch({ experience: moved(draft.experience, index, -1) })}
              >
                Gore
              </button>
              <button
                type="button"
                className="button button--secondary"
                disabled={index === draft.experience.length - 1}
                onClick={() => patch({ experience: moved(draft.experience, index, 1) })}
              >
                Dole
              </button>
              <button
                type="button"
                className="button button--secondary"
                onClick={() =>
                  patch({ experience: draft.experience.filter((r) => r.key !== row.key) })
                }
              >
                Ukloni
              </button>
            </div>
          </div>
        ))}
        <div className="actions">
          <button
            type="button"
            className="button button--secondary"
            disabled={draft.experience.length >= CV_LIMITS.entries}
            onClick={() => patch({ experience: [...draft.experience, keyed(BLANK_EXPERIENCE)] })}
          >
            Dodaj radno iskustvo
          </button>
        </div>
      </fieldset>

      <fieldset className="choice">
        <legend>Obrazovanje</legend>
        {draft.education.map((row, index) => (
          <div
            className="cv-editor__entry"
            key={row.key}
            role="group"
            aria-label={`Obrazovanje ${index + 1}`}
          >
            <Field
              label="Ustanova"
              value={row.value.institution}
              maxLength={CV_LIMITS.institution}
              onChange={(institution) =>
                patch({
                  education: draft.education.map((r) =>
                    r.key === row.key ? { ...r, value: { ...r.value, institution } } : r,
                  ),
                })
              }
            />
            <Field
              label="Zvanje ili smer"
              value={row.value.degree}
              maxLength={CV_LIMITS.degree}
              onChange={(degree) =>
                patch({
                  education: draft.education.map((r) =>
                    r.key === row.key ? { ...r, value: { ...r.value, degree } } : r,
                  ),
                })
              }
            />
            <Field
              label="Period (na primer 2012 – 2017)"
              value={row.value.period}
              maxLength={CV_LIMITS.period}
              onChange={(period) =>
                patch({
                  education: draft.education.map((r) =>
                    r.key === row.key ? { ...r, value: { ...r.value, period } } : r,
                  ),
                })
              }
            />
            <div className="actions">
              <button
                type="button"
                className="button button--secondary"
                disabled={index === 0}
                onClick={() => patch({ education: moved(draft.education, index, -1) })}
              >
                Gore
              </button>
              <button
                type="button"
                className="button button--secondary"
                disabled={index === draft.education.length - 1}
                onClick={() => patch({ education: moved(draft.education, index, 1) })}
              >
                Dole
              </button>
              <button
                type="button"
                className="button button--secondary"
                onClick={() =>
                  patch({ education: draft.education.filter((r) => r.key !== row.key) })
                }
              >
                Ukloni
              </button>
            </div>
          </div>
        ))}
        <div className="actions">
          <button
            type="button"
            className="button button--secondary"
            disabled={draft.education.length >= CV_LIMITS.entries}
            onClick={() => patch({ education: [...draft.education, keyed(BLANK_EDUCATION)] })}
          >
            Dodaj obrazovanje
          </button>
        </div>
      </fieldset>

      <fieldset className="choice">
        <legend>Veštine</legend>
        {draft.skills.map((row, index) => (
          <div className="cv-editor__skill" key={row.key}>
            <Field
              label={`Veština ${index + 1}`}
              value={row.value}
              maxLength={CV_LIMITS.skill}
              onChange={(skill) =>
                patch({
                  skills: draft.skills.map((r) => (r.key === row.key ? { ...r, value: skill } : r)),
                })
              }
            />
            <button
              type="button"
              className="button button--secondary"
              onClick={() => patch({ skills: draft.skills.filter((r) => r.key !== row.key) })}
            >
              Ukloni
            </button>
          </div>
        ))}
        <div className="actions">
          <button
            type="button"
            className="button button--secondary"
            disabled={draft.skills.length >= CV_LIMITS.skills}
            onClick={() => patch({ skills: [...draft.skills, keyed('')] })}
          >
            Dodaj veštinu
          </button>
        </div>
      </fieldset>

      <fieldset className="choice">
        <legend>Ko može da vidi moj CV</legend>
        <label className="check">
          <input
            type="checkbox"
            checked={draft.showPublic}
            disabled={!hasText && !draft.showPublic}
            onChange={(event) => patch({ showPublic: event.target.checked })}
          />
          <span>Javno: na naslovnoj strani, za svakoga ko poseti sajt</span>
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={draft.showMembers}
            disabled={!hasText && !draft.showMembers}
            onChange={(event) => patch({ showMembers: event.target.checked })}
          />
          <span>
            Prijavljenim korisnicima: učenicima, roditeljima, nastavnicima i administratorima
          </span>
        </label>
        {!hasText && (
          <p className="muted">Da biste uključili prikaz, prvo upišite tekst „O meni“.</p>
        )}
        {saved?.showPublic && (
          <p>
            Javna adresa vašeg CV-a: <code>/nastavnici/{saved.slug}</code>
          </p>
        )}
      </fieldset>

      <details className="cv-editor__preview">
        <summary>Pregled</summary>
        <CvView cv={preview} photoSrc={photoSrc} />
      </details>

      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <div className="actions">
        <button type="submit" className="button" disabled={busy || photoBusy || !dirty}>
          Sačuvaj CV
        </button>
      </div>
    </form>
  )
}

/** The teacher's own CV: text, photo, experience, education, skills, and who may see it. */
export function CvPage() {
  const cv = useMyCv()
  return (
    <div className="cv-page">
      <PageHeader title="Moj CV">
        <Link className="button button--secondary" to={`${homePath('teacher')}/cv-nastavnika`}>
          CV nastavnika
        </Link>
      </PageHeader>
      <Loaded query={cv}>{(saved) => <CvForm saved={saved} />}</Loaded>
    </div>
  )
}
