import { useRef, useState } from 'react'
import { AdminError } from '../../admin/adminApi'
import { explainError } from '../../admin/errors'
import { AddIcon, DeleteIcon, EditIcon, IconButton, ViewIcon } from '../../components/ActionIcons'
import { DeleteStudentDialog } from '../../components/DeleteStudentDialog'
import { Dialog } from '../../components/Dialog'
import { Field, FormDialog } from '../../components/FormDialog'
import { Loaded, Notice, PageHeader } from '../../components/Loaded'
import { formatGrade, gradeProblem } from '../../lib/grade'
import { formatPhone, normalizePhone, phoneProblem } from '../../lib/phone'
import { useTeacherApi } from '../TeacherApiProvider'
import { useRefresh, useStudentCounts, useStudents, useUnassigned } from '../queries'
import { type ParentRow, type StudentRow, type UnassignedStudent } from '../teacherApi'

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

type Shown =
  | { kind: 'addStudent' }
  | { kind: 'viewStudent'; student: StudentRow }
  | { kind: 'editStudent'; student: StudentRow }
  | { kind: 'addParent'; student: StudentRow }
  | { kind: 'editParent'; parent: ParentRow }
  | { kind: 'removeParent'; student: StudentRow; parent: ParentRow }
  | { kind: 'deleteStudent'; student: StudentRow; upcoming: number }
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
  const [phone, setPhone] = useState('')

  return (
    <FormDialog
      title="Novi učenik"
      action="addStudent"
      submitLabel="Dodaj"
      onClose={onClose}
      validate={() => {
        const problem =
          personProblem(email, firstName, lastName) ??
          phoneProblem(phone, false) ??
          gradeProblem(grade)
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
          section: null,
          phone: normalizePhone(phone),
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
      <Field label="Razred" value={grade} onChange={setGrade} maxLength={2} />
      <Field
        label="Telefon učenika (nije obavezan)"
        type="tel"
        value={phone}
        onChange={setPhone}
        maxLength={30}
      />
    </FormDialog>
  )
}

function ViewStudentDialog({ student, onClose }: { student: StudentRow; onClose: () => void }) {
  const rows: [string, string | null][] = [
    ['Ime i prezime', fullName(student)],
    ['Email adresa', student.email],
    ['Broj telefona', student.phone ? formatPhone(student.phone) : null],
    ['Škola', student.school],
    ['Razred', formatGrade(student.grade)],
  ]
  return (
    <Dialog title="Učenik" onClose={onClose}>
      <dl className="details">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value || '—'}</dd>
          </div>
        ))}
      </dl>
      <div className="actions actions--end">
        <button type="button" className="button" onClick={onClose}>
          Zatvori
        </button>
      </div>
    </Dialog>
  )
}

/** Name, email, number, school and class of a student; also where a student without a held lesson is deleted. */
function EditStudentDialog({
  student,
  canDelete,
  onDelete,
  onClose,
  onDone,
}: DialogProps & {
  student: StudentRow
  /** Only a student with no lesson recorded as held can be deleted. */
  canDelete: boolean
  onDelete: () => void
}) {
  const api = useTeacherApi()
  const refresh = useRefresh()
  const [firstName, setFirstName] = useState(student.firstName)
  const [lastName, setLastName] = useState(student.lastName)
  const [email, setEmail] = useState(student.email)
  const [phone, setPhone] = useState(student.phone ? formatPhone(student.phone) : '')
  const [school, setSchool] = useState(student.school ?? '')
  const [grade, setGrade] = useState(student.grade ?? '')
  // which of the saves is under way, to explain the one that fails in its own words
  const step = useRef<'email' | 'name' | 'details' | 'phone'>('details')
  const emailChanged = normalizeEmail(email) !== student.email

  return (
    <FormDialog
      title="Izmena učenika"
      action="updateStudent"
      submitLabel="Sačuvaj"
      onClose={onClose}
      validate={() =>
        personProblem(email, firstName, lastName) ??
        phoneProblem(phone, false) ??
        gradeProblem(grade, student.grade)
      }
      explain={(failure) => {
        if (step.current === 'email') return explainError(failure, 'changeStudentEmail')
        if (step.current === 'name') return explainError(failure, 'renamePerson')
        if (step.current === 'phone') return explainError(failure, 'setPhone')
        return null
      }}
      onSubmit={async () => {
        const nextEmail = normalizeEmail(email)
        const nextPhone = phone.trim() === '' ? null : normalizePhone(phone)
        const nameChanged =
          firstName.trim() !== student.firstName || lastName.trim() !== student.lastName
        // the section of the class is no longer asked for or shown, and what is stored stays as it is
        const details = { school: orNull(school), grade: orNull(grade), section: student.section }
        const detailsChanged = details.school !== student.school || details.grade !== student.grade
        const phoneChanged = nextPhone !== student.phone
        if (!emailChanged && !nameChanged && !detailsChanged && !phoneChanged) {
          onDone(null)
          return
        }
        try {
          // the email first: it is the one most likely to be refused, and then nothing else has been saved
          if (emailChanged) {
            step.current = 'email'
            await api.changeStudentEmail(student.id, nextEmail)
          }
          if (nameChanged) {
            step.current = 'name'
            await api.renamePerson(student.profileId, firstName.trim(), lastName.trim())
          }
          if (detailsChanged) {
            step.current = 'details'
            await api.updateStudentDetails(student.id, details)
          }
          if (phoneChanged) {
            step.current = 'phone'
            await api.setPhone(student.profileId, nextPhone)
          }
        } finally {
          // whatever was saved before a failure is shown as it is
          await refresh()
        }
        onDone('Podaci su sačuvani.')
      }}
    >
      <Field label="Ime" value={firstName} onChange={setFirstName} maxLength={100} />
      <Field label="Prezime" value={lastName} onChange={setLastName} maxLength={100} />
      <Field label="Email adresa" type="email" value={email} onChange={setEmail} maxLength={254} />
      {emailChanged && (
        <p className="notice notice--locked">
          Stari Google nalog odmah gubi pristup. Učenik se posle promene prijavljuje novom adresom.
          {student.hasSignedIn &&
            ' Ovaj učenik se već prijavljivao: bez nove adrese neće moći da uđe.'}
        </p>
      )}
      <Field
        label="Broj telefona (nije obavezan)"
        type="tel"
        value={phone}
        onChange={setPhone}
        maxLength={30}
      />
      <Field label="Škola" value={school} onChange={setSchool} maxLength={200} />
      <Field label="Razred" value={grade} onChange={setGrade} maxLength={2} />
      {canDelete && (
        <div className="danger-zone">
          <IconButton label={`Obriši učenika ${fullName(student)}`} danger onClick={onDelete}>
            <DeleteIcon />
          </IconButton>
          <span className="muted">Briše učenika; roditelji gube pristup njegovim podacima.</span>
        </div>
      )}
    </FormDialog>
  )
}

function AddParentDialog({ student, onClose, onDone }: DialogProps & { student: StudentRow }) {
  const api = useTeacherApi()
  const refresh = useRefresh()
  const [email, setEmail] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')

  return (
    <FormDialog
      title="Novi roditelj"
      action="addParent"
      submitLabel="Dodaj"
      onClose={onClose}
      validate={() => personProblem(email, firstName, lastName) ?? phoneProblem(phone, true)}
      onSubmit={async () => {
        await api.addParent(student.id, {
          email: normalizeEmail(email),
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone: normalizePhone(phone) ?? '',
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
      <Field
        label="Telefon roditelja"
        type="tel"
        value={phone}
        onChange={setPhone}
        maxLength={30}
      />
    </FormDialog>
  )
}

function EditParentDialog({ parent, onClose, onDone }: DialogProps & { parent: ParentRow }) {
  const api = useTeacherApi()
  const refresh = useRefresh()
  const [firstName, setFirstName] = useState(parent.firstName)
  const [lastName, setLastName] = useState(parent.lastName)
  const [phone, setPhone] = useState(parent.phone ? formatPhone(parent.phone) : '')
  const step = useRef<'name' | 'phone'>('name')

  return (
    <FormDialog
      title="Izmena roditelja"
      action="renamePerson"
      submitLabel="Sačuvaj"
      onClose={onClose}
      validate={() => personProblem(null, firstName, lastName) ?? phoneProblem(phone, true)}
      explain={(failure) => (step.current === 'phone' ? explainError(failure, 'setPhone') : null)}
      onSubmit={async () => {
        const nextPhone = normalizePhone(phone)
        const nameChanged =
          firstName.trim() !== parent.firstName || lastName.trim() !== parent.lastName
        const phoneChanged = nextPhone !== parent.phone
        if (!nameChanged && !phoneChanged) {
          onDone(null)
          return
        }
        try {
          if (nameChanged) {
            step.current = 'name'
            await api.renamePerson(parent.id, firstName.trim(), lastName.trim())
          }
          if (phoneChanged) {
            step.current = 'phone'
            await api.setPhone(parent.id, nextPhone)
          }
        } finally {
          await refresh()
        }
        onDone('Podaci su sačuvani.')
      }}
    >
      <ReadOnly label="Email adresa" value={parent.email} />
      <Field label="Ime" value={firstName} onChange={setFirstName} maxLength={100} />
      <Field label="Prezime" value={lastName} onChange={setLastName} maxLength={100} />
      <Field label="Broj telefona" type="tel" value={phone} onChange={setPhone} maxLength={30} />
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

function ClassCell({ grade }: { grade: string | null }) {
  return <>{formatGrade(grade) ?? '—'}</>
}

/** A parent in the table: the name with an edit and a delete icon, or a button to add one. */
function ParentCell({
  student,
  parent,
  second = false,
  onDialog,
}: {
  student: StudentRow
  parent: ParentRow | undefined
  /** The place for the second parent: its button is named so, since a student with no parent has two. */
  second?: boolean
  onDialog: (dialog: Shown) => void
}) {
  if (!parent) {
    return (
      <button
        type="button"
        className="button button--small button--secondary person-cell__add"
        aria-label={`${second ? 'Dodaj drugog roditelja' : 'Dodaj roditelja'} učeniku ${fullName(student)}`}
        onClick={() => onDialog({ kind: 'addParent', student })}
      >
        <AddIcon /> Dodaj
      </button>
    )
  }
  return (
    <div className="person-cell">
      <span className="person-cell__name">
        {fullName(parent)}
        {!parent.phone && <span className="badge badge--warn">nedostaje broj</span>}
      </span>
      <IconButton
        label={`Izmeni roditelja ${fullName(parent)}`}
        onClick={() => onDialog({ kind: 'editParent', parent })}
      >
        <EditIcon />
      </IconButton>
      <IconButton
        label={`Ukloni roditelja ${fullName(parent)}`}
        danger
        onClick={() => onDialog({ kind: 'removeParent', student, parent })}
      >
        <DeleteIcon />
      </IconButton>
    </div>
  )
}

/** A row a student: the student with a view and an edit icon, then the two places for a parent. */
function StudentsTable({
  rows,
  onDialog,
}: {
  rows: StudentRow[]
  onDialog: (dialog: Shown) => void
}) {
  return (
    <table className="table table--stack students-table">
      <thead>
        <tr>
          <th>Učenik</th>
          <th colSpan={2}>Roditelji</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((student) => (
          <tr key={student.id}>
            <td>
              <div className="person-cell">
                <span className="person-cell__name">
                  <strong>{fullName(student)}</strong>
                </span>
                <IconButton
                  label={`Prikaži učenika ${fullName(student)}`}
                  onClick={() => onDialog({ kind: 'viewStudent', student })}
                >
                  <ViewIcon />
                </IconButton>
                <IconButton
                  label={`Izmeni učenika ${fullName(student)}`}
                  onClick={() => onDialog({ kind: 'editStudent', student })}
                >
                  <EditIcon />
                </IconButton>
              </div>
            </td>
            <td data-label="Roditelji">
              <ParentCell student={student} parent={student.parents[0]} onDialog={onDialog} />
            </td>
            <td>
              <ParentCell
                student={student}
                parent={student.parents[1]}
                second
                onDialog={onDialog}
              />
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
    <table className="table table--stack">
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
            <td data-label="Škola">{student.school ?? '—'}</td>
            <td data-label="Razred">
              <ClassCell grade={student.grade} />
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
  const studentCounts = useStudentCounts()
  const counts = new Map((studentCounts.data ?? []).map((count) => [count.studentId, count]))
  const [dialog, setDialog] = useState<Shown>(null)
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
      {dialog?.kind === 'viewStudent' && (
        <ViewStudentDialog student={dialog.student} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === 'editStudent' && (
        <EditStudentDialog
          student={dialog.student}
          // while the lessons are not known, nobody is offered for deletion
          canDelete={counts.get(dialog.student.id)?.heldLessons === 0}
          onDelete={() =>
            setDialog({
              kind: 'deleteStudent',
              student: dialog.student,
              upcoming: counts.get(dialog.student.id)?.upcomingLessons ?? 0,
            })
          }
          onClose={() => setDialog(null)}
          onDone={done}
        />
      )}
      {dialog?.kind === 'addParent' && (
        <AddParentDialog student={dialog.student} onClose={() => setDialog(null)} onDone={done} />
      )}
      {dialog?.kind === 'editParent' && (
        <EditParentDialog parent={dialog.parent} onClose={() => setDialog(null)} onDone={done} />
      )}
      {dialog?.kind === 'deleteStudent' && (
        <DeleteStudentDialog
          name={fullName(dialog.student)}
          upcoming={dialog.upcoming}
          onDelete={async () => {
            await api.deleteStudent(dialog.student.id)
            await refresh()
          }}
          onClose={() => setDialog(null)}
          onDone={done}
        />
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
