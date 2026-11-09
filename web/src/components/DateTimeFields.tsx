import { useState } from 'react'
import { formatDate, parseDate } from '../lib/dateField'

/**
 * Date and time for the lesson forms. The browser's own date and time fields follow the language of the browser or the
 * system, so they show AM and PM and `11/09/2026` to someone who works in 24 hours and day.month.year. These show the
 * same everywhere and hand on the same values as before: `2026-11-09` and `16:30`.
 */

const HOURS = Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, '0'))
const QUARTERS = ['00', '15', '30', '45']

/** A date typed as day.month.year. Hands on `2026-11-09`, or an empty text while what is typed is not a date. */
export function DateField({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string
  /** `2026-11-09`, or empty. */
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}) {
  // what is typed is kept as it is, so a half-typed date is not rewritten under the fingers
  const [text, setText] = useState(formatDate(value))
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="text"
        inputMode="numeric"
        placeholder="dd.mm.gggg"
        autoComplete="off"
        maxLength={10}
        value={text}
        disabled={disabled}
        onChange={(event) => {
          setText(event.target.value)
          onChange(parseDate(event.target.value) ?? '')
        }}
      />
    </label>
  )
}

/** A time of day in 24 hours: the hour from 00 to 23 and the minutes in quarters of an hour. Hands on `16:30`. */
export function TimeField({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string
  /** `16:30`, or empty. */
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}) {
  const match = /^(\d{2}):(\d{2})$/.exec(value)
  const hour = match?.[1] ?? ''
  const minute = match?.[2] ?? ''
  // a time that is already there and not on a quarter stays visible: it is not changed unless the person changes it
  const minutes = minute && !QUARTERS.includes(minute) ? [...QUARTERS, minute].sort() : QUARTERS

  return (
    <fieldset className="field time-field" role="group" aria-label={label} disabled={disabled}>
      <legend>{label}</legend>
      <div className="time-field__parts">
        <select
          aria-label={`${label}, sat`}
          value={hour}
          onChange={(event) => onChange(`${event.target.value}:${minute || '00'}`)}
        >
          {hour === '' && <option value="">--</option>}
          {HOURS.map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>
        <span aria-hidden="true">:</span>
        <select
          aria-label={`${label}, minuti`}
          value={minute}
          onChange={(event) => onChange(`${hour || '00'}:${event.target.value}`)}
        >
          {minute === '' && <option value="">--</option>}
          {minutes.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>
    </fieldset>
  )
}
