import type { LessonStatus } from '../teacher/teacherApi'

/** A lesson, booking or free slot that has not ended yet and so stops a location from being taken away from a teacher. */
export interface LocationBlocker {
  id: string
  locationId: string
  /** ISO instants. */
  start: string
  end: string
  status: LessonStatus
}

export interface LocationBlockers {
  /** All of them; `lessons` holds the first few. */
  total: number
  lessons: LocationBlocker[]
}

export const STATUS_LABEL: Record<LessonStatus, string> = {
  open: 'slobodan termin',
  pending: 'zahtev na čekanju',
  confirmed: 'čas',
}

const isStatus = (value: unknown): value is LessonStatus =>
  value === 'open' || value === 'pending' || value === 'confirmed'

const instant = (value: unknown): string | null => {
  if (typeof value !== 'string') return null
  const time = new Date(value)
  return Number.isNaN(time.getTime()) ? null : time.toISOString()
}

/**
 * Reads the detail of the database's refusal (`{"total": n, "lessons": [{id, location_id, start_at, end_at, status}]}`).
 * Null for anything else: the screen then falls back to a plain sentence.
 */
export function parseLocationBlockers(details: string | undefined): LocationBlockers | null {
  if (!details) return null
  let data: unknown
  try {
    data = JSON.parse(details)
  } catch {
    return null
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return null
  const { total, lessons } = data as { total?: unknown; lessons?: unknown }
  if (typeof total !== 'number' || !Array.isArray(lessons)) return null

  const parsed: LocationBlocker[] = []
  for (const entry of lessons as Record<string, unknown>[]) {
    const start = instant(entry?.start_at)
    const end = instant(entry?.end_at)
    if (
      typeof entry?.id !== 'string' ||
      typeof entry.location_id !== 'string' ||
      !start ||
      !end ||
      !isStatus(entry.status)
    ) {
      return null
    }
    parsed.push({ id: entry.id, locationId: entry.location_id, start, end, status: entry.status })
  }
  return { total, lessons: parsed }
}
