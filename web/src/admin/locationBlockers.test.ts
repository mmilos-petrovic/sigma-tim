import { describe, expect, it } from 'vitest'
import { parseLocationBlockers, STATUS_LABEL } from './locationBlockers'

const lesson = (id: string, status = 'confirmed') => ({
  id,
  location_id: 'l-main',
  start_at: '2026-11-11T15:00:00+00:00',
  end_at: '2026-11-11T16:00:00+00:00',
  status,
})

describe('what the database says about lessons that stop a location from being taken away', () => {
  it('reads the total and the lessons, as instants and statuses', () => {
    const parsed = parseLocationBlockers(
      JSON.stringify({ total: 2, lessons: [lesson('a'), lesson('b', 'open')] }),
    )
    expect(parsed).toEqual({
      total: 2,
      lessons: [
        {
          id: 'a',
          locationId: 'l-main',
          start: '2026-11-11T15:00:00.000Z',
          end: '2026-11-11T16:00:00.000Z',
          status: 'confirmed',
        },
        {
          id: 'b',
          locationId: 'l-main',
          start: '2026-11-11T15:00:00.000Z',
          end: '2026-11-11T16:00:00.000Z',
          status: 'open',
        },
      ],
    })
  })

  it('knows when there are more than it lists', () => {
    const parsed = parseLocationBlockers(JSON.stringify({ total: 25, lessons: [lesson('a')] }))
    expect(parsed?.total).toBe(25)
    expect(parsed?.lessons).toHaveLength(1)
  })

  it('is nothing at all when there is no detail, or it is not what it expects', () => {
    expect(parseLocationBlockers(undefined)).toBeNull()
    expect(parseLocationBlockers('')).toBeNull()
    expect(parseLocationBlockers('not json')).toBeNull()
    expect(parseLocationBlockers('[]')).toBeNull()
    expect(parseLocationBlockers(JSON.stringify({ total: 'many', lessons: [] }))).toBeNull()
    expect(parseLocationBlockers(JSON.stringify({ total: 1, lessons: 'x' }))).toBeNull()
    expect(parseLocationBlockers(JSON.stringify({ total: 1, lessons: [{ id: 'a' }] }))).toBeNull()
    expect(
      parseLocationBlockers(JSON.stringify({ total: 1, lessons: [lesson('a', 'weird')] })),
    ).toBeNull()
    expect(
      parseLocationBlockers(
        JSON.stringify({ total: 1, lessons: [{ ...lesson('a'), start_at: 'tomorrow' }] }),
      ),
    ).toBeNull()
  })

  it('has a Serbian word for each kind of entry', () => {
    expect(STATUS_LABEL).toEqual({
      open: 'slobodan termin',
      pending: 'zahtev na čekanju',
      confirmed: 'čas',
    })
  })
})
