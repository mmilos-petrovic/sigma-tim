import { describe, expect, it, vi } from 'vitest'
import { createEmailSender } from '../../../supabase/functions/send-notifications/brevo.ts'
import type { Email } from '../../../supabase/functions/send-notifications/types.ts'

const EMAIL: Email = {
  to: { email: 'mika@example.test', name: 'Mika' },
  subject: 'Novi čas',
  text: 'Zdravo Mika',
  html: '<p>Zdravo Mika</p>',
}
const SETTINGS = {
  apiKey: 'xkeysib-secret',
  sender: { email: 'noreply@sigmatim.com', name: 'Sigma Tim' },
}

function setup(response: Response | Error) {
  const fetchFn = vi.fn(async () => {
    if (response instanceof Error) throw response
    return response
  })
  return { fetchFn, sender: createEmailSender(SETTINGS, fetchFn as unknown as typeof fetch) }
}

describe('the email sender', () => {
  it('posts the mail to Brevo with the key in a header', async () => {
    const { fetchFn, sender } = setup(new Response('{"messageId":"<1@x>"}', { status: 201 }))
    expect(await sender.send(EMAIL)).toEqual({ kind: 'sent' })

    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.brevo.com/v3/smtp/email')
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({
      accept: 'application/json',
      'content-type': 'application/json',
      'api-key': 'xkeysib-secret',
    })
    expect(JSON.parse(init.body as string)).toEqual({
      sender: { email: 'noreply@sigmatim.com', name: 'Sigma Tim' },
      to: [{ email: 'mika@example.test', name: 'Mika' }],
      subject: 'Novi čas',
      textContent: 'Zdravo Mika',
      htmlContent: '<p>Zdravo Mika</p>',
    })
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it('without a key nothing is sent', async () => {
    const fetchFn = vi.fn()
    const sender = createEmailSender(null, fetchFn as unknown as typeof fetch)
    expect(await sender.send(EMAIL)).toEqual({
      kind: 'failed',
      error: 'Brevo API ključ nije podešen',
    })
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('an address Brevo refuses is final, and says why', async () => {
    const { sender } = setup(
      new Response('{"code":"invalid_parameter","message":"valid email is required"}', {
        status: 400,
      }),
    )
    expect(await sender.send(EMAIL)).toEqual({
      kind: 'rejected',
      error: 'Brevo je odgovorio 400: valid email is required',
    })
  })

  it.each([402, 429])('%i is the limit', async (status) => {
    const { sender } = setup(new Response('{"message":"too many requests"}', { status }))
    expect(await sender.send(EMAIL)).toEqual({
      kind: 'limit',
      error: `Brevo je odgovorio ${status}: too many requests`,
    })
  })

  it.each([401, 403, 500, 502, 503])('%i is a failure to try again', async (status) => {
    const { sender } = setup(new Response('{"message":"unauthorized"}', { status }))
    const result = await sender.send(EMAIL)
    expect(result).toEqual({ kind: 'failed', error: `Brevo je odgovorio ${status}: unauthorized` })
  })

  it('quotes a plain-text answer, cut to 200 characters', async () => {
    const { sender } = setup(new Response('y'.repeat(500), { status: 404 }))
    const result = await sender.send(EMAIL)
    expect(result.kind).toBe('rejected')
    expect(result.kind !== 'sent' && result.error.length).toBe(
      'Brevo je odgovorio 404: '.length + 200,
    )
  })

  it('a Brevo that cannot be reached is a failure to try again', async () => {
    const { sender } = setup(new Error('fetch failed'))
    expect(await sender.send(EMAIL)).toEqual({
      kind: 'failed',
      error: 'Brevo nije dostupan: fetch failed',
    })
  })
})
