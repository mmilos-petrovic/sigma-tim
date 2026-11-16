import { Link } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import { destinationFor } from '../auth/destination'
import { contextsOf } from '../auth/roles'
import { PhoneLink } from '../components/PhoneLink'
import { SiteLayout } from '../components/SiteLayout'
import { PublicTeachers } from '../cv/PublicTeachers'
import { EnrolmentForm } from '../enrolment/EnrolmentForm'
import { useEnrolmentFormInfo } from '../enrolment/queries'
import { usePageMeta } from '../lib/pageMeta'
import { SCHOOL_NAME, SCHOOL_PHONE, TAGLINE } from '../lib/school'

const DESCRIPTION =
  'Privatni časovi za osnovce, srednjoškolce i studente. Izaberite predmet i prijavite se, ili pozovite nastavnike škole.'

/**
 * The front page. Somebody who is already a member gets the way into the app; everybody else the form for signing up,
 * when the school takes sign-ups and somebody teaches a subject, and otherwise just the phone of the school.
 */
export function LandingPage() {
  const { state } = useAuth()
  const form = useEnrolmentFormInfo()
  usePageMeta({ title: `${SCHOOL_NAME} – ${TAGLINE}`, description: DESCRIPTION })

  const member = state.status === 'ready' && contextsOf(state.roles).length > 0
  const info = form.data
  const open = !!info?.enabled && info.subjects.length > 0

  let call = null
  if (state.status === 'loading') {
    // not yet known whether the person is a member: showing the form first would only make it jump
  } else if (member && state.status === 'ready') {
    call = (
      <div className="actions">
        <Link className="button" to={destinationFor(state.roles, null)}>
          Otvori aplikaciju
        </Link>
      </div>
    )
  } else if (open) {
    call = <EnrolmentForm info={info} />
  } else if (!form.isPending) {
    call = (
      <p className="landing__call">
        Za časove pozovite: <PhoneLink phone={SCHOOL_PHONE} />
      </p>
    )
  }

  return (
    <SiteLayout>
      <main className="site__main landing">
        <section className="landing__hero">
          <div className="landing__intro">
            <h1>{TAGLINE}</h1>
            {call}
          </div>
          <img
            className="landing__photo"
            src="/img/classroom-1200.webp"
            srcSet="/img/classroom-640.webp 640w, /img/classroom-1200.webp 1200w"
            sizes="(min-width: 900px) 50vw, 100vw"
            width="1200"
            height="803"
            alt="Učionica sa stolom za rad i tablom"
          />
        </section>

        <PublicTeachers />

        <section className="landing__section" aria-labelledby="school-title">
          <h2 id="school-title">Naša škola</h2>
          <figure className="landing__building">
            <img
              src="/img/exterior-800.webp"
              srcSet="/img/exterior-480.webp 480w, /img/exterior-800.webp 800w"
              sizes="(min-width: 640px) 320px, 60vw"
              width="800"
              height="1195"
              loading="lazy"
              alt="Zgrada u kojoj se održavaju časovi"
            />
          </figure>
        </section>
      </main>
    </SiteLayout>
  )
}
