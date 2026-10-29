import FullCalendar from '@fullcalendar/react'
import interactionPlugin from '@fullcalendar/react/interaction'
import classicTheme from '@fullcalendar/react/themes/classic'
import timeGridPlugin from '@fullcalendar/react/timegrid'
import '@fullcalendar/react/skeleton.css'
import '@fullcalendar/react/themes/classic/theme.css'
import '@fullcalendar/react/themes/classic/palette.css'
import { useMemo } from 'react'
import { schoolDayStart, SCHOOL_TIME_ZONE } from '../schoolDay'
import { srLatn } from './locale'

/** What the calendar shows: one block of time. The page decides what each block means and whether it may be moved. */
export interface CalendarItem {
  id: string
  /** ISO 8601 instants. */
  start: string
  end: string
  title: string
  /** A second line, for example the students or the teacher. */
  detail?: string
  /** Background of the block. */
  color: string
  /** Style hook: `own`, `busy` (a colleague's lesson, no details), `slot`, `pending`... */
  variant: string
  movable: boolean
  resizable: boolean
}

export interface TimeRange {
  start: string
  end: string
}

export interface WeekCalendarProps {
  items: CalendarItem[]
  /** The visible week changed (also called for the first one). */
  onRangeChange: (range: TimeRange) => void
  onOpen: (id: string) => void
  /** An empty stretch of time was selected. */
  onCreate: (range: TimeRange) => void
  /** A block was dragged or resized. Reject to put it back where it was. */
  onChangeTime: (id: string, range: TimeRange) => Promise<void>
  /** For tests: the moment that counts as "now". */
  now?: Date
}

const QUARTER = '00:15:00'
// Long enough that scrolling the page does not start a drag, short enough to feel direct.
const LONG_PRESS_MS = 400

/** A weekly time grid in the school's time zone, with drag and resize in steps of 15 minutes. */
export function WeekCalendar({
  items,
  onRangeChange,
  onOpen,
  onCreate,
  onChangeTime,
  now,
}: WeekCalendarProps) {
  const events = useMemo(
    () =>
      items.map((item) => ({
        id: item.id,
        start: item.start,
        end: item.end,
        title: item.title,
        backgroundColor: item.color,
        borderColor: item.color,
        className: `cal-item cal-item--${item.variant}`,
        startEditable: item.movable,
        durationEditable: item.resizable,
        extendedProps: { detail: item.detail, variant: item.variant },
      })),
    [items],
  )

  // Nothing may be moved or created onto a day that is over (the database refuses it anyway).
  const startsToday = (startStr: string) =>
    new Date(startStr).getTime() >= schoolDayStart(now ?? new Date()).getTime()

  return (
    <div className="week-calendar">
      <FullCalendar
        plugins={[classicTheme, timeGridPlugin, interactionPlugin]}
        initialView="timeGridWeek"
        locale={srLatn}
        timeZone={SCHOOL_TIME_ZONE}
        now={now}
        height="100%"
        headerToolbar={{ left: 'prev,next today', center: 'title', right: '' }}
        allDaySlot={false}
        nowIndicator
        slotDuration="00:30:00"
        snapDuration={QUARTER}
        slotMinTime="00:00:00"
        slotMaxTime="24:00:00"
        scrollTime="07:00:00"
        expandRows
        slotEventOverlap={false}
        editable
        selectable
        selectMirror
        longPressDelay={LONG_PRESS_MS}
        eventLongPressDelay={LONG_PRESS_MS}
        selectLongPressDelay={LONG_PRESS_MS}
        events={events}
        eventContent={(arg) => (
          <div className="cal-item__body">
            <span className="cal-item__time">{arg.timeText}</span>
            <strong className="cal-item__title">{arg.event.title}</strong>
            {arg.event.extendedProps.detail ? (
              <span className="cal-item__detail">{String(arg.event.extendedProps.detail)}</span>
            ) : null}
          </div>
        )}
        datesSet={(info) => onRangeChange({ start: info.startStr, end: info.endStr })}
        eventClick={(info) => onOpen(info.event.id)}
        select={(info) => onCreate({ start: info.startStr, end: info.endStr })}
        selectAllow={(span) => startsToday(span.startStr)}
        eventAllow={(span) => startsToday(span.startStr)}
        eventDrop={(info) => {
          onChangeTime(info.event.id, { start: info.event.startStr, end: info.event.endStr }).catch(
            () => info.revert(),
          )
        }}
        eventResize={(info) => {
          onChangeTime(info.event.id, { start: info.event.startStr, end: info.event.endStr }).catch(
            () => info.revert(),
          )
        }}
      />
    </div>
  )
}
