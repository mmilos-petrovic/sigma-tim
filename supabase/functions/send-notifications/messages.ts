// The words of every notice, in Serbian, and where a tap on it leads. One text serves both the push and the email.
import type { Claim, Email, Notice, PushMessage } from './types.ts'

const SCHOOL_TIME_ZONE = 'Europe/Belgrade'
const WEEKDAYS = ['nedelja', 'ponedeljak', 'utorak', 'sreda', 'četvrtak', 'petak', 'subota']
const WEEKDAY_ABBREVIATIONS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = [
  'januara',
  'februara',
  'marta',
  'aprila',
  'maja',
  'juna',
  'jula',
  'avgusta',
  'septembra',
  'oktobra',
  'novembra',
  'decembra',
]
const MAX_PUSH_BODY = 240

interface SchoolTime {
  weekday: string
  day: number
  month: string
  time: string
}

function schoolTime(iso: string): SchoolTime | null {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: SCHOOL_TIME_ZONE,
    weekday: 'short',
    day: 'numeric',
    month: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return {
    weekday: WEEKDAYS[Math.max(0, WEEKDAY_ABBREVIATIONS.indexOf(part('weekday')))],
    day: Number(part('day')),
    month: MONTHS[Number(part('month')) - 1],
    time: `${part('hour')}:${part('minute')}`,
  }
}

/** "sreda, 12. novembra u 17:00", in the school's time zone. */
export function formatWhen(iso: unknown): string {
  const t = typeof iso === 'string' ? schoolTime(iso) : null
  return t ? `${t.weekday}, ${t.day}. ${t.month} u ${t.time}` : ''
}

/** "17:00" */
export function formatTime(iso: unknown): string {
  const t = typeof iso === 'string' ? schoolTime(iso) : null
  return t ? t.time : ''
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function names(value: unknown): string {
  return Array.isArray(value) ? value.filter((v) => typeof v === 'string' && v).join(', ') : ''
}

function sentence(...pieces: (string | false | null | undefined)[]): string {
  return pieces
    .filter((p): p is string => typeof p === 'string' && p !== '')
    .map((p) => (/[.!?]$/.test(p) ? p : `${p}.`))
    .join(' ')
}

function shorten(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}…`
}

/** Where a tap leads: the list that holds what the notice is about, in the part of the app of the person's role. */
export function pathFor(notice: Notice): string {
  const { recipient: r, kind } = notice
  if (kind === 'test' && r.is_admin) return '/administracija/podesavanja'
  const teacherSide =
    kind === 'slot_claimed' || r.teaches_lesson || (r.is_teacher && !r.is_student && !r.is_parent)
  if (teacherSide && r.is_teacher) return '/moj-raspored/casovi'
  if (r.is_student) return '/ucenik'
  if (r.is_parent) return '/roditelj'
  if (r.is_teacher) return '/moj-raspored/casovi'
  if (r.is_admin) return '/administracija'
  return '/'
}

function tagFor(notice: Notice): string | undefined {
  const lesson = text(notice.payload.lesson_id)
  if (!lesson) return notice.kind === 'test' ? 'test' : undefined
  return notice.kind === 'lesson_reminder' ? `reminder-${lesson}` : `lesson-${lesson}`
}

/** Title and text of a notice (the same for push and email). */
export function describe(notice: Notice, now: Date): { title: string; body: string } {
  const p = notice.payload
  const subject = text(p.subject)
  const when = formatWhen(p.start_at)
  const teacher = text(p.teacher)
  const location = text(p.location)
  // a parent is told which child it is about; a student or a teacher needs no name for themselves
  const forWhom =
    notice.recipient.is_parent && !notice.recipient.is_student && names(p.students)
      ? `Učenik: ${names(p.students)}`
      : ''

  switch (notice.kind) {
    case 'lesson_scheduled':
      return {
        title: 'Novi čas',
        body: sentence(
          [subject, when].filter(Boolean).join(', '),
          teacher && `Nastavnik: ${teacher}`,
          location,
          forWhom,
        ),
      }
    case 'slot_claimed': {
      const pending = p.status === 'pending'
      return {
        title: pending ? 'Zahtev za termin čeka potvrdu' : 'Termin je zakazan',
        body: sentence(
          [subject, when].filter(Boolean).join(', '),
          names(p.students) && `Učenik: ${names(p.students)}`,
          pending && 'Potvrdite ili odbijte zahtev',
        ),
      }
    }
    case 'booking_confirmed':
      return {
        title: 'Termin je potvrđen',
        body: sentence(
          [subject, when].filter(Boolean).join(', '),
          teacher && `Nastavnik: ${teacher}`,
          location,
          forWhom,
        ),
      }
    case 'lesson_moved': {
      const before = formatWhen(p.old_start_at)
      const oldLocation = text(p.old_location)
      return {
        title: 'Čas je pomeren',
        body: sentence(
          subject,
          when && `Novi termin: ${when}`,
          location && `Mesto: ${location}`,
          before &&
            `Ranije: ${before}${oldLocation && oldLocation !== location ? `, ${oldLocation}` : ''}`,
          forWhom,
        ),
      }
    }
    case 'lesson_cancelled': {
      const declined = p.reason === 'declined'
      const deactivated = p.reason === 'teacher_deactivated'
      return {
        title: declined ? 'Zahtev za termin je odbijen' : 'Čas je otkazan',
        body: sentence(
          [subject, when].filter(Boolean).join(', '),
          deactivated && 'Nastavnik više nije dostupan',
          text(p.note) && `Razlog: ${text(p.note)}`,
          forWhom,
        ),
      }
    }
    case 'participant_left':
      return {
        title: 'Učenik više ne dolazi na čas',
        body: sentence(
          names(p.students) && `${names(p.students)} više ne dolazi`,
          [subject, when].filter(Boolean).join(', '),
        ),
      }
    case 'lesson_reminder': {
      const time = formatTime(p.start_at)
      return {
        title: time ? `Čas počinje u ${time}` : 'Čas uskoro počinje',
        body: sentence(subject, teacher && `Nastavnik: ${teacher}`, location, forWhom),
      }
    }
    case 'welcome':
      return {
        title: 'Dobrodošli u Sigma Tim',
        body: 'Dodati ste u aplikaciju za zakazivanje časova.',
      }
    case 'welcome_push':
      return {
        title: 'Obaveštenja su uključena',
        body: 'Ovde ćete dobijati poruke o svojim časovima.',
      }
    case 'test':
      return {
        title: 'Probno obaveštenje',
        body: `Obaveštenja rade. Poslato ${formatWhen(now.toISOString())}.`,
      }
    default:
      return { title: 'Sigma Tim', body: 'Imate novo obaveštenje.' }
  }
}

/** A reminder is worthless once the lesson has begun, and a test once it has been looked at; the rest may wait a day. */
function holdSeconds(kind: string): number {
  if (kind === 'lesson_reminder') return 60 * 60
  if (kind === 'test') return 15 * 60
  return 24 * 60 * 60
}

export function pushMessage(notice: Notice, now: Date): PushMessage {
  const { title, body } = describe(notice, now)
  const message: PushMessage = {
    title,
    body: shorten(body, MAX_PUSH_BODY),
    url: pathFor(notice),
    ttl: holdSeconds(notice.kind),
    urgency: notice.kind === 'lesson_reminder' || notice.kind === 'test' ? 'high' : 'normal',
  }
  const tag = tagFor(notice)
  if (tag) message.tag = tag
  return message
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function paragraphs(blocks: string[]): string {
  return blocks
    .filter((b) => b)
    .map((b) => `<p>${escapeHtml(b).replaceAll('\n', '<br>')}</p>`)
    .join('\n')
}

const DEFAULT_WELCOME = 'Dodati ste u Sigma Tim, aplikaciju za zakazivanje časova.'

/** The email for a notice: the same words as the push, a greeting and a link; the welcome has its own text. */
export function emailFor(notice: Notice, claim: Claim, appUrl: string, now: Date): Email {
  const base = appUrl.replace(/\/+$/, '')
  const greeting = notice.recipient.first_name
    ? `Zdravo ${notice.recipient.first_name},`
    : 'Zdravo,'
  const to = {
    email: notice.recipient.email,
    name: notice.recipient.first_name,
  }

  let subject: string
  let blocks: string[]
  let linkLabel: string
  let link: string
  if (notice.kind === 'welcome') {
    subject = 'Dobrodošli u Sigma Tim'
    blocks = [claim.settings.welcome_text.trim() || DEFAULT_WELCOME]
    linkLabel = 'Prijavite se ovde'
    link = `${base}/prijava`
  } else {
    const { title, body } = describe(notice, now)
    subject = title
    blocks = [body]
    linkLabel = 'Otvorite aplikaciju'
    link = `${base}${pathFor(notice)}`
  }
  const contact = notice.kind === 'welcome' ? claim.settings.school_contact.trim() : ''

  const plain = [greeting, ...blocks, `${linkLabel}: ${link}`, contact, '— Sigma Tim']
    .filter((b) => b)
    .join('\n\n')
  const html = [
    paragraphs([greeting, ...blocks]),
    `<p><a href="${escapeHtml(link)}">${escapeHtml(linkLabel)}</a></p>`,
    paragraphs([contact, '— Sigma Tim']),
  ]
    .filter((b) => b)
    .join('\n')
  return { to, subject, text: plain, html }
}
