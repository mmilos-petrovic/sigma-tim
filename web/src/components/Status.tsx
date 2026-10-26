import { useAuth } from '../auth/AuthProvider'

export function LoadingScreen() {
  return (
    <main className="screen">
      <div className="screen__card" role="status" aria-live="polite">
        <span className="spinner" aria-hidden="true" />
        <p>Učitavanje…</p>
      </div>
    </main>
  )
}

/** The account or the session could not be read. Offers a retry and a way out, and never claims the person is not a member. */
export function ErrorScreen() {
  const { retry, signOut } = useAuth()
  return (
    <main className="screen">
      <div className="screen__card" role="alert">
        <h1>Došlo je do greške</h1>
        <p>Ne možemo da učitamo vaš nalog. Proverite internet vezu i pokušajte ponovo.</p>
        <div className="actions">
          <button type="button" className="button" onClick={retry}>
            Pokušaj ponovo
          </button>
          <button type="button" className="button button--secondary" onClick={() => void signOut()}>
            Odjavi se
          </button>
        </div>
      </div>
    </main>
  )
}

export function ConfigErrorScreen() {
  return (
    <main className="screen">
      <div className="screen__card" role="alert">
        <h1>Aplikacija nije podešena</h1>
        <p>Nedostaju podešavanja za povezivanje sa bazom. Obratite se administratoru sajta.</p>
      </div>
    </main>
  )
}
