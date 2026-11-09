import { fireEvent, type within } from '@testing-library/react'
import { formatDate } from '../lib/dateField'

type Scope = ReturnType<typeof within>

/** Types a date (`2026-11-06`) into a date field the way it is written there: `06.11.2026`. */
export function setDate(scope: Scope, label: string, iso: string) {
  fireEvent.change(scope.getByLabelText(label), { target: { value: formatDate(iso) } })
}

/** Chooses a time (`09:15`) in a time field: its hour, then its minutes. */
export function setTime(scope: Scope, label: string, time: string) {
  const [hour, minute] = time.split(':')
  fireEvent.change(scope.getByLabelText(`${label}, sat`), { target: { value: hour } })
  fireEvent.change(scope.getByLabelText(`${label}, minuti`), { target: { value: minute } })
}

/** The time a time field shows, as `09:15`. */
export function timeOf(scope: Scope, label: string): string {
  const hour = (scope.getByLabelText(`${label}, sat`) as HTMLSelectElement).value
  const minute = (scope.getByLabelText(`${label}, minuti`) as HTMLSelectElement).value
  return `${hour}:${minute}`
}
