import { createLimiter, environmentFor, prepareEvent, cleanBreadcrumb } from './scrub'

/**
 * Error reports to Sentry. Off unless the build has `VITE_SENTRY_DSN` (the address of the project, which is not a secret),
 * so a build without it, and the pages made at build time, never load or call anything. The client is loaded when the
 * browser has nothing else to do: a visitor of the front page does not wait for it.
 */

type Capture = (error: unknown, componentStack?: string | null) => void
let capture: Capture | null = null

/** Resolves when the browser is idle (or after a few seconds on a browser that cannot say so). */
function whenIdle(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(() => resolve(), { timeout: 5000 })
    } else {
      setTimeout(resolve, 2000)
    }
  })
}

export async function startMonitoring(hostname = window.location.hostname): Promise<void> {
  const dsn = import.meta.env.VITE_SENTRY_DSN
  if (!dsn) return
  const environment = environmentFor(hostname)
  // a developer sees the error in the console; reports from a laptop would only be noise
  if (environment === 'development') return

  await whenIdle()
  const Sentry = await import('./sentryClient')
  const admit = createLimiter()
  Sentry.init({
    dsn,
    environment,
    // errors only: no performance tracing, no session replay, no user, no IP address
    sendDefaultPii: false,
    denyUrls: [/^chrome-extension:\/\//i, /^moz-extension:\/\//i, /^safari-extension:\/\//i],
    beforeSend: (event) => prepareEvent(event, admit),
    beforeBreadcrumb: (crumb) => cleanBreadcrumb(crumb),
  })
  capture = (error, componentStack) =>
    Sentry.captureException(
      error,
      componentStack ? { contexts: { react: { componentStack } } } : undefined,
    )
}

/** Reports an error the app caught itself (the error screen). Does nothing while Sentry is off or not loaded yet. */
export function reportError(error: unknown, componentStack?: string | null): void {
  capture?.(error, componentStack)
}
