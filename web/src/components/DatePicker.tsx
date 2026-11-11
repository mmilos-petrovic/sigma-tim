import { useEffect, useRef, useState } from 'react'
import { MONTH_NAMES, monthGrid, shiftMonth, WEEKDAY_LETTERS, yearAndMonth } from '../lib/monthGrid'
import { toWallClock } from '../teacher/schoolDay'

/**
 * A month to choose a day from, Monday first. It opens below the date field and pushes the rest of the form down, so
 * it never hides behind the edge of a dialog on a phone. Escape closes only the picker, not the dialog around it.
 */
export function DatePicker({
  value,
  onPick,
  onClose,
}: {
  /** `2026-11-09`, or empty: then the month of today is shown. */
  value: string
  onPick: (value: string) => void
  onClose: () => void
}) {
  const today = toWallClock(new Date()).date
  const [shown, setShown] = useState(() => yearAndMonth(value) ?? yearAndMonth(today)!)
  const root = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  })

  useEffect(() => {
    // the keyboard starts on the chosen day, else on today, when this month has it
    root.current
      ?.querySelector<HTMLElement>('[aria-pressed="true"], [data-today="true"]')
      ?.focus({ preventScroll: true })
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      // in the capture phase, before the dialog's own handler closes the whole form
      event.stopPropagation()
      closeRef.current()
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [])

  return (
    <div className="date-picker" role="group" aria-label="Izbor dana" ref={root}>
      <div className="date-picker__head">
        <button
          type="button"
          className="button button--secondary"
          aria-label="Prethodni mesec"
          onClick={() => setShown((at) => shiftMonth(at, -1))}
        >
          ‹
        </button>
        <strong aria-live="polite">
          {MONTH_NAMES[shown.month]} {shown.year}.
        </strong>
        <button
          type="button"
          className="button button--secondary"
          aria-label="Sledeći mesec"
          onClick={() => setShown((at) => shiftMonth(at, 1))}
        >
          ›
        </button>
      </div>
      <div className="date-picker__grid">
        {WEEKDAY_LETTERS.map((letter, index) => (
          <span key={index} className="date-picker__weekday" aria-hidden="true">
            {letter}
          </span>
        ))}
        {monthGrid(shown.year, shown.month)
          .flat()
          .map((cell) => (
            <button
              key={cell.iso}
              type="button"
              className="date-picker__day"
              data-outside={cell.inMonth ? undefined : 'true'}
              data-today={cell.iso === today ? 'true' : undefined}
              aria-pressed={cell.iso === value}
              aria-label={`${cell.day}. ${MONTH_NAMES[Number(cell.iso.slice(5, 7)) - 1]} ${cell.iso.slice(0, 4)}.`}
              onClick={() => onPick(cell.iso)}
            >
              {cell.day}
            </button>
          ))}
      </div>
    </div>
  )
}
