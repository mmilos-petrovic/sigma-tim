import { useState } from 'react'
import { useMember } from '../../components/guards'
import { Field, FormDialog, SubjectChoice } from '../../components/FormDialog'
import { LoadError, Loaded, Loading, Notice, PageHeader } from '../../components/Loaded'
import { useAdminApi } from '../AdminApiProvider'
import type { Subject, TeacherRow } from '../adminApi'
import { useRefresh, useSubjects, useTeacherImpact, useTeachers } from '../queries'

// The same shape the database accepts.
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const normaliseEmail = (value: string) => value.trim().toLowerCase()
const fullName = (teacher: Pick<TeacherRow, 'firstName' | 'lastName'>) =>
  `${teacher.firstName} ${teacher.lastName}`

type Dialog =
  | { kind: 'add' }
  | { kind: 'subjects' | 'email' | 'deactivate' | 'activate'; teacher: TeacherRow }
  | null

interface DialogProps {
  onClose: () => void
  onDone: (message: string) => void
}

function AddTeacherDialog({ subjects, onClose, onDone }: DialogProps & { subjects: Subject[] }) {
  const api = useAdminApi()
  const refresh = useRefresh()
  const [email, setEmail] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [selected, setSelected] = useState<string[]>([])

  return (
    <FormDialog
      title="Dodaj nastavnika"
      action="createTeacher"
      submitLabel="Dodaj"
      onClose={onClose}
      validate={() => {
        if (!EMAIL.test(normaliseEmail(email))) return 'Unesite ispravnu email adresu.'
        if (!firstName.trim() || !lastName.trim()) return 'Unesite ime i prezime.'
        if (selected.length === 0) return 'Izaberite bar jedan predmet.'
        return null
      }}
      onSubmit={async () => {
        await api.createTeacher({
          email: normaliseEmail(email),
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          subjectIds: selected,
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
      <SubjectChoice subjects={subjects} selected={selected} onChange={setSelected} />
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
      {impact.isPending && <Loading />}
      {impact.isError && <LoadError error={impact.error} onRetry={() => void impact.refetch()} />}
      {impact.isSuccess && (
        <ul className="impact">
          <li>Budući časovi koji se brišu: {impact.data.futureLessons}</li>
          <li>Učenici koji postaju neraspoređeni: {impact.data.students}</li>
          <li>Zahtevi za preuzimanje koji se zatvaraju: {impact.data.pendingRequests}</li>
        </ul>
      )}
      <p className="muted">Učesnici obrisanih časova biće obavešteni.</p>
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
          disabled={!subjects.data || subjects.data.length === 0}
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

      <Loaded query={subjects}>
        {(subjectRows) => (
          <Loaded query={teachers}>
            {(rows) => {
              const subjectName = new Map(subjectRows.map((subject) => [subject.id, subject.name]))
              const subjectsOf = (teacher: TeacherRow) =>
                teacher.subjectIds
                  .map((id) => subjectName.get(id))
                  .filter((name): name is string => Boolean(name))
                  .sort((a, b) => a.localeCompare(b, 'sr'))
                  .join(', ')

              if (rows.length === 0)
                return <p className="empty-note">Još nema nastavnika. Dodajte prvog.</p>
              return (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Ime i prezime</th>
                      <th>Email</th>
                      <th>Predmeti</th>
                      <th>Status</th>
                      <th>
                        <span className="visually-hidden">Radnje</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((teacher) => {
                      const own = teacher.id === roles.profileId
                      const open = (kind: 'subjects' | 'email' | 'deactivate' | 'activate') => {
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
                          <td>{teacher.isActive ? 'Aktivan' : 'Deaktiviran'}</td>
                          <td className="table__actions">
                            <button
                              type="button"
                              className="button button--small button--secondary"
                              onClick={() => open('subjects')}
                            >
                              Predmeti
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
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )
            }}
          </Loaded>
        )}
      </Loaded>

      {dialog?.kind === 'add' && subjects.data && (
        <AddTeacherDialog subjects={subjects.data} onClose={close} onDone={done} />
      )}
      {dialog?.kind === 'subjects' && subjects.data && (
        <SubjectsDialog
          teacher={dialog.teacher}
          subjects={subjects.data}
          onClose={close}
          onDone={done}
        />
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
    </>
  )
}
