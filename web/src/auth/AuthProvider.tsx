import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { AuthExpiredError, type AuthApi, type AuthSession } from './authApi'
import type { MyRoles } from './roles'

export type AuthState =
  | { status: 'loading' }
  /** `expired`: the person was signed in and the session ended without them asking for it. */
  | { status: 'signedOut'; expired: boolean }
  /** The session or the account could not be read (offline, server down). Never to be shown as "not a member". */
  | { status: 'error' }
  /** `roles` is null for a Google account the school has not approved. */
  | { status: 'ready'; email: string; roles: MyRoles | null }

export interface AuthContextValue {
  state: AuthState
  signInWithGoogle: (returnTo: string | null) => Promise<void>
  /** Only present when the API offers it (development accounts). */
  signInWithPassword?: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  retry: () => void
}

type SessionState =
  | { kind: 'reading' }
  | { kind: 'failed' }
  | { kind: 'none'; expired: boolean }
  | { kind: 'active'; session: AuthSession }

const AuthContext = createContext<AuthContextValue | null>(null)

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>')
  return value
}

export function AuthProvider({ api, children }: { api: AuthApi; children: ReactNode }) {
  const [sessionState, setSessionState] = useState<SessionState>({ kind: 'reading' })
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState<{
    key: string
    roles: MyRoles | null
    failed: boolean
  } | null>(null)
  // Tells a sign-out the person asked for apart from one that just happened to them.
  const signOutKind = useRef<'user' | 'expired' | null>(null)

  useEffect(() => {
    let cancelled = false
    const settle = (next: SessionState) => {
      if (!cancelled) setSessionState((prev) => (prev.kind === 'reading' ? next : prev))
    }
    api.getSession().then(
      (session) => settle(session ? { kind: 'active', session } : { kind: 'none', expired: false }),
      () => settle({ kind: 'failed' }),
    )

    const unsubscribe = api.subscribe((event) => {
      if (event.type === 'signedOut') {
        const expired = signOutKind.current !== 'user'
        signOutKind.current = null
        // Only a person who was signed in can have their session expire.
        setSessionState((prev) => (prev.kind === 'active' ? { kind: 'none', expired } : prev))
      } else {
        const { session } = event
        setSessionState((prev) =>
          prev.kind === 'active' && prev.session.userId === session.userId
            ? prev
            : { kind: 'active', session },
        )
      }
    })
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [api, attempt])

  const session = sessionState.kind === 'active' ? sessionState.session : null
  const requestKey = session ? `${session.userId}#${attempt}` : null

  useEffect(() => {
    if (!requestKey) return
    let cancelled = false
    api.loadRoles().then(
      (roles) => {
        if (!cancelled) setResult({ key: requestKey, roles, failed: false })
      },
      (error: unknown) => {
        if (cancelled) return
        if (error instanceof AuthExpiredError) {
          signOutKind.current = 'expired'
          setSessionState({ kind: 'none', expired: true })
          // Drop the dead session from this device so the next page load does not trust it again.
          api.signOut().catch(() => {})
        } else {
          setResult({ key: requestKey, roles: null, failed: true })
        }
      },
    )
    return () => {
      cancelled = true
    }
  }, [api, requestKey])

  const signOut = useCallback(async () => {
    signOutKind.current = 'user'
    try {
      await api.signOut()
    } finally {
      signOutKind.current = null
      setSessionState({ kind: 'none', expired: false })
    }
  }, [api])

  const retry = useCallback(() => {
    setSessionState((prev) => (prev.kind === 'failed' ? { kind: 'reading' } : prev))
    setAttempt((n) => n + 1)
  }, [])

  const state = useMemo<AuthState>(() => {
    switch (sessionState.kind) {
      case 'reading':
        return { status: 'loading' }
      case 'failed':
        return { status: 'error' }
      case 'none':
        return { status: 'signedOut', expired: sessionState.expired }
      case 'active':
        if (result?.key !== requestKey) return { status: 'loading' }
        if (result.failed) return { status: 'error' }
        return { status: 'ready', email: sessionState.session.email, roles: result.roles }
    }
  }, [sessionState, result, requestKey])

  const value = useMemo<AuthContextValue>(
    () => ({
      state,
      signInWithGoogle: (returnTo) => api.signInWithGoogle(returnTo),
      signInWithPassword: api.signInWithPassword?.bind(api),
      signOut,
      retry,
    }),
    [api, state, signOut, retry],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
