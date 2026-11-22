// What happens to each notice that was taken from the outbox: push to every device, email when that is the rule, and what
// is written back (sent, failed, held back). The database has already counted the attempt and set the retry delay, so
// "failed, try again" only has to say so.
import { emailFor, pushMessage } from './messages.ts'
import type {
  Claim,
  EmailResult,
  EmailSender,
  Notice,
  Outbox,
  PushResult,
  PushSender,
  SendSettings,
  Summary,
} from './types.ts'

const CONCURRENCY = 10
const EMAIL_LIMIT_REASON = 'Dnevno ograničenje emailova'
// Waits before writing down a sent notice again, after the first try and after the second one.
const RECORD_RETRY_DELAYS_MS = [250, 1000]

export interface Services {
  push: PushSender
  email: EmailSender
  outbox: Outbox
}

type Outcome = 'push' | 'email' | 'retry' | 'held' | 'failed'

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function runPool<T>(items: T[], limit: number, work: (item: T) => Promise<void>) {
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) await work(items[next++])
  })
  await Promise.all(workers)
}

export async function processClaim(
  claim: Claim,
  services: Services,
  settings: SendSettings,
): Promise<Summary> {
  const { push, email, outbox } = services
  const sleep =
    settings.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))

  /**
   * Writes down that a notice went out. It has been sent by now, and a notice that is not written down comes back after its
   * delay and is sent again: an email cannot be taken back. A database that does not answer for a moment is the usual
   * reason, so this tries again a few times before it gives up (and then says so).
   */
  async function recordSent(id: number, channel: 'push' | 'email') {
    for (let attempt = 0; ; attempt++) {
      try {
        return await outbox.complete(id, channel)
      } catch (error) {
        if (attempt >= RECORD_RETRY_DELAYS_MS.length) {
          // the run logs it with the number and the kind of the notice
          throw new Error(
            `went out by ${channel} but could not be written down, so it will be sent again: ${errorText(error)}`,
          )
        }
        await sleep(RECORD_RETRY_DELAYS_MS[attempt])
      }
    }
  }
  const summary: Summary = {
    claimed: claim.notices.length,
    push: 0,
    email: 0,
    retry: 0,
    held: 0,
    failed: 0,
    forgotten: 0,
  }

  // Emails count against the day's budget as soon as they are started (the checks below run before any await), and are
  // given back when they do not go out. Once the provider says "limit", nothing more is tried in this run.
  let emailsUsed = claim.emails_today
  let providerLimited = false

  async function sendEmail(notice: Notice, alsoPushed: boolean): Promise<Outcome> {
    const urgent = notice.config.always_email
    const delivered = async (): Promise<Outcome> => {
      await recordSent(notice.id, 'push')
      return 'push'
    }

    if (!notice.recipient.email) {
      if (alsoPushed) return delivered()
      await outbox.fail(notice.id, 'Osoba nema email adresu', true)
      return 'failed'
    }
    if (providerLimited || (!urgent && emailsUsed >= settings.emailDailyLimit)) {
      if (alsoPushed) return delivered()
      await outbox.defer(notice.id, claim.emails_resume_at, EMAIL_LIMIT_REASON)
      return 'held'
    }

    emailsUsed++
    let result: EmailResult
    try {
      result = await email.send(emailFor(notice, claim, settings.appUrl, settings.now()))
    } catch (error) {
      result = { kind: 'failed', error: errorText(error) }
    }

    if (result.kind === 'sent') {
      await recordSent(notice.id, 'email')
      return 'email'
    }
    emailsUsed--
    if (alsoPushed) return delivered()
    if (result.kind === 'limit') {
      providerLimited = true
      await outbox.defer(notice.id, claim.emails_resume_at, EMAIL_LIMIT_REASON)
      return 'held'
    }
    if (result.kind === 'rejected') {
      await outbox.fail(notice.id, result.error, true)
      return 'failed'
    }
    await outbox.fail(notice.id, result.error, false)
    return notice.final_attempt ? 'failed' : 'retry'
  }

  async function deliver(notice: Notice): Promise<Outcome> {
    const now = settings.now()
    const p = notice.payload

    // a reminder that is only now getting its turn, after the lesson began, would be noise
    if (
      notice.kind === 'lesson_reminder' &&
      typeof p.start_at === 'string' &&
      new Date(p.start_at) <= now
    ) {
      await outbox.fail(notice.id, 'Čas je već počeo, podsetnik je zakasnio', true)
      return 'failed'
    }

    const message = pushMessage(notice, now)
    const results: PushResult[] = await Promise.all(
      notice.subscriptions.map(async (subscription): Promise<PushResult> => {
        try {
          return await push.send(subscription, message)
        } catch (error) {
          return { kind: 'failed', error: errorText(error) }
        }
      }),
    )

    const gone = notice.subscriptions.filter((_, i) => results[i].kind === 'gone').map((s) => s.id)
    if (gone.length > 0) {
      await outbox.forget(gone)
      summary.forgotten += gone.length
    }
    const delivered = results.some((r) => r.kind === 'sent')
    const failure = results.find(
      (r): r is Extract<PushResult, { kind: 'failed' }> => r.kind === 'failed',
    )

    const { always_email: alwaysEmail, email_fallback: emailFallback } = notice.config
    if (alwaysEmail) return sendEmail(notice, delivered)
    if (delivered) {
      await recordSent(notice.id, 'push')
      return 'push'
    }

    if (!emailFallback) {
      if (failure) {
        await outbox.fail(notice.id, failure.error, false)
        return notice.final_attempt ? 'failed' : 'retry'
      }
      await outbox.fail(
        notice.id,
        'Nema uređaja za obaveštenja, a email za ovu vrstu obaveštenja je isključen',
        true,
      )
      return 'failed'
    }
    // a device that could not be reached right now gets another chance; no device, or the last chance gone: email
    if (failure && !notice.final_attempt) {
      await outbox.fail(notice.id, failure.error, false)
      return 'retry'
    }
    return sendEmail(notice, false)
  }

  // the urgent ones (welcome, test) go first: if the provider's limit is reached in the middle of a run, the others wait
  const ordered = [...claim.notices].sort(
    (a, b) => Number(b.config.always_email) - Number(a.config.always_email),
  )
  await runPool(ordered, CONCURRENCY, async (notice) => {
    try {
      summary[await deliver(notice)]++
    } catch (error) {
      // the notice stays leased and comes back after its delay
      console.error(`notice ${notice.id} (${notice.kind}): ${errorText(error)}`)
      summary.failed++
    }
  })
  return summary
}
