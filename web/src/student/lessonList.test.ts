import { describe, expect, it } from 'vitest'
import {
  canCancel,
  groupSlotsByDay,
  isLateBooking,
  isPast,
  mapsUrl,
  noteDigest,
  pickRecord,
  recordLabel,
  sortPast,
  showsPaid,
  sortUpcoming,
  statusChip,
  goneBookings,
  reconcileWatched,
} from './lessonList'
import type { MyLesson, OpenSlot, StudentRecord } from './studentApi'

// Wednesday 4 November 2026, 11:00 in Belgrade
const NOW = new Date('2026-11-04T10:00:00Z')
const at = (hours: number) => new Date(NOW.getTime() + hours * 3_600_000).toISOString()

function lesson(overrides: Partial<MyLesson> = {}): MyLesson {
  return {
    id: 'l1',
    start: at(24),
    end: at(25),
    status: 'confirmed',
    outcome: null,
    origin: 'teacher',
    subject: 'Matematika',
    location: 'Centar',
    address: 'Knez Mihailova 1, Beograd',
    room: 'Učionica 1',
    teacherId: 't1',
    teacherName: 'Ana Nikolić',
    note: null,
    paid: false,
    ...overrides,
  }
}

const slot = (id: string, start: string, end: string): OpenSlot => ({
  id,
  start,
  end,
  subject: 'Matematika',
  location: 'Centar',
  address: 'Knez Mihailova 1, Beograd',
  room: null,
})

describe('isLateBooking', () => {
  it('is late when the lesson starts in less than 12 hours', () => {
    expect(isLateBooking(at(11.99), NOW)).toBe(true)
    expect(isLateBooking(at(1), NOW)).toBe(true)
  })

  it('is not late at exactly 12 hours or later (the database rule)', () => {
    expect(isLateBooking(at(12), NOW)).toBe(false)
    expect(isLateBooking(at(48), NOW)).toBe(false)
  })
})

describe('canCancel and isPast', () => {
  it('lets a lesson be cancelled until it starts', () => {
    expect(canCancel(lesson({ start: at(0.5), end: at(1.5) }), NOW)).toBe(true)
    expect(canCancel(lesson({ start: at(0), end: at(1) }), NOW)).toBe(false)
    expect(canCancel(lesson({ start: at(-0.5), end: at(0.5) }), NOW)).toBe(false)
  })

  it('counts a lesson as past only once it has ended', () => {
    expect(isPast(lesson({ start: at(-2), end: at(-1) }), NOW)).toBe(true)
    expect(isPast(lesson({ start: at(-1), end: at(0) }), NOW)).toBe(true)
    expect(isPast(lesson({ start: at(-0.5), end: at(0.5) }), NOW)).toBe(false)
    expect(isPast(lesson({ start: at(1), end: at(2) }), NOW)).toBe(false)
  })
})

describe('statusChip', () => {
  it('names the state of an upcoming lesson', () => {
    expect(statusChip(lesson({ status: 'confirmed' }), NOW)).toBe('Potvrđen')
    expect(statusChip(lesson({ status: 'pending' }), NOW)).toBe('Čeka potvrdu')
  })

  it('says a lesson is going on', () => {
    expect(statusChip(lesson({ start: at(-0.5), end: at(0.5) }), NOW)).toBe('U toku')
  })

  it('shows what the teacher recorded for a past lesson', () => {
    const past = { start: at(-3), end: at(-2) }
    expect(statusChip(lesson({ ...past, outcome: 'held' }), NOW)).toBe('Održan')
    expect(statusChip(lesson({ ...past, outcome: 'not_held' }), NOW)).toBe('Nije održan')
  })

  it('shows nothing for a past lesson without an outcome: the option is not for students to know about', () => {
    expect(statusChip(lesson({ start: at(-3), end: at(-2) }), NOW)).toBeNull()
  })

  it('says a booking nobody confirmed was not confirmed', () => {
    expect(statusChip(lesson({ start: at(-3), end: at(-2), status: 'pending' }), NOW)).toBe(
      'Nije potvrđen',
    )
  })
})

describe('showsPaid', () => {
  it('is for a lesson that is over and was paid', () => {
    expect(showsPaid(lesson({ start: at(-30), end: at(-29), paid: true }))).toBe(true)
  })

  it('never says that a lesson was not paid', () => {
    expect(showsPaid(lesson({ start: at(-30), end: at(-29), paid: false }))).toBe(false)
    expect(showsPaid(lesson({ start: at(24), end: at(25), paid: false }))).toBe(false)
  })

  it('is also for a lesson that is still to come and was paid in advance', () => {
    expect(showsPaid(lesson({ start: at(24), end: at(25), paid: true }))).toBe(true)
  })

  it('is also for a lesson that is going on', () => {
    expect(showsPaid(lesson({ start: at(-0.5), end: at(0.5), paid: true }))).toBe(true)
  })
})

describe('sorting', () => {
  it('puts the nearest upcoming lesson first', () => {
    const rows = [
      lesson({ id: 'c', start: at(72), end: at(73) }),
      lesson({ id: 'a', start: at(2), end: at(3) }),
      lesson({ id: 'b', start: at(30), end: at(31) }),
    ]
    expect(sortUpcoming(rows).map((l) => l.id)).toEqual(['a', 'b', 'c'])
  })

  it('puts the newest past lesson first', () => {
    const rows = [
      lesson({ id: 'old', start: at(-100), end: at(-99) }),
      lesson({ id: 'new', start: at(-5), end: at(-4) }),
      lesson({ id: 'mid', start: at(-50), end: at(-49) }),
    ]
    expect(sortPast(rows).map((l) => l.id)).toEqual(['new', 'mid', 'old'])
  })

  it('does not change the list it was given', () => {
    const rows = [lesson({ id: 'b', start: at(30), end: at(31) }), lesson({ id: 'a' })]
    sortUpcoming(rows)
    expect(rows.map((l) => l.id)).toEqual(['b', 'a'])
  })
})

describe('groupSlotsByDay', () => {
  it('groups by Belgrade day, in time order', () => {
    const groups = groupSlotsByDay([
      slot('late', '2026-11-05T18:00:00Z', '2026-11-05T19:00:00Z'),
      slot('early', '2026-11-05T08:00:00Z', '2026-11-05T09:00:00Z'),
      slot('next', '2026-11-06T08:00:00Z', '2026-11-06T09:00:00Z'),
    ])
    expect(groups.map((g) => g.slots.map((s) => s.id))).toEqual([['early', 'late'], ['next']])
    expect(groups.map((g) => g.key)).toEqual(['2026-11-05', '2026-11-06'])
  })

  it('uses the Belgrade calendar, not UTC: 23:30 UTC is already the next day', () => {
    const groups = groupSlotsByDay([slot('s', '2026-11-04T23:30:00Z', '2026-11-05T00:30:00Z')])
    expect(groups[0].key).toBe('2026-11-05')
  })

  it('has no groups for no slots', () => {
    expect(groupSlotsByDay([])).toEqual([])
  })
})

describe('mapsUrl', () => {
  it('links to a map search for the address', () => {
    expect(mapsUrl('Knez Mihailova 1, Beograd')).toBe(
      'https://www.google.com/maps/search/?api=1&query=Knez%20Mihailova%201%2C%20Beograd',
    )
  })
})

describe('records', () => {
  const marko: StudentRecord = {
    id: 's1',
    name: 'Marko Marković',
    teacherId: 't1',
    teacherName: 'Ana Nikolić',
  }
  const jana: StudentRecord = {
    id: 's2',
    name: 'Jana Marković',
    teacherId: 't2',
    teacherName: 'Petar Jović',
  }

  it('labels a parent’s choice by the child and a student’s by the teacher', () => {
    expect(recordLabel('parent', marko)).toBe('Marko Marković')
    expect(recordLabel('student', marko)).toBe('Kod nastavnika: Ana Nikolić')
  })

  it('has a label for a student without a teacher', () => {
    expect(recordLabel('student', { ...marko, teacherId: null, teacherName: null })).toBe(
      'Bez nastavnika',
    )
  })

  it('picks the remembered record when it is still there', () => {
    expect(pickRecord([marko, jana], 's2')?.id).toBe('s2')
  })

  it('falls back to the first one when nothing is remembered or the record is gone', () => {
    expect(pickRecord([marko, jana], null)?.id).toBe('s1')
    expect(pickRecord([marko, jana], 'gone')?.id).toBe('s1')
  })

  it('picks nothing from nothing', () => {
    expect(pickRecord([], 's1')).toBeNull()
  })
})

describe('noteDigest', () => {
  it('is the same for the same text and changes when the note is edited', () => {
    expect(noteDigest('Ponesite zbirku')).toBe(noteDigest('Ponesite zbirku'))
    expect(noteDigest('Ponesite zbirku')).not.toBe(noteDigest('Ponesite zbirku i svesku'))
  })
})

describe('watching bookings that wait for the teacher', () => {
  const waiting = (id: string, hours = 6) =>
    lesson({ id, status: 'pending', origin: 'slot', start: at(hours), end: at(hours + 1) })

  it('starts watching a booking that waits for the teacher', () => {
    const next = reconcileWatched({}, [waiting('w1'), lesson({ id: 'ok' })], NOW)
    expect(next).toEqual({ w1: { start: at(6), subject: 'Matematika' } })
  })

  it('keeps watching while it still waits', () => {
    const stored = { w1: { start: at(6), subject: 'Matematika' } }
    expect(reconcileWatched(stored, [waiting('w1')], NOW)).toEqual(stored)
  })

  it('forgets a booking the teacher confirmed', () => {
    const stored = { w1: { start: at(6), subject: 'Matematika' } }
    expect(reconcileWatched(stored, [lesson({ id: 'w1', start: at(6), end: at(7) })], NOW)).toEqual(
      {},
    )
  })

  it('marks a booking that is gone: declined, or the slot was taken away', () => {
    const stored = { w1: { start: at(6), subject: 'Matematika' } }
    const next = reconcileWatched(stored, [], NOW)
    expect(next).toEqual({ w1: { start: at(6), subject: 'Matematika', gone: true } })
    expect(goneBookings(next)).toEqual([{ id: 'w1', start: at(6), subject: 'Matematika' }])
  })

  it('keeps reporting it until the person dismisses it', () => {
    const gone = { w1: { start: at(6), subject: 'Matematika', gone: true } }
    expect(reconcileWatched(gone, [], NOW)).toEqual(gone)
  })

  it('does not report a booking whose time has passed: nothing could be declined by then', () => {
    const stored = { w1: { start: at(-1), subject: 'Matematika' } }
    expect(reconcileWatched(stored, [], NOW)).toEqual({})
  })

  it('forgets a waiting booking once its lesson is over', () => {
    const stored = { w1: { start: at(-3), subject: 'Matematika' } }
    expect(
      reconcileWatched(
        stored,
        [lesson({ id: 'w1', status: 'pending', start: at(-3), end: at(-2) })],
        NOW,
      ),
    ).toEqual({})
  })

  it('stops reporting a booking that came back as a lesson of the person', () => {
    const gone = { w1: { start: at(6), subject: 'Matematika', gone: true } }
    expect(reconcileWatched(gone, [waiting('w1')], NOW)).toEqual({
      w1: { start: at(6), subject: 'Matematika' },
    })
  })

  it('has nothing to report when nothing was watched', () => {
    expect(goneBookings({})).toEqual([])
  })
})
