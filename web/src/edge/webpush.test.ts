import { describe, expect, it, vi } from 'vitest'
import {
  createPushSender,
  type RequestDetails,
  type VapidDetails,
  type WebPushLibrary,
} from '../../../supabase/functions/send-notifications/webpush.ts'
import type { PushMessage } from '../../../supabase/functions/send-notifications/types.ts'
import { base64url, subscription } from './fixtures.ts'

const VAPID: VapidDetails = {
  subject: 'mailto:noreply@example.test',
  publicKey: 'pub',
  privateKey: 'priv',
}
const MESSAGE: PushMessage = {
  title: 'Novi čas',
  body: 'Matematika',
  url: '/ucenik',
  tag: 'lesson-1',
  ttl: 86400,
  urgency: 'normal',
}
const REQUEST: RequestDetails = {
  endpoint: 'https://push.example/d1',
  method: 'POST',
  headers: { TTL: '86400', Authorization: 'vapid t=x, k=y' },
  body: new Uint8Array([1, 2, 3]),
}

function setup(response: Response | Error = new Response(null, { status: 201 })) {
  const library = { generateRequestDetails: vi.fn(() => REQUEST) } satisfies WebPushLibrary
  const fetchFn = vi.fn(async () => {
    if (response instanceof Error) throw response
    return response
  })
  const sender = createPushSender(library, VAPID, fetchFn as unknown as typeof fetch)
  return { library, fetchFn, sender }
}

describe('the push sender', () => {
  it('asks the library for the encrypted request and makes it', async () => {
    const { library, fetchFn, sender } = setup()
    const result = await sender.send(subscription('d1'), MESSAGE)

    expect(result).toEqual({ kind: 'sent' })
    const [subscriptionArg, payload, options] = library.generateRequestDetails.mock
      .calls[0] as unknown as [
      { endpoint: string; keys: { p256dh: string; auth: string } },
      string,
      { vapidDetails: VapidDetails; TTL: number; urgency: string },
    ]
    expect(subscriptionArg.endpoint).toBe('https://push.example/d1')
    expect(subscriptionArg.keys).toEqual({
      p256dh: subscription('d1').p256dh,
      auth: subscription('d1').auth,
    })
    // what the service worker reads: title, body, url and tag
    expect(JSON.parse(payload)).toEqual({
      title: 'Novi čas',
      body: 'Matematika',
      url: '/ucenik',
      tag: 'lesson-1',
    })
    expect(options).toEqual({ vapidDetails: VAPID, TTL: 86400, urgency: 'normal' })

    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://push.example/d1')
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual(REQUEST.headers)
    expect(init.body).toBe(REQUEST.body)
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it('leaves the tag out when there is none', async () => {
    const { library, sender } = setup()
    await sender.send(subscription('d1'), { ...MESSAGE, tag: undefined })
    const payload = (
      library.generateRequestDetails.mock.calls[0] as unknown as [unknown, string]
    )[1]
    expect(JSON.parse(payload)).toEqual({ title: 'Novi čas', body: 'Matematika', url: '/ucenik' })
  })

  it('any 2xx answer is a success', async () => {
    expect(
      await setup(new Response(null, { status: 200 })).sender.send(subscription('d1'), MESSAGE),
    ).toEqual({
      kind: 'sent',
    })
  })

  it.each([404, 410])('%i means the device is gone', async (status) => {
    const { sender } = setup(new Response('gone', { status }))
    expect(await sender.send(subscription('d1'), MESSAGE)).toEqual({ kind: 'gone' })
  })

  it.each([400, 401, 403, 413, 429, 500, 503])(
    '%i is a failure to try again, with what the service said',
    async (status) => {
      const { sender } = setup(new Response('bad vapid token', { status }))
      expect(await sender.send(subscription('d1'), MESSAGE)).toEqual({
        kind: 'failed',
        error: `Push servis je odgovorio ${status}: bad vapid token`,
      })
    },
  )

  it('quotes no more than 200 characters of the answer', async () => {
    const { sender } = setup(new Response('x'.repeat(1000), { status: 500 }))
    const result = await sender.send(subscription('d1'), MESSAGE)
    expect(result.kind === 'failed' && result.error.length).toBe(
      'Push servis je odgovorio 500: '.length + 200,
    )
  })

  it('a service that cannot be reached is a failure to try again', async () => {
    const { sender } = setup(new Error('getaddrinfo ENOTFOUND'))
    expect(await sender.send(subscription('d1'), MESSAGE)).toEqual({
      kind: 'failed',
      error: 'Push servis nije dostupan: getaddrinfo ENOTFOUND',
    })
  })

  it('without VAPID keys nothing is sent and nothing is lost', async () => {
    const library = { generateRequestDetails: vi.fn(() => REQUEST) }
    const fetchFn = vi.fn()
    const sender = createPushSender(library, null, fetchFn as unknown as typeof fetch)
    expect(await sender.send(subscription('d1'), MESSAGE)).toEqual({
      kind: 'failed',
      error: 'VAPID ključevi nisu podešeni',
    })
    expect(library.generateRequestDetails).not.toHaveBeenCalled()
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('a subscription whose keys cannot work is reported gone, without asking the library', async () => {
    const { library, fetchFn, sender } = setup()
    for (const broken of [
      { ...subscription('d1'), p256dh: 'short' },
      { ...subscription('d1'), auth: base64url(8, 0) },
      { ...subscription('d1'), p256dh: '' },
      { ...subscription('d1'), auth: 'not base64 at all!' },
    ]) {
      expect(await sender.send(broken, MESSAGE)).toEqual({ kind: 'gone' })
    }
    expect(library.generateRequestDetails).not.toHaveBeenCalled()
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('an error of the library (our own keys are wrong) is a failure, never a lost device', async () => {
    const library = {
      generateRequestDetails: vi.fn(() => {
        throw new Error('Vapid private key should be 32 bytes long when decoded.')
      }),
    }
    const fetchFn = vi.fn()
    const sender = createPushSender(library, VAPID, fetchFn as unknown as typeof fetch)
    expect(await sender.send(subscription('d1'), MESSAGE)).toEqual({
      kind: 'failed',
      error:
        'Poruka nije mogla da se pripremi: Vapid private key should be 32 bytes long when decoded.',
    })
    expect(fetchFn).not.toHaveBeenCalled()
  })
})
