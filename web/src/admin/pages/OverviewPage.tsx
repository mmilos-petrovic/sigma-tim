import { Link } from 'react-router'
import { homePath } from '../../auth/roles'
import { Loading, LoadError, PageHeader } from '../../components/Loaded'
import { useAllEnrolments } from '../../enrolment/queries'
import { useLocations, useNotificationHealth, useSubjects, useTeachers } from '../queries'

const BASE = homePath('admin')

/**
 * Whether notices get through. It is a separate query, so that a failing check never hides the rest of the page; and a
 * check that did not answer is said so, never shown as zero.
 */
function Notices() {
  const health = useNotificationHealth()
  const settings = `${BASE}/podesavanja`

  return (
    <section aria-labelledby="notices-title">
      <h2 id="notices-title">Obaveštenja</h2>
      {health.isPending && <Loading />}
      {health.isError && <LoadError error={health.error} onRetry={() => void health.refetch()} />}
      {health.data && (
        <div className="cards">
          <Link className={`card${health.data.failed > 0 ? ' card--alert' : ''}`} to={settings}>
            <span className="card__title">Neuspela obaveštenja</span>
            <span className="card__count">{health.data.failed}</span>
            <span className="card__hint">
              {health.data.failed > 0
                ? 'Otvorite dnevnik i pošaljite ih ponovo'
                : 'Sva obaveštenja su stigla'}
            </span>
          </Link>
          <Link className={`card${health.data.overdue > 0 ? ' card--alert' : ''}`} to={settings}>
            <span className="card__title">Čekaju na slanje</span>
            <span className="card__count">{health.data.overdue}</span>
            <span className="card__hint">
              {health.data.overdue > 0
                ? 'Nijedan pokušaj slanja već 10 minuta: slanje ne radi'
                : 'Slanje radi'}
            </span>
          </Link>
        </div>
      )}
    </section>
  )
}

/** The setup checklist: how much of the school exists so far, with a link to each part. */
export function OverviewPage() {
  const subjects = useSubjects()
  const locations = useLocations()
  const teachers = useTeachers()
  const enrolments = useAllEnrolments()
  const queries = [subjects, locations, teachers, enrolments]

  const failed = queries.find((query) => query.isError)
  if (failed) {
    return (
      <>
        <PageHeader title="Administracija" />
        <LoadError
          error={failed.error}
          onRetry={() => queries.forEach((query) => query.isError && void query.refetch())}
        />
      </>
    )
  }
  if (!subjects.data || !locations.data || !teachers.data || !enrolments.data) {
    return (
      <>
        <PageHeader title="Administracija" />
        <Loading />
      </>
    )
  }

  const cards = [
    {
      to: 'predmeti',
      title: 'Predmeti',
      count: subjects.data.length,
      empty: 'Dodajte prvi predmet',
    },
    {
      to: 'lokacije',
      title: 'Lokacije',
      count: locations.data.length,
      empty: 'Dodajte prvu lokaciju',
    },
    {
      to: 'nastavnici',
      title: 'Nastavnici',
      count: teachers.data.filter((teacher) => teacher.isActive).length,
      empty: 'Dodajte prvog nastavnika',
    },
    {
      to: 'prijave',
      title: 'Prijave za časove',
      // what waits for the administrator: sign-ups past the daily cap
      count: enrolments.data.filter((row) => row.state === 'needs_approval').length,
      empty: 'Nema prijava koje čekaju odluku',
    },
  ]

  return (
    <>
      <PageHeader title="Administracija" />
      <p>Podesite školu redom: predmeti, lokacije sa učionicama, pa nastavnici.</p>
      <div className="cards">
        {cards.map((card) => (
          <Link key={card.to} className="card" to={`${BASE}/${card.to}`}>
            <span className="card__title">{card.title}</span>
            <span className="card__count">{card.count}</span>
            {card.count === 0 && <span className="card__hint">{card.empty}</span>}
          </Link>
        ))}
      </div>
      <Notices />
    </>
  )
}
