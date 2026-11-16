import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Navigate, useLocation } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import { destinationFor } from '../auth/destination'
import { LOGIN_PATH } from '../auth/roles'
import { LoadError } from '../components/Loaded'
import { SiteLayout } from '../components/SiteLayout'
import { ErrorScreen, LoadingScreen } from '../components/Status'
import { usePageMeta } from '../lib/pageMeta'
import type { MyEnrolmentRequest } from './enrolmentApi'
import { ProfileForm } from './ProfileForm'
import { useMyEnrolmentRequests } from './queries'

function RequestCard({
  request,
  defaults,
}: {
  request: MyEnrolmentRequest
  defaults: { firstName: string; lastName: string }
}) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const saved = () => {
    setEditing(false)
    void queryClient.invalidateQueries({ queryKey: ['enrolment', 'mine'] })
  }

  return (
    <section
      className="enrolment-request"
      aria-label={`Prijava za ${request.subjectName ?? 'časove'}`}
    >
      <h2>{request.subjectName ?? 'Časovi'}</h2>
      {request.status === 'chosen' ? (
        <p>Nastavnik je izabran.</p>
      ) : !request.profileCompleted ? (
        <>
          <p>Popuni profil da bi te videli nastavnici.</p>
          <ProfileForm request={request} defaults={defaults} onSaved={saved} />
        </>
      ) : editing ? (
        <ProfileForm request={request} defaults={defaults} onSaved={saved} />
      ) : (
        <>
          <p>Tvoj zahtev je primljen. Kada neki nastavnik ponudi časove, videćeš ga ovde.</p>
          <p className="muted">
            {request.studentFirstName} {request.studentLastName} · {request.school}, {request.grade}
          </p>
          <div className="actions">
            <button
              type="button"
              className="button button--secondary"
              onClick={() => setEditing(true)}
            >
              Izmeni profil
            </button>
          </div>
        </>
      )}
    </section>
  )
}

/** Where somebody who signed up from the front page lands: their requests, and the profile to fill in. */
export function EnrolmentPage() {
  const { state } = useAuth()
  const location = useLocation()
  const requests = useMyEnrolmentRequests(state.status === 'ready')
  usePageMeta({ title: 'Prijava za časove – Sigma Tim', noindex: true })

  if (state.status === 'loading') return <LoadingScreen />
  if (state.status === 'error') return <ErrorScreen />
  if (state.status === 'signedOut') {
    return <Navigate to={LOGIN_PATH} replace state={{ from: location.pathname }} />
  }
  if (requests.isPending) return <LoadingScreen />
  if (requests.isError) {
    return (
      <SiteLayout>
        <main className="site__main">
          <LoadError error={requests.error} onRetry={() => void requests.refetch()} />
        </main>
      </SiteLayout>
    )
  }
  // nobody signed this account up: the usual place for it
  if (requests.data.length === 0) {
    return <Navigate to={destinationFor(state.roles, null)} replace />
  }

  const own = {
    firstName: state.roles?.firstName ?? '',
    lastName: state.roles?.lastName ?? '',
  }
  return (
    <SiteLayout>
      <main className="site__main">
        <h1>Prijava za časove</h1>
        {requests.data.map((request) => (
          <RequestCard
            key={request.id}
            request={request}
            defaults={request.role === 'student' ? own : { firstName: '', lastName: '' }}
          />
        ))}
      </main>
    </SiteLayout>
  )
}
