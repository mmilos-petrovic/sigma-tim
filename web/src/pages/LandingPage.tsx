import { lazy, Suspense, useEffect, useState, type MouseEvent, type ReactNode } from 'react'
import { Link, Navigate, useLocation, useSearchParams } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import { destinationFor } from '../auth/destination'
import { clearReturnTo, peekReturnTo, sanitizeReturnTo } from '../auth/returnTo'
import { contextsOf, ENROLMENT_PATH } from '../auth/roles'
import { clearSignInStarted, peekSignInStarted } from '../auth/signInReturn'
import { PhoneLink } from '../components/PhoneLink'
import { SiteLayout } from '../components/SiteLayout'
import { LoadingScreen } from '../components/Status'
import { clearPendingEnrolment, peekPendingEnrolment } from '../enrolment/pending'
import { EnrolmentForm } from '../enrolment/EnrolmentForm'
import { useEnrolmentFormInfo, useMyEnrolmentRequests } from '../enrolment/queries'
import { StartEnrolment } from '../enrolment/StartEnrolment'
import { usePageMeta } from '../lib/pageMeta'
import { LANDING_META } from '../lib/publicMeta'
import { SCHOOL_PHONE, TAGLINE } from '../lib/school'

// Only referenced behind `import.meta.env.DEV`, so the production build drops it together with its chunk.
const DevLogin = /* @__PURE__ */ lazy(() => import('../dev/DevLogin'))

const STEPS = [
  {
    title: 'Prijavi se Google nalogom',
    text: 'Nakon prijave dobijaš besplatan pristup našoj platformi.',
    icon: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </>
    ),
  },
  {
    title: 'Nastavnici ti odgovaraju',
    text: 'Nastavnici koji žele da prihvate rad sa detetom odgovoriće na tvoju prijavu. Dobićeš brojeve telefona i uvid u biografiju svakog prijavljenog nastavnika.',
    icon: (
      <path d="M5 4h3l2 5-2.5 1.5a11 11 0 0 0 6 6L15 14l5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z" />
    ),
  },
  {
    title: 'Izaberi nastavnika',
    text: 'Izaberi nastavnika koji ti najviše odgovara.',
    icon: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="m8 12.5 3 3 5-6" />
      </>
    ),
  },
]

/** Takes the person to the form and puts the cursor on the list of subjects. */
function goToForm(event: MouseEvent) {
  const form = document.getElementById('prijava')
  if (!form) return
  event.preventDefault()
  const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  form.scrollIntoView?.({ behavior: calm ? 'auto' : 'smooth', block: 'center' })
  window.setTimeout(() => document.getElementById('predmet')?.focus({ preventScroll: true }), 400)
}

/**
 * The front page, and the place Google sends the person back to. A member who has just signed in goes on into the app;
 * somebody the school does not know yet and who filled in the form has their request made (`StartEnrolment`); somebody who
 * only signed in is told the school does not know the account and can fill in the form now. Everybody else gets the form
 * for signing up, when the school takes sign-ups and somebody teaches a subject, and otherwise just the phone of the school.
 */
export function LandingPage() {
  const { state } = useAuth()
  const form = useEnrolmentFormInfo()
  const [params] = useSearchParams()
  const location = useLocation()
  const [, choose] = useState(0)
  const [cameBack, setCameBack] = useState(false)
  usePageMeta(LANDING_META)

  const member = state.status === 'ready' && contextsOf(state.roles).length > 0
  const backFromGoogle = peekSignInStarted()
  const stranger = state.status === 'ready' && !member
  const pending = stranger ? peekPendingEnrolment() : null
  // The note is used up below, this keeps that the person has come back from Google for as long as the page is open.
  if (backFromGoogle && !cameBack) setCameBack(true)
  // Somebody the school does not know who has only signed in: has their account a request from an earlier sign-up?
  const lookForRequest = stranger && cameBack && !pending
  const requests = useMyEnrolmentRequests(lookForRequest)

  // The note about the sign-in is used up as soon as it is known who came back (or that Google sent nobody back). Not
  // while the session is still being read or has not arrived yet: the person is not signed in at that moment.
  const refused = params.has('error') || params.has('error_code')
  useEffect(() => {
    if (backFromGoogle && (state.status === 'ready' || (state.status === 'signedOut' && refused))) {
      clearSignInStarted()
    }
    if (member) {
      // The saved page is used up once the person is signed in, and so is what the form chose.
      clearReturnTo()
      clearPendingEnrolment()
    }
  }, [state.status, member, backFromGoogle, refused])

  if (state.status === 'ready' && member && backFromGoogle) {
    // the page that sent the person here to sign in (see `RequireMember`), or the one saved for the trip to Google
    const from = sanitizeReturnTo((location.state as { from?: string } | null)?.from)
    return <Navigate to={destinationFor(state.roles, from ?? peekReturnTo())} replace />
  }
  // Somebody the school does not know yet comes back from Google after the form of the front page.
  if (pending) return <StartEnrolment pending={pending} />
  if (lookForRequest) {
    if (requests.isPending) return <LoadingScreen />
    // somebody who signed up from here is not a stranger: their request is the place for them
    if (requests.data && requests.data.length > 0) return <Navigate to={ENROLMENT_PATH} replace />
  }
  // the school has no request of this account: it only signed in
  const unknownAccount = lookForRequest

  const info = form.data
  const open = !!info?.enabled && info.subjects.length > 0
  const knownWho = state.status !== 'loading'
  const knownForm = !form.isPending

  const problems: ReactNode[] = []
  if (state.status === 'signedOut' && state.expired) {
    problems.push(
      <p key="expired" className="pub-notice pub-notice--problem" role="alert">
        Sesija je istekla. Prijavite se ponovo.
      </p>,
    )
  }
  if (state.status === 'signedOut' && refused) {
    problems.push(
      <p key="failed" className="pub-notice pub-notice--problem" role="alert">
        Prijava nije uspela. Pokušajte ponovo.
      </p>,
    )
  }
  if (unknownAccount && state.status === 'ready') {
    problems.push(
      <p key="unknown" className="pub-notice" role="status">
        Prijavljeni ste kao <strong>{state.email}</strong>, ali škola taj nalog još ne poznaje.{' '}
        {open ? 'Izaberite predmet da pošaljete prijavu za časove.' : 'Pozovite nas za časove.'} Ako
        ste hteli drugi nalog, odjavite se i prijavite ponovo.
      </p>,
    )
  }

  let card
  let cta = null
  if (state.status === 'ready' && member) {
    const app = destinationFor(state.roles, null)
    card = (
      <div className="pub-card pub-welcome">
        <h2 className="pub-welcome__title">
          Dobro došli nazad{state.roles?.firstName ? `, ${state.roles.firstName}` : ''}
        </h2>
        <p className="pub-welcome__text">
          Vaši časovi, raspored i obaveštenja čekaju vas u aplikaciji.
        </p>
        <Link className="pub-btn pub-btn--primary pub-welcome__button" to={app}>
          <span>Otvori aplikaciju</span>
          <svg className="pub-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </Link>
      </div>
    )
  } else if (!knownWho || !knownForm) {
    // not yet known what the card says: showing the form first would only make it jump
    card = <div className="pub-card pub-form pub-form--wait" aria-busy="true" />
  } else if (open) {
    card = <EnrolmentForm info={info} onChosen={() => choose((n) => n + 1)} />
    cta = (
      <a className="pub-btn pub-btn--accent pub-how__cta" href="#prijava" onClick={goToForm}>
        Počni prijavu
      </a>
    )
  } else {
    card = (
      <div className="pub-card pub-form pub-callbox">
        <p>
          Za časove pozovite: <PhoneLink phone={SCHOOL_PHONE} />
        </p>
      </div>
    )
  }

  return (
    <SiteLayout>
      <main className="pub-landing">
        <section className="pub-hero" id="top">
          <span className="pub-doodle pub-doodle--pi" aria-hidden="true">
            π
          </span>
          <span className="pub-doodle pub-doodle--root" aria-hidden="true">
            √x
          </span>
          <span className="pub-doodle pub-doodle--sigma" aria-hidden="true">
            Σ
          </span>

          {problems.length > 0 && <div className="pub-container pub-notices">{problems}</div>}
          <div className="pub-container pub-hero__grid">
            <div className="pub-hero__intro">
              <h1 className="pub-title">
                Sigma tim <span className="pub-accent">Kruševac</span>
              </h1>
              <p className="pub-chip">{TAGLINE}</p>
              <p className="pub-lead">
                Mi smo udruženje nastavnika koje pomaže učenicima u savladavanju redovnih školskih
                aktivnosti.
              </p>
            </div>

            {card}

            <div className="pub-hero__visual">
              <img
                className="pub-hero__photo"
                src="/img/members-1200.webp"
                srcSet="/img/members-640.webp 640w, /img/members-1200.webp 1200w"
                sizes="(min-width: 901px) 46vw, 100vw"
                width="1200"
                height="900"
                alt="Članovi Sigma tima za stolom u učionici"
                fetchPriority="high"
              />
              <div className="pub-promise">
                <span className="pub-promise__badge" aria-hidden="true">
                  Σ
                </span>
                <p>Računamo na vaš uspeh</p>
              </div>
            </div>
          </div>
        </section>

        <section className="pub-how" aria-labelledby="kako-radi">
          <svg
            className="pub-wave pub-wave--top"
            viewBox="0 0 1440 120"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <path d="M0 0h1440v40C1180 130 980 10 720 50S250 120 0 50Z" />
          </svg>
          <span className="pub-bubble pub-bubble--1" aria-hidden="true"></span>
          <span className="pub-bubble pub-bubble--2" aria-hidden="true"></span>
          <span className="pub-bubble pub-bubble--3" aria-hidden="true"></span>

          <div className="pub-container">
            <p className="pub-script">Do nastavnika u tri koraka</p>
            <h2 className="pub-how__title" id="kako-radi">
              Kako Sigma tim radi
            </h2>

            <ol className="pub-steps">
              {STEPS.map((step, index) => (
                <li key={step.title} className="pub-step">
                  <span className="pub-step__icon" aria-hidden="true">
                    <svg className="pub-icon" viewBox="0 0 24 24">
                      {step.icon}
                    </svg>
                    <span className="pub-step__num">{index + 1}</span>
                  </span>
                  <h3>{step.title}</h3>
                  <p>{step.text}</p>
                </li>
              ))}
            </ol>

            {cta ??
              (!member && knownWho && knownForm && (
                <a className="pub-btn pub-btn--accent pub-how__cta" href={`tel:${SCHOOL_PHONE}`}>
                  Pozovi odmah
                </a>
              ))}
          </div>
        </section>

        {import.meta.env.DEV && <DevSignIn />}
      </main>
    </SiteLayout>
  )
}

/** Development only: the test accounts, when the local settings have a password for them. */
function DevSignIn() {
  const devPassword: unknown = import.meta.env.VITE_DEV_LOGIN_PASSWORD
  if (typeof devPassword !== 'string' || devPassword === '') return null
  return (
    <div className="pub-container">
      <Suspense fallback={null}>
        <DevLogin password={devPassword} />
      </Suspense>
    </div>
  )
}
