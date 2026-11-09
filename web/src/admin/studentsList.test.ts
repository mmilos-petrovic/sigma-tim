import { describe, expect, it } from 'vitest'
import { groupStudents, matchesPerson } from './studentsList'
import type { AdminStudentRow } from './adminApi'

function record(overrides: Partial<AdminStudentRow> = {}): AdminStudentRow {
  return {
    studentId: 'st-1',
    profileId: 'pr-1',
    firstName: 'Ana',
    lastName: 'Petrović',
    email: 'ana@example.test',
    createdAt: '2026-01-10T10:00:00Z',
    teacherId: 't-1',
    teacherName: 'Marko Jovanović',
    parentNames: ['Mira Petrović'],
    locationNames: ['Zemun'],
    heldLessons: 0,
    upcomingLessons: 0,
    ...overrides,
  }
}

describe('groupStudents', () => {
  it('makes one row of the records of a person who studies with two teachers', () => {
    const people = groupStudents([
      record({ studentId: 'a', teacherName: 'Marko Jovanović' }),
      record({ studentId: 'b', teacherId: 't-2', teacherName: 'Ana Nikolić' }),
    ])
    expect(people).toHaveLength(1)
    expect(people[0].records.map((r) => r.studentId)).toEqual(['a', 'b'])
    expect(people[0].teachers).toEqual(['Ana Nikolić', 'Marko Jovanović'])
  })

  it('keeps people with other profiles apart', () => {
    const people = groupStudents([record(), record({ studentId: 'x', profileId: 'pr-2' })])
    expect(people).toHaveLength(2)
  })

  it('says the person was added the day their first record was', () => {
    const [person] = groupStudents([
      record({ studentId: 'late', createdAt: '2026-03-01T10:00:00Z' }),
      record({ studentId: 'early', createdAt: '2026-01-10T10:00:00Z' }),
    ])
    expect(person.addedAt).toBe('2026-01-10T10:00:00Z')
  })

  it('puts the person added last on top', () => {
    const people = groupStudents([
      record({
        profileId: 'old',
        studentId: 'o',
        lastName: 'Stari',
        createdAt: '2026-01-01T10:00:00Z',
      }),
      record({
        profileId: 'new',
        studentId: 'n',
        lastName: 'Novi',
        createdAt: '2026-05-01T10:00:00Z',
      }),
      record({
        profileId: 'mid',
        studentId: 'm',
        lastName: 'Srednji',
        createdAt: '2026-03-01T10:00:00Z',
      }),
    ])
    expect(people.map((p) => p.profileId)).toEqual(['new', 'mid', 'old'])
  })

  it('puts people added at the same moment in the order of their names', () => {
    const people = groupStudents([
      record({ profileId: 'b', studentId: 'b', lastName: 'Zorić' }),
      record({ profileId: 'a', studentId: 'a', lastName: 'Ćirić' }),
    ])
    expect(people.map((p) => p.lastName)).toEqual(['Ćirić', 'Zorić'])
  })

  it('names every location and every parent once, in order', () => {
    const [person] = groupStudents([
      record({
        studentId: 'a',
        locationNames: ['Zemun', 'Centar'],
        parentNames: ['Zoran Petrović'],
      }),
      record({
        studentId: 'b',
        locationNames: ['Centar', 'Čukarica'],
        parentNames: ['Mira Petrović', 'Zoran Petrović'],
      }),
    ])
    expect(person.locations).toEqual(['Centar', 'Čukarica', 'Zemun'])
    expect(person.parents).toEqual(['Mira Petrović', 'Zoran Petrović'])
  })

  it('says "Bez nastavnika" for a record nobody teaches', () => {
    const [person] = groupStudents([record({ teacherId: null, teacherName: null })])
    expect(person.teachers).toEqual(['Bez nastavnika'])
  })

  it('has nothing for nobody', () => {
    expect(groupStudents([])).toEqual([])
  })
})

describe('matchesPerson', () => {
  const [person] = groupStudents([record()])

  it('matches everything when nothing is typed', () => {
    expect(matchesPerson(person, '')).toBe(true)
    expect(matchesPerson(person, '  ')).toBe(true)
  })

  it('matches a part of the name or of the email', () => {
    expect(matchesPerson(person, 'ana')).toBe(true)
    expect(matchesPerson(person, 'trovi')).toBe(true)
    expect(matchesPerson(person, 'example.test')).toBe(true)
  })

  it('does not mind case or diacritics, and wants every word', () => {
    expect(matchesPerson(person, 'PETROVIC')).toBe(true)
    expect(matchesPerson(person, 'ana petrović')).toBe(true)
    expect(matchesPerson(person, 'ana marko')).toBe(false)
  })

  it('does not search the teachers, the places or the parents', () => {
    expect(matchesPerson(person, 'Jovanović')).toBe(false)
    expect(matchesPerson(person, 'Zemun')).toBe(false)
    expect(matchesPerson(person, 'Mira')).toBe(false)
  })
})
