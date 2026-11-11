// What claim_notifications() returns and what the senders take and give back. No imports, so the modules that use these
// types run in Deno (the Edge Function) and in Node (the unit tests in web/src/edge) alike.

export interface PushSubscription {
  id: string
  endpoint: string
  p256dh: string
  auth: string
}

export interface Recipient {
  id: string
  email: string
  first_name: string
  is_admin: boolean
  is_teacher: boolean
  is_student: boolean
  is_parent: boolean
  /** True when the notice is about a lesson this person teaches (false when the lesson is gone). */
  teaches_lesson: boolean
}

export interface Notice {
  id: number
  kind: string
  /** A snapshot written by the database; every field is optional because the kinds differ. */
  payload: Record<string, unknown>
  attempt: number
  final_attempt: boolean
  recipient: Recipient
  config: { email_fallback: boolean; always_email: boolean }
  subscriptions: PushSubscription[]
}

export interface Claim {
  settings: { welcome_text: string; school_contact: string }
  emails_today: number
  /** When a notice held back by the daily email limit may go again. */
  emails_resume_at: string
  notices: Notice[]
}

/** What the person sees on the lock screen, and where a tap leads (a path of this site). */
export interface PushMessage {
  title: string
  body: string
  url: string
  tag?: string
  /** How long the push service may hold the message for a device that is off, in seconds. */
  ttl: number
  urgency: 'normal' | 'high'
}

export interface Email {
  to: { email: string; name: string }
  subject: string
  text: string
  html: string
}

export type PushResult =
  | { kind: 'sent' }
  /** The push service says this device is gone for good (404, 410). */
  | { kind: 'gone' }
  | { kind: 'failed'; error: string }

export type EmailResult =
  | { kind: 'sent' }
  /** The address or the mail itself was refused: trying again will not help. */
  | { kind: 'rejected'; error: string }
  /** The provider's daily or rate limit. */
  | { kind: 'limit'; error: string }
  | { kind: 'failed'; error: string }

export interface PushSender {
  send(subscription: PushSubscription, message: PushMessage): Promise<PushResult>
}

export interface EmailSender {
  send(email: Email): Promise<EmailResult>
}

/** The database side of the function (the functions of 20261111140000_notification_sending.sql). */
export interface Outbox {
  complete(id: number, channel: 'push' | 'email'): Promise<void>
  fail(id: number, error: string, giveUp: boolean): Promise<void>
  defer(id: number, until: string, reason: string): Promise<void>
  forget(subscriptionIds: string[]): Promise<void>
}

export interface SendSettings {
  /** Address of the site, for the links in emails (no trailing slash). */
  appUrl: string
  /** Non-urgent emails stop at this many a day; the rest of the provider's limit is kept for welcome and test. */
  emailDailyLimit: number
  now: () => Date
}

export interface Summary {
  claimed: number
  push: number
  email: number
  retry: number
  held: number
  failed: number
  forgotten: number
}
