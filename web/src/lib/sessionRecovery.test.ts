import { describe, expect, it, vi } from 'vitest'
import { withSessionRecovery } from './sessionRecovery'

const API = 'https://abc.supabase.co'
const ANON = 'anon-key'
const respond = (status: number) => new Response('{}', { status })

/** A server that answers the given statuses one after the other, and the recovery set up on top of it. */
function setup(
  statuses: number[],
  options: { freshToken?: (stale: string) => Promise<string | null> } = {},
) {
  const answers = [...statuses]
  const base = vi.fn(async () => respond(answers.shift() ?? 200)) as unknown as typeof fetch
  const freshToken = vi.fn(options.freshToken ?? (async () => 'fresh-token'))
  const giveUp = vi.fn(async () => {})
  const recovering = withSessionRecovery(base, { apiUrl: API, anonKey: ANON, freshToken, giveUp })
  return { base: base as unknown as ReturnType<typeof vi.fn>, freshToken, giveUp, recovering }
}

const asUser = (token = 'stale-token') => ({
  method: 'POST',
  body: '{"p_id":1}',
  headers: { Authorization: `Bearer ${token}`, apikey: ANON },
})
const sentWith = (base: ReturnType<typeof vi.fn>, call: number) =>
  new Headers((base.mock.calls[call][1] as RequestInit).headers).get('Authorization')

describe('withSessionRecovery', () => {
  it('leaves an answer that is not a refusal alone', async () => {
    const { recovering, base, freshToken, giveUp } = setup([200])
    const response = await recovering(`${API}/rest/v1/rpc/x`, asUser())
    expect(response.status).toBe(200)
    expect(base).toHaveBeenCalledTimes(1)
    expect(freshToken).not.toHaveBeenCalled()
    expect(giveUp).not.toHaveBeenCalled()
  })

  it('sends a refused request again with a fresh token, and the person never knows', async () => {
    const { recovering, base, freshToken, giveUp } = setup([401, 200])
    const response = await recovering(`${API}/rest/v1/rpc/claim_slot`, asUser())
    expect(response.status).toBe(200)
    expect(freshToken).toHaveBeenCalledWith('stale-token')
    expect(base).toHaveBeenCalledTimes(2)
    expect(sentWith(base, 0)).toBe('Bearer stale-token')
    expect(sentWith(base, 1)).toBe('Bearer fresh-token')
    expect(giveUp).not.toHaveBeenCalled()
  })

  it('sends the same request again, with everything else as it was', async () => {
    const { recovering, base } = setup([401, 200])
    await recovering(`${API}/rest/v1/rpc/claim_slot`, asUser())
    expect(base.mock.calls[1][0]).toBe(`${API}/rest/v1/rpc/claim_slot`)
    expect(base.mock.calls[1][1]).toMatchObject({ method: 'POST', body: '{"p_id":1}' })
    expect(new Headers((base.mock.calls[1][1] as RequestInit).headers).get('apikey')).toBe(ANON)
  })

  it('gives up when the fresh token is refused too', async () => {
    const { recovering, base, giveUp } = setup([401, 401])
    const response = await recovering(`${API}/rest/v1/x`, asUser())
    expect(response.status).toBe(401)
    expect(base).toHaveBeenCalledTimes(2)
    expect(giveUp).toHaveBeenCalledTimes(1)
  })

  it('gives up at once when there is no fresh token, and does not send the request again', async () => {
    const { recovering, base, giveUp } = setup([401], { freshToken: async () => null })
    const response = await recovering(`${API}/rest/v1/x`, asUser())
    expect(response.status).toBe(401)
    expect(base).toHaveBeenCalledTimes(1)
    expect(giveUp).toHaveBeenCalledTimes(1)
  })

  it('does not call it the end of a session when a new token could not be asked for', async () => {
    const { recovering, base, giveUp } = setup([401], {
      freshToken: async () => {
        throw new TypeError('Failed to fetch')
      },
    })
    const response = await recovering(`${API}/rest/v1/x`, asUser())
    expect(response.status).toBe(401)
    expect(base).toHaveBeenCalledTimes(1)
    expect(giveUp).not.toHaveBeenCalled()
  })

  it('looks only at the requests of its own project', async () => {
    const { recovering, freshToken, giveUp } = setup([401, 401, 401])
    for (const url of [
      'https://other.example/rest/v1/x',
      'https://abc.supabase.co.evil.example/rest/v1/x',
      'https://abc.supabase.coo/rest/v1/x',
    ]) {
      expect((await recovering(url, asUser())).status).toBe(401)
    }
    expect(freshToken).not.toHaveBeenCalled()
    expect(giveUp).not.toHaveBeenCalled()
  })

  it('leaves the requests of the sign-in to answer for themselves', async () => {
    const { recovering, freshToken, giveUp } = setup([401, 401])
    expect(
      (await recovering(`${API}/auth/v1/token?grant_type=refresh_token`, asUser())).status,
    ).toBe(401)
    expect((await recovering(`${API}/auth/v1/user`, asUser())).status).toBe(401)
    expect(freshToken).not.toHaveBeenCalled()
    expect(giveUp).not.toHaveBeenCalled()
  })

  it('is no session that ended when nobody was signed in', async () => {
    const { recovering, freshToken, giveUp } = setup([401, 401, 401])
    const anonymous = { headers: { Authorization: `Bearer ${ANON}`, apikey: ANON } }
    expect((await recovering(`${API}/rest/v1/rpc/list_public_cvs`, anonymous)).status).toBe(401)
    expect(
      (await recovering(`${API}/rest/v1/rpc/list_public_cvs`, { headers: { apikey: ANON } }))
        .status,
    ).toBe(401)
    expect((await recovering(`${API}/rest/v1/rpc/list_public_cvs`)).status).toBe(401)
    expect(freshToken).not.toHaveBeenCalled()
    expect(giveUp).not.toHaveBeenCalled()
  })

  it('shares one fresh token between the requests refused at the same moment', async () => {
    let release: (token: string) => void = () => {}
    const { recovering, freshToken, base } = setup([401, 401, 200, 200], {
      freshToken: () => new Promise((resolve) => (release = resolve)),
    })
    const first = recovering(`${API}/rest/v1/a`, asUser())
    const second = recovering(`${API}/rest/v1/b`, asUser())
    await vi.waitFor(() => expect(base).toHaveBeenCalledTimes(2))
    release('shared-token')
    expect((await first).status).toBe(200)
    expect((await second).status).toBe(200)
    expect(freshToken).toHaveBeenCalledTimes(1)
    expect(sentWith(base, 2)).toBe('Bearer shared-token')
    expect(sentWith(base, 3)).toBe('Bearer shared-token')
  })

  it('asks again for the next refusal, later', async () => {
    const { recovering, freshToken } = setup([401, 200, 401, 200])
    await recovering(`${API}/rest/v1/a`, asUser())
    await recovering(`${API}/rest/v1/b`, asUser())
    expect(freshToken).toHaveBeenCalledTimes(2)
  })

  it('understands a Request, a URL and a bearer written in lower case', async () => {
    const { recovering, base, freshToken } = setup([401, 200, 401, 200])
    const request = new Request(`${API}/rest/v1/x`, {
      method: 'POST',
      body: '{}',
      headers: { Authorization: 'Bearer request-token' },
    })
    expect((await recovering(request)).status).toBe(200)
    expect(freshToken).toHaveBeenLastCalledWith('request-token')
    expect(sentWith(base, 1)).toBe('Bearer fresh-token')

    const viaUrl = await recovering(new URL(`${API}/rest/v1/y`), {
      headers: { authorization: 'bearer lower-token' },
    })
    expect(viaUrl.status).toBe(200)
    expect(freshToken).toHaveBeenLastCalledWith('lower-token')
  })

  it('can send a Request again although sending it used its body up', async () => {
    const bodies: string[] = []
    const answers = [401, 200]
    const base = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      // like the real fetch: a request whose body was read cannot be sent again
      if (input instanceof Request) bodies.push(await input.text())
      return respond(answers.shift() ?? 200)
    }) as unknown as typeof fetch
    const recovering = withSessionRecovery(base, {
      apiUrl: API,
      anonKey: ANON,
      freshToken: async () => 'fresh-token',
      giveUp: async () => {},
    })
    const request = new Request(`${API}/rest/v1/rpc/x`, {
      method: 'POST',
      body: '{"p_id":7}',
      headers: { Authorization: 'Bearer request-token' },
    })
    expect((await recovering(request)).status).toBe(200)
    expect(bodies).toEqual(['{"p_id":7}', '{"p_id":7}'])
  })

  it('works when the address of the project is written with a slash at the end', async () => {
    const base = vi.fn(async () => respond(401)) as unknown as typeof fetch
    const freshToken = vi.fn(async () => null)
    const giveUp = vi.fn(async () => {})
    const recovering = withSessionRecovery(base, {
      apiUrl: `${API}/`,
      anonKey: ANON,
      freshToken,
      giveUp,
    })
    await recovering(`${API}/rest/v1/x`, asUser())
    expect(giveUp).toHaveBeenCalledTimes(1)
  })
})
