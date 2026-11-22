import type { Breadcrumb, ErrorEvent } from '@sentry/browser'
import { describe, expect, it, vi } from 'vitest'
import {
  cleanBreadcrumb,
  cleanEvent,
  createLimiter,
  environmentFor,
  isNoise,
  prepareEvent,
  scrubText,
  scrubUrl,
} from './scrub'

const event = (overrides: Partial<ErrorEvent> = {}): ErrorEvent => ({
  type: undefined,
  exception: {
    values: [
      {
        type: 'TypeError',
        value: 'x is undefined',
        stacktrace: { frames: [{ filename: '/assets/app.js', lineno: 10, colno: 5 }] },
      },
    ],
  },
  ...overrides,
})

const thrown = (value: string, type = 'Error'): ErrorEvent =>
  event({ exception: { values: [{ type, value }] } })

describe('environmentFor', () => {
  it('knows the school address, with and without www', () => {
    expect(environmentFor('sigmatim.com')).toBe('production')
    expect(environmentFor('www.sigmatim.com')).toBe('production')
  })

  it('knows a developer machine', () => {
    expect(environmentFor('localhost')).toBe('development')
    expect(environmentFor('127.0.0.1')).toBe('development')
  })

  it('takes every other address, the fixed staging site and the previews, for staging', () => {
    expect(environmentFor('staging.sigma-tim.pages.dev')).toBe('staging')
    expect(environmentFor('phase-8a-app.sigma-tim.pages.dev')).toBe('staging')
    expect(environmentFor('sigmatim.com.example.test')).toBe('staging')
    expect(environmentFor('notsigmatim.com')).toBe('staging')
  })
})

describe('scrubText', () => {
  it('takes out an email address, also inside what the database says', () => {
    expect(scrubText('Key (email)=(mika.mikic@example.test) already exists.')).toBe(
      'Key (email)=([email]) already exists.',
    )
    expect(scrubText('ana@x.rs and bojan.p+tag@mail.example.com')).toBe('[email] and [email]')
  })

  it('takes out a phone number, written in the ways people write it', () => {
    expect(scrubText('call +381 64 4994 235 now')).toBe('call [phone] now')
    expect(scrubText('+381644994235')).toBe('[phone]')
    expect(scrubText('tel +381 (64) 499-4235.')).toBe('tel [phone].')
  })

  it('leaves everything else alone', () => {
    const text = "Cannot read properties of undefined (reading 'map') at line 1234:56"
    expect(scrubText(text)).toBe(text)
    expect(scrubText('')).toBe('')
  })
})

describe('scrubUrl', () => {
  it('drops the query and the hash', () => {
    expect(scrubUrl('https://sigmatim.com/prijava?code=abc&state=x')).toBe(
      'https://sigmatim.com/prijava',
    )
    expect(scrubUrl('https://sigmatim.com/ucenik#access_token=abc')).toBe(
      'https://sigmatim.com/ucenik',
    )
    expect(scrubUrl('/upis?x=1#y')).toBe('/upis')
  })

  it('keeps an address that has neither', () => {
    expect(scrubUrl('https://sigmatim.com/nastavnici/ana-anic')).toBe(
      'https://sigmatim.com/nastavnici/ana-anic',
    )
  })
})

describe('isNoise', () => {
  it('is a lost connection, a cancelled request or a harmless browser message', () => {
    for (const value of [
      'Failed to fetch',
      'NetworkError when attempting to fetch resource.',
      'Load failed',
      'Network request failed',
      'The operation was aborted.',
      'ResizeObserver loop completed with undelivered notifications.',
    ]) {
      expect(isNoise(thrown(value, 'TypeError'))).toBe(true)
    }
    expect(isNoise(event({ exception: undefined, message: 'Failed to fetch' }))).toBe(true)
    expect(isNoise(thrown('cancelled', 'AbortError'))).toBe(true)
  })

  it('is not an error of the app', () => {
    expect(isNoise(event())).toBe(false)
    expect(isNoise(event({ exception: undefined, message: 'Something broke' }))).toBe(false)
    expect(isNoise(event({ exception: undefined }))).toBe(false)
  })
})

describe('cleanBreadcrumb', () => {
  const crumb = (category: string, data?: Breadcrumb['data']): Breadcrumb => ({ category, data })

  it('keeps only moving between pages', () => {
    for (const category of ['console', 'fetch', 'xhr', 'ui.click', 'ui.input']) {
      expect(cleanBreadcrumb(crumb(category, { url: '/x?name=Mika' }))).toBeNull()
    }
    expect(cleanBreadcrumb(crumb('navigation', { from: '/a', to: '/b' }))).not.toBeNull()
  })

  it('without queries and hashes', () => {
    expect(
      cleanBreadcrumb(crumb('navigation', { from: '/prijava?code=1', to: '/ucenik#token=2' })),
    ).toEqual({ category: 'navigation', data: { from: '/prijava', to: '/ucenik' } })
  })

  it('copes with a crumb that has no data or odd data', () => {
    expect(cleanBreadcrumb(crumb('navigation'))).toEqual({ category: 'navigation', data: {} })
    expect(cleanBreadcrumb(crumb('navigation', { from: 5, to: null }))).toEqual({
      category: 'navigation',
      data: {},
    })
  })
})

describe('cleanEvent', () => {
  it('forgets who it was', () => {
    const cleaned = cleanEvent(
      event({ user: { id: 'u1', email: 'a@b.rs', ip_address: '1.2.3.4' } }),
    )
    expect(cleaned).not.toHaveProperty('user')
  })

  it('takes personal data out of the message and out of every exception, and keeps the rest of it', () => {
    const cleaned = cleanEvent(
      event({
        message: 'Failed for ana@x.rs',
        exception: {
          values: [
            { type: 'Error', value: 'first for mika@x.rs' },
            { type: 'Error', value: undefined },
            {
              type: 'AdminError',
              value: 'phone +381 64 4994 235',
              stacktrace: { frames: [{ filename: 'a.js', lineno: 1, colno: 2 }] },
            },
          ],
        },
        tags: { page: 'x' },
        environment: 'production',
      }),
    )
    expect(cleaned.message).toBe('Failed for [email]')
    expect(cleaned.exception?.values?.map((v) => v.value)).toEqual([
      'first for [email]',
      undefined,
      'phone [phone]',
    ])
    expect(cleaned.exception?.values?.[2]).toMatchObject({
      type: 'AdminError',
      stacktrace: { frames: [{ filename: 'a.js', lineno: 1, colno: 2 }] },
    })
    expect(cleaned.tags).toEqual({ page: 'x' })
    expect(cleaned.environment).toBe('production')
  })

  it('keeps of the request the address without its query and the name of the browser, nothing else', () => {
    const cleaned = cleanEvent(
      event({
        request: {
          url: 'https://sigmatim.com/prijava?code=secret',
          query_string: 'code=secret',
          cookies: { sb: 'token' },
          headers: { 'User-Agent': 'Firefox', Referer: 'https://x.test/?a=b', Cookie: 'sb=token' },
        },
      }),
    )
    expect(cleaned.request).toEqual({
      url: 'https://sigmatim.com/prijava',
      headers: { 'User-Agent': 'Firefox' },
    })
  })

  it('copes with a request that has neither an address nor a browser name', () => {
    expect(cleanEvent(event({ request: { headers: { Cookie: 'x' } } })).request).toEqual({})
  })

  it('keeps only the page changes among the breadcrumbs, and the address of the transaction without its query', () => {
    const cleaned = cleanEvent(
      event({
        transaction: '/ucenik?x=1',
        breadcrumbs: [
          { category: 'console', message: 'a name' },
          { category: 'navigation', data: { to: '/ucenik?x=1' } },
        ],
      }),
    )
    expect(cleaned.breadcrumbs).toEqual([{ category: 'navigation', data: { to: '/ucenik' } }])
    expect(cleaned.transaction).toBe('/ucenik')
  })

  it('does not change the report it was given', () => {
    const original = event({ message: 'for ana@x.rs', user: { id: 'u1' } })
    const copy = structuredClone(original)
    cleanEvent(original)
    expect(original).toEqual(copy)
  })

  it('adds nothing that was not there', () => {
    expect(Object.keys(cleanEvent({ type: undefined }))).toEqual(['type'])
  })
})

describe('createLimiter', () => {
  it('lets an error through once', () => {
    const admit = createLimiter()
    expect(admit(event())).toBe(true)
    expect(admit(event())).toBe(false)
  })

  it('tells errors apart by their kind and their message', () => {
    const admit = createLimiter()
    expect(admit(thrown('x is undefined', 'TypeError'))).toBe(true)
    expect(admit(thrown('y is undefined', 'TypeError'))).toBe(true)
    expect(admit(thrown('x is undefined', 'RangeError'))).toBe(true)
  })

  it('tells errors that only differ in the place they were thrown from apart as well', () => {
    const at = (filename: string, lineno: number, colno: number) =>
      event({
        exception: {
          values: [
            {
              type: 'Error',
              value: 'same',
              stacktrace: { frames: [{ filename, lineno, colno }] },
            },
          ],
        },
      })
    const admit = createLimiter()
    expect(admit(at('a.js', 1, 1))).toBe(true)
    expect(admit(at('a.js', 1, 2))).toBe(true)
    expect(admit(at('a.js', 2, 1))).toBe(true)
    expect(admit(at('b.js', 1, 1))).toBe(true)
    expect(admit(at('a.js', 1, 1))).toBe(false)
  })

  it('goes by the last exception and the last frame of the report: what was thrown, and where', () => {
    const report = (
      exceptions: { type: string; value: string; frames: [string, number, number][] }[],
    ): ErrorEvent =>
      event({
        exception: {
          values: exceptions.map(({ type, value, frames }) => ({
            type,
            value,
            stacktrace: {
              frames: frames.map(([filename, lineno, colno]) => ({ filename, lineno, colno })),
            },
          })),
        },
      })
    const root = {
      type: 'Error',
      value: 'same',
      frames: [['x.js', 1, 1]] as [string, number, number][],
    }
    const admit = createLimiter()
    expect(admit(report([{ ...root, value: 'cause one' }, root]))).toBe(true)
    // another first exception, the same last one: the same error
    expect(admit(report([{ ...root, type: 'Other', value: 'cause two' }, root]))).toBe(false)
    // the same first exception, another last one: another error
    expect(
      admit(
        report([
          { ...root, value: 'cause one' },
          { ...root, value: 'different' },
        ]),
      ),
    ).toBe(true)

    const calls = (...frames: [string, number, number][]) => report([{ ...root, frames }])
    // another first frame, the same last one: the same error; the other way round: another error
    expect(admit(calls(['a.js', 1, 1], ['z.js', 9, 9]))).toBe(true)
    expect(admit(calls(['b.js', 2, 2], ['z.js', 9, 9]))).toBe(false)
    expect(admit(calls(['a.js', 1, 1], ['y.js', 8, 8]))).toBe(true)
  })

  it('takes the message of an event that has no exception', () => {
    const admit = createLimiter()
    expect(admit({ type: undefined, message: 'one' })).toBe(true)
    expect(admit({ type: undefined, message: 'one' })).toBe(false)
    expect(admit({ type: undefined, message: 'two' })).toBe(true)
  })

  it('stops at a number of different errors', () => {
    const admit = createLimiter(2)
    expect(admit(thrown('a'))).toBe(true)
    expect(admit(thrown('b'))).toBe(true)
    expect(admit(thrown('c'))).toBe(false)
    expect(admit(thrown('a'))).toBe(false)
  })

  it('stops at twenty by default', () => {
    const admit = createLimiter()
    const results = Array.from({ length: 22 }, (_, i) => admit(thrown(`e${i}`)))
    expect(results.filter(Boolean)).toHaveLength(20)
    expect(results.slice(20)).toEqual([false, false])
  })
})

describe('prepareEvent', () => {
  it('sends the cleaned report', () => {
    const sent = prepareEvent(event({ message: 'for ana@x.rs', user: { id: 'u' } }), () => true)
    expect(sent?.message).toBe('for [email]')
    expect(sent).not.toHaveProperty('user')
  })

  it('sends nothing for noise, and noise does not use up a place of the limiter', () => {
    const admit = vi.fn(() => true)
    expect(prepareEvent(thrown('Failed to fetch', 'TypeError'), admit)).toBeNull()
    expect(admit).not.toHaveBeenCalled()
  })

  it('sends nothing the limiter turns away', () => {
    expect(prepareEvent(event(), () => false)).toBeNull()
  })

  it('compares errors after the personal parts are out: the same error for two people is one error', () => {
    const admit = createLimiter()
    expect(prepareEvent(thrown('duplicate ana@x.rs'), admit)).not.toBeNull()
    expect(prepareEvent(thrown('duplicate mika@x.rs'), admit)).toBeNull()
  })
})
