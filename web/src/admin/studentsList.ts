/** The administrator's list of students: records of the same person put on one row, newest first. */
import { containsWords } from '../lib/text'
import type { AdminStudentRow } from './adminApi'

export const NO_TEACHER = 'Bez nastavnika'

const byName = (a: string, b: string) => a.localeCompare(b, 'sr')

export interface PersonRow {
  profileId: string
  firstName: string
  lastName: string
  email: string
  /** The day the first record of the person was added (an ISO instant). */
  addedAt: string
  /** One record per teacher, the one the person is deleted by. */
  records: AdminStudentRow[]
  /** The teachers, once each; "Bez nastavnika" for a record nobody teaches. */
  teachers: string[]
  /** Where the person has lessons, once each. */
  locations: string[]
  parents: string[]
}

const distinct = (values: string[]) => [...new Set(values)].sort(byName)

/** A person who studies with two teachers has two records and one row; the person added last is on top. */
export function groupStudents(rows: readonly AdminStudentRow[]): PersonRow[] {
  const byProfile = new Map<string, AdminStudentRow[]>()
  for (const row of rows)
    byProfile.set(row.profileId, [...(byProfile.get(row.profileId) ?? []), row])

  return [...byProfile.values()]
    .map((records): PersonRow => {
      const [first] = records
      return {
        profileId: first.profileId,
        firstName: first.firstName,
        lastName: first.lastName,
        email: first.email,
        addedAt: records.map((r) => r.createdAt).sort()[0],
        records,
        teachers: distinct(records.map((r) => r.teacherName ?? NO_TEACHER)),
        locations: distinct(records.flatMap((r) => r.locationNames)),
        parents: distinct(records.flatMap((r) => r.parentNames)),
      }
    })
    .sort(
      (a, b) =>
        b.addedAt.localeCompare(a.addedAt) ||
        byName(a.lastName, b.lastName) ||
        byName(a.firstName, b.firstName),
    )
}

/** Every word typed is in the name or the email. Nothing typed matches everybody. */
export const matchesPerson = (person: PersonRow, query: string): boolean =>
  containsWords(`${person.firstName} ${person.lastName} ${person.email}`, query)
