import { describe, expect, it } from 'vitest'
import {
  describe as describeNotice,
  emailFor,
  formatTime,
  formatWhen,
  pathFor,
  pushMessage,
} from '../../../supabase/functions/send-notifications/messages.ts'
import { claim, LESSON, notice, recipient } from './fixtures.ts'

const NOW = new Date('2026-11-12T09:00:00Z')

describe('formatWhen', () => {
  it('writes the day and time in the school time zone (winter)', () => {
    expect(formatWhen('2026-11-12T16:00:00+00:00')).toBe('četvrtak, 12. novembra u 17:00')
  })

  it('and in summer time', () => {
    expect(formatWhen('2026-07-01T10:05:00Z')).toBe('sreda, 1. jula u 12:05')
  })

  it('moves to the next day when the school clock has passed midnight', () => {
    expect(formatWhen('2026-11-11T23:30:00Z')).toBe('četvrtak, 12. novembra u 00:30')
  })

  it('is empty for what is not a time', () => {
    expect(formatWhen('nonsense')).toBe('')
    expect(formatWhen(undefined)).toBe('')
    expect(formatWhen(42)).toBe('')
  })

  it('formatTime gives the clock time alone', () => {
    expect(formatTime('2026-11-12T16:00:00+00:00')).toBe('17:00')
    expect(formatTime(null)).toBe('')
  })
})

describe('pathFor: where a tap leads', () => {
  it('a student to their lessons', () => {
    expect(pathFor(notice())).toBe('/ucenik')
  })

  it('a parent to the lessons of their children', () => {
    expect(pathFor(notice({ recipient: recipient({ is_student: false, is_parent: true }) }))).toBe(
      '/roditelj',
    )
  })

  it('a teacher to their lesson list', () => {
    const teacher = recipient({ is_student: false, is_teacher: true, teaches_lesson: true })
    expect(pathFor(notice({ recipient: teacher }))).toBe('/moj-raspored/casovi')
  })

  it('a booking always goes to the teacher side', () => {
    const teacherAndParent = recipient({ is_student: false, is_teacher: true, is_parent: true })
    expect(pathFor(notice({ kind: 'slot_claimed', recipient: teacherAndParent }))).toBe(
      '/moj-raspored/casovi',
    )
  })

  it('a teacher who is also a parent goes where the notice is about: their own lesson, or their child', () => {
    const both = { is_student: false, is_teacher: true, is_parent: true }
    expect(pathFor(notice({ recipient: recipient({ ...both, teaches_lesson: true }) }))).toBe(
      '/moj-raspored/casovi',
    )
    expect(pathFor(notice({ recipient: recipient({ ...both, teaches_lesson: false }) }))).toBe(
      '/roditelj',
    )
  })

  it('the test goes to the settings page of an administrator', () => {
    const admin = recipient({ is_student: false, is_admin: true })
    expect(pathFor(notice({ kind: 'test', recipient: admin }))).toBe('/administracija/podesavanja')
  })

  it('a person with no role in force goes to the front page', () => {
    expect(pathFor(notice({ recipient: recipient({ is_student: false }) }))).toBe('/')
  })
})

describe('the words', () => {
  it('a new lesson', () => {
    expect(describeNotice(notice(), NOW)).toEqual({
      title: 'Novi čas',
      body: 'Matematika, četvrtak, 12. novembra u 17:00. Nastavnik: Ana Anić. Centar.',
    })
  })

  it('names the child to a parent, and only to a parent', () => {
    const parent = recipient({ is_student: false, is_parent: true })
    expect(describeNotice(notice({ recipient: parent }), NOW).body).toContain('Učenik: Mika Mikić.')
    expect(describeNotice(notice(), NOW).body).not.toContain('Učenik')
  })

  it('a booking that waits for the teacher, and one that does not', () => {
    const teacher = recipient({ is_student: false, is_teacher: true })
    const pending = describeNotice(
      notice({
        kind: 'slot_claimed',
        recipient: teacher,
        payload: { ...LESSON, status: 'pending', students: ['Mika Mikić'] },
      }),
      NOW,
    )
    expect(pending.title).toBe('Zahtev za termin čeka potvrdu')
    expect(pending.body).toBe(
      'Matematika, četvrtak, 12. novembra u 17:00. Učenik: Mika Mikić. Potvrdite ili odbijte zahtev.',
    )
    const confirmed = describeNotice(
      notice({
        kind: 'slot_claimed',
        recipient: teacher,
        payload: { ...LESSON, status: 'confirmed', students: ['Mika Mikić'] },
      }),
      NOW,
    )
    expect(confirmed.title).toBe('Termin je zakazan')
    expect(confirmed.body).not.toContain('Potvrdite')
  })

  it('a confirmed booking', () => {
    expect(describeNotice(notice({ kind: 'booking_confirmed' }), NOW).title).toBe(
      'Termin je potvrđen',
    )
  })

  it('a moved lesson says what it was', () => {
    const moved = notice({
      kind: 'lesson_moved',
      payload: {
        ...LESSON,
        start_at: '2026-11-13T16:00:00+00:00',
        old_start_at: '2026-11-12T16:00:00+00:00',
        old_location: 'Zemun',
        students: ['Mika Mikić'],
      },
    })
    expect(describeNotice(moved, NOW)).toEqual({
      title: 'Čas je pomeren',
      body: 'Matematika. Novi termin: petak, 13. novembra u 17:00. Mesto: Centar. Ranije: četvrtak, 12. novembra u 17:00, Zemun.',
    })
  })

  it('a moved lesson does not repeat a place that did not change', () => {
    const moved = notice({
      kind: 'lesson_moved',
      payload: { ...LESSON, old_start_at: '2026-11-12T15:00:00+00:00', old_location: 'Centar' },
    })
    expect(describeNotice(moved, NOW).body).toContain('Ranije: četvrtak, 12. novembra u 16:00.')
  })

  it('a cancelled lesson, with and without a reason', () => {
    const plain = describeNotice(
      notice({ kind: 'lesson_cancelled', payload: { ...LESSON, reason: 'cancelled' } }),
      NOW,
    )
    expect(plain).toEqual({
      title: 'Čas je otkazan',
      body: 'Matematika, četvrtak, 12. novembra u 17:00.',
    })
    const noted = describeNotice(
      notice({
        kind: 'lesson_cancelled',
        payload: { ...LESSON, reason: 'cancelled', note: 'Bolestan sam' },
      }),
      NOW,
    )
    expect(noted.body).toContain('Razlog: Bolestan sam.')
  })

  it('a declined booking and a teacher who left', () => {
    const declined = describeNotice(
      notice({ kind: 'lesson_cancelled', payload: { ...LESSON, reason: 'declined' } }),
      NOW,
    )
    expect(declined.title).toBe('Zahtev za termin je odbijen')
    const left = describeNotice(
      notice({ kind: 'lesson_cancelled', payload: { ...LESSON, reason: 'teacher_deactivated' } }),
      NOW,
    )
    expect(left.body).toContain('Nastavnik više nije dostupan.')
  })

  it('a participant who left', () => {
    const left = notice({
      kind: 'participant_left',
      payload: { ...LESSON, students: ['Mika Mikić', 'Pera Perić'] },
    })
    expect(describeNotice(left, NOW)).toEqual({
      title: 'Učenik više ne dolazi na čas',
      body: 'Mika Mikić, Pera Perić više ne dolazi. Matematika, četvrtak, 12. novembra u 17:00.',
    })
  })

  it('a reminder says when it starts', () => {
    expect(describeNotice(notice({ kind: 'lesson_reminder' }), NOW)).toEqual({
      title: 'Čas počinje u 17:00',
      body: 'Matematika. Nastavnik: Ana Anić. Centar.',
    })
  })

  it('the welcome push and the test', () => {
    expect(describeNotice(notice({ kind: 'welcome_push', payload: {} }), NOW).title).toBe(
      'Obaveštenja su uključena',
    )
    expect(describeNotice(notice({ kind: 'test', payload: {} }), NOW)).toEqual({
      title: 'Probno obaveštenje',
      body: 'Obaveštenja rade. Poslato četvrtak, 12. novembra u 10:00.',
    })
  })

  it('holds together when the snapshot is nearly empty', () => {
    expect(describeNotice(notice({ kind: 'lesson_moved', payload: {} }), NOW).title).toBe(
      'Čas je pomeren',
    )
    expect(describeNotice(notice({ kind: 'something_new', payload: {} }), NOW).title).toBe(
      'Sigma Tim',
    )
  })
})

describe('the push message', () => {
  it('carries the words, the path and a tag that makes a newer notice replace an older one', () => {
    expect(pushMessage(notice(), NOW)).toEqual({
      title: 'Novi čas',
      body: 'Matematika, četvrtak, 12. novembra u 17:00. Nastavnik: Ana Anić. Centar.',
      url: '/ucenik',
      tag: 'lesson-lesson-1',
      ttl: 86400,
      urgency: 'normal',
    })
  })

  it('a reminder is urgent, short-lived and does not replace the notices about the lesson', () => {
    const reminder = pushMessage(notice({ kind: 'lesson_reminder' }), NOW)
    expect(reminder).toMatchObject({ tag: 'reminder-lesson-1', ttl: 3600, urgency: 'high' })
  })

  it('a notice about nothing in particular has no tag, a test has its own', () => {
    expect(pushMessage(notice({ kind: 'welcome_push', payload: {} }), NOW).tag).toBeUndefined()
    expect(pushMessage(notice({ kind: 'test', payload: {} }), NOW)).toMatchObject({
      tag: 'test',
      ttl: 900,
      urgency: 'high',
    })
  })

  it('a long text is cut', () => {
    const long = notice({ kind: 'lesson_cancelled', payload: { ...LESSON, note: 'x'.repeat(500) } })
    const body = pushMessage(long, NOW).body
    expect(body.length).toBe(240)
    expect(body.endsWith('…')).toBe(true)
  })
})

describe('the email', () => {
  const APP = 'https://sigmatim.com'

  it('greets by name, repeats the words and links to the right list', () => {
    const email = emailFor(notice(), claim([]), APP, NOW)
    expect(email.to).toEqual({ email: 'ucenik@example.test', name: 'Mika' })
    expect(email.subject).toBe('Novi čas')
    expect(email.text).toBe(
      [
        'Zdravo Mika,',
        'Matematika, četvrtak, 12. novembra u 17:00. Nastavnik: Ana Anić. Centar.',
        'Otvorite aplikaciju: https://sigmatim.com/ucenik',
        '— Sigma Tim',
      ].join('\n\n'),
    )
    expect(email.html).toContain('<a href="https://sigmatim.com/ucenik">Otvorite aplikaciju</a>')
  })

  it('does not double the slash when the address ends with one', () => {
    expect(emailFor(notice(), claim([]), 'https://sigmatim.com//', NOW).text).toContain(
      'https://sigmatim.com/ucenik',
    )
  })

  it("the welcome has the administrator's text, the sign-in link and the school contact", () => {
    const welcome = notice({ kind: 'welcome', payload: { first_name: 'Mika' }, subscriptions: [] })
    const email = emailFor(
      welcome,
      claim([], {
        settings: { welcome_text: 'Drago nam je što ste tu.', school_contact: 'Tel 011 123 4567' },
      }),
      APP,
      NOW,
    )
    expect(email.subject).toBe('Dobrodošli u Sigma Tim')
    expect(email.text).toBe(
      [
        'Zdravo Mika,',
        'Drago nam je što ste tu.',
        'Prijavite se ovde: https://sigmatim.com/prijava',
        'Tel 011 123 4567',
        '— Sigma Tim',
      ].join('\n\n'),
    )
  })

  it('the welcome has a text of its own when the administrator wrote none', () => {
    const welcome = notice({ kind: 'welcome', payload: {}, subscriptions: [] })
    const email = emailFor(welcome, claim([]), APP, NOW)
    expect(email.text).toContain('Dodati ste u Sigma Tim, aplikaciju za zakazivanje časova.')
    expect(email.text).not.toContain('Tel')
  })

  it('greets without a name when there is none', () => {
    const nameless = notice({ recipient: recipient({ first_name: '' }) })
    expect(emailFor(nameless, claim([]), APP, NOW).text.startsWith('Zdravo,\n\n')).toBe(true)
  })

  it('writes what a person typed as text, never as markup', () => {
    const welcome = notice({ kind: 'welcome', payload: {}, subscriptions: [] })
    const email = emailFor(
      welcome,
      claim([], {
        settings: { welcome_text: '<script>alert("x")</script>\nDrugi red', school_contact: '' },
      }),
      APP,
      NOW,
    )
    expect(email.html).not.toContain('<script>')
    expect(email.html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;<br>Drugi red')
  })
})
