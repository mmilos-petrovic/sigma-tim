import { describe, expect, it } from 'vitest'
import { seedTeacher, TEST_NOW } from '../test/fakeTeacherApi'
import { formatDay, formatRange, formatTime } from './format'
import { OWN_COLOR, teacherColor } from './colors'
import { buildItems, describeConflict, lessonState } from './scheduleItems'

const seed = seedTeacher()
const lessons = seed.lessons
const byId = (id: string) => lessons.find((l) => l.id === id)!
const build = (overrides = {}) =>
  buildItems({
    lessons,
    busy: seed.busy,
    students: seed.students,
    reference: seed.reference,
    teacherId: 't-ana',
    now: TEST_NOW,
    ...overrides,
  })
const item = (id: string) => build().find((i) => i.id === id)

describe('formatting in the school time zone', () => {
  it('writes day, time and range the way a Serbian calendar does', () => {
    expect(formatTime('2026-11-04T07:00:00Z')).toBe('08:00')
    expect(formatDay('2026-11-04T07:00:00Z')).toBe('sre, 4. novembar')
    expect(formatRange('2026-11-04T07:00:00Z', '2026-11-04T08:30:00Z')).toBe('08:00–09:30')
  })

  it('uses the Belgrade day even when UTC is still the day before', () => {
    expect(formatDay('2026-11-04T23:30:00Z')).toBe('čet, 5. novembar')
  })
})

describe('colours', () => {
  it('gives every teacher one stable colour, and the owner a colour of their own', () => {
    expect(teacherColor('t-marko')).toBe(teacherColor('t-marko'))
    expect(teacherColor('t-marko')).not.toBe(OWN_COLOR)
    const colours = new Set(['t-1', 't-2', 't-3', 't-4', 't-5', 't-6'].map(teacherColor))
    expect(colours.size).toBeGreaterThan(3)
  })
})

describe('what the calendar shows', () => {
  it('names a lesson by its subject and lists the students and the room', () => {
    expect(item('les-tomorrow')).toMatchObject({
      title: 'Fizika',
      detail: 'Ana Petrović, Luka Ilić · Učionica 1',
      variant: 'own',
      color: OWN_COLOR,
    })
  })

  it('shows a free slot as an offer and a late booking as waiting', () => {
    expect(item('slot-open')).toMatchObject({ title: 'Slobodan termin', variant: 'slot' })
    expect(item('booking-pending')).toMatchObject({ title: 'Na čekanju', variant: 'pending' })
    expect(item('booking-pending')!.detail).toContain('Luka Ilić')
  })

  it('hides a free slot that has already begun', () => {
    expect(item('slot-expired')).toBeUndefined()
  })

  it('draws a colleague as a block with the person and the room, nothing else', () => {
    const [busy] = build().filter((i) => i.variant === 'busy')
    expect(busy).toMatchObject({
      title: 'Zauzeto',
      detail: 'Marko Jovanović · Učionica 1',
      color: teacherColor('t-marko'),
      movable: false,
      resizable: false,
    })
  })

  it("leaves out the teacher's own entries of the busy list", () => {
    const own = [...seed.busy, { ...seed.busy[0], teacherId: 't-ana' }]
    expect(build({ busy: own }).filter((i) => i.variant === 'busy')).toHaveLength(1)
  })

  it('copes with a student or room it does not know', () => {
    const odd = [
      { ...byId('les-today'), roomId: 'r-gone', participants: [{ studentId: 'gone', note: null }] },
    ]
    expect(build({ lessons: odd })[0].detail).toBeTruthy()
  })
})

describe('what may be moved', () => {
  it('lets a lesson of today move and resize, even though it is over', () => {
    expect(item('les-today')).toMatchObject({ movable: true, resizable: true })
  })

  it('freezes a lesson whose day is over or that has an outcome', () => {
    expect(item('les-locked')).toMatchObject({ movable: false, resizable: false })
    const held = [{ ...byId('les-tomorrow'), outcome: 'held' as const }]
    expect(build({ lessons: held })[0]).toMatchObject({ movable: false, resizable: false })
  })

  it('moves a free slot but keeps its length, and never moves a booking that waits for an answer', () => {
    expect(item('slot-open')).toMatchObject({ movable: true, resizable: false })
    expect(item('booking-pending')).toMatchObject({ movable: false, resizable: false })
  })

  it('moves a booked slot but keeps its length', () => {
    const booked = [
      {
        ...byId('slot-open'),
        status: 'confirmed' as const,
        participants: byId('les-today').participants,
      },
    ]
    expect(build({ lessons: booked })[0]).toMatchObject({ movable: true, resizable: false })
  })
})

describe('the state of a lesson', () => {
  it('knows whether it started, ended, is locked, and what can still be done', () => {
    expect(lessonState(byId('les-tomorrow'), TEST_NOW)).toMatchObject({
      started: false,
      ended: false,
      locked: false,
      canEditPlaceAndTime: true,
      canCancel: true,
      canRecordOutcome: false,
    })
    expect(lessonState(byId('les-today'), TEST_NOW)).toMatchObject({
      started: true,
      ended: true,
      locked: false,
      canEditPlaceAndTime: true,
      canCancel: false,
      canRecordOutcome: true,
    })
    expect(lessonState(byId('les-locked'), TEST_NOW)).toMatchObject({
      locked: true,
      canEditPlaceAndTime: false,
      canCancel: false,
      canRecordOutcome: true, // the outcome stays editable
    })
  })

  it('does not offer an outcome for a free slot or a booking that waits', () => {
    expect(lessonState(byId('slot-open'), TEST_NOW).canRecordOutcome).toBe(false)
    expect(lessonState(byId('booking-pending'), TEST_NOW).canRecordOutcome).toBe(false)
  })
})

describe('describing a conflict', () => {
  const conflict = {
    teacherId: 't-ana',
    roomId: 'r-1',
    start: '2026-11-05T15:00:00Z',
    end: '2026-11-05T16:00:00Z',
    sameTeacher: true,
    sameRoom: true,
  }

  it('says whose time and which room', () => {
    expect(describeConflict(conflict, 't-ana', seed.reference)).toBe(
      'Već imate čas u to vreme (16:00–17:00) u istoj učionici (Učionica 1).',
    )
    expect(describeConflict({ ...conflict, sameRoom: false }, 't-ana', seed.reference)).toBe(
      'Već imate čas u to vreme (16:00–17:00).',
    )
    expect(
      describeConflict(
        { ...conflict, teacherId: 't-marko', sameTeacher: false },
        't-ana',
        seed.reference,
      ),
    ).toBe('Učionica (Učionica 1) je u to vreme (16:00–17:00) zauzeta: nastavnik Marko Jovanović.')
  })
})
