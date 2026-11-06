import { describe, expect, it } from 'vitest'
import { toEventInput } from './eventInput'
import type { CalendarItem } from './items'

const item: CalendarItem = {
  id: 'les-1',
  start: '2026-11-05T15:00:00Z',
  end: '2026-11-05T16:00:00Z',
  title: 'Ana Petrović',
  detail: 'Učionica 1',
  color: '#006a6a',
  variant: 'own',
  movable: true,
  resizable: false,
}

describe('what the calendar is given for a block', () => {
  it('colours it with `color`, the only property FullCalendar 7 draws an event with, and white text', () => {
    const input = toEventInput(item)
    expect(input).toMatchObject({ color: '#006a6a', contrastColor: '#ffffff' })
    // a backgroundColor or borderColor would be silently ignored: the block would stay the default blue
    expect(input).not.toHaveProperty('backgroundColor')
    expect(input).not.toHaveProperty('borderColor')
  })

  it('passes on what the block says, whether it may be moved, and its kind for the style', () => {
    expect(toEventInput(item)).toMatchObject({
      id: 'les-1',
      title: 'Ana Petrović',
      startEditable: true,
      durationEditable: false,
      className: 'cal-item cal-item--own',
      extendedProps: { detail: 'Učionica 1', variant: 'own' },
    })
  })
})
