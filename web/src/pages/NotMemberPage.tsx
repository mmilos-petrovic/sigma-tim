import { Navigate } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import { destinationFor } from '../auth/destination'
import { contextsOf, LOGIN_PATH } from '../auth/roles'
import { ErrorScreen, LoadingScreen } from '../components/Status'

/** A Google account the school has not approved. The email is shown, because a mistyped address is the usual cause. */
export function NotMemberPage() {
  const { state, signOut } = useAuth()

  if (state.status === 'loading') return <LoadingScreen />
  if (state.status === 'error') return <ErrorScreen />
  if (state.status === 'signedOut') return <Navigate to={LOGIN_PATH} replace />
  if (contextsOf(state.roles).length > 0)
    return <Navigate to={destinationFor(state.roles, null)} replace />

  return (
    <main className="screen">
      <div className="screen__card">
        <h1>Još niste član škole</h1>
        <p>Pozovite nastavnika da vam zakaže prvi čas.</p>
        <p>
          Prijavljeni ste kao <strong>{state.email}</strong>. Ako je nastavnik upisao drugu adresu,
          prijavite se tim nalogom.
        </p>
        <div className="actions">
          <button type="button" className="button" onClick={() => void signOut()}>
            Prijavi se drugim nalogom
          </button>
        </div>
      </div>
    </main>
  )
}
