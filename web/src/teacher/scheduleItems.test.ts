import { describe, expect, it } from 'vitest'
import { seedTeacher, TEST_NOW } from '../test/fakeTeacherApi'
import { formatDay, formatRange, formatTime } from './format'
import { COLORS, OWN_COLOR, teacherColor } from './colors'
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
    colleaguesAt: 'l-main',
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
  it('names a lesson by its students and shows the room, without the subject', () => {
    expect(item('les-tomorrow')).toMatchObject({
      title: 'Ana Petrović, Luka Ilić',
      detail: 'Učionica 1',
      variant: 'own',
      color: OWN_COLOR,
    })
  })

  it('shows a lesson without a room by its students alone', () => {
    expect(item('les-locked')).toMatchObject({ title: 'Ana Petrović', detail: '' })
  })

  it('shows a free slot as an offer and a late booking as waiting, with no subject', () => {
    expect(item('slot-open')).toMatchObject({
      title: 'Slobodan termin',
      detail: '',
      variant: 'slot',
    })
    expect(item('booking-pending')).toMatchObject({
      title: 'Na čekanju',
      detail: 'Luka Ilić',
      variant: 'pending',
    })
  })

  it('adds the room to a free slot and to a late booking when they have one', () => {
    const withRoom = (id: string) => ({ ...byId(id), roomId: 'r-1' })
    const [slot, pending] = build({ lessons: [withRoom('slot-open'), withRoom('booking-pending')] })
    expect(slot).toMatchObject({ title: 'Slobodan termin', detail: 'Učionica 1' })
    expect(pending).toMatchObject({ title: 'Na čekanju', detail: 'Luka Ilić · Učionica 1' })
  })

  it('never puts a subject on any card', () => {
    const names = seed.reference.subjects.map((s) => s.name)
    const withRoom = lessons.map((l) => ({ ...l, roomId: 'r-1' }))
    for (const card of build({ lessons: withRoom })) {
      for (const name of names) {
        expect(`${card.title} ${card.detail}`).not.toContain(name)
      }
    }
  })

  it('hides a free slot that has already begun', () => {
    expect(item('slot-expired')).toBeUndefined()
  })

  it('draws a colleague as a block with the person and the room, nothing else', () => {
    const [busy] = build().filter((i) => i.variant === 'busy')
    expect(busy).toMatchObject({
      title: 'Marko Jovanović',
      detail: 'Učionica 1',
      color: teacherColor('t-marko'),
      movable: false,
      resizable: false,
    })
  })

  it('does not write the word "Zauzeto" on a colleague, nor name a colleague it does not know', () => {
    const stranger = build({ busy: [{ ...seed.busy[0], teacherId: 't-gone', roomId: null }] })
    const [busy] = stranger.filter((i) => i.variant === 'busy')
    expect(busy).toMatchObject({ title: 'Drugi nastavnik', detail: '' })
    expect(`${busy.title} ${busy.detail}`).not.toMatch(/Zauzeto/i)
  })

  it("leaves out the teacher's own entries of the busy list", () => {
    const own = [...seed.busy, { ...seed.busy[0], teacherId: 't-ana' }]
    expect(build({ busy: own }).filter((i) => i.variant === 'busy')).toHaveLength(1)
  })

  it('copes with a student or room it does not know', () => {
    const odd = [
      { ...byId('les-today'), roomId: 'r-gone', participants: [{ studentId: 'gone', note: null }] },
    ]
    expect(build({ lessons: odd })[0]).toMatchObject({ title: 'Nepoznat učenik', detail: '' })
  })
})

describe("a teacher's colour", () => {
  const withColor = (color: 'teal' | null) => ({ ...seed.reference, color })
  const cards = (reference = seed.reference) =>
    build({ reference, lessons: lessons.map((l) => ({ ...l, roomId: null })) }).filter(
      (i) => i.variant !== 'busy',
    )

  it('colours every lesson of the teacher with the colour they chose', () => {
    const own = cards(withColor('teal'))
    expect(own.length).toBeGreaterThan(3)
    for (const card of own) expect(card.color).toBe(COLORS.teal.hex)
  })

  it('keeps the blue of the owner while there is no choice', () => {
    for (const card of cards(withColor(null))) expect(card.color).toBe(OWN_COLOR)
  })

  it('draws a colleague in the colour they chose, and in the colour of their id when they chose none', () => {
    const chosen = {
      ...seed.reference,
      colleagues: [{ ...seed.reference.colleagues[0], color: 'wine' as const }],
    }
    const busy = (reference = seed.reference) =>
      build({ reference }).find((i) => i.variant === 'busy')!
    expect(busy(chosen).color).toBe(COLORS.wine.hex)
    expect(busy().color).toBe(teacherColor('t-marko'))
  })

  it('lets two teachers share a colour', () => {
    const same = {
      ...seed.reference,
      color: 'teal' as const,
      colleagues: [{ ...seed.reference.colleagues[0], color: 'teal' as const }],
    }
    const items = build({ reference: same })
    expect(new Set(items.map((i) => i.color))).toEqual(new Set([COLORS.teal.hex]))
  })

  it('draws the blocks of a colleague who is not in the list in the colour of their id', () => {
    const stranger = build({ busy: [{ ...seed.busy[0], teacherId: 't-gone' }] }).find(
      (i) => i.variant === 'busy',
    )!
    expect(stranger.color).toBe(teacherColor('t-gone'))
  })
})

describe('payment', () => {
  it('does not show on the calendar: not in a title, a detail or any other property', () => {
    const paid = lessons.map((l) => ({
      ...l,
      participants: l.participants.map((p) => ({ ...p, paid: true })),
    }))
    const before = JSON.stringify(build())
    const after = JSON.stringify(build({ lessons: paid }))
    expect(after).toBe(before)
    expect(after).not.toMatch(/paid|Plać|plać/)
  })
})

describe('lessons that are over', () => {
  it('are marked as past, so the calendar can draw them lighter than the ones still to come', () => {
    expect(item('les-today')).toMatchObject({ past: true }) // ended at 09:00, now is 11:00
    expect(item('les-locked')).toMatchObject({ past: true })
    expect(item('les-tomorrow')).toMatchObject({ past: false })
  })

  it('count as past from the moment they end, not before', () => {
    const lesson = (end: string) => [{ ...byId('les-today'), end }]
    const endsAt = (end: string) =>
      build({ lessons: lesson(end), now: new Date('2026-11-04T09:00:00Z') })[0]
    expect(endsAt('2026-11-04T09:00:00Z')).toMatchObject({ past: true })
    expect(endsAt('2026-11-04T09:15:00Z')).toMatchObject({ past: false })
  })

  it('mark one that was not held, so it can be crossed out', () => {
    const notHeld = [{ ...byId('les-locked'), outcome: 'not_held' as const }]
    expect(build({ lessons: notHeld })[0]).toMatchObject({ past: true, notHeld: true })
    expect(item('les-locked')).toMatchObject({ notHeld: false })
  })

  it('leave free slots, waiting bookings and the colleagues’ blocks as they are', () => {
    expect(item('slot-open')).not.toHaveProperty('past')
    expect(item('booking-pending')).not.toHaveProperty('past')
    const colleague = build().find((i) => i.variant === 'busy')!
    expect(colleague).not.toHaveProperty('past')
  })
})

describe('the location of the colleagues', () => {
  const atZemun = (id: string) => ({ ...byId(id), locationId: 'l-zemun', roomId: null })
  const mixed = [byId('les-tomorrow'), atZemun('les-today')]
  const busyMixed = [seed.busy[0], { ...seed.busy[0], locationId: 'l-zemun', roomId: null }]
  const ids = (items: { id: string }[]) => items.map((i) => i.id).sort()
  type Shown = { variant: string; detail?: string }
  const own = (items: Shown[]) => items.filter((i) => i.variant !== 'busy')
  const busy = (items: Shown[]) => items.filter((i) => i.variant === 'busy')

  it('always shows every own lesson, wherever it is', () => {
    for (const colleaguesAt of ['l-main', 'l-zemun', 'l-elsewhere', null]) {
      const items = build({ lessons: mixed, busy: [], colleaguesAt })
      expect(ids(items)).toEqual(['les-today', 'les-tomorrow'])
    }
  })

  it('always shows own free slots and waiting bookings, wherever they are', () => {
    const slots = [
      atZemun('slot-open'),
      byId('slot-open'),
      atZemun('booking-pending'),
      byId('booking-pending'),
    ].map((l, i) => ({ ...l, id: `${l.id}-${i}` }))
    for (const colleaguesAt of ['l-main', 'l-zemun']) {
      expect(build({ lessons: slots, busy: [], colleaguesAt })).toHaveLength(4)
    }
  })

  it('shows the colleagues who are busy at the chosen location only', () => {
    const main = build({ lessons: [], busy: busyMixed, colleaguesAt: 'l-main' })
    expect(busy(main)).toHaveLength(1)
    expect(busy(main)[0].detail).toBe('Učionica 1')

    const zemun = build({ lessons: [], busy: busyMixed, colleaguesAt: 'l-zemun' })
    expect(busy(zemun)).toHaveLength(1)
    expect(busy(zemun)[0].detail).toBe('')
  })

  it('shows a colleague at another location to nobody, also with all of the own lessons there', () => {
    const items = build({ lessons: mixed, busy: busyMixed, colleaguesAt: 'l-elsewhere' })
    expect(busy(items)).toEqual([])
    expect(own(items)).toHaveLength(2)
  })

  it('shows no colleague at all when there is no location to look at', () => {
    expect(busy(build({ lessons: mixed, busy: busyMixed, colleaguesAt: null }))).toEqual([])
    expect(own(build({ lessons: mixed, busy: busyMixed, colleaguesAt: null }))).toHaveLength(2)
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
