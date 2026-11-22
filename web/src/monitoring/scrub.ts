import type { Breadcrumb, ErrorEvent } from '@sentry/browser'

/**
 * What may leave the browser in an error report, and what is not worth a report. Pure functions: the Sentry client
 * itself is loaded and set up in `index.ts`. The people of the school are mostly children and their parents, so a report
 * carries the error and the page it happened on and nothing a person typed or was called.
 */

export type Environment = 'production' | 'staging' | 'development'

const PRODUCTION_HOSTS = ['sigmatim.com', 'www.sigmatim.com']

/** Every other address (the fixed staging site, a preview of a branch) is "staging". */
export function environmentFor(hostname: string): Environment {
  if (PRODUCTION_HOSTS.includes(hostname)) return 'production'
  if (hostname === 'localhost' || hostname === '127.0.0.1') return 'development'
  return 'staging'
}

// Postgres puts the value into its message ("Key (email)=(x@y.z) already exists"), and a phone number is typed in many ways.
const EMAIL = /[^\s@()<>,;:"']+@[^\s@()<>,;:"']+\.[^\s@()<>,;:"']+/g
const PHONE = /\+\d[\d ()/-]{6,}\d/g

export function scrubText(text: string): string {
  return text.replace(EMAIL, '[email]').replace(PHONE, '[phone]')
}

/** An address without its query and hash: the sign-in answer and some filters carry codes and names there. */
export function scrubUrl(url: string): string {
  const cut = url.search(/[?#]/)
  return cut === -1 ? url : url.slice(0, cut)
}

// A lost connection or a request cancelled by leaving the page is the person's network, not a fault of the app.
// ("Failed to fetch" also matches a screen that could not be loaded after a new version was published; that case is
// handled by the app itself, by loading the page again.)
const NOISE = [
  /ResizeObserver loop/i,
  /Failed to fetch/i,
  /NetworkError/i,
  /Load failed/i,
  /Network request failed/i,
  /AbortError|The operation was aborted/i,
]

const texts = (event: ErrorEvent): string[] => [
  ...(event.message ? [event.message] : []),
  ...(event.exception?.values ?? []).map((v) => `${v.type ?? ''}: ${v.value ?? ''}`),
]

export function isNoise(event: ErrorEvent): boolean {
  return texts(event).some((text) => NOISE.some((pattern) => pattern.test(text)))
}

/** Only the browser's name is kept of the request headers: the referrer and the cookies can say who and where from. */
function cleanRequest(request: NonNullable<ErrorEvent['request']>): ErrorEvent['request'] {
  const userAgent = request.headers?.['User-Agent']
  return {
    ...(request.url ? { url: scrubUrl(request.url) } : {}),
    ...(userAgent ? { headers: { 'User-Agent': userAgent } } : {}),
  }
}

/** The same report with the personal parts taken out. */
export function cleanEvent(event: ErrorEvent): ErrorEvent {
  const cleaned: ErrorEvent = { ...event }
  delete cleaned.user
  return {
    ...cleaned,
    ...(event.message !== undefined ? { message: scrubText(event.message) } : {}),
    ...(event.transaction !== undefined ? { transaction: scrubUrl(event.transaction) } : {}),
    ...(event.exception?.values
      ? {
          exception: {
            ...event.exception,
            values: event.exception.values.map((v) =>
              v.value === undefined ? v : { ...v, value: scrubText(v.value) },
            ),
          },
        }
      : {}),
    ...(event.request ? { request: cleanRequest(event.request) } : {}),
    ...(event.breadcrumbs
      ? {
          breadcrumbs: event.breadcrumbs.flatMap((crumb) => {
            const kept = cleanBreadcrumb(crumb)
            return kept ? [kept] : []
          }),
        }
      : {}),
  }
}

/** Only moving between pages is kept (without queries): what was clicked, typed or fetched may hold a name or an address. */
export function cleanBreadcrumb(crumb: Breadcrumb): Breadcrumb | null {
  if (crumb.category !== 'navigation') return null
  const { from, to } = (crumb.data ?? {}) as { from?: unknown; to?: unknown }
  return {
    ...crumb,
    data: {
      ...(typeof from === 'string' ? { from: scrubUrl(from) } : {}),
      ...(typeof to === 'string' ? { to: scrubUrl(to) } : {}),
    },
  }
}

/** Something that identifies an error: its kind, its message and the place it was thrown from. */
function fingerprint(event: ErrorEvent): string {
  const first = event.exception?.values?.[event.exception.values.length - 1]
  const frame = first?.stacktrace?.frames?.[first.stacktrace.frames.length - 1]
  return [
    first?.type,
    first?.value ?? event.message,
    frame?.filename,
    frame?.lineno,
    frame?.colno,
  ].join('|')
}

/**
 * One bad release must not use up the monthly allowance of the free plan: the same error is reported once per page load,
 * and at most `max` different ones.
 */
export function createLimiter(max = 20): (event: ErrorEvent) => boolean {
  const seen = new Set<string>()
  return (event) => {
    if (seen.size >= max) return false
    const key = fingerprint(event)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }
}

/** What to send: the cleaned report, or null for noise and for an error already reported. */
export function prepareEvent(
  event: ErrorEvent,
  admit: (event: ErrorEvent) => boolean,
): ErrorEvent | null {
  const cleaned = cleanEvent(event)
  if (isNoise(cleaned)) return null
  return admit(cleaned) ? cleaned : null
}
