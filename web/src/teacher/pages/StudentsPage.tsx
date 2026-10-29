import { useState } from 'react'
import { AdminError } from '../../admin/adminApi'
import { explainError } from '../../admin/errors'
import { Field, FormDialog } from '../../components/FormDialog'
import { Loaded, Notice, PageHeader } from '../../components/Loaded'
import { useTeacherApi } from '../TeacherApiProvider'
import { useRefresh, useStudents, useUnassigned } from '../queries'
import { MAX_PARENTS, type ParentRow, type StudentRow, type UnassignedStudent } from '../teacherApi'

const EMAIL_FORMAT = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const normalizeEmail = (email: string) => email.trim().toLowerCase()
const fullName = (person: { firstName: string; lastName: string }) =>
  `${person.firstName} ${person.lastName}`
const orNull = (value: string) => value.trim() || null

/** What is wrong with the name and email a teacher typed, or null. */
function personProblem(email: string | null, firstName: string, lastName: string): string | null {
  if (email !== null && !EMAIL_FORMAT.test(normalizeEmail(email))) {
    return 'Email adresa nije ispravna.'
  }
  if (!firstName.trim() || !lastName.trim()) return 'Ime i prezime su obavezni.'
  return null
}

type Dialog =
  | { kind: 'addStudent' }
  | { kind: 'editStudent'; student: StudentRow }
  | { kind: 'changeEmail'; student: StudentRow }
  | { kind: 'addParent'; student: StudentRow }
  | { kind: 'editParent'; parent: ParentRow }
  | { kind: 'removeParent'; student: StudentRow; parent: ParentRow }
  | null

interface DialogProps {
  onClose: () => void
  onDone: (message: string | null) => void
}

function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <p className="field field--readonly">
      <span>{label}</span>
      <span className="field__value">{value}</span>
    </p>
  )
}

function AddStudentDialog({
  students,
  unassigned,
  onClose,
  onDone,
}: DialogProps & { students: StudentRow[]; unassigned: UnassignedStudent[] }) {
  const api = useTeacherApi()
  const refresh = useRefresh()
  const [email, setEmail] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [school, setSchool] = useState('')
  const [grade, setGrade] = useState('')
  const [section, setSection] = useState('')

  return (
    <FormDialog
      title="Novi učenik"
      action="addStudent"
      submitLabel="Dodaj"
      onClose={onClose}
      validate={() => {
        const problem = personProblem(email, firstName, lastName)
        if (problem) return problem
        const lower = normalizeEmail(email)
        if (students.some((student) => student.email === lower)) {
          return explainError(new AdminError('PT409'), 'addStudent')
        }
        // A second record for somebody nobody teaches would be a duplicate; the takeover request is the way.
        if (unassigned.some((student) => student.email === lower)) {
          return 'Ovaj učenik trenutno nema nastavnika. Zatražite preuzimanje u odeljku „Neraspoređeni učenici“.'
        }
        return null
      }}
      onSubmit={async () => {
        await api.addStudent({
          email: normalizeEmail(email),
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          school: orNull(school),
          grade: orNull(grade),
          section: orNull(section),
        })
        await refresh()
        onDone('Učenik je dodat.')
      }}
    >
      <Field
        label="Email adresa (Google nalog)"
        type="email"
        value={email}
        onChange={setEmail}
        maxLength={254}
      />
      <Field label="Ime" value={firstName} onChange={setFirstName} maxLength={100} />
      <Field label="Prezime" value={lastName} onChange={setLastName} maxLength={100} />
      <Field label="Škola" value={school} onChange={setSchool} maxLength={200} />
      <Field label="Razred" value={grade} onChange={setGrade} maxLength={50} />
      <Field label="Odeljenje" value={section} onChange={setSection} maxLength={50} />
    </FormDialog>
  )
}

function EditStudentDialog({ student, onClose, onDone }: DialogProps & { student: StudentRow }) {
  const api = useTeacherApi()
  const refresh = useRefresh()
  const [firstName, setFirstName] = useState(student.firstName)
  const [lastName, setLastName] = useState(student.lastName)
  const [school, setSchool] = useState(student.school ?? '')
  const [grade, setGrade] = useState(student.grade ?? '')
  const [section, setSection] = useState(student.section ?? '')

  return (
    <FormDialog
      title="Izmena učenika"
      action="updateStudent"
      submitLabel="Sačuvaj"
      onClose={onClose}
      validate={() => personProblem(null, firstName, lastName)}
      onSubmit={async () => {
        const nameChanged =
          firstName.trim() !== student.firstName || lastName.trim() !== student.lastName
        const details = { school: orNull(school), grade: orNull(grade), section: orNull(section) }
        const detailsChanged =
          details.school !== student.school ||
          details.grade !== student.grade ||
          details.section !== student.section
        if (!nameChanged && !detailsChanged) {
          onDone(null)
          return
        }
        try {
          if (nameChanged) {
            await api.renamePerson(student.profileId, firstName.trim(), lastName.trim())
          }
          if (detailsChanged) await api.updateStudentDetails(student.id, details)
        } finally {
          // whatever was saved before a failure is shown as it is
          await refresh()
        }
        onDone('Podaci su sačuvani.')
      }}
    >
      <ReadOnly label="Email adresa" value={student.email} />
      <Field label="Ime" value={firstName} onChange={setFirstName} maxLength={100} />
      <Field label="Prezime" value={lastName} onChange={setLastName} maxLength={100} />
      <Field label="Škola" value={school} onChange={setSchool} maxLength={200} />
      <Field label="Razred" value={grade} onChange={setGrade} maxLength={50} />
      <Field label="Odeljenje" value={section} onChange={setSection} maxLength={50} />
    </FormDialog>
  )
}

function ChangeEmailDialog({ student, onClose, onDone }: DialogProps & { student: StudentRow }) {
  const api = useTeacherApi()
  const refresh = useRefresh()
  const [email, setEmail] = useState('')

  return (
    <FormDialog
      title="Promena email adrese"
      action="changeStudentEmail"
      submitLabel="Promeni"
      onClose={onClose}
      validate={() => {
        if (!EMAIL_FORMAT.test(normalizeEmail(email))) return 'Email adresa nije ispravna.'
        if (normalizeEmail(email) === student.email) return 'To je trenutna email adresa učenika.'
        return null
      }}
      onSubmit={async () => {
        await api.changeStudentEmail(student.id, normalizeEmail(email))
        await refresh()
        onDone('Email adresa je promenjena.')
      }}
    >
      <ReadOnly label="Učenik" value={fullName(student)} />
      <ReadOnly label="Trenutna email adresa" value={student.email} />
      <p>
        Stari Google nalog odmah gubi pristup. Učenik se posle promene prijavljuje novom adresom.
        {student.hasSignedIn &&
          ' Ovaj učenik se već prijavljivao: bez nove adrese neće moći da uđe.'}
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

function AddParentDialog({ student, onClose, onDone }: DialogProps & { student: StudentRow }) {
  const api = useTeacherApi()
  const refresh = useRefresh()
  const [email, setEmail] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')

  return (
    <FormDialog
      title="Novi roditelj"
      action="addParent"
      submitLabel="Dodaj"
      onClose={onClose}
      validate={() => personProblem(email, firstName, lastName)}
      onSubmit={async () => {
        await api.addParent(student.id, {
          email: normalizeEmail(email),
          firstName: firstName.trim(),
          lastName: lastName.trim(),
        })
        await refresh()
        onDone('Roditelj je dodat.')
      }}
    >
      <p>
        Roditelj za učenika <strong>{fullName(student)}</strong>. Ako se ova email adresa već
        koristi za roditelja, povezuje se postojeći nalog.
      </p>
      <Field
        label="Email adresa (Google nalog)"
        type="email"
        value={email}
        onChange={setEmail}
        maxLength={254}
      />
      <Field label="Ime" value={firstName} onChange={setFirstName} maxLength={100} />
      <Field label="Prezime" value={lastName} onChange={setLastName} maxLength={100} />
    </FormDialog>
  )
}

function EditParentDialog({ parent, onClose, onDone }: DialogProps & { parent: ParentRow }) {
  const api = useTeacherApi()
  const refresh = useRefresh()
  const [firstName, setFirstName] = useState(parent.firstName)
  const [lastName, setLastName] = useState(parent.lastName)

  return (
    <FormDialog
      title="Izmena roditelja"
      action="renamePerson"
      submitLabel="Sačuvaj"
      onClose={onClose}
      validate={() => personProblem(null, firstName, lastName)}
      onSubmit={async () => {
        if (firstName.trim() === parent.firstName && lastName.trim() === parent.lastName) {
          onDone(null)
          return
        }
        await api.renamePerson(parent.id, firstName.trim(), lastName.trim())
        await refresh()
        onDone('Podaci su sačuvani.')
      }}
    >
      <ReadOnly label="Email adresa" value={parent.email} />
      <Field label="Ime" value={firstName} onChange={setFirstName} maxLength={100} />
      <Field label="Prezime" value={lastName} onChange={setLastName} maxLength={100} />
    </FormDialog>
  )
}

function RemoveParentDialog({
  student,
  parent,
  onClose,
  onDone,
}: DialogProps & { student: StudentRow; parent: ParentRow }) {
  const api = useTeacherApi()
  const refresh = useRefresh()
  return (
    <FormDialog
      title="Uklanjanje roditelja"
      action="removeParent"
      submitLabel="Ukloni"
      danger
      onClose={onClose}
      onSubmit={async () => {
        await api.removeParent(student.id, parent.id)
        await refresh()
        onDone('Roditelj je uklonjen.')
      }}
    >
      <p>
        Roditelj <strong>{fullName(parent)}</strong> ({parent.email}) gubi pristup podacima i
        časovima učenika <strong>{fullName(student)}</strong>.
      </p>
      <p>
        Ako ste uneli pogrešnu email adresu, uklonite roditelja pa ga dodajte ponovo sa ispravnom
        adresom.
      </p>
    </FormDialog>
  )
}

function ClassCell({ grade, section }: { grade: string | null; section: string | null }) {
  const text = [grade, section].filter(Boolean).join(' ')
  return <>{text || '—'}</>
}

function StudentsTable({
  rows,
  onDialog,
}: {
  rows: StudentRow[]
  onDialog: (dialog: Dialog) => void
}) {
  return (
    <table className="table">
      <thead>
        <tr>
          <th>Učenik</th>
          <th>Škola</th>
          <th>Razred</th>
          <th>Roditelji</th>
          <th>
            <span className="visually-hidden">Radnje</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((student) => (
          <tr key={student.id}>
            <td>
              <strong>{fullName(student)}</strong>
              <div className="muted">{student.email}</div>
            </td>
            <td>{student.school ?? '—'}</td>
            <td>
              <ClassCell grade={student.grade} section={student.section} />
            </td>
            <td>
              {student.parents.length === 0 ? (
                <span className="muted">Nema roditelja</span>
              ) : (
                <ul className="plain-list">
                  {student.parents.map((parent) => (
                    <li key={parent.id}>
                      <span>{fullName(parent)}</span>
                      <div className="muted">{parent.email}</div>
                      <button
                        type="button"
                        className="button button--small button--secondary"
                        aria-label={`Izmeni roditelja ${fullName(parent)}`}
                        onClick={() => onDialog({ kind: 'editParent', parent })}
                      >
                        Izmeni
                      </button>
                      <button
                        type="button"
                        className="button button--small button--secondary"
                        aria-label={`Ukloni roditelja ${fullName(parent)}`}
                        onClick={() => onDialog({ kind: 'removeParent', student, parent })}
                      >
                        Ukloni
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </td>
            <td className="table__actions">
              <button
                type="button"
                className="button button--small button--secondary"
                aria-label={`Izmeni učenika ${fullName(student)}`}
                onClick={() => onDialog({ kind: 'editStudent', student })}
              >
                Izmeni
              </button>
              <button
                type="button"
                className="button button--small button--secondary"
                aria-label={`Promeni email učeniku ${fullName(student)}`}
                onClick={() => onDialog({ kind: 'changeEmail', student })}
              >
                Promeni email
              </button>
              {student.parents.length < MAX_PARENTS && (
                <button
                  type="button"
                  className="button button--small button--secondary"
                  aria-label={`Dodaj roditelja učeniku ${fullName(student)}`}
                  onClick={() => onDialog({ kind: 'addParent', student })}
                >
                  Dodaj roditelja
                </button>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function UnassignedTable({
  rows,
  busyId,
  onRequest,
}: {
  rows: UnassignedStudent[]
  busyId: string | null
  onRequest: (student: UnassignedStudent) => void
}) {
  return (
    <table className="table">
      <thead>
        <tr>
          <th>Učenik</th>
          <th>Škola</th>
          <th>Razred</th>
          <th>
            <span className="visually-hidden">Radnje</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((student) => (
          <tr key={student.id}>
            <td>
              <strong>{fullName(student)}</strong>
              <div className="muted">{student.email}</div>
            </td>
            <td>{student.school ?? '—'}</td>
            <td>
              <ClassCell grade={student.grade} section={student.section} />
            </td>
            <td className="table__actions">
              {student.requested ? (
                <span className="muted">Zahtev je poslat</span>
              ) : (
                <button
                  type="button"
                  className="button button--small button--secondary"
                  disabled={busyId === student.id}
                  onClick={() => onRequest(student)}
                >
                  Zatraži preuzimanje
                </button>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function StudentsPage() {
  const api = useTeacherApi()
  const refresh = useRefresh()
  const students = useStudents()
  const unassigned = useUnassigned()
  const [dialog, setDialog] = useState<Dialog>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [requestError, setRequestError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const done = (message: string | null) => {
    setDialog(null)
    setNotice(message)
  }

  const requestTakeover = async (student: UnassignedStudent) => {
    if (busyId) return
    setBusyId(student.id)
    setRequestError(null)
    setNotice(null)
    try {
      await api.requestTakeover(student.id)
      await refresh()
      setNotice('Zahtev je poslat administratoru.')
    } catch (failure) {
      setRequestError(explainError(failure, 'requestTakeover'))
      await refresh()
    } finally {
      setBusyId(null)
    }
  }

  return (
    <>
      <PageHeader title="Učenici">
        <button type="button" className="button" onClick={() => setDialog({ kind: 'addStudent' })}>
          Dodaj učenika
        </button>
      </PageHeader>
      <Notice message={notice} />

      <Loaded query={students}>
        {(rows) =>
          rows.length === 0 ? (
            <p className="empty-note">Još nemate učenika. Dodajte prvog.</p>
          ) : (
            <StudentsTable rows={rows} onDialog={setDialog} />
          )
        }
      </Loaded>

      <h2 className="section-title">Neraspoređeni učenici</h2>
      <p className="muted">Učenici bez nastavnika. Zahtev za preuzimanje odobrava administrator.</p>
      {requestError && (
        <p role="alert" className="form-error">
          {requestError}
        </p>
      )}
      <Loaded query={unassigned}>
        {(rows) =>
          rows.length === 0 ? (
            <p className="empty-note">Trenutno nema neraspoređenih učenika.</p>
          ) : (
            <UnassignedTable
              rows={rows}
              busyId={busyId}
              onRequest={(student) => void requestTakeover(student)}
            />
          )
        }
      </Loaded>

      {dialog?.kind === 'addStudent' && (
        <AddStudentDialog
          students={students.data ?? []}
          unassigned={unassigned.data ?? []}
          onClose={() => setDialog(null)}
          onDone={done}
        />
      )}
      {dialog?.kind === 'editStudent' && (
        <EditStudentDialog student={dialog.student} onClose={() => setDialog(null)} onDone={done} />
      )}
      {dialog?.kind === 'changeEmail' && (
        <ChangeEmailDialog student={dialog.student} onClose={() => setDialog(null)} onDone={done} />
      )}
      {dialog?.kind === 'addParent' && (
        <AddParentDialog student={dialog.student} onClose={() => setDialog(null)} onDone={done} />
      )}
      {dialog?.kind === 'editParent' && (
        <EditParentDialog parent={dialog.parent} onClose={() => setDialog(null)} onDone={done} />
      )}
      {dialog?.kind === 'removeParent' && (
        <RemoveParentDialog
          student={dialog.student}
          parent={dialog.parent}
          onClose={() => setDialog(null)}
          onDone={done}
        />
      )}
    </>
  )
}
