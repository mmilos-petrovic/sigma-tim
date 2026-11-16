import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import { destinationFor } from '../auth/destination'
import { contextsOf, LOGIN_PATH } from '../auth/roles'
import { SCHOOL_NAME, SCHOOL_PHONE } from '../lib/school'
import { PhoneLink } from './PhoneLink'

/** The frame of the pages everybody may open: the logo, the phone of the school and the way in, then the page, then the footer. */
export function SiteLayout({ children }: { children: ReactNode }) {
  const { state, signOut } = useAuth()

  let action = null
  if (state.status === 'ready' && contextsOf(state.roles).length > 0) {
    action = <Link to={destinationFor(state.roles, null)}>Aplikacija</Link>
  } else if (state.status === 'ready') {
    // signed in, but not a member of the school (somebody who signed up): the way in is the way out
    action = (
      <button type="button" className="site__link" onClick={() => void signOut()}>
        Odjavi se
      </button>
    )
  } else if (state.status !== 'loading') {
    action = <Link to={LOGIN_PATH}>Prijava</Link>
  }

  return (
    <div className="site">
      <header className="site__header">
        <Link to="/" className="site__logo">
          <img src="/img/logo.webp" alt={SCHOOL_NAME} width="600" height="289" />
        </Link>
        <div className="site__contact">
          <PhoneLink phone={SCHOOL_PHONE} />
          {action}
        </div>
      </header>
      {children}
      <footer className="site__footer">
        <p>
          {SCHOOL_NAME} · <PhoneLink phone={SCHOOL_PHONE} />
        </p>
        <p>
          <a href="/politika-privatnosti">Politika privatnosti</a>
        </p>
      </footer>
    </div>
  )
}
