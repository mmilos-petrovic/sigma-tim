import { describe, expect, it } from 'vitest'
import {
  mapLocation,
  mapSubject,
  mapTakeover,
  mapTeacher,
  nextFreePosition,
  photoPath,
  toAdminError,
} from './supabaseAdminApi'

describe('toAdminError', () => {
  it('keeps the PostgREST and Postgres codes, which the screens translate', () => {
    expect(toAdminError({ code: 'PT409', message: 'slot is already taken' }, 409)).toMatchObject({
      name: 'AdminError',
      code: 'PT409',
      message: 'slot is already taken',
    })
    expect(toAdminError({ code: '23503', message: 'foreign key' }, 409).code).toBe('23503')
    expect(toAdminError({ code: '42501', message: 'denied' }, 403).code).toBe('42501')
  })

  it('recognises a lost connection', () => {
    expect(toAdminError({ message: 'TypeError: Failed to fetch' }, 0).code).toBe('network')
    expect(toAdminError({ message: 'Failed to fetch', code: '' }, 0).code).toBe('network')
    expect(
      toAdminError({ message: 'NetworkError when attempting to fetch resource.' }, 0).code,
    ).toBe('network')
  })

  it('recognises a session the server refuses', () => {
    expect(toAdminError({ code: 'PGRST301', message: 'JWT expired' }, 401).code).toBe('expired')
    expect(toAdminError({ message: 'Unauthorized' }, 401).code).toBe('expired')
  })

  it('has an unknown bucket for the rest', () => {
    expect(toAdminError({ message: 'oops', code: '' }, 500).code).toBe('unknown')
    expect(toAdminError({ message: 'oops' }, 500).code).toBe('unknown')
  })
})

describe('photo helpers', () => {
  it('fills the first free position of three', () => {
    expect(nextFreePosition([])).toBe(1)
    expect(nextFreePosition([1])).toBe(2)
    expect(nextFreePosition([1, 3])).toBe(2)
    expect(nextFreePosition([2, 3])).toBe(1)
    expect(nextFreePosition([1, 2, 3])).toBeNull()
  })

  it('names the object after its location', () => {
    expect(photoPath('loc-1', 'abc')).toBe('loc-1/abc.jpg')
  })
})

describe('row mappers', () => {
  it('maps a subject with its teacher count', () => {
    expect(mapSubject({ id: 's1', name: 'Fizika', teachers: [{ count: 2 }] })).toEqual({
      id: 's1',
      name: 'Fizika',
      teacherCount: 2,
    })
    expect(mapSubject({ id: 's2', name: 'Hemija', teachers: [] }).teacherCount).toBe(0)
  })

  it('maps a teacher, and knows whether they have signed in yet', () => {
    const row = {
      profile_id: 't1',
      is_active: true,
      profile: {
        email: 'ana@example.test',
        first_name: 'Ana',
        last_name: 'Nikolić',
        user_id: null,
      },
      subjects: [{ subject_id: 's1' }, { subject_id: 's2' }],
    }
    expect(mapTeacher(row)).toEqual({
      id: 't1',
      email: 'ana@example.test',
      firstName: 'Ana',
      lastName: 'Nikolić',
      isActive: true,
      hasSignedIn: false,
      subjectIds: ['s1', 's2'],
    })
    expect(mapTeacher({ ...row, profile: { ...row.profile, user_id: 'u1' } }).hasSignedIn).toBe(
      true,
    )
  })

  it('maps a location with its rooms and photos in a sensible order', () => {
    const location = mapLocation({
      id: 'l1',
      name: 'Glavna',
      address: 'Ulica 1',
      rooms: [
        { id: 'r2', name: 'Učionica 2' },
        { id: 'r10', name: 'Učionica 10' },
        { id: 'r1', name: 'Učionica 1' },
      ],
      location_photos: [
        { id: 'p3', storage_path: 'l1/c.jpg', position: 3 },
        { id: 'p1', storage_path: 'l1/a.jpg', position: 1 },
      ],
    })
    expect(location.rooms.map((room) => room.name)).toEqual([
      'Učionica 1',
      'Učionica 2',
      'Učionica 10',
    ])
    expect(location.photos).toEqual([
      { id: 'p1', path: 'l1/a.jpg', position: 1 },
      { id: 'p3', path: 'l1/c.jpg', position: 3 },
    ])
  })

  it('maps a takeover request with names of the student and the teacher', () => {
    expect(
      mapTakeover({
        id: 'q1',
        created_at: '2026-10-26T10:00:00Z',
        student: {
          id: 'st1',
          school: 'OŠ Vuk',
          grade: '7',
          class_section: 'a',
          profile: { first_name: 'Luka', last_name: 'Ilić' },
        },
        teacher: { profile_id: 't1', profile: { first_name: 'Ana', last_name: 'Nikolić' } },
      }),
    ).toEqual({
      id: 'q1',
      createdAt: '2026-10-26T10:00:00Z',
      student: {
        id: 'st1',
        firstName: 'Luka',
        lastName: 'Ilić',
        school: 'OŠ Vuk',
        grade: '7',
        section: 'a',
      },
      teacher: { id: 't1', firstName: 'Ana', lastName: 'Nikolić' },
    })
  })
})
