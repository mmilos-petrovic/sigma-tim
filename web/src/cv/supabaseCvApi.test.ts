import { describe, expect, it } from 'vitest'
import { mapCv, mapSummary } from './supabaseCvApi'

describe('mapSummary', () => {
  it('maps a line of the list of CVs', () => {
    expect(
      mapSummary({
        slug: 'ana-anic',
        first_name: 'Ana',
        last_name: 'Anić',
        about: 'Tekst',
        photo_path: 'p/f.jpg',
        subjects: ['Fizika', 'Matematika'],
      }),
    ).toEqual({
      slug: 'ana-anic',
      firstName: 'Ana',
      lastName: 'Anić',
      about: 'Tekst',
      photoPath: 'p/f.jpg',
      subjects: ['Fizika', 'Matematika'],
    })
  })

  it('has no subjects when the database sent none', () => {
    expect(
      mapSummary({
        slug: 'a',
        first_name: 'A',
        last_name: 'B',
        about: null,
        photo_path: null,
        subjects: null,
      }).subjects,
    ).toEqual([])
  })
})

describe('mapCv', () => {
  const json = {
    slug: 'ana-anic',
    first_name: 'Ana',
    last_name: 'Anić',
    about: 'Tekst',
    photo_path: null,
    subjects: ['Fizika'],
    experience: [{ employer: 'Škola', position: 'Nastavnik', period: '2020', description: null }],
    education: [{ institution: 'Fakultet', degree: 'Master', period: null }],
    skills: ['Strpljenje'],
  }

  it('maps a whole CV', () => {
    expect(mapCv(json)).toEqual({
      slug: 'ana-anic',
      firstName: 'Ana',
      lastName: 'Anić',
      about: 'Tekst',
      photoPath: null,
      subjects: ['Fizika'],
      experience: [{ employer: 'Škola', position: 'Nastavnik', period: '2020', description: null }],
      education: [{ institution: 'Fakultet', degree: 'Master', period: null }],
      skills: ['Strpljenje'],
    })
  })

  it('is nothing when there is no CV for the reader', () => {
    expect(mapCv(null)).toBeNull()
    expect(mapCv(undefined)).toBeNull()
    expect(mapCv('text')).toBeNull()
  })

  it('treats a list that is missing or not a list as empty', () => {
    const cv = mapCv({ ...json, experience: 'x', education: undefined, skills: null, subjects: {} })
    expect(cv).toMatchObject({ experience: [], education: [], skills: [], subjects: [] })
  })

  it('leaves out skills and subjects that are not texts', () => {
    expect(mapCv({ ...json, skills: ['Dobra', 5, null], subjects: [1, 'Fizika'] })).toMatchObject({
      skills: ['Dobra'],
      subjects: ['Fizika'],
    })
  })
})
