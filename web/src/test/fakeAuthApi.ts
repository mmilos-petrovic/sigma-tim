import { vi } from 'vitest'
import type { AuthApi, AuthEvent, AuthSession } from '../auth/authApi'
import type { MyRoles } from '../auth/roles'

export interface FakeAuthApi extends AuthApi {
  /** What the next `loadRoles()` does. Change it between calls to simulate recovery. */
  roles: MyRoles | null
  rolesError: unknown
  /** When set, `loadRoles()` waits for it (to look at the loading state). */
  rolesGate: Promise<void> | null
  sessionError: unknown
  session: AuthSession | null
  /** Pushes an auth event to the subscribed provider, the way the Supabase client does. */
  emit: (event: AuthEvent) => void
  loadRoles: ReturnType<typeof vi.fn<() => Promise<MyRoles | null>>>
  signInWithGoogle: ReturnType<typeof vi.fn<(returnTo: string | null) => Promise<void>>>
  signInWithPassword: ReturnType<typeof vi.fn<(email: string, password: string) => Promise<void>>>
  signOut: ReturnType<typeof vi.fn<() => Promise<void>>>
}

export function sessionFor(roles: MyRoles): AuthSession {
  return { userId: `user-of-${roles.profileId}`, email: roles.email }
}

/** A signed-in account whose profile is `roles` (null = a Google account the school has not approved). */
export function createFakeAuthApi(
  initial: { roles?: MyRoles | null; session?: AuthSession | null } = {},
): FakeAuthApi {
  const listeners = new Set<(event: AuthEvent) => void>()
  const roles = initial.roles ?? null
  const session =
    initial.session === undefined
      ? initial.roles
        ? sessionFor(initial.roles)
        : null
      : initial.session

  const api: FakeAuthApi = {
    roles,
    rolesError: null,
    rolesGate: null,
    sessionError: null,
    session,
    emit: (event) => listeners.forEach((listener) => listener(event)),
    getSession: async () => {
      if (api.sessionError) throw api.sessionError
      return api.session
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    loadRoles: vi.fn(async () => {
      if (api.rolesGate) await api.rolesGate
      if (api.rolesError) throw api.rolesError
      return api.roles
    }),
    signInWithGoogle: vi.fn(async () => {}),
    signInWithPassword: vi.fn(async () => {}),
    signOut: vi.fn(async () => {
      api.session = null
      api.emit({ type: 'signedOut' })
    }),
  }
  return api
}
