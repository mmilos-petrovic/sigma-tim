import type { NotificationState } from './adminApi'

/** The kinds of notice as the administrator reads them. A kind the app does not know yet shows as it is written. */
const KIND_LABEL: Record<string, string> = {
  lesson_scheduled: 'Novi čas',
  slot_claimed: 'Zauzet slobodan termin (nastavniku)',
  booking_confirmed: 'Potvrđena rezervacija',
  lesson_moved: 'Pomeren čas',
  lesson_cancelled: 'Otkazan čas',
  participant_left: 'Učenik je napustio čas',
  lesson_reminder: 'Podsetnik pre časa',
  welcome: 'Dobrodošlica',
  welcome_push: 'Dobrodošlica (push)',
  test: 'Probno obaveštenje',
}

export const kindLabel = (kind: string) => KIND_LABEL[kind] ?? kind

export const STATE_LABEL: Record<NotificationState, string> = {
  sent: 'Poslato',
  waiting: 'Čeka kraj tihih sati',
  queued: 'U redu za slanje',
  retrying: 'Ponovni pokušaj',
  failed: 'Nije uspelo',
}

export const CHANNEL_LABEL = { push: 'Push', email: 'Email' } as const
