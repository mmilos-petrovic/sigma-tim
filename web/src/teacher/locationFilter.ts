/**
 * The calendar shows the teacher's own lessons everywhere, and the colleagues at ONE location: the one chosen in the
 * filter. The choice is remembered per teacher and per device only; storage can be blocked (a private window), then the
 * teacher simply starts from the first location every time.
 */
import type { LocationOption } from './teacherApi'

const key = (profileId: string) => `sigma.scheduleLocation.${profileId}`

export function readLastLocation(profileId: string): string | null {
  try {
    return window.localStorage.getItem(key(profileId))
  } catch {
    return null
  }
}

export function writeLastLocation(profileId: string, locationId: string): void {
  try {
    window.localStorage.setItem(key(profileId), locationId)
  } catch {
    // blocked: the choice is simply not remembered
  }
}

/** The remembered location if it is still one of the teacher's, else the first of them by name; null without any. */
export function chooseLocation(
  own: readonly LocationOption[],
  remembered: string | null,
): string | null {
  if (own.some((location) => location.id === remembered)) return remembered
  const [first] = [...own].sort((a, b) => a.name.localeCompare(b.name, 'sr-Latn'))
  return first?.id ?? null
}
