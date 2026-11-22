import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const URL_ = 'https://abc.supabase.co'
const KEY = 'anon-key'

type Options = { auth: unknown; global: { fetch: typeof fetch } }

/** The module with a fake `createClient` that remembers how it was called and hands out a fake client. */
async function load(auth: Record<string, unknown>) {
  vi.resetModules()
  const created: { options?: Options } = {}
  vi.doMock('@supabase/supabase-js', () => ({
    createClient: (_url: string, _key: string, options: Options) => {
      created.options = options
      return { auth }
    },
  }))
  const { createAppClient } = await import('./supabase')
  return { createAppClient, created }
}

beforeEach(() => {
  vi.stubEnv('VITE_SUPABASE_URL', URL_)
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', KEY)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.doUnmock('@supabase/supabase-js')
})

describe('createAppClient', () => {
  it('is null for a build without the settings', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '')
    const { createAppClient } = await load({})
    expect(createAppClient()).toBeNull()
    vi.stubEnv('VITE_SUPABASE_URL', URL_)
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', '')
    expect(createAppClient()).toBeNull()
  })

  it('signs in with PKCE and sends its requests through the recovery', async () => {
    const { createAppClient, created } = await load({})
    expect(createAppClient()).not.toBeNull()
    expect(created.options?.auth).toEqual({ flowType: 'pkce' })
    expect(typeof created.options?.global.fetch).toBe('function')
  })

  it('sends a refused request again with the token the session has by now', async () => {
    const auth = {
      getSession: vi.fn(async () => ({ data: { session: { access_token: 'newer-token' } } })),
      refreshSession: vi.fn(),
      signOut: vi.fn(),
    }
    const { createAppClient, created } = await load(auth)
    createAppClient()
    const answers = [401, 200]
    const send = vi.fn(async () => new Response('{}', { status: answers.shift() }))
    vi.stubGlobal('fetch', send)

    const response = await created.options!.global.fetch(`${URL_}/rest/v1/rpc/x`, {
      headers: { Authorization: 'Bearer old-token' },
    })
    expect(response.status).toBe(200)
    expect(auth.refreshSession).not.toHaveBeenCalled()
    expect(auth.signOut).not.toHaveBeenCalled()
    expect(
      new Headers((send.mock.calls[1] as unknown as [string, RequestInit])[1].headers).get(
        'Authorization',
      ),
    ).toBe('Bearer newer-token')
  })

  it('refreshes the session when the token it has is the one that was refused', async () => {
    const auth = {
      getSession: vi.fn(async () => ({ data: { session: { access_token: 'old-token' } } })),
      refreshSession: vi.fn(async () => ({
        data: { session: { access_token: 'refreshed-token' } },
      })),
      signOut: vi.fn(),
    }
    const { createAppClient, created } = await load(auth)
    createAppClient()
    const answers = [401, 200]
    const send = vi.fn(async () => new Response('{}', { status: answers.shift() }))
    vi.stubGlobal('fetch', send)

    const response = await created.options!.global.fetch(`${URL_}/rest/v1/rpc/x`, {
      headers: { Authorization: 'Bearer old-token' },
    })
    expect(response.status).toBe(200)
    expect(auth.refreshSession).toHaveBeenCalledTimes(1)
    expect(
      new Headers((send.mock.calls[1] as unknown as [string, RequestInit])[1].headers).get(
        'Authorization',
      ),
    ).toBe('Bearer refreshed-token')
  })

  it('signs the person out on this device when there is no way to a fresh token', async () => {
    const auth = {
      getSession: vi.fn(async () => ({ data: { session: null } })),
      refreshSession: vi.fn(async () => ({ data: { session: null }, error: new Error('revoked') })),
      signOut: vi.fn(async () => ({ error: null })),
    }
    const { createAppClient, created } = await load(auth)
    createAppClient()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 401 })),
    )

    const response = await created.options!.global.fetch(`${URL_}/rest/v1/rpc/x`, {
      headers: { Authorization: 'Bearer old-token' },
    })
    expect(response.status).toBe(401)
    // only on this device: the other devices of the person stay signed in
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' })
  })
})
