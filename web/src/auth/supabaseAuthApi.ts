import type { Session, SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../lib/database.types'
import { AuthExpiredError, type AuthApi, type AuthSession } from './authApi'
import { LOGIN_PATH, type MyRoles } from './roles'
import { saveReturnTo } from './returnTo'

type Row = Database['public']['Functions']['my_roles']['Returns'][number]

const toSession = (session: Pick<Session, 'user'>): AuthSession => ({
  userId: session.user.id,
  email: session.user.email ?? '',
})

const toRoles = (row: Row): MyRoles => ({
  profileId: row.profile_id,
  email: row.email,
  firstName: row.first_name,
  lastName: row.last_name,
  avatarUrl: row.avatar_url,
  isAdmin: row.is_admin,
  isTeacher: row.is_teacher,
  isStudent: row.is_student,
  isParent: row.is_parent,
})

export function createSupabaseAuthApi(client: SupabaseClient<Database>): AuthApi {
  return {
    async getSession() {
      const { data, error } = await client.auth.getSession()
      if (error) throw error
      return data.session ? toSession(data.session) : null
    },

    subscribe(listener) {
      const { data } = client.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_OUT') {
          listener({ type: 'signedOut' })
        } else if (
          session &&
          (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION')
        ) {
          listener({ type: 'signedIn', session: toSession(session) })
        }
      })
      return () => data.subscription.unsubscribe()
    },

    async loadRoles() {
      const { data, error, status } = await client.rpc('my_roles')
      if (error) {
        // A token the server refuses is an expired session; anything else (offline, server down) is just a failure.
        if (status === 401 || error.code === 'PGRST301') throw new AuthExpiredError()
        throw new Error(error.message)
      }
      const row = data?.[0]
      return row ? toRoles(row) : null
    },

    async signInWithGoogle(returnTo) {
      saveReturnTo(returnTo)
      const { error } = await client.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}${LOGIN_PATH}` },
      })
      if (error) throw error
    },

    async signInWithPassword(email, password) {
      const { error } = await client.auth.signInWithPassword({ email, password })
      if (error) throw error
    },

    async signOut() {
      const { error } = await client.auth.signOut({ scope: 'local' })
      if (error) throw error
    },
  }
}
