import { lazy, Suspense, useEffect, useState } from 'react'
import { Navigate, useLocation, useSearchParams } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import { destinationFor } from '../auth/destination'
import { clearReturnTo, peekReturnTo, sanitizeReturnTo } from '../auth/returnTo'
import { ErrorScreen, LoadingScreen } from '../components/Status'

// Only referenced behind `import.meta.env.DEV`, so the production build drops it together with its chunk.
const DevLogin = /* @__PURE__ */ lazy(() => import('../dev/DevLogin'))

export function LoginPage() {
  const { state, signInWithGoogle } = useAuth()
  const location = useLocation()
  const [params] = useSearchParams()
  const [startFailed, setStartFailed] = useState(false)
  const [starting, setStarting] = useState(false)

  const from = sanitizeReturnTo((location.state as { from?: string } | null)?.from)
  const signedIn = state.status === 'ready'

  useEffect(() => {
    // The saved page is used up once the person is signed in.
    if (signedIn) clearReturnTo()
  }, [signedIn])

  if (state.status === 'loading') return <LoadingScreen />
  if (state.status === 'error') return <ErrorScreen />
  if (state.status === 'ready')
    return <Navigate to={destinationFor(state.roles, from ?? peekReturnTo())} replace />

  // Google sends the person back here with ?error=... when they refuse or something goes wrong.
  const failed = startFailed || params.has('error') || params.has('error_code')
  const devPassword: unknown = import.meta.env.VITE_DEV_LOGIN_PASSWORD

  const start = async () => {
    setStartFailed(false)
    setStarting(true)
    try {
      await signInWithGoogle(from ?? peekReturnTo())
    } catch {
      setStartFailed(true)
    } finally {
      setStarting(false)
    }
  }

  return (
    <main className="screen">
      <div className="screen__card">
        <h1>Prijava</h1>
        {state.expired && <p role="alert">Sesija je istekla. Prijavite se ponovo.</p>}
        {failed && <p role="alert">Prijava nije uspela. Pokušajte ponovo.</p>}
        <p>Prijavite se Google nalogom koji koristite u školi.</p>
        <div className="actions">
          <button type="button" className="button" onClick={() => void start()} disabled={starting}>
            Prijavi se Google nalogom
          </button>
        </div>

        {import.meta.env.DEV && typeof devPassword === 'string' && devPassword !== '' && (
          <Suspense fallback={null}>
            <DevLogin password={devPassword} />
          </Suspense>
        )}
      </div>
    </main>
  )
}
