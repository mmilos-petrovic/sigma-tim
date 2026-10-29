import { Link } from 'react-router'
import { homePath } from '../../auth/roles'
import { Loading, LoadError, PageHeader } from '../../components/Loaded'
import { useLocations, useSubjects, useTakeovers, useTeachers } from '../queries'

const BASE = homePath('admin')

/** The setup checklist: how much of the school exists so far, with a link to each part. */
export function OverviewPage() {
  const subjects = useSubjects()
  const locations = useLocations()
  const teachers = useTeachers()
  const takeovers = useTakeovers()
  const queries = [subjects, locations, teachers, takeovers]

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
  if (!subjects.data || !locations.data || !teachers.data || !takeovers.data) {
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
      to: 'zahtevi',
      title: 'Zahtevi za preuzimanje',
      count: takeovers.data.length,
      empty: 'Nema zahteva na čekanju',
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
    </>
  )
}
