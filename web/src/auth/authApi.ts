import type { MyRoles } from './roles'

export interface AuthSession {
  userId: string
  email: string
}

export type AuthEvent = { type: 'signedIn'; session: AuthSession } | { type: 'signedOut' }

/** The server no longer accepts the session (expired, revoked). Not the same as being offline. */
export class AuthExpiredError extends Error {
  constructor() {
    super('The session is no longer valid')
    this.name = 'AuthExpiredError'
  }
}

/**
 * What the app needs from authentication. The Supabase implementation is `supabaseAuthApi.ts`;
 * tests use a fake, so the sign-in flow can be exercised without Google or a network.
 */
export interface AuthApi {
  getSession(): Promise<AuthSession | null>
  /** Tells about sign-ins and sign-outs, including ones that happen in another tab. Returns the unsubscribe. */
  subscribe(listener: (event: AuthEvent) => void): () => void
  /** The account's profile and roles; null for a Google account the school has not approved. */
  loadRoles(): Promise<MyRoles | null>
  /** Leaves for Google. `returnTo` is the page to come back to afterwards. */
  signInWithGoogle(returnTo: string | null): Promise<void>
  /** Development accounts only (see `dev/DevLogin.tsx`); the production build never offers it. */
  signInWithPassword?(email: string, password: string): Promise<void>
  /** Signs out on this device only. */
  signOut(): Promise<void>
}
