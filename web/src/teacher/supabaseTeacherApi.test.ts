import { describe, expect, it } from 'vitest'
import {
  mapBusy,
  mapConflict,
  mapLesson,
  mapLocation,
  mapMyCv,
  mapPhones,
  mapReference,
  mapStudent,
} from './supabaseTeacherApi'

const person = (id: string, first: string, last: string, userId: string | null = null) => ({
  id,
  email: `${first.toLowerCase()}@example.test`,
  first_name: first,
  last_name: last,
  user_id: userId,
})

describe('mapStudent', () => {
  const row = {
    id: 'st-1',
    school: 'OŠ Vuk Karadžić',
    grade: '7',
    class_section: 'a',
    profile: person('pr-1', 'Ana', 'Petrović', 'u-1'),
    parent_links: [
      { parent: { profile: person('pr-3', 'Zoran', 'Petrović') } },
      { parent: { profile: person('pr-2', 'Mira', 'Petrović', 'u-2') } },
    ],
  }

  it('maps the student, the person behind them and whether they have signed in', () => {
    expect(mapStudent(row)).toMatchObject({
      id: 'st-1',
      profileId: 'pr-1',
      email: 'ana@example.test',
      firstName: 'Ana',
      lastName: 'Petrović',
      hasSignedIn: true,
      school: 'OŠ Vuk Karadžić',
      grade: '7',
      section: 'a',
    })
  })

  it('lists the parents by name, with their own sign-in state', () => {
    const { parents } = mapStudent(row)
    expect(parents.map((p) => [p.id, p.firstName, p.hasSignedIn])).toEqual([
      ['pr-2', 'Mira', true],
      ['pr-3', 'Zoran', false],
    ])
  })

  it('skips a link whose parent the database did not show', () => {
    expect(mapStudent({ ...row, parent_links: [{ parent: null }] }).parents).toEqual([])
  })

  it('keeps missing school details as null', () => {
    const mapped = mapStudent({ ...row, school: null, grade: null, class_section: null })
    expect([mapped.school, mapped.grade, mapped.section]).toEqual([null, null, null])
  })

  it('gives the student and the parents the numbers the database showed, and null for the rest', () => {
    const phones = mapPhones([
      { profile_id: 'pr-1', phone: '+381641234567' },
      { profile_id: 'pr-2', phone: '+381651234567' },
    ])
    const mapped = mapStudent(row, phones)
    expect(mapped.phone).toBe('+381641234567')
    expect(mapped.parents.map((p) => [p.id, p.phone])).toEqual([
      ['pr-2', '+381651234567'],
      ['pr-3', null],
    ])
  })

  it('has no number for anybody when the database showed none', () => {
    const mapped = mapStudent(row)
    expect(mapped.phone).toBeNull()
    expect(mapped.parents.every((p) => p.phone === null)).toBe(true)
  })
})

describe('mapPhones', () => {
  it('maps the rows by the profile they belong to', () => {
    const phones = mapPhones([
      { profile_id: 'a', phone: '+381641111111' },
      { profile_id: 'b', phone: '+381642222222' },
    ])
    expect(phones.get('a')).toBe('+381641111111')
    expect(phones.get('b')).toBe('+381642222222')
    expect(phones.get('c')).toBeUndefined()
  })

  it('copes with no rows', () => {
    expect(mapPhones([]).size).toBe(0)
  })
})

describe('mapLesson', () => {
  const row = {
    id: 'les-1',
    subject_id: 's-mat',
    location_id: 'l-main',
    room_id: 'r-1',
    start_at: '2026-11-05T15:00:00+00:00',
    end_at: '2026-11-05T16:00:00+00:00',
    status: 'confirmed' as const,
    origin: 'teacher' as const,
    outcome: null,
    participants: [
      { student_id: 'st-2', note: null, paid_at: null },
      { student_id: 'st-1', note: 'Razlomci', paid_at: '2026-11-06T09:00:00+00:00' },
    ],
  }

  it('maps a lesson with its participants and their notes', () => {
    expect(mapLesson(row)).toEqual({
      id: 'les-1',
      subjectId: 's-mat',
      locationId: 'l-main',
      roomId: 'r-1',
      start: '2026-11-05T15:00:00.000Z',
      end: '2026-11-05T16:00:00.000Z',
      status: 'confirmed',
      origin: 'teacher',
      outcome: null,
      participants: [
        { studentId: 'st-2', note: null, paid: false },
        { studentId: 'st-1', note: 'Razlomci', paid: true },
      ],
    })
  })

  it('keeps a missing room as null and a free slot without participants', () => {
    const slot = mapLesson({
      ...row,
      room_id: null,
      status: 'open',
      origin: 'slot',
      participants: [],
    })
    expect(slot.roomId).toBeNull()
    expect(slot.participants).toEqual([])
  })

  it('normalises the timestamps the database sends to ISO instants', () => {
    expect(mapLesson({ ...row, start_at: '2026-11-05T16:00:00+01:00' }).start).toBe(
      '2026-11-05T15:00:00.000Z',
    )
  })
})

describe('busy times and conflicts', () => {
  it('maps the block of a colleague with no more than when, where and whose', () => {
    expect(
      mapBusy({
        teacher_id: 't-marko',
        location_id: 'l-main',
        room_id: null,
        start_at: '2026-11-05T15:30:00+00:00',
        end_at: '2026-11-05T16:30:00+00:00',
      }),
    ).toEqual({
      teacherId: 't-marko',
      locationId: 'l-main',
      roomId: null,
      start: '2026-11-05T15:30:00.000Z',
      end: '2026-11-05T16:30:00.000Z',
    })
  })

  it('maps a conflict', () => {
    expect(
      mapConflict({
        teacher_id: 't-1',
        location_id: 'l-main',
        room_id: 'r-1',
        start_at: '2026-11-05T15:00:00+00:00',
        end_at: '2026-11-05T16:00:00+00:00',
        same_teacher: true,
        same_room: false,
      }),
    ).toEqual({
      teacherId: 't-1',
      roomId: 'r-1',
      start: '2026-11-05T15:00:00.000Z',
      end: '2026-11-05T16:00:00.000Z',
      sameTeacher: true,
      sameRoom: false,
    })
  })
})

describe('mapLocation', () => {
  it('sorts rooms the way a person counts: Učionica 2 before Učionica 10', () => {
    const mapped = mapLocation({
      id: 'l-1',
      name: 'Glavna',
      rooms: [
        { id: 'r-10', name: 'Učionica 10' },
        { id: 'r-2', name: 'Učionica 2' },
      ],
    })
    expect(mapped.rooms.map((room) => room.name)).toEqual(['Učionica 2', 'Učionica 10'])
  })
})

describe('mapReference', () => {
  const teachers = [
    { profile_id: 't-me', color: 'teal', profile: { first_name: 'Ana', last_name: 'Nikolić' } },
    { profile_id: 't-b', color: 'wine', profile: { first_name: 'Marko', last_name: 'Jovanović' } },
    { profile_id: 't-a', color: null, profile: { first_name: 'Dragan', last_name: 'Adamović' } },
  ]
  const input = {
    teacherId: 't-me',
    subjects: [
      { subject: { id: 's-2', name: 'Fizika' } },
      { subject: { id: 's-1', name: 'Hemija' } },
    ],
    locations: [
      { id: 'l-2', name: 'Zemun', rooms: [] },
      { id: 'l-1', name: 'Glavna', rooms: [{ id: 'r-1', name: 'Učionica 1' }] },
    ],
    ownLocationIds: ['l-2'],
    teachers,
  }

  it('keeps every location, and says which of them the teacher may use', () => {
    const mapped = mapReference(input)
    expect(mapped.locations.map((l) => l.id)).toEqual(['l-1', 'l-2'])
    expect(mapped.ownLocationIds).toEqual(['l-2'])
  })

  it('takes the colour of the teacher from their own row, and the colleagues’ from theirs', () => {
    const mapped = mapReference(input)
    expect(mapped.color).toBe('teal')
    expect(mapped.colleagues.map((c) => [c.id, c.color])).toEqual([
      ['t-a', null],
      ['t-b', 'wine'],
    ])
  })

  it('lists the colleagues by name, without the teacher themselves', () => {
    expect(mapReference(input).colleagues.map((c) => c.lastName)).toEqual(['Adamović', 'Jovanović'])
  })

  it('treats a colour it does not know as no choice', () => {
    const odd = teachers.map((t) => ({
      ...t,
      color: t.profile_id === 't-b' ? 'chartreuse' : t.color,
    }))
    expect(
      mapReference({ ...input, teachers: odd }).colleagues.find((c) => c.id === 't-b')?.color,
    ).toBeNull()
    expect(
      mapReference({ ...input, teachers: odd.map((t) => ({ ...t, color: 'chartreuse' })) }).color,
    ).toBeNull()
  })

  it('sorts the subjects by name and keeps what the teacher has no subjects for empty', () => {
    expect(mapReference(input).subjects.map((s) => s.name)).toEqual(['Fizika', 'Hemija'])
    expect(mapReference({ ...input, subjects: [] }).subjects).toEqual([])
  })
})

describe('mapMyCv', () => {
  const row = {
    slug: 'petar-petrovic',
    about: 'Predajem.',
    photo_path: 'p-1/f.jpg',
    show_public: true,
    show_members: false,
    experience: [
      { employer: 'B', position: 'Drugo', period: null, description: null, sort_order: 2 },
      { employer: 'A', position: 'Prvo', period: '2020', description: 'Opis', sort_order: 1 },
    ],
    education: [{ institution: 'Fakultet', degree: null, period: null, sort_order: 1 }],
    skills: [
      { skill: 'Druga', sort_order: 2 },
      { skill: 'Prva', sort_order: 1 },
    ],
  }

  it('keeps the order the teacher put the lists in', () => {
    const cv = mapMyCv(row)
    expect(cv.experience.map((e) => e.employer)).toEqual(['A', 'B'])
    expect(cv.skills).toEqual(['Prva', 'Druga'])
  })

  it('turns a missing text into an empty one, which the editor shows as an empty field', () => {
    const cv = mapMyCv({ ...row, about: null })
    expect(cv.about).toBe('')
    expect(cv.experience[1]).toEqual({
      employer: 'B',
      position: 'Drugo',
      period: '',
      description: '',
    })
    expect(cv.education[0]).toEqual({ institution: 'Fakultet', degree: '', period: '' })
  })

  it('carries the link, the photo and the two switches as they are', () => {
    expect(mapMyCv(row)).toMatchObject({
      slug: 'petar-petrovic',
      photoPath: 'p-1/f.jpg',
      showPublic: true,
      showMembers: false,
    })
  })

  it('does not change the rows it was given', () => {
    const before = JSON.stringify(row)
    mapMyCv(row)
    expect(JSON.stringify(row)).toBe(before)
  })
})
