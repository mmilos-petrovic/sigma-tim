import { useState, type FormEvent } from 'react'
import { Field, FormDialog } from '../../components/FormDialog'
import { Loaded, Notice, PageHeader } from '../../components/Loaded'
import { useAdminApi } from '../AdminApiProvider'
import type { Subject } from '../adminApi'
import { explainError } from '../errors'
import { duplicateMessage, hasName } from '../names'
import { useRefresh, useSubjects } from '../queries'

type Dialog = { kind: 'rename' | 'delete'; subject: Subject } | null

function RenameDialog({
  subject,
  others,
  onClose,
  onDone,
}: {
  subject: Subject
  /** The names of the other subjects. */
  others: string[]
  onClose: () => void
  onDone: (message: string) => void
}) {
  const api = useAdminApi()
  const refresh = useRefresh()
  const [name, setName] = useState(subject.name)
  return (
    <FormDialog
      title="Preimenovanje predmeta"
      action="renameSubject"
      submitLabel="Sačuvaj"
      onClose={onClose}
      validate={() => {
        if (!name.trim()) return 'Unesite naziv predmeta.'
        return hasName(others, name) ? duplicateMessage('renameSubject') : null
      }}
      onSubmit={async () => {
        await api.renameSubject(subject.id, name.trim())
        await refresh()
        onDone('Predmet je preimenovan.')
      }}
    >
      <Field label="Naziv" value={name} onChange={setName} maxLength={100} />
    </FormDialog>
  )
}

function DeleteDialog({
  subject,
  onClose,
  onDone,
}: {
  subject: Subject
  onClose: () => void
  onDone: (message: string) => void
}) {
  const api = useAdminApi()
  const refresh = useRefresh()
  return (
    <FormDialog
      title="Brisanje predmeta"
      action="deleteSubject"
      submitLabel="Obriši"
      danger
      onClose={onClose}
      onSubmit={async () => {
        await api.deleteSubject(subject.id)
        await refresh()
        onDone('Predmet je obrisan.')
      }}
    >
      <p>
        Da li sigurno želite da obrišete predmet <strong>{subject.name}</strong>?
      </p>
    </FormDialog>
  )
}

export function SubjectsPage() {
  const api = useAdminApi()
  const refresh = useRefresh()
  const subjects = useSubjects()
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [dialog, setDialog] = useState<Dialog>(null)

  const add = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Unesite naziv predmeta.')
      return
    }
    // The database tells "Fizika" and "fizika" apart; a person does not.
    if (hasName(subjects.data?.map((subject) => subject.name) ?? [], trimmed)) {
      setError(duplicateMessage('addSubject'))
      return
    }
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await api.addSubject(trimmed)
      await refresh()
      setName('')
      setNotice('Predmet je dodat.')
    } catch (failure) {
      setError(explainError(failure, 'addSubject'))
    } finally {
      setBusy(false)
    }
  }

  const done = (message: string) => {
    setDialog(null)
    setNotice(message)
  }

  return (
    <>
      <PageHeader title="Predmeti" />
      <Notice message={notice} />

      <form className="inline-form" onSubmit={(event) => void add(event)} noValidate>
        <label className="field">
          <span>Novi predmet</span>
          <input value={name} maxLength={100} onChange={(event) => setName(event.target.value)} />
        </label>
        <button type="submit" className="button" disabled={busy}>
          Dodaj predmet
        </button>
      </form>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}

      <Loaded query={subjects}>
        {(rows) =>
          rows.length === 0 ? (
            <p className="empty-note">Još nema predmeta. Dodajte prvi.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Naziv</th>
                  <th>Nastavnika</th>
                  <th>
                    <span className="visually-hidden">Radnje</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((subject) => (
                  <tr key={subject.id}>
                    <td>{subject.name}</td>
                    <td>{subject.teacherCount}</td>
                    <td className="table__actions">
                      <button
                        type="button"
                        className="button button--small button--secondary"
                        onClick={() => setDialog({ kind: 'rename', subject })}
                      >
                        Preimenuj
                      </button>
                      <button
                        type="button"
                        className="button button--small button--secondary"
                        onClick={() => setDialog({ kind: 'delete', subject })}
                      >
                        Obriši
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        }
      </Loaded>

      {dialog?.kind === 'rename' && (
        <RenameDialog
          subject={dialog.subject}
          others={(subjects.data ?? [])
            .filter((subject) => subject.id !== dialog.subject.id)
            .map((subject) => subject.name)}
          onClose={() => setDialog(null)}
          onDone={done}
        />
      )}
      {dialog?.kind === 'delete' && (
        <DeleteDialog subject={dialog.subject} onClose={() => setDialog(null)} onDone={done} />
      )}
    </>
  )
}
