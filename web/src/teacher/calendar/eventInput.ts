import type { CalendarItem } from './items'

/** What FullCalendar is given for a block of the calendar. */
export function toEventInput(item: CalendarItem) {
  return {
    id: item.id,
    start: item.start,
    end: item.end,
    title: item.title,
    // FullCalendar 7 draws an event with its `color` (a CSS variable under the hood); a `backgroundColor` is ignored
    color: item.color,
    contrastColor: '#ffffff',
    className: [
      'cal-item',
      `cal-item--${item.variant}`,
      item.past && 'cal-item--past',
      item.notHeld && 'cal-item--not-held',
    ]
      .filter(Boolean)
      .join(' '),
    startEditable: item.movable,
    durationEditable: item.resizable,
    extendedProps: { detail: item.detail, variant: item.variant },
  }
}
