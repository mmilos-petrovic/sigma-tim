import { createClient } from '@supabase/supabase-js'
import { createSupabaseAuthApi } from '../auth/supabaseAuthApi'
import type { AuthApi } from '../auth/authApi'
import type { Database } from './database.types'

/**
 * The Supabase-backed auth API, or null when the build has no Supabase settings
 * (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`; see `.env.example`).
 * The publishable key is meant for browsers: what a signed-in person can reach is decided by RLS in the database.
 */
export function createAppAuthApi(): AuthApi | null {
  const url = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) return null
  const client = createClient<Database>(url, key, { auth: { flowType: 'pkce' } })
  return createSupabaseAuthApi(client)
}
