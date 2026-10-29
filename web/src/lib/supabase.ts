import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

/**
 * The Supabase client, or null when the build has no Supabase settings
 * (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`; see `.env.example`).
 * The publishable key is meant for browsers: what a signed-in person can reach is decided by RLS in the database.
 */
export function createAppClient(): SupabaseClient<Database> | null {
  const url = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) return null
  return createClient<Database>(url, key, { auth: { flowType: 'pkce' } })
}
