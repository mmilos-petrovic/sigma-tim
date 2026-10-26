import { Link } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import { destinationFor } from '../auth/destination'
import { contextsOf, LOGIN_PATH } from '../auth/roles'

/** Placeholder front page; the public page with the teachers' CVs comes in a later phase. */
export function LandingPage() {
  const { state } = useAuth()

  let action = null
  if (state.status === 'ready' && contextsOf(state.roles).length > 0) {
    action = (
      <Link className="button" to={destinationFor(state.roles, null)}>
        Otvori aplikaciju
      </Link>
    )
  } else if (state.status !== 'loading') {
    action = (
      <Link className="button" to={LOGIN_PATH}>
        Prijavi se
      </Link>
    )
  }

  return (
    <main className="screen">
      <div className="screen__card">
        <h1>Sigma Tim</h1>
        <p>Časovi za osnovce, srednjoškolce i studente</p>
        <div className="actions">{action}</div>
        <p className="muted">
          <a href="/politika-privatnosti">Politika privatnosti</a>
        </p>
      </div>
    </main>
  )
}
