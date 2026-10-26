import { Navigate, Outlet, useLocation, useOutletContext } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import { contextsOf, LOGIN_PATH, NOT_MEMBER_PATH, type Context, type MyRoles } from '../auth/roles'
import { ErrorScreen, LoadingScreen } from './Status'

export interface Member {
  email: string
  roles: MyRoles
  contexts: Context[]
}

/**
 * Gate for every page that needs an approved account. This only decides what the screen shows;
 * what the account can actually read is decided by RLS in the database.
 */
export function RequireMember() {
  const { state } = useAuth()
  const location = useLocation()

  if (state.status === 'loading') return <LoadingScreen />
  if (state.status === 'error') return <ErrorScreen />
  if (state.status === 'signedOut') {
    // Remember the page, so signing in (also after an expired session) brings the person back to it.
    const from = `${location.pathname}${location.search}${location.hash}`
    return <Navigate to={LOGIN_PATH} replace state={{ from }} />
  }
  const contexts = contextsOf(state.roles)
  if (!state.roles || contexts.length === 0) return <Navigate to={NOT_MEMBER_PATH} replace />

  const member: Member = { email: state.email, roles: state.roles, contexts }
  return <Outlet context={member} />
}

// eslint-disable-next-line react-refresh/only-export-components
export function useMember(): Member {
  return useOutletContext<Member>()
}
