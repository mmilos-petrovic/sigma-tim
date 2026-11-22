import { useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import { destinationFor } from '../auth/destination'
import { peekReturnTo, sanitizeReturnTo } from '../auth/returnTo'
import { contextsOf } from '../auth/roles'
import { SCHOOL_CITY, SCHOOL_NAME, SCHOOL_PHONE, SCHOOL_STREET, SCHOOL_TITLE } from '../lib/school'
import { PhoneLink } from './PhoneLink'

const [STREET_NAME, ...STREET_REST] = SCHOOL_STREET.split(' ')

/**
 * The frame of the pages everybody may open: the logo, where the school is, the way to call it and the way in, then the
 * page, then the footer with the privacy policy. Signing in starts here: the button goes straight to Google and Google
 * sends the person back to the front page (see `LandingPage`).
 */
export function SiteLayout({ children }: { children: ReactNode }) {
  const { state, signInWithGoogle, signOut } = useAuth()
  const location = useLocation()
  const [starting, setStarting] = useState(false)
  const [failed, setFailed] = useState(false)

  // A page that needed a sign-in (also after an expired session) sends the person here with the page to come back to.
  const from = sanitizeReturnTo((location.state as { from?: string } | null)?.from)

  const start = async () => {
    setFailed(false)
    setStarting(true)
    try {
      await signInWithGoogle(from ?? peekReturnTo())
    } catch {
      setFailed(true)
    } finally {
      setStarting(false)
    }
  }

  let action
  if (state.status === 'ready' && contextsOf(state.roles).length > 0) {
    action = (
      <Link className="pub-btn pub-btn--primary" to={destinationFor(state.roles, null)}>
        Aplikacija
      </Link>
    )
  } else if (state.status === 'ready') {
    // signed in, but not a member of the school (somebody who signed up): the way in is the way out
    action = (
      <button type="button" className="pub-btn pub-btn--outline" onClick={() => void signOut()}>
        Odjavi se
      </button>
    )
  } else {
    // While it is not known who is here the button is there but not seen, so the header does not change when it is known.
    const unknown = state.status === 'loading'
    action = (
      <button
        type="button"
        className={`pub-btn pub-btn--primary pub-btn--login${unknown ? ' pub-btn--hidden' : ''}`}
        onClick={() => void start()}
        disabled={starting}
        aria-hidden={unknown || undefined}
        tabIndex={unknown ? -1 : undefined}
      >
        <svg className="pub-icon pub-login-icon" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21a8 8 0 0 1 16 0" />
        </svg>
        <span className="pub-btn__label--login">Prijava</span>
      </button>
    )
  }

  return (
    <div className="pub">
      <a className="pub-skip-link" href="#sadrzaj">
        Preskoči na sadržaj
      </a>

      <header className="pub-header">
        <div className="pub-container pub-header__row">
          <Link className="pub-logo" to="/" aria-label={`${SCHOOL_TITLE} – početak strane`}>
            <img src="/img/logo.webp" width="600" height="289" alt={SCHOOL_NAME} />
          </Link>
          <ul className="pub-header__info" aria-label="Lokacija">
            <li className="pub-info">
              <svg className="pub-info__icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 21s7-6.2 7-11a7 7 0 0 0-14 0c0 4.8 7 11 7 11Z" />
                <circle cx="12" cy="10" r="2.5" />
              </svg>
              <span className="pub-info__text">
                <strong>
                  <span className="pub-street__name">{STREET_NAME}</span>{' '}
                  <span className="pub-street__no">{STREET_REST.join(' ')}</span>
                </strong>
                <span className="pub-info__city">{SCHOOL_CITY}</span>
              </span>
            </li>
          </ul>
          <nav className="pub-header__actions" aria-label="Glavne radnje">
            <a className="pub-btn pub-btn--call" href={`tel:${SCHOOL_PHONE}`}>
              <svg className="pub-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M5 4h3l2 5-2.5 1.5a11 11 0 0 0 6 6L15 14l5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z" />
              </svg>
              <span className="pub-btn__label">Pozovi odmah</span>
            </a>
            {action}
          </nav>
        </div>
      </header>
      {failed && (
        <p role="alert" className="pub-banner">
          Prijava nije uspela. Pokušajte ponovo.
        </p>
      )}

      <div className="pub-content" id="sadrzaj">
        {children}
      </div>

      <footer className="pub-footer">
        <div className="pub-container pub-footer__row">
          <p>
            © {SCHOOL_TITLE} · {SCHOOL_STREET} · <PhoneLink phone={SCHOOL_PHONE} />
          </p>
          <Link to="/politika-privatnosti">Politika privatnosti</Link>
        </div>
      </footer>
    </div>
  )
}
