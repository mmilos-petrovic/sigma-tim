import { useState } from 'react'
import { useMember } from '../../components/guards'
import { Field, FormDialog, LocationChoice, SubjectChoice } from '../../components/FormDialog'
import { LoadError, Loaded, Loading, Notice, PageHeader } from '../../components/Loaded'
import { PhoneDialog, PhoneLine } from '../../components/PhoneDialog'
import { PhoneLink } from '../../components/PhoneLink'
import { normalizePhone, phoneProblem } from '../../lib/phone'

import { formatDay, formatRange } from '../../teacher/format'
import { useAdminApi } from '../AdminApiProvider'
import { AdminError, type LocationRow, type Subject, type TeacherRow } from '../adminApi'
import { parseLocationBlockers, STATUS_LABEL } from '../locationBlockers'
import { useLocations, useRefresh, useSubjects, useTeacherImpact, useTeachers } from '../queries'

// The same shape the database accepts.
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const normaliseEmail = (value: string) => value.trim().toLowerCase()
const fullName = (teacher: Pick<TeacherRow, 'firstName' | 'lastName'>) =>
  `${teacher.firstName} ${teacher.lastName}`
// Case and extra spaces do not matter; letters with marks do.
const squash = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase()
const sameName = (typed: string, name: string) => squash(typed) === squash(name)

type Dialog =
  | { kind: 'add' }
  | {
      kind: 'subjects' | 'locations' | 'phone' | 'email' | 'deactivate' | 'activate' | 'erase'
      teacher: TeacherRow
    }
  | null

interface DialogProps {
  onClose: () => void
  onDone: (message: string) => void
}

function AddTeacherDialog({
  subjects,
  locations,
  onClose,
  onDone,
}: DialogProps & { subjects: Subject[]; locations: LocationRow[] }) {
  const api = useAdminApi()
  const refresh = useRefresh()
  const [email, setEmail] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [selectedLocations, setSelectedLocations] = useState<string[]>([])
  const [phone, setPhone] = useState('')

  return (
    <FormDialog
      title="Dodaj nastavnika"
      action="createTeacher"
      submitLabel="Dodaj"
      onClose={onClose}
      validate={() => {
        if (!EMAIL.test(normaliseEmail(email))) return 'Unesite ispravnu email adresu.'
        if (!firstName.trim() || !lastName.trim()) return 'Unesite ime i prezime.'
        const phoneIssue = phoneProblem(phone, true)
        if (phoneIssue) return phoneIssue
        if (selected.length === 0) return 'Izaberite bar jedan predmet.'
        if (selectedLocations.length === 0) return 'Izaberite bar jednu lokaciju.'
        return null
      }}
      onSubmit={async () => {
        await api.createTeacher({
          email: normaliseEmail(email),
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          subjectIds: selected,
          locationIds: selectedLocations,
          phone: normalizePhone(phone) ?? '',
        })
        await refresh()
        onDone('Nastavnik je dodat.')
      }}
    >
      <p className="muted">
        Nastavnik se prijavljuje Google nalogom sa ovom adresom. Nalog ne mora da postoji unapred.
      </p>
      <Field label="Email" type="email" value={email} onChange={setEmail} maxLength={254} />
      <Field
        label="Ime"
        value={firstName}
        onChange={setFirstName}
        maxLength={100}
        autoComplete="given-name"
      />
      <Field
        label="Prezime"
        value={lastName}
        onChange={setLastName}
        maxLength={100}
        autoComplete="family-name"
      />
      <Field label="Telefon" type="tel" value={phone} onChange={setPhone} maxLength={30} />
      <SubjectChoice subjects={subjects} selected={selected} onChange={setSelected} />
      <LocationChoice
        locations={locations}
        selected={selectedLocations}
        onChange={setSelectedLocations}
      />
    </FormDialog>
  )
}

function SubjectsDialog({
  teacher,
  subjects,
  onClose,
  onDone,
}: DialogProps & { teacher: TeacherRow; subjects: Subject[] }) {
  const api = useAdminApi()
  const refresh = useRefresh()
  const [selected, setSelected] = useState(teacher.subjectIds)

  return (
    <FormDialog
      title={`Predmeti nastavnika ${fullName(teacher)}`}
      action="setSubjects"
      submitLabel="Sačuvaj"
      onClose={onClose}
      validate={() => (selected.length === 0 ? 'Izaberite bar jedan predmet.' : null)}
      onSubmit={async () => {
        await api.setTeacherSubjects(teacher.id, selected)
        await refresh()
        onDone('Predmeti su sačuvani.')
      }}
    >
      <SubjectChoice subjects={subjects} selected={selected} onChange={setSelected} />
    </FormDialog>
  )
}

/** The lessons and free slots that stop a location from being taken away, as the database listed them. */
function BlockedLocations({
  details,
  locations,
}: {
  details: string | undefined
  locations: LocationRow[]
}) {
  const blockers = parseLocationBlockers(details)
  if (!blockers || blockers.lessons.length === 0) {
    return <>Nastavnik još ima buduće časove ili slobodne termine na lokaciji koja se uklanja.</>
  }
  const placeName = new Map(locations.map((location) => [location.id, location.name]))
  const more = blockers.total - blockers.lessons.length
  return (
    <>
      <p>
        Ne može: na lokaciji koja se uklanja nastavnik još ima buduće časove i slobodne termine.
        Obrišite ih ili premestite, pa pokušajte ponovo.
      </p>
      <ul>
        {blockers.lessons.map((lesson) => (
          <li key={lesson.id}>
            {`${formatDay(lesson.start)}, ${formatRange(lesson.start, lesson.end)} · ${
              placeName.get(lesson.locationId) ?? 'Nepoznata lokacija'
            } · ${STATUS_LABEL[lesson.status]}`}
          </li>
        ))}
      </ul>
      {more > 0 && <p>i još {more}</p>}
    </>
  )
}

function LocationsDialog({
  teacher,
  locations,
  onClose,
  onDone,
}: DialogProps & { teacher: TeacherRow; locations: LocationRow[] }) {
  const api = useAdminApi()
  const refresh = useRefresh()
  const [selected, setSelected] = useState(teacher.locationIds)

  return (
    <FormDialog
      title={`Lokacije nastavnika ${fullName(teacher)}`}
      action="setLocations"
      submitLabel="Sačuvaj"
      onClose={onClose}
      validate={() => (selected.length === 0 ? 'Izaberite bar jednu lokaciju.' : null)}
      explain={(failure) =>
        failure instanceof AdminError && failure.code === 'PT409' && failure.details ? (
          <BlockedLocations details={failure.details} locations={locations} />
        ) : null
      }
      onSubmit={async () => {
        await api.setTeacherLocations(teacher.id, selected)
        await refresh()
        onDone('Lokacije su sačuvane.')
      }}
    >
      <p className="muted">
        Nastavnik može da drži časove i objavljuje slobodne termine samo na ovim lokacijama.
      </p>
      <LocationChoice locations={locations} selected={selected} onChange={setSelected} />
    </FormDialog>
  )
}

function TeacherPhoneDialog({ teacher, onClose, onDone }: DialogProps & { teacher: TeacherRow }) {
  const api = useAdminApi()
  const refresh = useRefresh()
  return (
    <PhoneDialog
      personName={fullName(teacher)}
      current={teacher.phone}
      required
      save={async (next) => {
        await api.setPersonPhone(teacher.id, next)
        await refresh()
      }}
      onClose={onClose}
      // null: nothing changed, so there is nothing to report
      onDone={(message) => (message ? onDone(message) : onClose())}
    />
  )
}

function EmailDialog({ teacher, onClose, onDone }: DialogProps & { teacher: TeacherRow }) {
  const api = useAdminApi()
  const refresh = useRefresh()
  const [email, setEmail] = useState(teacher.email)

  return (
    <FormDialog
      title="Promena email adrese"
      action="changeEmail"
      submitLabel="Promeni"
      onClose={onClose}
      validate={() => (EMAIL.test(normaliseEmail(email)) ? null : 'Unesite ispravnu email adresu.')}
      onSubmit={async () => {
        await api.changeEmail(teacher.id, normaliseEmail(email))
        await refresh()
        onDone('Email adresa je promenjena.')
      }}
    >
      <p>
        Za: {fullName(teacher)}. Koristite ovo da ispravite grešku u adresi. Stari Google nalog više
        neće imati pristup aplikaciji; osoba se prijavljuje Google nalogom sa novom adresom, a svi
        njeni podaci ostaju.
      </p>
      <Field
        label="Nova email adresa"
        type="email"
        value={email}
        onChange={setEmail}
        maxLength={254}
      />
    </FormDialog>
  )
}

/** What deactivating or erasing will do to the teacher's lessons, students and requests. */
function Impact({ impact }: { impact: ReturnType<typeof useTeacherImpact> }) {
  return (
    <>
      {impact.isPending && <Loading />}
      {impact.isError && <LoadError error={impact.error} onRetry={() => void impact.refetch()} />}
      {impact.isSuccess && (
        <ul className="impact">
          <li>Budući časovi koji se brišu: {impact.data.futureLessons}</li>
          <li>Učenici koji postaju neraspoređeni: {impact.data.students}</li>
          <li>Zahtevi za preuzimanje koji se zatvaraju: {impact.data.pendingRequests}</li>
        </ul>
      )}
    </>
  )
}

function DeactivateDialog({ teacher, onClose, onDone }: DialogProps & { teacher: TeacherRow }) {
  const api = useAdminApi()
  const refresh = useRefresh()
  const impact = useTeacherImpact(teacher.id)

  return (
    <FormDialog
      title="Deaktivacija nastavnika"
      action="deactivateTeacher"
      submitLabel="Deaktiviraj"
      danger
      disabled={!impact.isSuccess}
      onClose={onClose}
      onSubmit={async () => {
        await api.deactivateTeacher(teacher.id)
        await refresh()
        onDone('Nastavnik je deaktiviran.')
      }}
    >
      <p>
        Nastavnik <strong>{fullName(teacher)}</strong> više neće moći da radi u aplikaciji. Prošli
        časovi i podaci ostaju.
      </p>
      <Impact impact={impact} />
      <p className="muted">Učesnici obrisanih časova biće obavešteni.</p>
    </FormDialog>
  )
}

function EraseDialog({ teacher, onClose, onDone }: DialogProps & { teacher: TeacherRow }) {
  const api = useAdminApi()
  const refresh = useRefresh()
  const impact = useTeacherImpact(teacher.id)
  const [typed, setTyped] = useState('')

  return (
    <FormDialog
      title="Brisanje naloga"
      action="eraseTeacher"
      submitLabel="Obriši nalog"
      danger
      disabled={!impact.isSuccess}
      onClose={onClose}
      validate={() =>
        sameName(typed, fullName(teacher)) ? null : 'Upišite ime i prezime nastavnika radi potvrde.'
      }
      onSubmit={async () => {
        const result = await api.eraseTeacher(teacher.id)
        await refresh()
        onDone(
          result === 'kept_history'
            ? 'Nalog je obrisan. Održani časovi ostaju u evidenciji.'
            : 'Nalog je obrisan.',
        )
      }}
    >
      <p>
        Nalog nastavnika <strong>{fullName(teacher)}</strong> biće obrisan. Ovo se ne može
        poništiti.
      </p>
      <p>
        Briše se sve što je vezano za osobu: biografija, predmeti i CV. Ako je ova osoba i učenik
        ili roditelj, i ti nalozi se brišu.
      </p>
      <Impact impact={impact} />
      <p className="muted">Učesnici obrisanih časova biće obavešteni.</p>
      <p>
        Časovi koji su već počeli ostaju u evidenciji i vidljivi su administratoru, uz ime
        nastavnika. Email adresa se oslobađa i može ponovo da se doda.
      </p>
      <Field
        label={`Za potvrdu upišite ime i prezime: ${fullName(teacher)}`}
        value={typed}
        onChange={setTyped}
        maxLength={200}
        autoComplete="off"
      />
    </FormDialog>
  )
}

function ActivateDialog({ teacher, onClose, onDone }: DialogProps & { teacher: TeacherRow }) {
  const api = useAdminApi()
  const refresh = useRefresh()

  return (
    <FormDialog
      title="Aktivacija nastavnika"
      action="reactivateTeacher"
      submitLabel="Aktiviraj"
      onClose={onClose}
      onSubmit={async () => {
        await api.reactivateTeacher(teacher.id)
        await refresh()
        onDone('Nastavnik je ponovo aktivan.')
      }}
    >
      <p>
        Nastavnik {fullName(teacher)} će ponovo moći da se prijavi i radi. Obrisani časovi i
        oslobođeni učenici se ne vraćaju; učenike nastavnik ponovo traži preko zahteva za
        preuzimanje.
      </p>
    </FormDialog>
  )
}

export function TeachersPage() {
  const teachers = useTeachers()
  const subjects = useSubjects()
  const locations = useLocations()
  const { roles } = useMember()
  const [dialog, setDialog] = useState<Dialog>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const done = (message: string) => {
    setDialog(null)
    setNotice(message)
  }
  const close = () => setDialog(null)

  return (
    <>
      <PageHeader title="Nastavnici">
        <button
          type="button"
          className="button"
          disabled={
            !subjects.data ||
            subjects.data.length === 0 ||
            !locations.data ||
            locations.data.length === 0
          }
          onClick={() => {
            setNotice(null)
            setDialog({ kind: 'add' })
          }}
        >
          Dodaj nastavnika
        </button>
      </PageHeader>
      <Notice message={notice} />
      {subjects.data?.length === 0 && (
        <p className="muted">Pre nego što dodate nastavnika, dodajte bar jedan predmet.</p>
      )}
      {locations.data?.length === 0 && (
        <p className="muted">Pre nego što dodate nastavnika, dodajte bar jednu lokaciju.</p>
      )}

      <Loaded query={subjects}>
        {(subjectRows) => (
          <Loaded query={locations}>
            {(locationRows) => (
              <Loaded query={teachers}>
                {(allRows) => {
                  const rows = allRows.filter((teacher) => !teacher.erased)
                  const erased = allRows.filter((teacher) => teacher.erased)
                  const subjectName = new Map(
                    subjectRows.map((subject) => [subject.id, subject.name]),
                  )
                  const subjectsOf = (teacher: TeacherRow) =>
                    teacher.subjectIds
                      .map((id) => subjectName.get(id))
                      .filter((name): name is string => Boolean(name))
                      .sort((a, b) => a.localeCompare(b, 'sr'))
                      .join(', ')
                  const locationName = new Map(
                    locationRows.map((location) => [location.id, location.name]),
                  )
                  const locationsOf = (teacher: TeacherRow) =>
                    teacher.locationIds
                      .map((id) => locationName.get(id))
                      .filter((name): name is string => Boolean(name))
                      .sort((a, b) => a.localeCompare(b, 'sr'))
                      .join(', ')

                  const list =
                    rows.length === 0 ? (
                      <p className="empty-note">Još nema nastavnika. Dodajte prvog.</p>
                    ) : (
                      <table className="table">
                        <thead>
                          <tr>
                            <th>Ime i prezime</th>
                            <th>Email</th>
                            <th>Predmeti</th>
                            <th>Lokacije</th>
                            <th>Telefon</th>
                            <th>Status</th>
                            <th>
                              <span className="visually-hidden">Radnje</span>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((teacher) => {
                            const own = teacher.id === roles.profileId
                            const open = (
                              kind:
                                | 'subjects'
                                | 'locations'
                                | 'phone'
                                | 'email'
                                | 'deactivate'
                                | 'activate'
                                | 'erase',
                            ) => {
                              setNotice(null)
                              setDialog({ kind, teacher })
                            }
                            return (
                              <tr key={teacher.id}>
                                <td>
                                  {fullName(teacher)}
                                  {own && <span className="muted"> (vi)</span>}
                                </td>
                                <td>
                                  <span>{teacher.email}</span>
                                  {!teacher.hasSignedIn && (
                                    <span className="badge">Još se nije prijavio</span>
                                  )}
                                </td>
                                <td>{subjectsOf(teacher)}</td>
                                <td>{locationsOf(teacher)}</td>
                                <td>
                                  {teacher.phone ? (
                                    <PhoneLink phone={teacher.phone} />
                                  ) : (
                                    <PhoneLine phone={null} required />
                                  )}
                                </td>
                                <td>{teacher.isActive ? 'Aktivan' : 'Deaktiviran'}</td>
                                <td className="table__actions">
                                  <button
                                    type="button"
                                    className="button button--small button--secondary"
                                    onClick={() => open('subjects')}
                                  >
                                    Predmeti
                                  </button>
                                  <button
                                    type="button"
                                    className="button button--small button--secondary"
                                    onClick={() => open('locations')}
                                  >
                                    Lokacije
                                  </button>
                                  <button
                                    type="button"
                                    className="button button--small button--secondary"
                                    onClick={() => open('phone')}
                                  >
                                    Telefon
                                  </button>

                                  {!own && (
                                    <button
                                      type="button"
                                      className="button button--small button--secondary"
                                      onClick={() => open('email')}
                                    >
                                      Promeni email
                                    </button>
                                  )}
                                  {teacher.isActive ? (
                                    <button
                                      type="button"
                                      className="button button--small button--secondary"
                                      onClick={() => open('deactivate')}
                                    >
                                      Deaktiviraj
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      className="button button--small button--secondary"
                                      onClick={() => open('activate')}
                                    >
                                      Aktiviraj
                                    </button>
                                  )}
                                  {!own && !teacher.isAdmin && (
                                    <button
                                      type="button"
                                      className="button button--small button--secondary button--danger-text"
                                      onClick={() => open('erase')}
                                    >
                                      Obriši nalog
                                    </button>
                                  )}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    )
                  return (
                    <>
                      {list}
                      {erased.length > 0 && (
                        <section aria-labelledby="erased-heading" className="erased">
                          <h2 id="erased-heading">Obrisani nalozi</h2>
                          <p className="muted">
                            Podaci ovih osoba su obrisani. Časovi koji su održani su sačuvani i
                            vidljivi su administratoru.
                          </p>
                          <ul>
                            {erased.map((teacher) => (
                              <li key={teacher.id}>{fullName(teacher)}</li>
                            ))}
                          </ul>
                        </section>
                      )}
                    </>
                  )
                }}
              </Loaded>
            )}
          </Loaded>
        )}
      </Loaded>

      {dialog?.kind === 'add' && subjects.data && locations.data && (
        <AddTeacherDialog
          subjects={subjects.data}
          locations={locations.data}
          onClose={close}
          onDone={done}
        />
      )}
      {dialog?.kind === 'locations' && locations.data && (
        <LocationsDialog
          teacher={dialog.teacher}
          locations={locations.data}
          onClose={close}
          onDone={done}
        />
      )}
      {dialog?.kind === 'subjects' && subjects.data && (
        <SubjectsDialog
          teacher={dialog.teacher}
          subjects={subjects.data}
          onClose={close}
          onDone={done}
        />
      )}
      {dialog?.kind === 'phone' && (
        <TeacherPhoneDialog teacher={dialog.teacher} onClose={close} onDone={done} />
      )}
      {dialog?.kind === 'email' && (
        <EmailDialog teacher={dialog.teacher} onClose={close} onDone={done} />
      )}
      {dialog?.kind === 'deactivate' && (
        <DeactivateDialog teacher={dialog.teacher} onClose={close} onDone={done} />
      )}
      {dialog?.kind === 'activate' && (
        <ActivateDialog teacher={dialog.teacher} onClose={close} onDone={done} />
      )}
      {dialog?.kind === 'erase' && (
        <EraseDialog teacher={dialog.teacher} onClose={close} onDone={done} />
      )}
    </>
  )
}
