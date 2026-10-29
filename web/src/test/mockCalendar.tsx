/* eslint-disable react-refresh/only-export-components */
import { useEffect } from 'react'
import type { WeekCalendarProps } from '../teacher/calendar/WeekCalendar'

/** The first visible week in the tests: Monday 2 to Monday 9 November 2026 on the Belgrade clock. */
export const TEST_WEEK = { start: '2026-11-01T23:00:00.000Z', end: '2026-11-08T23:00:00.000Z' }

let latest: WeekCalendarProps | null = null

/** The props the page gave the calendar last: tests call its callbacks like a drag or a click would. */
export const calendar = (): WeekCalendarProps => {
  if (!latest) throw new Error('the calendar has not been rendered')
  return latest
}

/** Stands in for the real calendar (drag and drop is checked in the browser): every block is a button. */
export function WeekCalendar(props: WeekCalendarProps) {
  const { onRangeChange } = props
  useEffect(() => {
    latest = props
  })
  useEffect(() => {
    onRangeChange(TEST_WEEK)
  }, [onRangeChange])

  return (
    <div role="region" aria-label="Kalendar">
      {props.items.map((item) => (
        <button
          key={item.id}
          type="button"
          data-variant={item.variant}
          data-movable={item.movable}
          data-resizable={item.resizable}
          onClick={() => props.onOpen(item.id)}
        >
          {item.title}
          {item.detail ? ` – ${item.detail}` : ''}
        </button>
      ))}
    </div>
  )
}
