import { describe, expect, it } from 'vitest'
import {
  mapBusy,
  mapConflict,
  mapLesson,
  mapLocation,
  mapStudent,
  mapUnassigned,
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
})

describe('mapUnassigned', () => {
  const row = {
    id: 'st-9',
    school: null,
    grade: '2',
    class_section: 'c',
    profile: { email: 'neda@example.test', first_name: 'Neda', last_name: 'Marković' },
  }

  it('marks the students the teacher has already asked for', () => {
    expect(mapUnassigned(row, new Set(['st-9'])).requested).toBe(true)
    expect(mapUnassigned(row, new Set(['st-1'])).requested).toBe(false)
  })

  it('maps the person and the school details', () => {
    expect(mapUnassigned(row, new Set())).toEqual({
      id: 'st-9',
      email: 'neda@example.test',
      firstName: 'Neda',
      lastName: 'Marković',
      school: null,
      grade: '2',
      section: 'c',
      requested: false,
    })
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
      { student_id: 'st-2', note: null },
      { student_id: 'st-1', note: 'Razlomci' },
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
        { studentId: 'st-2', note: null },
        { studentId: 'st-1', note: 'Razlomci' },
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
