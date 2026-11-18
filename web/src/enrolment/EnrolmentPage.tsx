import { Navigate, useLocation } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import { destinationFor } from '../auth/destination'
import { LOGIN_PATH } from '../auth/roles'
import { LoadError } from '../components/Loaded'
import { SiteLayout } from '../components/SiteLayout'
import { ErrorScreen, LoadingScreen } from '../components/Status'
import { usePageMeta } from '../lib/pageMeta'
import { useMyEnrolmentRequests } from './queries'
import { RequestsView } from './RequestsView'

/** Where somebody who signed up from the front page lands: their requests, the profile to fill in, the offers and the choice. */
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
        <RequestsView
          requests={requests.data}
          defaults={own}
          canStartAnother={requests.data.some((request) => request.role === 'parent')}
        />
      </main>
    </SiteLayout>
  )
}
