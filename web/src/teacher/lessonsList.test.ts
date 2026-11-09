import { describe, expect, it } from 'vitest'
import { seedTeacher } from '../test/fakeTeacherApi'
import { matchesStudent, needsPayment, outcomeChip, paidChip } from './lessonsList'
import type { LessonRow, Participant } from './teacherApi'

// Wednesday 4 November 2026, 11:00 in Belgrade
const NOW = new Date('2026-11-04T10:00:00Z')
const at = (hours: number) => new Date(NOW.getTime() + hours * 3_600_000).toISOString()

const who = (paid: boolean[]): Participant[] =>
  paid.map((p, i) => ({ studentId: `st-${i}`, note: null, paid: p }))

function lesson(overrides: Partial<LessonRow> = {}): LessonRow {
  return {
    id: 'l1',
    subjectId: 's-mat',
    locationId: 'l-main',
    roomId: null,
    start: at(24),
    end: at(25),
    status: 'confirmed',
    origin: 'teacher',
    outcome: null,
    participants: who([false]),
    ...overrides,
  }
}
const over = (overrides: Partial<LessonRow> = {}) =>
  lesson({ start: at(-30), end: at(-29), ...overrides })

describe('outcomeChip', () => {
  it('says that a booking waits for the teacher, whenever it is', () => {
    expect(outcomeChip(lesson({ status: 'pending' }), NOW)).toBe('Čeka vaš odgovor')
    expect(outcomeChip(over({ status: 'pending' }), NOW)).toBe('Čeka vaš odgovor')
  })

  it('says nothing about a confirmed lesson that is still to come', () => {
    expect(outcomeChip(lesson(), NOW)).toBeNull()
  })

  it('says that a lesson is going on', () => {
    expect(outcomeChip(lesson({ start: at(-0.5), end: at(0.5) }), NOW)).toBe('U toku')
  })

  it('names what was recorded after a lesson, and reminds the teacher when nothing was', () => {
    expect(outcomeChip(over({ outcome: 'held' }), NOW)).toBe('Održan')
    expect(outcomeChip(over({ outcome: 'not_held' }), NOW)).toBe('Nije održan')
    expect(outcomeChip(over(), NOW)).toBe('Ishod nije upisan')
  })

  it('counts a lesson as over from the moment it ends', () => {
    expect(outcomeChip(lesson({ start: at(-1), end: at(0) }), NOW)).toBe('Ishod nije upisan')
    expect(outcomeChip(lesson({ start: at(-1), end: at(0.25) }), NOW)).toBe('U toku')
  })
})

describe('paidChip', () => {
  it('says when everybody on the lesson has paid, also in advance', () => {
    expect(paidChip(over({ participants: who([true]) }), NOW)).toBe('Plaćeno')
    expect(paidChip(lesson({ participants: who([true, true]) }), NOW)).toBe('Plaćeno')
  })

  it('says how many of a group have paid', () => {
    expect(paidChip(over({ participants: who([true, false, false]) }), NOW)).toBe('Plaćeno 1 od 3')
    expect(paidChip(lesson({ participants: who([true, false]) }), NOW)).toBe('Plaćeno 1 od 2')
  })

  it('says that a lesson that took place, or may have, was not paid', () => {
    expect(paidChip(over({ outcome: 'held' }), NOW)).toBe('Nije plaćeno')
    expect(paidChip(over(), NOW)).toBe('Nije plaćeno')
  })

  it('says nothing about a lesson that did not take place, one still to come, or one nobody answered', () => {
    expect(paidChip(over({ outcome: 'not_held' }), NOW)).toBeNull()
    expect(paidChip(lesson(), NOW)).toBeNull()
    expect(paidChip(over({ status: 'pending' }), NOW)).toBeNull()
  })

  it('says nothing about a lesson with nobody on it', () => {
    expect(paidChip(over({ participants: [] }), NOW)).toBeNull()
  })
})

describe('needsPayment', () => {
  it('is a confirmed lesson that is over, was not marked as not held, and has somebody who has not paid', () => {
    expect(needsPayment(over(), NOW)).toBe(true)
    expect(needsPayment(over({ outcome: 'held' }), NOW)).toBe(true)
    expect(needsPayment(over({ participants: who([true, false]) }), NOW)).toBe(true)
  })

  it('is not a lesson everybody has paid for', () => {
    expect(needsPayment(over({ participants: who([true, true]) }), NOW)).toBe(false)
  })

  it('is not a lesson that did not take place', () => {
    expect(needsPayment(over({ outcome: 'not_held' }), NOW)).toBe(false)
  })

  it('is not a lesson still to come, or going on', () => {
    expect(needsPayment(lesson(), NOW)).toBe(false)
    expect(needsPayment(lesson({ start: at(-0.5), end: at(0.5) }), NOW)).toBe(false)
  })

  it('is not a booking nobody answered', () => {
    expect(needsPayment(over({ status: 'pending' }), NOW)).toBe(false)
  })

  it('is not a lesson with nobody on it', () => {
    expect(needsPayment(over({ participants: [] }), NOW)).toBe(false)
  })
})

describe('matchesStudent', () => {
  const { students } = seedTeacher()
  const both = lesson({
    participants: [
      { studentId: 'st-ana', note: null, paid: false },
      { studentId: 'st-luka', note: null, paid: false },
    ],
  })

  it('matches everything when nothing is typed', () => {
    expect(matchesStudent(both, students, '')).toBe(true)
    expect(matchesStudent(both, students, '   ')).toBe(true)
  })

  it('matches a name or part of one, whoever of the group it is', () => {
    expect(matchesStudent(both, students, 'Ana')).toBe(true)
    expect(matchesStudent(both, students, 'luk')).toBe(true)
    expect(matchesStudent(both, students, 'ilić')).toBe(true)
  })

  it('does not care about case or about diacritics', () => {
    expect(matchesStudent(both, students, 'PETROVIC')).toBe(true)
    expect(matchesStudent(both, students, 'petrović')).toBe(true)
    expect(matchesStudent(both, students, 'ilic')).toBe(true)
  })

  it('wants every word to be somewhere in the names', () => {
    expect(matchesStudent(both, students, 'ana petrovic')).toBe(true)
    expect(matchesStudent(both, students, 'petrovic ana')).toBe(true)
    expect(matchesStudent(both, students, 'ana marko')).toBe(false)
  })

  it('does not match a student who is not on the lesson', () => {
    expect(
      matchesStudent(
        lesson({ participants: [{ studentId: 'st-ana', note: null, paid: false }] }),
        students,
        'Luka',
      ),
    ).toBe(false)
  })

  it('does not match a lesson with nobody on it, once something is typed', () => {
    expect(matchesStudent(lesson({ participants: [] }), students, 'Ana')).toBe(false)
  })

  it('keeps a lesson with nobody on it while nothing is typed', () => {
    expect(matchesStudent(lesson({ participants: [] }), students, '')).toBe(true)
  })
})
