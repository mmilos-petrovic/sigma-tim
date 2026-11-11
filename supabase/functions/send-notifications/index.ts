// Edge Function `send-notifications`: called every minute by pg_cron (see supabase/README.md, "Notifications"). It takes the
// notices that are due from the outbox, sends each by push (and email where the rules say so) and writes the result back.
// Only this file knows about Deno, the database client and the environment; the rest is plain TypeScript with its own tests.
import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'
import { createEmailSender } from './brevo.ts'
import { processClaim } from './process.ts'
import type { Claim, Outbox } from './types.ts'
import { createPushSender } from './webpush.ts'

const BATCH = 100

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

/** Compares without stopping at the first difference. */
function sameSecret(given: string, expected: string): boolean {
  const a = new TextEncoder().encode(given)
  const b = new TextEncoder().encode(expected)
  let difference = a.length ^ b.length
  for (let i = 0; i < Math.max(a.length, b.length); i++) difference |= (a[i] ?? 0) ^ (b[i] ?? 0)
  return difference === 0
}

function vapidFromEnvironment() {
  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY')
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY')
  if (!publicKey || !privateKey) return null
  const details = {
    subject: Deno.env.get('VAPID_SUBJECT') ?? 'mailto:noreply@sigmatim.com',
    publicKey,
    privateKey,
  }
  try {
    webpush.setVapidDetails(details.subject, details.publicKey, details.privateKey)
  } catch (error) {
    console.error(`the VAPID keys are not usable: ${(error as Error).message}`)
    return null
  }
  return details
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  const secret = Deno.env.get('CRON_SECRET')
  if (!secret) return json({ error: 'CRON_SECRET is not set' }, 500)
  if (!sameSecret(request.headers.get('x-cron-secret') ?? '', secret))
    return json({ error: 'unauthorized' }, 401)

  const appUrl = Deno.env.get('APP_URL')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!appUrl || !supabaseUrl || !serviceKey) {
    // before anything is taken from the outbox, so a missing setting leaves every notice where it was
    return json(
      {
        error: 'APP_URL, SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set',
      },
      500,
    )
  }

  const db = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const call = async (name: string, args: Record<string, unknown>) => {
    const { data, error } = await db.rpc(name, args)
    if (error) throw new Error(`${name}: ${error.message}`)
    return data
  }
  const outbox: Outbox = {
    complete: async (id, channel) =>
      void (await call('complete_notification', {
        p_id: id,
        p_channel: channel,
      })),
    fail: async (id, message, giveUp) =>
      void (await call('fail_notification', {
        p_id: id,
        p_error: message,
        p_give_up: giveUp,
      })),
    defer: async (id, until, reason) =>
      void (await call('defer_notification', {
        p_id: id,
        p_until: until,
        p_reason: reason,
      })),
    forget: async (ids) => void (await call('forget_push_subscriptions', { p_ids: ids })),
  }

  const brevoKey = Deno.env.get('BREVO_API_KEY')
  const push = createPushSender(webpush, vapidFromEnvironment(), fetch)
  const email = createEmailSender(
    brevoKey
      ? {
          apiKey: brevoKey,
          sender: {
            email: Deno.env.get('EMAIL_FROM') ?? 'noreply@sigmatim.com',
            name: Deno.env.get('EMAIL_FROM_NAME') ?? 'Sigma Tim',
          },
        }
      : null,
    fetch,
  )

  try {
    const claim = (await call('claim_notifications', {
      p_limit: BATCH,
    })) as Claim
    const limit = Number.parseInt(Deno.env.get('EMAIL_DAILY_LIMIT') ?? '', 10)
    const summary = await processClaim(
      claim,
      { push, email, outbox },
      {
        appUrl,
        emailDailyLimit: Number.isFinite(limit) && limit > 0 ? limit : 200,
        now: () => new Date(),
      },
    )
    console.log(JSON.stringify(summary))
    return json(summary)
  } catch (error) {
    console.error((error as Error).message)
    return json({ error: (error as Error).message }, 500)
  }
})
