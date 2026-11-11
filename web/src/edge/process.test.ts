import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { processClaim } from '../../../supabase/functions/send-notifications/process.ts'
import type {
  Email,
  EmailResult,
  Notice,
  PushMessage,
  PushResult,
  PushSubscription,
} from '../../../supabase/functions/send-notifications/types.ts'
import { claim, LESSON, notice, recipient, subscription } from './fixtures.ts'

const NOW = new Date('2026-11-12T09:00:00Z')
const RESUME = '2026-11-12T06:00:00+00:00'

interface Fakes {
  pushed: { subscription: PushSubscription; message: PushMessage }[]
  emailed: Email[]
  completed: { id: number; channel: string }[]
  failed: { id: number; error: string; giveUp: boolean }[]
  deferred: { id: number; until: string; reason: string }[]
  forgotten: string[][]
}

function setup(
  options: {
    push?: (subscription: PushSubscription) => PushResult | Promise<PushResult>
    email?: (email: Email) => EmailResult | Promise<EmailResult>
    complete?: (id: number) => void
    emailDailyLimit?: number
  } = {},
) {
  const fakes: Fakes = {
    pushed: [],
    emailed: [],
    completed: [],
    failed: [],
    deferred: [],
    forgotten: [],
  }
  const services = {
    push: {
      send: async (subscription: PushSubscription, message: PushMessage) => {
        fakes.pushed.push({ subscription, message })
        return options.push ? options.push(subscription) : ({ kind: 'sent' } as PushResult)
      },
    },
    email: {
      send: async (email: Email) => {
        fakes.emailed.push(email)
        return options.email ? options.email(email) : ({ kind: 'sent' } as EmailResult)
      },
    },
    outbox: {
      complete: async (id: number, channel: 'push' | 'email') => {
        options.complete?.(id)
        fakes.completed.push({ id, channel })
      },
      fail: async (id: number, error: string, giveUp: boolean) =>
        void fakes.failed.push({ id, error, giveUp }),
      defer: async (id: number, until: string, reason: string) =>
        void fakes.deferred.push({ id, until, reason }),
      forget: async (ids: string[]) => void fakes.forgotten.push(ids),
    },
  }
  const settings = {
    appUrl: 'https://sigmatim.com',
    emailDailyLimit: options.emailDailyLimit ?? 200,
    now: () => NOW,
  }
  return {
    fakes,
    run: (notices: Notice[], emailsToday = 0) =>
      processClaim(
        claim(notices, { emails_today: emailsToday, emails_resume_at: RESUME }),
        services,
        settings,
      ),
  }
}

const gone: PushResult = { kind: 'gone' }
const failed: PushResult = { kind: 'failed', error: 'Push servis je odgovorio 503' }
const welcome = (id: number, overrides: Partial<Notice> = {}) =>
  notice({
    id,
    kind: 'welcome',
    payload: { first_name: 'Mika' },
    config: { email_fallback: true, always_email: true },
    subscriptions: [],
    ...overrides,
  })
const reminder = (id: number, overrides: Partial<Notice> = {}) =>
  notice({
    id,
    kind: 'lesson_reminder',
    config: { email_fallback: false, always_email: false },
    ...overrides,
  })

describe('push', () => {
  it('goes to every device and is done when one takes it', async () => {
    const { fakes, run } = setup({ push: (s) => (s.id === 'd2' ? failed : { kind: 'sent' }) })
    const summary = await run([notice({ subscriptions: [subscription('d1'), subscription('d2')] })])
    expect(fakes.pushed.map((p) => p.subscription.id)).toEqual(['d1', 'd2'])
    expect(fakes.completed).toEqual([{ id: 1, channel: 'push' }])
    expect(fakes.emailed).toEqual([])
    expect(summary).toMatchObject({ claimed: 1, push: 1, email: 0, retry: 0, failed: 0 })
  })

  it('sends the message the notice calls for', async () => {
    const { fakes, run } = setup()
    await run([notice()])
    expect(fakes.pushed[0].message).toMatchObject({
      title: 'Novi čas',
      url: '/ucenik',
      tag: 'lesson-lesson-1',
    })
  })

  it('forgets the devices the push service says are gone, and still counts the others', async () => {
    const { fakes, run } = setup({ push: (s) => (s.id === 'd1' ? gone : { kind: 'sent' }) })
    const summary = await run([notice({ subscriptions: [subscription('d1'), subscription('d2')] })])
    expect(fakes.forgotten).toEqual([['d1']])
    expect(fakes.completed).toEqual([{ id: 1, channel: 'push' }])
    expect(summary.forgotten).toBe(1)
  })
})

describe('email instead of push', () => {
  it('goes out when the person has no device', async () => {
    const { fakes, run } = setup()
    const summary = await run([notice({ subscriptions: [] })])
    expect(fakes.pushed).toEqual([])
    expect(fakes.emailed).toHaveLength(1)
    expect(fakes.emailed[0]).toMatchObject({
      to: { email: 'ucenik@example.test' },
      subject: 'Novi čas',
    })
    expect(fakes.completed).toEqual([{ id: 1, channel: 'email' }])
    expect(summary).toMatchObject({ email: 1, push: 0 })
  })

  it('goes out when every device is gone (and they are forgotten)', async () => {
    const { fakes, run } = setup({ push: () => gone })
    await run([notice({ subscriptions: [subscription('d1'), subscription('d2')] })])
    expect(fakes.forgotten).toEqual([['d1', 'd2']])
    expect(fakes.completed).toEqual([{ id: 1, channel: 'email' }])
  })

  it('waits for another try when a device could not be reached, instead of mailing at once', async () => {
    const { fakes, run } = setup({ push: () => failed })
    const summary = await run([notice()])
    expect(fakes.emailed).toEqual([])
    expect(fakes.failed).toEqual([{ id: 1, error: 'Push servis je odgovorio 503', giveUp: false }])
    expect(summary).toMatchObject({ retry: 1, failed: 0 })
  })

  it('is the last resort when the last try of a push fails', async () => {
    const { fakes, run } = setup({ push: () => failed })
    await run([notice({ attempt: 5, final_attempt: true })])
    expect(fakes.completed).toEqual([{ id: 1, channel: 'email' }])
    expect(fakes.failed).toEqual([])
  })

  it('is not used for a kind that has no email (a reminder): it is given up at once when there is no device', async () => {
    const { fakes, run } = setup()
    const summary = await run([reminder(1, { subscriptions: [] })])
    expect(fakes.emailed).toEqual([])
    expect(fakes.failed).toEqual([
      {
        id: 1,
        error: 'Nema uređaja za obaveštenja, a email za ovu vrstu obaveštenja je isključen',
        giveUp: true,
      },
    ])
    expect(summary).toMatchObject({ failed: 1, retry: 0 })
  })

  it('a reminder to a device that could not be reached is tried again, and fails for good on the last try', async () => {
    const { fakes, run } = setup({ push: () => failed })
    const first = await run([reminder(1)])
    expect(first).toMatchObject({ retry: 1, failed: 0 })
    const last = await run([reminder(2, { attempt: 5, final_attempt: true })])
    expect(last).toMatchObject({ retry: 0, failed: 1 })
    expect(fakes.failed.map((f) => f.giveUp)).toEqual([false, false])
    expect(fakes.emailed).toEqual([])
  })

  it('a push that throws is a push that failed', async () => {
    const { fakes, run } = setup({
      push: () => {
        throw new Error('socket closed')
      },
    })
    const summary = await run([notice()])
    expect(fakes.failed).toEqual([{ id: 1, error: 'socket closed', giveUp: false }])
    expect(summary.retry).toBe(1)
  })
})

describe('notices that are always an email (welcome, test)', () => {
  it('a welcome is an email even to somebody with a device', async () => {
    const { fakes, run } = setup()
    await run([welcome(1, { subscriptions: [subscription('d1')] })])
    expect(fakes.pushed).toHaveLength(1)
    expect(fakes.emailed).toHaveLength(1)
    expect(fakes.completed).toEqual([{ id: 1, channel: 'email' }])
    expect(fakes.emailed[0].text).toContain('https://sigmatim.com/prijava')
  })

  it('is done by the push alone if the email cannot go out', async () => {
    const { fakes, run } = setup({
      email: () => ({ kind: 'failed', error: 'Brevo je odgovorio 503' }),
    })
    await run([welcome(1, { subscriptions: [subscription('d1')] })])
    expect(fakes.completed).toEqual([{ id: 1, channel: 'push' }])
    expect(fakes.failed).toEqual([])
  })

  it('is tried again when there is no device and the email fails', async () => {
    const { fakes, run } = setup({
      email: () => ({ kind: 'failed', error: 'Brevo je odgovorio 503' }),
    })
    const summary = await run([welcome(1)])
    expect(fakes.failed).toEqual([{ id: 1, error: 'Brevo je odgovorio 503', giveUp: false }])
    expect(summary).toMatchObject({ retry: 1 })
  })
})

describe('what the email can answer', () => {
  it('a refused address is given up at once', async () => {
    const { fakes, run } = setup({
      email: () => ({ kind: 'rejected', error: 'Brevo je odgovorio 400: invalid email' }),
    })
    const summary = await run([notice({ subscriptions: [] })])
    expect(fakes.failed).toEqual([
      { id: 1, error: 'Brevo je odgovorio 400: invalid email', giveUp: true },
    ])
    expect(summary.failed).toBe(1)
  })

  it('a failure is tried again, and is a failure on the last try', async () => {
    const { run } = setup({ email: () => ({ kind: 'failed', error: 'down' }) })
    expect(await run([notice({ id: 1, subscriptions: [] })])).toMatchObject({ retry: 1, failed: 0 })
    expect(
      await run([notice({ id: 2, subscriptions: [], attempt: 5, final_attempt: true })]),
    ).toMatchObject({ retry: 0, failed: 1 })
  })

  it('a person without an address cannot be mailed', async () => {
    const { fakes, run } = setup()
    await run([notice({ subscriptions: [], recipient: recipient({ email: '' }) })])
    expect(fakes.emailed).toEqual([])
    expect(fakes.failed).toEqual([{ id: 1, error: 'Osoba nema email adresu', giveUp: true }])
  })

  it("the provider's own limit holds the notice until tomorrow, and the rest of the run does not try", async () => {
    const { fakes, run } = setup({
      email: () => ({ kind: 'limit', error: 'Brevo je odgovorio 429' }),
    })
    // more notices than run at once, so the later ones start after the first answer came
    const many = Array.from({ length: 12 }, (_, i) => notice({ id: i + 1, subscriptions: [] }))
    const summary = await run(many)
    expect(summary.held).toBe(12)
    expect(fakes.emailed).toHaveLength(10)
    expect(fakes.deferred).toHaveLength(12)
    expect(fakes.deferred[0]).toEqual({
      id: 1,
      until: RESUME,
      reason: 'Dnevno ograničenje emailova',
    })
  })
})

describe('the daily email budget', () => {
  it("holds a notice back until tomorrow when the day's share is used", async () => {
    const { fakes, run } = setup({ emailDailyLimit: 200 })
    const summary = await run([notice({ subscriptions: [] })], 200)
    expect(fakes.emailed).toEqual([])
    expect(fakes.deferred).toEqual([
      { id: 1, until: RESUME, reason: 'Dnevno ograničenje emailova' },
    ])
    expect(summary).toMatchObject({ held: 1, email: 0 })
  })

  it('still sends under the limit', async () => {
    const { fakes, run } = setup({ emailDailyLimit: 200 })
    await run([notice({ subscriptions: [] })], 199)
    expect(fakes.emailed).toHaveLength(1)
  })

  it('does not hold a welcome or a test', async () => {
    const { fakes, run } = setup({ emailDailyLimit: 200 })
    await run([welcome(1), welcome(2, { kind: 'test', payload: {} })], 250)
    expect(fakes.emailed).toHaveLength(2)
    expect(fakes.deferred).toEqual([])
  })

  it('counts the emails of this run too', async () => {
    const { fakes, run } = setup({ emailDailyLimit: 3 })
    const four = [1, 2, 3, 4].map((id) => notice({ id, subscriptions: [] }))
    const summary = await run(four, 1)
    expect(fakes.emailed).toHaveLength(2)
    expect(summary).toMatchObject({ email: 2, held: 2 })
  })

  it('gives back the share of an email that did not go out', async () => {
    const { fakes, run } = setup({
      emailDailyLimit: 10,
      email: (email) =>
        email.to.email === 'first@example.test'
          ? { kind: 'failed', error: 'down' }
          : { kind: 'sent' },
    })
    // ten notices are worked on at once; the eleventh starts when the first is done. Had the first kept its share
    // of the day's ten, the eleventh would be held
    const notices = Array.from({ length: 11 }, (_, i) =>
      notice({
        id: i + 1,
        subscriptions: [],
        recipient: recipient({ email: i === 0 ? 'first@example.test' : `p${i}@example.test` }),
      }),
    )
    const summary = await run(notices)
    expect(summary).toMatchObject({ email: 10, retry: 1, held: 0 })
    expect(fakes.deferred).toEqual([])
  })

  it('a push that arrives needs no email, whatever the budget', async () => {
    const { fakes, run } = setup({ emailDailyLimit: 1 })
    await run([notice()], 500)
    expect(fakes.completed).toEqual([{ id: 1, channel: 'push' }])
    expect(fakes.deferred).toEqual([])
  })

  it('a device that could not be reached on the last try is mailed only if the budget allows', async () => {
    const { fakes, run } = setup({ emailDailyLimit: 10, push: () => failed })
    await run([notice({ attempt: 5, final_attempt: true })], 10)
    expect(fakes.deferred).toEqual([
      { id: 1, until: RESUME, reason: 'Dnevno ograničenje emailova' },
    ])
  })
})

describe('reminders that come too late', () => {
  it('are dropped when the lesson has begun', async () => {
    const { fakes, run } = setup()
    const late = reminder(1, { payload: { ...LESSON, start_at: '2026-11-12T08:59:00Z' } })
    const summary = await run([late])
    expect(fakes.pushed).toEqual([])
    expect(fakes.failed).toEqual([
      { id: 1, error: 'Čas je već počeo, podsetnik je zakasnio', giveUp: true },
    ])
    expect(summary.failed).toBe(1)
  })

  it('are sent right up to the start', async () => {
    const { fakes, run } = setup()
    await run([reminder(1, { payload: { ...LESSON, start_at: '2026-11-12T09:00:01Z' } })])
    expect(fakes.completed).toEqual([{ id: 1, channel: 'push' }])
  })
})

describe('a run', () => {
  let errors: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    errors = vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => errors.mockRestore())

  it('goes on when writing one result fails', async () => {
    const { fakes, run } = setup({
      complete: (id) => {
        if (id === 1) throw new Error('database is down')
      },
    })
    const summary = await run([notice({ id: 1 }), notice({ id: 2 })])
    expect(fakes.completed).toEqual([{ id: 2, channel: 'push' }])
    expect(summary).toMatchObject({ claimed: 2, push: 1, failed: 1 })
    expect(errors).toHaveBeenCalledOnce()
  })

  it('does nothing with an empty claim', async () => {
    const { fakes, run } = setup()
    expect(await run([])).toEqual({
      claimed: 0,
      push: 0,
      email: 0,
      retry: 0,
      held: 0,
      failed: 0,
      forgotten: 0,
    })
    expect(fakes.pushed).toEqual([])
  })

  it('sends the urgent ones first', async () => {
    const order: number[] = []
    const { run } = setup({
      email: () => ({ kind: 'sent' }),
      complete: (id) => void order.push(id),
    })
    // a single worker would show the order; with ten at once the completions can interleave, so look at who starts first
    const normal = Array.from({ length: 12 }, (_, i) => notice({ id: i + 1, subscriptions: [] }))
    const urgent = welcome(99)
    await run([...normal, urgent])
    expect(order.indexOf(99)).toBeLessThan(10)
  })
})
