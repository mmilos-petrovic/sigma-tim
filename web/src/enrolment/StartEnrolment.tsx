import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { Link, Navigate } from 'react-router'
import { explainError } from '../admin/errors'
import { ENROLMENT_PATH } from '../auth/roles'
import { Loading } from '../components/Loaded'
import { useEnrolmentApi } from './EnrolmentApiProvider'
import { clearPendingEnrolment, type PendingEnrolment } from './pending'

/**
 * Shown by the sign-in page when somebody the school does not know yet comes back from Google after the form of the front
 * page. It makes their profile and request (asking again gives the same request, so a reload does no harm) and sends them on.
 */
export function StartEnrolment({ pending }: { pending: PendingEnrolment }) {
  const api = useEnrolmentApi()
  const queryClient = useQueryClient()
  const start = useQuery({
    queryKey: ['enrolment', 'start', pending.subjectId, pending.role],
    queryFn: () => api.startEnrolment(pending.subjectId, pending.role),
    retry: false,
    gcTime: 0,
  })

  const started = start.isSuccess
  useEffect(() => {
    if (!started) return
    clearPendingEnrolment()
    void queryClient.invalidateQueries({ queryKey: ['enrolment', 'mine'] })
  }, [started, queryClient])

  if (start.isSuccess) return <Navigate to={ENROLMENT_PATH} replace />

  if (start.isError) {
    return (
      <main className="screen">
        <div className="screen__card">
          <h1>Prijava za časove</h1>
          <p role="alert">{explainError(start.error, 'startEnrolment')}</p>
          <div className="actions">
            <button type="button" className="button" onClick={() => void start.refetch()}>
              Pokušaj ponovo
            </button>
            <Link className="button button--secondary" to="/" onClick={clearPendingEnrolment}>
              Na početnu
            </Link>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="screen">
      <div className="screen__card">
        <Loading />
      </div>
    </main>
  )
}
