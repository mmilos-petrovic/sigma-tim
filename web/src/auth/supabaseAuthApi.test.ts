import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import type { Database } from '../lib/database.types'
import { AuthExpiredError, type AuthEvent } from './authApi'
import { createSupabaseAuthApi } from './supabaseAuthApi'

type Client = SupabaseClient<Database>

interface RpcResult {
  data: unknown
  error: { code?: string; message: string } | null
  status: number
}

function fakeClient(rpcResult: RpcResult = { data: [], error: null, status: 200 }) {
  let authListener: ((event: string, session: unknown) => void) | undefined
  const unsubscribe = vi.fn()
  const auth = {
    getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
    onAuthStateChange: vi.fn((listener: (event: string, session: unknown) => void) => {
      authListener = listener
      return { data: { subscription: { unsubscribe } } }
    }),
    signInWithOAuth: vi.fn(async () => ({ data: {}, error: null })),
    signInWithPassword: vi.fn(async () => ({ data: {}, error: null })),
    signOut: vi.fn(async () => ({ error: null })),
  }
  const rpc = vi.fn(async () => rpcResult)
  return {
    client: { auth, rpc } as unknown as Client,
    auth,
    rpc,
    unsubscribe,
    fire: (event: string, session: unknown) => authListener?.(event, session),
  }
}

const row = {
  profile_id: 'pid',
  email: 'ana@example.test',
  first_name: 'Ana',
  last_name: 'Nikolić',
  avatar_url: 'https://example.test/a.png',
  is_admin: false,
  is_teacher: true,
  is_student: false,
  is_parent: false,
}

describe('getSession', () => {
  it('returns the signed-in account', async () => {
    const { client, auth } = fakeClient()
    auth.getSession.mockResolvedValue({
      data: { session: { user: { id: 'u1', email: 'ana@example.test' } } },
      error: null,
    } as never)
    expect(await createSupabaseAuthApi(client).getSession()).toEqual({
      userId: 'u1',
      email: 'ana@example.test',
    })
  })

  it('returns null when nobody is signed in', async () => {
    expect(await createSupabaseAuthApi(fakeClient().client).getSession()).toBeNull()
  })

  it('throws when the session cannot be read', async () => {
    const { client, auth } = fakeClient()
    auth.getSession.mockResolvedValue({
      data: { session: null },
      error: new Error('boom'),
    } as never)
    await expect(createSupabaseAuthApi(client).getSession()).rejects.toThrow('boom')
  })
})

describe('subscribe', () => {
  function collect() {
    const f = fakeClient()
    const events: AuthEvent[] = []
    const stop = createSupabaseAuthApi(f.client).subscribe((event) => events.push(event))
    return { ...f, events, stop }
  }
  const session = { user: { id: 'u1', email: 'ana@example.test' } }

  it('maps sign-in, refresh and the initial session to "signed in"', () => {
    const { events, fire } = collect()
    fire('SIGNED_IN', session)
    fire('TOKEN_REFRESHED', session)
    fire('INITIAL_SESSION', session)
    expect(events).toEqual(
      Array(3).fill({ type: 'signedIn', session: { userId: 'u1', email: 'ana@example.test' } }),
    )
  })

  it('maps sign-out, and ignores events that change nothing for the app', () => {
    const { events, fire } = collect()
    fire('INITIAL_SESSION', null)
    fire('USER_UPDATED', session)
    fire('PASSWORD_RECOVERY', session)
    expect(events).toEqual([])
    fire('SIGNED_OUT', null)
    expect(events).toEqual([{ type: 'signedOut' }])
  })

  it('unsubscribes', () => {
    const { stop, unsubscribe } = collect()
    stop()
    expect(unsubscribe).toHaveBeenCalled()
  })
})

describe('loadRoles', () => {
  it('maps the row to camelCase', async () => {
    const { client, rpc } = fakeClient({ data: [row], error: null, status: 200 })
    expect(await createSupabaseAuthApi(client).loadRoles()).toEqual({
      profileId: 'pid',
      email: 'ana@example.test',
      firstName: 'Ana',
      lastName: 'Nikolić',
      avatarUrl: 'https://example.test/a.png',
      isAdmin: false,
      isTeacher: true,
      isStudent: false,
      isParent: false,
    })
    expect(rpc).toHaveBeenCalledWith('my_roles')
  })

  it('returns null for an account without a profile', async () => {
    const { client } = fakeClient({ data: [], error: null, status: 200 })
    expect(await createSupabaseAuthApi(client).loadRoles()).toBeNull()
  })

  it('reports a rejected token as an expired session', async () => {
    for (const result of [
      { data: null, error: { message: 'JWT expired', code: 'PGRST301' }, status: 401 },
      { data: null, error: { message: 'Unauthorized' }, status: 401 },
    ]) {
      const { client } = fakeClient(result)
      await expect(createSupabaseAuthApi(client).loadRoles()).rejects.toBeInstanceOf(
        AuthExpiredError,
      )
    }
  })

  it('reports any other failure as an ordinary error', async () => {
    const { client } = fakeClient({ data: null, error: { message: 'Failed to fetch' }, status: 0 })
    const failure = createSupabaseAuthApi(client).loadRoles()
    await expect(failure).rejects.toThrow('Failed to fetch')
    await expect(failure).rejects.not.toBeInstanceOf(AuthExpiredError)
  })
})

describe('signing in and out', () => {
  it('starts Google sign-in that comes back to the sign-in page, and remembers where to go afterwards', async () => {
    const { client, auth } = fakeClient()
    await createSupabaseAuthApi(client).signInWithGoogle('/moj-raspored')
    expect(auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/prijava` },
    })
    expect(window.sessionStorage.getItem('sigma.returnTo')).toBe('/moj-raspored')
  })

  it('throws when Google sign-in cannot start', async () => {
    const { client, auth } = fakeClient()
    auth.signInWithOAuth.mockResolvedValue({
      data: {},
      error: new Error('provider disabled'),
    } as never)
    await expect(createSupabaseAuthApi(client).signInWithGoogle('/')).rejects.toThrow(
      'provider disabled',
    )
  })

  it('signs out on this device only', async () => {
    const { client, auth } = fakeClient()
    await createSupabaseAuthApi(client).signOut()
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' })
  })

  it('offers password sign-in for the development accounts', async () => {
    const { client, auth } = fakeClient()
    await createSupabaseAuthApi(client).signInWithPassword!('ucenik1@example.test', 'pw')
    expect(auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'ucenik1@example.test',
      password: 'pw',
    })
  })
})
