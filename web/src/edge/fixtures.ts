import type {
  Claim,
  Notice,
  PushSubscription,
  Recipient,
} from '../../../supabase/functions/send-notifications/types.ts'

/** `length` bytes, all `fill`, as base64url (what a browser hands out for its keys). */
export function base64url(length: number, fill: number): string {
  return btoa(String.fromCharCode(...new Uint8Array(length).fill(fill)))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '')
}

/** A well-formed browser subscription (65-byte public key, 16-byte secret), as the database hands them out. */
export function subscription(
  id: string,
  endpoint = `https://push.example/${id}`,
): PushSubscription {
  return {
    id,
    endpoint,
    p256dh: base64url(65, 7),
    auth: base64url(16, 9),
  }
}

export function recipient(overrides: Partial<Recipient> = {}): Recipient {
  return {
    id: 'person-1',
    email: 'ucenik@example.test',
    first_name: 'Mika',
    is_admin: false,
    is_teacher: false,
    is_student: true,
    is_parent: false,
    teaches_lesson: false,
    ...overrides,
  }
}

export const LESSON = {
  lesson_id: 'lesson-1',
  subject: 'Matematika',
  teacher: 'Ana Anić',
  location: 'Centar',
  start_at: '2026-11-12T16:00:00+00:00',
  end_at: '2026-11-12T17:00:00+00:00',
}

export function notice(overrides: Partial<Notice> & { id?: number } = {}): Notice {
  return {
    id: 1,
    kind: 'lesson_scheduled',
    payload: { ...LESSON, students: ['Mika Mikić'] },
    attempt: 1,
    final_attempt: false,
    recipient: recipient(),
    config: { email_fallback: true, always_email: false },
    subscriptions: [subscription('d1')],
    ...overrides,
  }
}

export function claim(notices: Notice[], overrides: Partial<Claim> = {}): Claim {
  return {
    settings: { welcome_text: '', school_contact: '' },
    emails_today: 0,
    emails_resume_at: '2026-11-12T06:00:00+00:00',
    notices,
    ...overrides,
  }
}
