import type { ErrorEvent } from '@sentry/browser'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./sentryClient', () => ({ init: vi.fn(), captureException: vi.fn() }))

const DSN = 'https://key@o1.ingest.de.sentry.io/2'

/** A fresh copy of the module (it remembers whether it was started) and of the mocked client. */
async function load() {
  vi.resetModules()
  const sentry = await import('./sentryClient')
  const monitoring = await import('./index')
  return { sentry: vi.mocked(sentry), ...monitoring }
}

const options = (sentry: Awaited<ReturnType<typeof load>>['sentry']) =>
  sentry.init.mock.calls[0][0] as NonNullable<Parameters<typeof sentry.init>[0]>

beforeEach(() => {
  vi.stubGlobal('requestIdleCallback', (callback: () => void) => callback())
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('startMonitoring', () => {
  it('does nothing without an address of the project', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', '')
    const { sentry, startMonitoring, reportError } = await load()
    await startMonitoring('sigmatim.com')
    expect(sentry.init).not.toHaveBeenCalled()
    reportError(new Error('x'))
    expect(sentry.captureException).not.toHaveBeenCalled()
  })

  it('takes the address of the page when it is not told one (here the test browser, a developer machine)', async () => {
    expect(window.location.hostname).toBe('localhost')
    vi.stubEnv('VITE_SENTRY_DSN', DSN)
    const { sentry, startMonitoring } = await load()
    await startMonitoring()
    expect(sentry.init).not.toHaveBeenCalled()
  })

  it('does nothing on a developer machine', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', DSN)
    const { sentry, startMonitoring } = await load()
    await startMonitoring('localhost')
    await startMonitoring('127.0.0.1')
    expect(sentry.init).not.toHaveBeenCalled()
  })

  it('starts the client for the school, with errors only', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', DSN)
    const { sentry, startMonitoring } = await load()
    await startMonitoring('sigmatim.com')
    expect(sentry.init).toHaveBeenCalledTimes(1)
    expect(options(sentry)).toMatchObject({
      dsn: DSN,
      environment: 'production',
      sendDefaultPii: false,
    })
    // no performance tracing, no session replay
    for (const key of ['tracesSampleRate', 'tracesSampler', 'replaysSessionSampleRate']) {
      expect(options(sentry)).not.toHaveProperty(key)
    }
    expect(options(sentry).denyUrls).toEqual(
      expect.arrayContaining([/^chrome-extension:\/\//i, /^moz-extension:\/\//i]),
    )
  })

  it('tells the staging site and the previews apart from the school', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', DSN)
    const { sentry, startMonitoring } = await load()
    await startMonitoring('staging.sigma-tim.pages.dev')
    expect(options(sentry).environment).toBe('staging')
  })

  it('cleans what it sends: no person, no noise, nobody twice', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', DSN)
    const { sentry, startMonitoring } = await load()
    await startMonitoring('sigmatim.com')
    const beforeSend = options(sentry).beforeSend as (event: ErrorEvent) => ErrorEvent | null
    const failure = (value: string): ErrorEvent => ({
      type: undefined,
      exception: { values: [{ type: 'Error', value }] },
      user: { id: 'u1' },
    })

    const sent = beforeSend(failure('boom for ana@x.rs'))
    expect(sent?.exception?.values?.[0].value).toBe('boom for [email]')
    expect(sent).not.toHaveProperty('user')
    expect(beforeSend(failure('boom for mika@x.rs'))).toBeNull()
    expect(beforeSend(failure('Failed to fetch'))).toBeNull()
  })

  it('keeps only the page changes as breadcrumbs', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', DSN)
    const { sentry, startMonitoring } = await load()
    await startMonitoring('sigmatim.com')
    const beforeBreadcrumb = options(sentry).beforeBreadcrumb as (crumb: {
      category?: string
      data?: Record<string, unknown>
    }) => { data?: Record<string, unknown> } | null
    expect(beforeBreadcrumb({ category: 'console' })).toBeNull()
    expect(beforeBreadcrumb({ category: 'navigation', data: { to: '/a?b=c' } })?.data).toEqual({
      to: '/a',
    })
  })

  it('waits until the browser has nothing else to do', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', DSN)
    let idle: () => void = () => {}
    vi.stubGlobal('requestIdleCallback', (callback: () => void) => {
      idle = callback
    })
    const { sentry, startMonitoring } = await load()
    const started = startMonitoring('sigmatim.com')
    await Promise.resolve()
    expect(sentry.init).not.toHaveBeenCalled()
    idle()
    await started
    expect(sentry.init).toHaveBeenCalledTimes(1)
  })

  it('asks for the idle time with a limit, so that it does start', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', DSN)
    const ask = vi.fn((callback: () => void) => callback())
    vi.stubGlobal('requestIdleCallback', ask)
    const { startMonitoring } = await load()
    await startMonitoring('sigmatim.com')
    expect(ask).toHaveBeenCalledWith(expect.any(Function), { timeout: 5000 })
  })

  it('waits two seconds in a browser that cannot tell when it is idle', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', DSN)
    vi.stubGlobal('requestIdleCallback', undefined)
    vi.useFakeTimers()
    const { sentry, startMonitoring } = await load()
    const started = startMonitoring('sigmatim.com')
    await vi.advanceTimersByTimeAsync(1999)
    expect(sentry.init).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    await started
    expect(sentry.init).toHaveBeenCalledTimes(1)
  })
})

describe('reportError', () => {
  it('does nothing before the client is there', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', DSN)
    const { sentry, reportError } = await load()
    expect(() => reportError(new Error('early'))).not.toThrow()
    expect(sentry.captureException).not.toHaveBeenCalled()
  })

  it('reports the error with the components it happened in', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', DSN)
    const { sentry, startMonitoring, reportError } = await load()
    await startMonitoring('sigmatim.com')
    const error = new Error('broken screen')
    reportError(error, '\n    at Page\n    at App')
    expect(sentry.captureException).toHaveBeenCalledWith(error, {
      contexts: { react: { componentStack: '\n    at Page\n    at App' } },
    })
  })

  it('reports an error that has no component stack', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', DSN)
    const { sentry, startMonitoring, reportError } = await load()
    await startMonitoring('sigmatim.com')
    const error = new Error('plain')
    reportError(error)
    reportError(error, null)
    expect(sentry.captureException).toHaveBeenNthCalledWith(1, error, undefined)
    expect(sentry.captureException).toHaveBeenNthCalledWith(2, error, undefined)
  })
})
