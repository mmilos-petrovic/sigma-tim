import { useState } from 'react'
import { FormDialog } from '../../components/FormDialog'
import { Loaded, Notice, PageHeader } from '../../components/Loaded'
import { useAdminApi } from '../AdminApiProvider'
import type { TakeoverRow } from '../adminApi'
import { explainError } from '../errors'
import { useRefresh, useTakeovers } from '../queries'

const studentName = (request: TakeoverRow) =>
  `${request.student.firstName} ${request.student.lastName}`
const teacherName = (request: TakeoverRow) =>
  `${request.teacher.firstName} ${request.teacher.lastName}`

function details(student: TakeoverRow['student']): string {
  const grade = student.grade ? `razred ${student.grade}${student.section ?? ''}` : null
  return [student.school, grade].filter(Boolean).join(', ')
}

function ApproveDialog({
  request,
  onClose,
  onDone,
}: {
  request: TakeoverRow
  onClose: () => void
  onDone: (message: string) => void
}) {
  const api = useAdminApi()
  const refresh = useRefresh()
  return (
    <FormDialog
      title="Odobravanje zahteva"
      action="approveTakeover"
      submitLabel="Odobri"
      onClose={onClose}
      onSubmit={async () => {
        await api.approveTakeover(request.id)
        await refresh()
        onDone('Zahtev je odobren.')
      }}
    >
      <p>{`${studentName(request)} postaje učenik nastavnika ${teacherName(request)}. Ostali zahtevi za tog učenika biće odbijeni.`}</p>
    </FormDialog>
  )
}

/** Teachers ask for students nobody teaches; the admin decides. Competing requests for one student sit together. */
export function TakeoverRequestsPage() {
  const api = useAdminApi()
  const refresh = useRefresh()
  const takeovers = useTakeovers()
  const [approving, setApproving] = useState<TakeoverRow | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reject = async (request: TakeoverRow) => {
    setError(null)
    setNotice(null)
    try {
      await api.rejectTakeover(request.id)
      await refresh()
      setNotice('Zahtev je odbijen.')
    } catch (failure) {
      setError(explainError(failure, 'rejectTakeover'))
    }
  }

  return (
    <>
      <PageHeader title="Zahtevi za preuzimanje" />
      <p>
        Nastavnici traže učenike koji trenutno nemaju nastavnika. Odobravanjem jednog zahteva ostali
        za istog učenika se odbijaju.
      </p>
      <Notice message={notice} />
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}

      <Loaded query={takeovers}>
        {(requests) => {
          if (requests.length === 0) return <p className="empty-note">Nema zahteva na čekanju.</p>
          const byStudent = new Map<string, TakeoverRow[]>()
          for (const request of requests) {
            byStudent.set(request.student.id, [
              ...(byStudent.get(request.student.id) ?? []),
              request,
            ])
          }
          return (
            <div className="stack">
              {[...byStudent.values()].map((group) => (
                <article
                  key={group[0].student.id}
                  className="panel"
                  aria-label={studentName(group[0])}
                >
                  <h2>{studentName(group[0])}</h2>
                  {details(group[0].student) && (
                    <p className="muted">{details(group[0].student)}</p>
                  )}
                  <ul className="requests">
                    {group.map((request) => (
                      <li key={request.id}>
                        <span>{teacherName(request)}</span>
                        <span className="table__actions">
                          <button
                            type="button"
                            className="button button--small"
                            aria-label={`Odobri: ${teacherName(request)}`}
                            onClick={() => {
                              setNotice(null)
                              setApproving(request)
                            }}
                          >
                            Odobri
                          </button>
                          <button
                            type="button"
                            className="button button--small button--secondary"
                            aria-label={`Odbij: ${teacherName(request)}`}
                            onClick={() => void reject(request)}
                          >
                            Odbij
                          </button>
                        </span>
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          )
        }}
      </Loaded>

      {approving && (
        <ApproveDialog
          request={approving}
          onClose={() => setApproving(null)}
          onDone={(message) => {
            setApproving(null)
            setNotice(message)
          }}
        />
      )}
    </>
  )
}
