import { Link } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import { CONTEXT_LABEL, homePath } from '../auth/roles'
import { useMember } from '../components/guards'

/** Shown to an account with several roles that has no remembered context yet. */
export function ChooserPage() {
  const { contexts } = useMember()
  const { signOut } = useAuth()

  return (
    <main className="screen">
      <div className="screen__card">
        <h1>Izaberite prikaz</h1>
        <p>Imate više uloga u školi. Šta želite da otvorite?</p>
        <ul className="choices">
          {contexts.map((context) => (
            <li key={context}>
              <Link className="button" to={homePath(context)}>
                {CONTEXT_LABEL[context]}
              </Link>
            </li>
          ))}
        </ul>
        <div className="actions">
          <button type="button" className="button button--secondary" onClick={() => void signOut()}>
            Odjavi se
          </button>
        </div>
      </div>
    </main>
  )
}
