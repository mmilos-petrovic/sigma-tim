import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.types'
import { withSessionRecovery } from './sessionRecovery'

/**
 * The Supabase client, or null when the build has no Supabase settings
 * (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`; see `.env.example`).
 * The publishable key is meant for browsers: what a signed-in person can reach is decided by RLS in the database.
 *
 * A request the server refuses for the sign-in of a signed-in person is sent again with a fresh token; when there is none,
 * the person is signed out on this device (see `sessionRecovery.ts`).
 */
export function createAppClient(): SupabaseClient<Database> | null {
  const url = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) return null

  // the client is made with a fetch that uses the client, so it exists by the time a request is refused
  const clientRef: { current: SupabaseClient<Database> | null } = { current: null }
  const recovering = withSessionRecovery((input, init) => fetch(input, init), {
    apiUrl: url,
    anonKey: key,
    freshToken: async (stale) => {
      const auth = clientRef.current!.auth
      // another request may have got a new token already (reading the session renews one that has run out)
      const { data } = await auth.getSession()
      if (data.session && data.session.access_token !== stale) return data.session.access_token
      const refreshed = await auth.refreshSession()
      return refreshed.data.session?.access_token ?? null
    },
    giveUp: async () => {
      await clientRef.current!.auth.signOut({ scope: 'local' })
    },
  })

  clientRef.current = createClient<Database>(url, key, {
    auth: { flowType: 'pkce' },
    global: { fetch: recovering },
  })
  return clientRef.current
}
