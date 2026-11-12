import FullCalendar, { type CalendarRef } from '@fullcalendar/react'
import interactionPlugin from '@fullcalendar/react/interaction'
import classicTheme from '@fullcalendar/react/themes/classic'
import timeGridPlugin from '@fullcalendar/react/timegrid'
import '@fullcalendar/react/skeleton.css'
import '@fullcalendar/react/themes/classic/theme.css'
import '@fullcalendar/react/themes/classic/palette.css'
import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { schoolDayStart, SCHOOL_TIME_ZONE } from '../schoolDay'
import { dayHeaderParts } from './dayHeader'
import { toEventInput } from './eventInput'
import type { CalendarItem } from './items'
import { srLatn } from './locale'

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
// The week shows 06:00-23:00. A lesson outside that is scheduled all the same, it is only not drawn here.
export const FIRST_HOUR = '06:00:00'
export const LAST_HOUR = '23:00:00'
// Long enough that scrolling the page does not start a drag, short enough to feel direct.
const LONG_PRESS_MS = 400

// On a phone the week does not fit: always four days, from the day being looked at, and "next" moves four days on.
const WEEK_VIEW = 'timeGridWeek'
const PHONE_VIEW = 'timeGridFourDays'
const PHONE_QUERY = '(max-width: 639px)'

function usePhoneWidth(): boolean {
  return useSyncExternalStore(
    (notify) => {
      const query = window.matchMedia?.(PHONE_QUERY)
      query?.addEventListener('change', notify)
      return () => query?.removeEventListener('change', notify)
    },
    () => window.matchMedia?.(PHONE_QUERY).matches === true,
    () => false,
  )
}

/** A weekly time grid in the school's time zone, with drag and resize in steps of 15 minutes. */
export function WeekCalendar({
  items,
  onRangeChange,
  onOpen,
  onCreate,
  onChangeTime,
  now,
}: WeekCalendarProps) {
  const events = useMemo(() => items.map(toEventInput), [items])
  const phone = usePhoneWidth()
  const calendar = useRef<CalendarRef>(null)

  // Turning the phone, or resizing the window, changes the view and keeps the day that is being looked at.
  useEffect(() => {
    calendar.current?.getApi().changeView(phone ? PHONE_VIEW : WEEK_VIEW)
  }, [phone])

  // Nothing may be moved or created onto a day that is over (the database refuses it anyway).
  const startsToday = (startStr: string) =>
    new Date(startStr).getTime() >= schoolDayStart(now ?? new Date()).getTime()

  return (
    <div className="week-calendar">
      <FullCalendar
        plugins={[classicTheme, timeGridPlugin, interactionPlugin]}
        ref={calendar}
        initialView={phone ? PHONE_VIEW : WEEK_VIEW}
        views={{ [PHONE_VIEW]: { type: 'timeGrid', dayCount: 4, dateIncrement: { days: 4 } } }}
        // the day columns of a phone are too narrow for the default text: the letter of the day and the date, two lines
        dayHeaderContent={
          phone
            ? (info) => {
                const { weekday, date } = dayHeaderParts(info.date)
                return (
                  <div className="cal-day">
                    <strong>{weekday}</strong>
                    <span>{date}</span>
                  </div>
                )
              }
            : undefined
        }
        locale={srLatn}
        timeZone={SCHOOL_TIME_ZONE}
        now={now}
        height="100%"
        // no title (the month and the year): the arrows at the two edges and "Danas" between them
        headerToolbar={{ left: 'prev', center: 'today', right: 'next' }}
        allDaySlot={false}
        nowIndicator
        slotDuration="00:30:00"
        snapDuration={QUARTER}
        slotMinTime={FIRST_HOUR}
        slotMaxTime={LAST_HOUR}
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
