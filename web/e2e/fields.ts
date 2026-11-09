import type { Locator } from '@playwright/test'

/** Types a date (`2026-11-06`) into a date field the way it is written there: `06.11.2026`. */
export async function fillDate(scope: Locator, label: string, iso: string) {
  const [year, month, day] = iso.split('-')
  await scope.getByLabel(label, { exact: true }).fill(`${day}.${month}.${year}`)
}

/** Chooses a time (`09:15`) in a time field: its hour, then its minutes. */
export async function chooseTime(scope: Locator, label: string, time: string) {
  const [hour, minute] = time.split(':')
  await scope.getByLabel(`${label}, sat`, { exact: true }).selectOption(hour)
  await scope.getByLabel(`${label}, minuti`, { exact: true }).selectOption(minute)
}
