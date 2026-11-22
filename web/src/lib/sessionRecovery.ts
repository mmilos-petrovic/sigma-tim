/**
 * What happens when the server refuses the sign-in of somebody who is signed in (401): a laptop that slept longer than the
 * hour a token lives, a tab that woke up, an account whose session was ended. The request is sent again once with a fresh
 * token, so the person never sees it. When no fresh token can be had the session is over: the person is signed out on this
 * device, and the app takes them to the sign-in page and brings them back to the page they were on (`RequireMember`).
 *
 * Only requests to our own project are looked at, and not those of the sign-in itself (`/auth/`): they answer 401 for their
 * own reasons. A request that was sent with the public key, by nobody signed in, is not a session that ended.
 */

export interface RecoveryOptions {
  /** The address of the project, e.g. `https://abc.supabase.co`. */
  apiUrl: string
  /** The public key, which is what a request carries when nobody is signed in. */
  anonKey: string
  /**
   * A token that is good now, or null when there is none. `stale` is the token the server just refused: another request
   * may have got a new one already, and then there is nothing to refresh.
   */
  freshToken: (stale: string) => Promise<string | null>
  /** The session is over: forget it on this device. */
  giveUp: () => Promise<void> | void
}

type Fetch = typeof fetch

function urlOf(input: Parameters<Fetch>[0]): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.href
  return input.url
}

export function withSessionRecovery(base: Fetch, options: RecoveryOptions): Fetch {
  const apiUrl = options.apiUrl.replace(/\/+$/, '')
  // requests refused at the same moment share one answer to "is there a fresh token"
  let pending: Promise<string | null> | null = null
  const fresh = (stale: string) => {
    pending ??= options.freshToken(stale).finally(() => {
      pending = null
    })
    return pending
  }

  return async (input, init) => {
    // a request that is a `Request` is used up by sending it, so the copy for a second try is made first
    const again = input instanceof Request ? input.clone() : input
    const response = await base(input, init)
    if (response.status !== 401) return response

    const url = urlOf(input)
    if (!url.startsWith(`${apiUrl}/`) || url.startsWith(`${apiUrl}/auth/`)) return response

    const headers = new Headers(
      init?.headers ?? (input instanceof Request ? input.headers : undefined),
    )
    const stale = headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? ''
    if (!stale || stale === options.anonKey) return response

    let token: string | null
    try {
      token = await fresh(stale)
    } catch {
      // a refresh that cannot be made (offline) is no news about the session: the person sees the failure of the request
      return response
    }
    if (!token) {
      await options.giveUp()
      return response
    }

    headers.set('Authorization', `Bearer ${token}`)
    const retried = await base(again, { ...init, headers })
    if (retried.status === 401) await options.giveUp()
    return retried
  }
}
