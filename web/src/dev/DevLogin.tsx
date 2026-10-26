import { useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { devPersonas } from './personas'

/** Development only: signs in as one of the local test accounts. Loaded lazily and only when `import.meta.env.DEV`. */
export default function DevLogin({ password }: { password: string }) {
  const { signInWithPassword } = useAuth()
  const [failed, setFailed] = useState(false)
  if (!signInWithPassword) return null

  const signIn = (email: string) => {
    setFailed(false)
    signInWithPassword(email, password).catch(() => setFailed(true))
  }

  return (
    <section className="dev-login">
      <h2>Prijava test nalogom</h2>
      <p>Samo za lokalni razvoj.</p>
      <div className="dev-login__list">
        {devPersonas.map((persona) => (
          <button
            key={persona.email}
            type="button"
            className="button button--secondary"
            onClick={() => signIn(persona.email)}
          >
            {persona.label}
          </button>
        ))}
      </div>
      {failed && (
        <p role="alert">
          Prijava test nalogom nije uspela. Da li su napravljeni lokalni nalozi (npm run dev)?
        </p>
      )}
    </section>
  )
}
