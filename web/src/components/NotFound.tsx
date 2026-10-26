import { Link } from 'react-router'

export function NotFoundContent({ homeTo, homeLabel }: { homeTo: string; homeLabel: string }) {
  return (
    <div className="empty">
      <h1>Stranica nije pronađena</h1>
      <p>Adresa koju ste otvorili ne postoji.</p>
      <Link className="button" to={homeTo}>
        {homeLabel}
      </Link>
    </div>
  )
}
