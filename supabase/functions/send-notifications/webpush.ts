// Sends a push message. The `web-push` library only builds the request (it encrypts the message for the device and signs the
// VAPID header); this module makes the call itself, so the network, the time limit and the answers are ours to handle
// and to test. Neither the library nor `fetch` is imported here: both are handed in.
import type { PushMessage, PushResult, PushSender, PushSubscription } from './types.ts'

export interface VapidDetails {
  /** A `mailto:` or https address of whoever runs the service; push services may write to it about misuse. */
  subject: string
  publicKey: string
  privateKey: string
}

export interface RequestDetails {
  endpoint: string
  method: string
  headers: Record<string, string>
  body: BodyInit | null
}

/** The part of the `web-push` package that is used. */
export interface WebPushLibrary {
  generateRequestDetails(
    subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
    payload: string,
    options: {
      vapidDetails: VapidDetails
      TTL: number
      urgency: 'normal' | 'high'
    },
  ): RequestDetails
}

const TIMEOUT_MS = 8000

/** Bytes in a base64url string, or -1 when it is not one. */
function byteLength(value: string): number {
  if (!/^[A-Za-z0-9_-]+={0,2}$/.test(value)) return -1
  const unpadded = value.replace(/=+$/, '')
  return Math.floor((unpadded.length * 3) / 4)
}

/** A browser's subscription has a 65-byte public key and a 16-byte secret; anything else cannot be sent to, ever. */
function hasUsableKeys(subscription: PushSubscription): boolean {
  return byteLength(subscription.p256dh) === 65 && byteLength(subscription.auth) === 16
}

export function createPushSender(
  library: WebPushLibrary,
  vapid: VapidDetails | null,
  fetchFn: typeof fetch,
): PushSender {
  return {
    async send(subscription: PushSubscription, message: PushMessage): Promise<PushResult> {
      if (!vapid) return { kind: 'failed', error: 'VAPID ključevi nisu podešeni' }
      // checked here, so that a library error below can only mean our own setup (a wrong key) and never costs a device
      if (!hasUsableKeys(subscription)) return { kind: 'gone' }

      let request: RequestDetails
      try {
        request = library.generateRequestDetails(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          JSON.stringify({
            title: message.title,
            body: message.body,
            url: message.url,
            ...(message.tag ? { tag: message.tag } : {}),
          }),
          { vapidDetails: vapid, TTL: message.ttl, urgency: message.urgency },
        )
      } catch (error) {
        return {
          kind: 'failed',
          error: `Poruka nije mogla da se pripremi: ${(error as Error).message}`,
        }
      }

      let response: Response
      try {
        response = await fetchFn(request.endpoint, {
          method: request.method,
          headers: request.headers,
          body: request.body,
          signal: AbortSignal.timeout(TIMEOUT_MS),
        })
      } catch (error) {
        return {
          kind: 'failed',
          error: `Push servis nije dostupan: ${(error as Error).message}`,
        }
      }

      if (response.status >= 200 && response.status < 300) return { kind: 'sent' }
      if (response.status === 404 || response.status === 410) return { kind: 'gone' }
      let detail = ''
      try {
        detail = (await response.text()).slice(0, 200)
      } catch {
        // no body to quote
      }
      return {
        kind: 'failed',
        error: `Push servis je odgovorio ${response.status}${detail ? `: ${detail}` : ''}`,
      }
    },
  }
}
